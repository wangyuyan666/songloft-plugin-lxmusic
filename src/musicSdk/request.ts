// 沙箱适配层：用 fetch 重写 lxserver 的 httpFetch，保持同样签名与返回结构。
// 平台代码大量调用 httpFetch(url, options).promise.then(({ body }) => ...)。

import { bHh } from './options';

export interface HttpResp {
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string>;
  body: any; // 自动 JSON.parse（失败保留文本）
  raw: string;
}

export interface HttpRequestObj {
  promise: Promise<HttpResp>;
  cancelHttp: () => void;
}

export interface HttpOptions {
  method?: string;
  headers?: Record<string, any>;
  body?: any;
  form?: Record<string, any>;
  formData?: Record<string, any>;
  timeout?: number;
  format?: string;
  [key: string]: any;
}

const defaultHeaders: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

function hasHeader(headers: Record<string, any>, name: string): boolean {
  name = name.toLowerCase();
  for (const k in headers) if (k.toLowerCase() === name) return true;
  return false;
}

function urlencode(obj: Record<string, any>): string {
  const parts: string[] = [];
  for (const k in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
    parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]));
  }
  return parts.join('&');
}

/** raw deflate（无 zlib 头）：宿主 __go_zlib_deflate 输出去掉 2 字节头 + 4 字节 adler 尾。 */
function rawDeflateHex(dataHex: string): string {
  const z = __go_zlib_deflate(dataHex); // zlib 格式 hex
  // 头 2 字节 = 4 hex，尾 4 字节 = 8 hex
  return z.slice(4, z.length - 8);
}

const regx = /(?:\d\w)+/g;

/** kw 反盗链 bHh 头签名（移植自 request.js fetchData 的 bHh 分支）。 */
function applyBHh(url: string, headers: Record<string, any>): void {
  if (!headers[bHh]) return;
  const path = url.replace(/^https?:\/\/[\w.:]+\//, '/');
  let s = Buffer.from(bHh, 'hex').toString();
  s = s.replace(s.substr(-1), '');
  s = Buffer.from(s, 'base64').toString();

  const v1 = '2050201';
  const v2 = '10';
  const v = v1
    .split('-')[0]
    .split('.')
    .map((n) => (n.length < 3 ? n.padStart(3, '0') : n))
    .join('');

  const matched = `${path}${v}`.match(regx);
  const b64 = Buffer.from(JSON.stringify(matched, null, 1).concat(v) as any).toString('base64');
  const defHex = rawDeflateHex(Buffer.from(b64).toString('hex'));
  headers[s] = !s ? '' : `${defHex}&${parseInt(v)}${v2}`;
  delete headers[bHh];
}

async function doFetch(url: string, method: string, options: HttpOptions): Promise<HttpResp> {
  const format = options.format || 'json';
  const timeout = options.timeout || 15000;
  const headers: Record<string, any> = Object.assign({}, options.headers || {});
  applyBHh(url, headers);
  const merged: Record<string, string> = Object.assign({}, defaultHeaders, headers);

  let body: string | undefined;
  const m = (method || 'get').toUpperCase();
  if (options.body != null) {
    if (typeof options.body === 'object') {
      body = JSON.stringify(options.body);
      if (!hasHeader(merged, 'content-type')) merged['Content-Type'] = 'application/json';
    } else body = options.body;
  } else if (options.form != null) {
    body = urlencode(options.form);
    if (!hasHeader(merged, 'content-type')) merged['Content-Type'] = 'application/x-www-form-urlencoded';
  } else if (options.formData != null) {
    body = urlencode(options.formData);
    if (!hasHeader(merged, 'content-type')) merged['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const init: any = { method: m, headers: merged };
  if (body != null && m !== 'GET' && m !== 'HEAD') init.body = body;
  if (controller) init.signal = controller.signal;

  let timer: any;
  if (controller && timeout) timer = setTimeout(() => controller.abort(), timeout);

  try {
    const resp = await fetch(url, init);
    const raw = await resp.text();
    if (timer) clearTimeout(timer);
    const rHeaders: Record<string, string> = {};
    try { (resp.headers as any).forEach((v: string, k: string) => { rHeaders[k] = v; }); } catch {}
    let parsed: any = raw;
    if (format === 'json') {
      try { parsed = JSON.parse(raw); } catch {}
    }
    return {
      statusCode: resp.status,
      statusMessage: resp.statusText || '',
      headers: rHeaders,
      body: parsed,
      raw,
    };
  } catch (e) {
    if (timer) clearTimeout(timer);
    throw e;
  }
}

/** 与 lxserver 同签名：返回 { promise, cancelHttp }。 */
export const httpFetch = (url: string, options: HttpOptions = { method: 'get' }): HttpRequestObj => {
  let aborted = false;
  const obj: HttpRequestObj = {
    promise: Promise.resolve() as any,
    cancelHttp: () => { aborted = true; },
  };
  obj.promise = doFetch(url, options.method || 'get', options).then((resp) => {
    if (aborted) throw new Error('cancelled');
    return resp;
  });
  return obj;
};

/** httpGet(url, options?, callback) 回调风格。 */
export const httpGet = (
  url: string,
  options: HttpOptions | ((err: any, resp: HttpResp | null, body?: any) => void),
  callback?: (err: any, resp: HttpResp | null, body?: any) => void,
): HttpRequestObj => {
  let opts: HttpOptions = {};
  let cb = callback;
  if (typeof options === 'function') { cb = options; opts = {}; }
  else opts = options || {};
  const req = httpFetch(url, { ...opts, method: 'get' });
  if (cb) req.promise.then((resp) => cb!(null, resp, resp.body)).catch((err) => cb!(err, null));
  return req;
};
