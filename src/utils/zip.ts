import { latin1ToUtf8, latin1ToHex, hexToLatin1 } from './encoding';

/** 解出的单个文件条目（content 为 UTF-8 文本）。 */
export interface ZipEntry {
  name: string;
  content: string;
}

function u16(s: string, off: number): number {
  return s.charCodeAt(off) | (s.charCodeAt(off + 1) << 8);
}
function u32(s: string, off: number): number {
  return (
    (s.charCodeAt(off) |
      (s.charCodeAt(off + 1) << 8) |
      (s.charCodeAt(off + 2) << 16) |
      (s.charCodeAt(off + 3) << 24)) >>>
    0
  );
}

function skipEntry(name: string): boolean {
  if (!name || name.endsWith('/')) return true; // 目录
  if (name.startsWith('__MACOSX/') || name.indexOf('/__MACOSX/') >= 0) return true;
  const base = name.replace(/^.*\//, '');
  if (base.startsWith('._')) return true;
  if (base === '.DS_Store') return true;
  return false;
}

/** 解压单条：STORE(0) 原样，DEFLATE(8) 走宿主 raw inflate。 */
function inflateData(raw: string, method: number): string | null {
  if (method === 0) return raw;
  if (method === 8) {
    try {
      const hex = latin1ToHex(raw);
      const outHex = __go_raw_inflate(hex);
      return hexToLatin1(outHex);
    } catch {
      return null;
    }
  }
  return null; // 不支持的压缩方法
}

/**
 * 解析 ZIP（latin1 字节串）。优先走 Central Directory（EOCD `PK\x05\x06`），
 * 失败回退扫描 local header（`PK\x03\x04`）。返回文本文件条目。
 */
export function parseZip(data: string): ZipEntry[] {
  const entries = parseViaCentralDir(data);
  if (entries.length > 0) return entries;
  return parseViaLocalHeaders(data);
}

function parseViaCentralDir(data: string): ZipEntry[] {
  const out: ZipEntry[] = [];
  // 从尾部找 EOCD：PK\x05\x06
  let eocd = -1;
  const minEnd = Math.max(0, data.length - 22 - 0xffff);
  for (let i = data.length - 22; i >= minEnd; i--) {
    if (
      data.charCodeAt(i) === 0x50 &&
      data.charCodeAt(i + 1) === 0x4b &&
      data.charCodeAt(i + 2) === 0x05 &&
      data.charCodeAt(i + 3) === 0x06
    ) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return out;

  const total = u16(data, eocd + 10);
  let cdOff = u32(data, eocd + 16);

  for (let n = 0; n < total; n++) {
    if (
      !(
        data.charCodeAt(cdOff) === 0x50 &&
        data.charCodeAt(cdOff + 1) === 0x4b &&
        data.charCodeAt(cdOff + 2) === 0x01 &&
        data.charCodeAt(cdOff + 3) === 0x02
      )
    ) {
      break;
    }
    const method = u16(data, cdOff + 10);
    const compSize = u32(data, cdOff + 20);
    const nameLen = u16(data, cdOff + 28);
    const extraLen = u16(data, cdOff + 30);
    const commentLen = u16(data, cdOff + 32);
    const localOff = u32(data, cdOff + 42);
    const nameRaw = data.substr(cdOff + 46, nameLen);
    const name = latin1ToUtf8(nameRaw);

    if (!skipEntry(name)) {
      const entry = readLocal(data, localOff, method, compSize);
      if (entry != null) out.push({ name, content: latin1ToUtf8(entry) });
    }
    cdOff += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** 从 local header 读取并解压数据。 */
function readLocal(data: string, localOff: number, cdMethod: number, cdCompSize: number): string | null {
  if (
    !(
      data.charCodeAt(localOff) === 0x50 &&
      data.charCodeAt(localOff + 1) === 0x4b &&
      data.charCodeAt(localOff + 2) === 0x03 &&
      data.charCodeAt(localOff + 3) === 0x04
    )
  ) {
    return null;
  }
  const method = u16(data, localOff + 8) || cdMethod;
  const nameLen = u16(data, localOff + 26);
  const extraLen = u16(data, localOff + 28);
  const dataStart = localOff + 30 + nameLen + extraLen;
  const raw = data.substr(dataStart, cdCompSize);
  return inflateData(raw, method);
}

/** 回退：扫描所有 local header。无法拿到准确 compSize 时用下一个 header 定界。 */
function parseViaLocalHeaders(data: string): ZipEntry[] {
  const out: ZipEntry[] = [];
  const offsets: number[] = [];
  for (let i = 0; i + 4 <= data.length; i++) {
    if (
      data.charCodeAt(i) === 0x50 &&
      data.charCodeAt(i + 1) === 0x4b &&
      data.charCodeAt(i + 2) === 0x03 &&
      data.charCodeAt(i + 3) === 0x04
    ) {
      offsets.push(i);
    }
  }
  for (let k = 0; k < offsets.length; k++) {
    const localOff = offsets[k];
    const method = u16(data, localOff + 8);
    const compSizeHdr = u32(data, localOff + 18);
    const nameLen = u16(data, localOff + 26);
    const extraLen = u16(data, localOff + 28);
    const dataStart = localOff + 30 + nameLen + extraLen;
    const nameRaw = data.substr(localOff + 30, nameLen);
    const name = latin1ToUtf8(nameRaw);

    let compSize = compSizeHdr;
    if (compSize === 0) {
      // data descriptor 情况：用下一个 header / CD 起点定界
      const next = k + 1 < offsets.length ? offsets[k + 1] : findNextSig(data, dataStart);
      compSize = Math.max(0, next - dataStart);
    }
    if (skipEntry(name)) continue;
    const raw = data.substr(dataStart, compSize);
    const inflated = inflateData(raw, method);
    if (inflated != null) out.push({ name, content: latin1ToUtf8(inflated) });
  }
  return out;
}

function findNextSig(data: string, from: number): number {
  for (let i = from; i + 4 <= data.length; i++) {
    if (data.charCodeAt(i) === 0x50 && data.charCodeAt(i + 1) === 0x4b) {
      const c2 = data.charCodeAt(i + 2);
      const c3 = data.charCodeAt(i + 3);
      if ((c2 === 0x03 && c3 === 0x04) || (c2 === 0x01 && c3 === 0x02) || (c2 === 0x07 && c3 === 0x08)) {
        return i;
      }
    }
  }
  return data.length;
}
