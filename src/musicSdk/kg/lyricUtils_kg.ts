// 移植自 lxserver src/common/utils/lyricUtils/kg.js
// 沙箱适配：Buffer 字节操作 → latin1 串；zlib.inflate → 宿主 __go_zlib_inflate（hex）。
import { decodeName } from '../shared';

const enc_key = [0x40, 0x47, 0x61, 0x77, 0x5e, 0x32, 0x74, 0x47, 0x51, 0x36, 0x31, 0x2d, 0xce, 0xd2, 0x6e, 0x69];

function decodeLyric(str: string): Promise<string> {
  if (!str || !str.length) return Promise.resolve('');
  // base64 → latin1 字节串，去掉前 4 字节头
  const bytes = Buffer.from(str, 'base64').toString('latin1');
  const body = bytes.slice(4);
  let hex = '';
  for (let i = 0; i < body.length; i++) {
    const b = (body.charCodeAt(i) ^ enc_key[i % 16]) & 0xff;
    hex += b < 16 ? '0' + b.toString(16) : b.toString(16);
  }
  try {
    const outHex = __go_zlib_inflate(hex);
    return Promise.resolve(Buffer.from(outHex, 'hex').toString('utf8'));
  } catch (e) {
    return Promise.reject(e);
  }
}

const headExp = /^.*\[id:\$\w+\]\n/;

function parseLyric(str: string) {
  str = str.replace(/\r/g, '');
  if (headExp.test(str)) str = str.replace(headExp, '');
  const trans = str.match(/\[language:([\w=\\/+]+)\]/);
  let lyric: string;
  let rlyric: any;
  let tlyric: any;
  if (trans) {
    str = str.replace(/\[language:[\w=\\/+]+\]\n/, '');
    const json = JSON.parse(Buffer.from(trans[1], 'base64').toString('utf8'));
    for (const item of json.content) {
      switch (item.type) {
        case 0:
          rlyric = item.lyricContent;
          break;
        case 1:
          tlyric = item.lyricContent;
          break;
      }
    }
  }
  let i = 0;
  let lxlyric = str.replace(/\[((\d+),\d+)\].*/g, (s: string) => {
    const result = s.match(/\[((\d+),\d+)\].*/)!;
    let time = parseInt(result[2]);
    const ms = time % 1000;
    time /= 1000;
    const m = parseInt(String(time / 60)).toString().padStart(2, '0');
    time %= 60;
    const sec = parseInt(String(time)).toString().padStart(2, '0');
    const t = `${m}:${sec}.${ms}`;
    if (rlyric) rlyric[i] = `[${t}]${rlyric[i]?.join('') ?? ''}`;
    if (tlyric) tlyric[i] = `[${t}]${tlyric[i]?.join('') ?? ''}`;
    i++;
    return s.replace(result[1], t);
  });
  rlyric = rlyric ? rlyric.join('\n') : '';
  tlyric = tlyric ? tlyric.join('\n') : '';
  lxlyric = lxlyric.replace(/<(\d+,\d+),\d+>/g, '<$1>');
  lxlyric = decodeName(lxlyric);
  lyric = lxlyric.replace(/<\d+,\d+>/g, '');
  rlyric = decodeName(rlyric);
  tlyric = decodeName(tlyric);
  return { lyric, tlyric, rlyric, lxlyric };
}

export const decodeKrc = async (data: string) => decodeLyric(data).then(parseLyric);
