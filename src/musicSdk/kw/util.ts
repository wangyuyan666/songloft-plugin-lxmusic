// 移植自 lxserver kw/util.js。沙箱适配：
// - 去掉 node crypto / zlib / iconv-lite 依赖；
// - decodeLyric（gb18030）在沙箱不可用 → 桩；kw 歌词改走 UTF-8 JSON 端点（见 lyric.ts）。
// - wbdCrypto 用纯 TS AES-128-ECB（二进制 key）。
import { toMD5 } from '../utils';
import { encryptECB, decryptECB } from './aes';

export const objStr2JSON = (str: string): any => {
  return JSON.parse(str.replace(/('(?=(,\s*')))|('(?=:))|((?<=([:,]\s*))')|((?<={)')|('(?=}))/g, '"'));
};

export const formatSinger = (rawData: string): string => rawData.replace(/&/g, '、');
export const formatPic = (url: string, size = 1000): string => {
  if (!url) return url;
  return url
    .replace(/(\/star\/albumcover\/)\d+/, `$1${size}`)
    .replace(/(pictype=)\d+/, `$1${size}`)
    .replace(/(size=)\d+/, `$1${size}`);
};

export const matchToken = (headers: any): string | null => {
  try {
    return headers['set-cookie'][0].match(/kw_token=(\w+)/)[1];
  } catch {
    return null;
  }
};

// gb18030 解码在 QuickJS 不可用；kw 歌词改走 UTF-8 JSON 端点，此函数不应被调用。
export const decodeLyric = async (_args: { lrcBase64: string; isGetLyricx?: boolean }): Promise<string> => {
  throw new Error('kw legacy gb18030 lyric not supported in sandbox');
};

// ——— lrcTools：逐字歌词解析（纯字符串，原样移植）———
export const lrcTools: any = {
  rxps: {
    wordLine: /^(\[\d{1,2}:.*\d{1,4}\])\s*(\S+(?:\s+\S+)*)?\s*/,
    tagLine: /\[(ver|ti|ar|al|offset|by|kuwo):\s*(\S+(?:\s+\S+)*)\s*\]/,
    wordTimeAll: /<(-?\d+),(-?\d+)(?:,-?\d+)?>/g,
    wordTime: /<(-?\d+),(-?\d+)(?:,-?\d+)?>/,
  },
  offset: 1,
  offset2: 1,
  isOK: false,
  lines: [] as string[],
  tags: [] as string[],
  getWordInfo(str: string, str2: string, prevWord: any) {
    const offset = parseInt(str);
    const offset2 = parseInt(str2);
    const startTime = Math.abs((offset + offset2) / (this.offset * 2));
    const endTime = Math.abs((offset - offset2) / (this.offset2 * 2)) + startTime;
    if (prevWord) {
      if (startTime < prevWord.endTime) {
        prevWord.endTime = startTime;
        if (prevWord.startTime > prevWord.endTime) prevWord.startTime = prevWord.endTime;
        prevWord.newTimeStr = `<${prevWord.startTime},${prevWord.endTime - prevWord.startTime}>`;
      }
    }
    return { startTime, endTime, timeStr: `<${startTime},${endTime - startTime}>` };
  },
  parseLine(line: string) {
    if (line.length < 6) return;
    let result = this.rxps.wordLine.exec(line);
    if (result) {
      const time = result[1];
      let words = result[2];
      if (words == null) words = '';
      const wordTimes = words.match(this.rxps.wordTimeAll);
      if (!wordTimes) return;
      let preTimeInfo: any;
      for (const timeStr of wordTimes) {
        const r = this.rxps.wordTime.exec(timeStr);
        const wordInfo = this.getWordInfo(r[1], r[2], preTimeInfo);
        words = words.replace(timeStr, wordInfo.timeStr);
        if (preTimeInfo?.newTimeStr) words = words.replace(preTimeInfo.timeStr, preTimeInfo.newTimeStr);
        preTimeInfo = wordInfo;
      }
      this.lines.push(time + words);
      return;
    }
    result = this.rxps.tagLine.exec(line);
    if (!result) return;
    if (result[1] === 'kuwo') {
      let content = result[2];
      if (content != null && content.includes('][')) content = content.substring(0, content.indexOf(']['));
      const valueOf = parseInt(content, 8);
      this.offset = Math.trunc(valueOf / 10);
      this.offset2 = Math.trunc(valueOf % 10);
      if (this.offset === 0 || Number.isNaN(this.offset) || this.offset2 === 0 || Number.isNaN(this.offset2)) this.isOK = false;
    } else {
      this.tags.push(line);
    }
  },
  parse(lrc: string): string {
    const lines = lrc.split(/\r\n|\r|\n/);
    const tools = Object.create(this);
    tools.isOK = true;
    tools.offset = 1;
    tools.offset2 = 1;
    tools.lines = [];
    tools.tags = [];
    for (const line of lines) {
      if (!tools.isOK) throw new Error('failed');
      tools.parseLine(line);
    }
    if (!tools.lines.length) return '';
    let lrcs = tools.lines.join('\n');
    if (tools.tags.length) lrcs = `${tools.tags.join('\n')}\n${lrcs}`;
    return lrcs;
  },
};

// ——— wbdCrypto：kw 歌单/新接口签名（aes-128-ecb 二进制 key + md5 sign）———
function utf8ToBytes(s: string): Uint8Array {
  return hexToBytes(Buffer.from(s, 'utf8').toString('hex'));
}
function bytesToUtf8(b: Uint8Array): string {
  return Buffer.from(bytesToHex(b), 'hex').toString('utf8');
}
function base64ToBytes(s: string): Uint8Array {
  return hexToBytes(Buffer.from(s, 'base64').toString('hex'));
}
function bytesToBase64(b: Uint8Array): string {
  return Buffer.from(bytesToHex(b), 'hex').toString('base64');
}
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) {
    const h = b[i].toString(16);
    s += h.length < 2 ? '0' + h : h;
  }
  return s;
}

export const wbdCrypto = {
  aesKey: [112, 87, 39, 61, 199, 250, 41, 191, 57, 68, 45, 114, 221, 94, 140, 228],
  appId: 'y67sprxhhpws',
  decodeData(base64Result: string): any {
    const bytes = base64ToBytes(decodeURIComponent(base64Result));
    return JSON.parse(bytesToUtf8(decryptECB(this.aesKey, bytes)));
  },
  createSign(data: string, time: number): string {
    return toMD5(`${this.appId}${data}${time}`).toUpperCase();
  },
  buildParam(jsonData: unknown): string {
    const time = Date.now();
    const encodeData = bytesToBase64(encryptECB(this.aesKey, utf8ToBytes(JSON.stringify(jsonData))));
    const sign = this.createSign(encodeData, time);
    return `data=${encodeURIComponent(encodeData)}&time=${time}&appId=${this.appId}&sign=${sign}`;
  },
};
