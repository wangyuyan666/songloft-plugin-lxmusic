// 最小 AES-128 ECB + PKCS7（纯 TS，QuickJS 安全）。
// 仅供 kw wbdCrypto 使用：其 key 为 16 字节二进制，宿主 crypto 的 utf8 字符串语义
// 无法安全表达非 ASCII key 字节，故自实现，保证字节精确。

const SBOX = new Uint8Array(256);
const INV_SBOX = new Uint8Array(256);
const RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];

(function initSbox() {
  let p = 1;
  let q = 1;
  const sbox = SBOX;
  do {
    // p * 3
    p = p ^ ((p << 1) & 0xff) ^ ((p & 0x80) ? 0x1b : 0);
    // q / 3
    q ^= q << 1;
    q ^= q << 2;
    q ^= q << 4;
    q &= 0xff;
    if (q & 0x80) q ^= 0x09;
    const xformed = q ^ ((q << 1) | (q >> 7)) ^ ((q << 2) | (q >> 6)) ^ ((q << 3) | (q >> 5)) ^ ((q << 4) | (q >> 4));
    sbox[p] = (xformed ^ 0x63) & 0xff;
  } while (p !== 1);
  sbox[0] = 0x63;
  for (let i = 0; i < 256; i++) INV_SBOX[sbox[i]] = i;
})();

function xtime(a: number): number {
  return ((a << 1) ^ ((a & 0x80) ? 0x1b : 0)) & 0xff;
}
function mul(a: number, b: number): number {
  let res = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) res ^= a;
    const hi = a & 0x80;
    a = (a << 1) & 0xff;
    if (hi) a ^= 0x1b;
    b >>= 1;
  }
  return res & 0xff;
}

function expandKey(key: number[] | Uint8Array): Uint8Array[] {
  const Nk = 4;
  const Nr = 10;
  const w: Uint8Array[] = [];
  for (let i = 0; i < Nk; i++) w.push(Uint8Array.from([key[4 * i], key[4 * i + 1], key[4 * i + 2], key[4 * i + 3]]));
  for (let i = Nk; i < 4 * (Nr + 1); i++) {
    let temp = Uint8Array.from(w[i - 1]);
    if (i % Nk === 0) {
      temp = Uint8Array.from([temp[1], temp[2], temp[3], temp[0]]); // RotWord
      temp = Uint8Array.from([SBOX[temp[0]], SBOX[temp[1]], SBOX[temp[2]], SBOX[temp[3]]]); // SubWord
      temp[0] ^= RCON[i / Nk - 1];
    }
    w.push(Uint8Array.from([w[i - Nk][0] ^ temp[0], w[i - Nk][1] ^ temp[1], w[i - Nk][2] ^ temp[2], w[i - Nk][3] ^ temp[3]]));
  }
  return w;
}

function addRoundKey(s: Uint8Array, w: Uint8Array[], round: number): void {
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) s[c * 4 + r] ^= w[round * 4 + c][r];
}

function encryptBlock(block: Uint8Array, w: Uint8Array[]): Uint8Array {
  const s = Uint8Array.from(block);
  addRoundKey(s, w, 0);
  for (let round = 1; round < 10; round++) {
    for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]];
    shiftRows(s);
    mixColumns(s);
    addRoundKey(s, w, round);
  }
  for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]];
  shiftRows(s);
  addRoundKey(s, w, 10);
  return s;
}

function decryptBlock(block: Uint8Array, w: Uint8Array[]): Uint8Array {
  const s = Uint8Array.from(block);
  addRoundKey(s, w, 10);
  for (let round = 9; round > 0; round--) {
    invShiftRows(s);
    for (let i = 0; i < 16; i++) s[i] = INV_SBOX[s[i]];
    addRoundKey(s, w, round);
    invMixColumns(s);
  }
  invShiftRows(s);
  for (let i = 0; i < 16; i++) s[i] = INV_SBOX[s[i]];
  addRoundKey(s, w, 0);
  return s;
}

// state 以 column-major 存（s[c*4+r]）
function shiftRows(s: Uint8Array): void {
  for (let r = 1; r < 4; r++) {
    const row = [s[r], s[4 + r], s[8 + r], s[12 + r]];
    for (let c = 0; c < 4; c++) s[c * 4 + r] = row[(c + r) % 4];
  }
}
function invShiftRows(s: Uint8Array): void {
  for (let r = 1; r < 4; r++) {
    const row = [s[r], s[4 + r], s[8 + r], s[12 + r]];
    for (let c = 0; c < 4; c++) s[c * 4 + r] = row[(c - r + 4) % 4];
  }
}
function mixColumns(s: Uint8Array): void {
  for (let c = 0; c < 4; c++) {
    const a0 = s[c * 4], a1 = s[c * 4 + 1], a2 = s[c * 4 + 2], a3 = s[c * 4 + 3];
    s[c * 4] = xtime(a0) ^ (xtime(a1) ^ a1) ^ a2 ^ a3;
    s[c * 4 + 1] = a0 ^ xtime(a1) ^ (xtime(a2) ^ a2) ^ a3;
    s[c * 4 + 2] = a0 ^ a1 ^ xtime(a2) ^ (xtime(a3) ^ a3);
    s[c * 4 + 3] = (xtime(a0) ^ a0) ^ a1 ^ a2 ^ xtime(a3);
  }
}
function invMixColumns(s: Uint8Array): void {
  for (let c = 0; c < 4; c++) {
    const a0 = s[c * 4], a1 = s[c * 4 + 1], a2 = s[c * 4 + 2], a3 = s[c * 4 + 3];
    s[c * 4] = mul(a0, 14) ^ mul(a1, 11) ^ mul(a2, 13) ^ mul(a3, 9);
    s[c * 4 + 1] = mul(a0, 9) ^ mul(a1, 14) ^ mul(a2, 11) ^ mul(a3, 13);
    s[c * 4 + 2] = mul(a0, 13) ^ mul(a1, 9) ^ mul(a2, 14) ^ mul(a3, 11);
    s[c * 4 + 3] = mul(a0, 11) ^ mul(a1, 13) ^ mul(a2, 9) ^ mul(a3, 14);
  }
}

/** AES-128 ECB + PKCS7 加密。 */
export function encryptECB(key: number[] | Uint8Array, data: Uint8Array): Uint8Array {
  const w = expandKey(key);
  const pad = 16 - (data.length % 16);
  const padded = new Uint8Array(data.length + pad);
  padded.set(data);
  for (let i = data.length; i < padded.length; i++) padded[i] = pad;
  const out = new Uint8Array(padded.length);
  for (let off = 0; off < padded.length; off += 16) out.set(encryptBlock(padded.subarray(off, off + 16), w), off);
  return out;
}

/** AES-128 ECB + PKCS7 解密。 */
export function decryptECB(key: number[] | Uint8Array, data: Uint8Array): Uint8Array {
  const w = expandKey(key);
  const out = new Uint8Array(data.length);
  for (let off = 0; off < data.length; off += 16) out.set(decryptBlock(data.subarray(off, off + 16), w), off);
  const pad = out[out.length - 1];
  return out.subarray(0, out.length - pad);
}
