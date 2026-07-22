// 编码工具：ZIP/multipart body 按字节读为 latin1 字符串，中文再转 UTF-8。

/** latin1（每字符 1 字节）字符串 → UTF-8 文本。 */
export function latin1ToUtf8(s: string): string {
  try {
    return Buffer.from(s, 'latin1').toString('utf8');
  } catch {
    return s;
  }
}

/** Uint8Array → latin1 字符串（按字节，保持二进制安全）。 */
export function bytesToLatin1(bytes: Uint8Array): string {
  let out = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const sub = bytes.subarray(i, i + CHUNK);
    out += String.fromCharCode.apply(null, sub as unknown as number[]);
  }
  return out;
}

/** latin1 子串 → hex（供 __go_raw_inflate 使用）。 */
export function latin1ToHex(s: string): string {
  return Buffer.from(s, 'latin1').toString('hex');
}

/** hex → latin1 字符串（二进制安全）。 */
export function hexToLatin1(hex: string): string {
  return Buffer.from(hex, 'hex').toString('latin1');
}
