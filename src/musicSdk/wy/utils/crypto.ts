// 沙箱重实现 lxserver wy/utils/crypto.js。
// node crypto(createCipheriv/publicEncrypt) → 宿主 crypto.aesEncrypt/aesDecrypt + BigInt textbook RSA。
// 宿主 aesEncrypt(str,...) 按 utf8 取字节，与 node Buffer.from(text) 一致；PKCS7 + CBC/ECB 由宿主处理。
// 网易 weapi 的 RSA 为 NO_PADDING 128 字节，公钥模数固定，硬编码 + BigInt 求幂。

const iv = '0102030405060708';
const presetKey = '0CoJUm6Qyw8W8jud';
const linuxapiKey = 'rFgB&h#%2?^eDg:Q';
const eapiKey = 'e82ckenh8dichen8';
const base62 = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const RSA_N = BigInt(
  '0x00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725' +
    '152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312' +
    'ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424' +
    'd813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7',
);
const RSA_E = BigInt(0x10001);

function modpow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base %= mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

/** textbook RSA：ascii 串（大端字节）→ m^e mod n → 256-hex。 */
function rsaEncryptHex(str: string): string {
  let m = 0n;
  for (let i = 0; i < str.length; i++) m = (m << 8n) | BigInt(str.charCodeAt(i) & 0xff);
  const c = modpow(m, RSA_E, RSA_N);
  let hex = c.toString(16);
  while (hex.length < 256) hex = '0' + hex;
  return hex;
}

// 宿主 AES 封装
const aesEncB64 = (text: string, mode: 'cbc' | 'ecb', key: string): string =>
  crypto.aesEncrypt(text, mode, key, mode === 'cbc' ? iv : undefined).toString('base64');
const aesEncHex = (text: string, mode: 'cbc' | 'ecb', key: string): string =>
  crypto.aesEncrypt(text, mode, key, mode === 'cbc' ? iv : undefined).toString('hex');

function genSecretKey(): string {
  const hex = crypto.randomBytes(16).toString('hex');
  let s = '';
  for (let i = 0; i < 16; i++) {
    const b = parseInt(hex.substr(i * 2, 2), 16);
    s += base62.charAt(b % 62);
  }
  return s;
}
const reverseStr = (s: string): string => s.split('').reverse().join('');

export const weapi = (object: unknown) => {
  const text = JSON.stringify(object);
  const secretKey = genSecretKey();
  const first = aesEncB64(text, 'cbc', presetKey);
  return {
    params: aesEncB64(first, 'cbc', secretKey),
    encSecKey: rsaEncryptHex(reverseStr(secretKey)),
  };
};

export const linuxapi = (object: unknown) => {
  const text = JSON.stringify(object);
  return { eparams: aesEncHex(text, 'ecb', linuxapiKey).toUpperCase() };
};

export const eapi = (url: string, object: unknown) => {
  const text = typeof object === 'object' ? JSON.stringify(object) : String(object);
  const message = `nobody${url}use${text}md5forencrypt`;
  const digest = crypto.md5(message);
  const data = `${url}-36cd479b6b5-${text}-36cd479b6b5-${digest}`;
  return { params: aesEncHex(data, 'ecb', eapiKey).toUpperCase() };
};

export const eapiDecrypt = (cipher: any): string => {
  // 宿主 aesDecrypt：字符串密文默认按 base64 解析
  const b64 = typeof cipher === 'string' ? cipher : cipher && cipher.toString ? cipher.toString('base64') : '';
  if (!b64) return '';
  try {
    return crypto.aesDecrypt(b64, 'ecb', eapiKey).toString('utf8');
  } catch {
    return '';
  }
};
