// 内部 UI 用的统一响应封装：{code,msg,data}。
// 注意：主程序契约端点（/api/search、/api/music/url）走 SDK 工厂返回裸
// {results}/{url}，不用这个封装，别混。

import { jsonResponse } from '@songloft/plugin-sdk';

export function ok(data: unknown, warning?: string): HTTPResponse {
  const body: Record<string, unknown> = { code: 0, msg: 'success', data };
  if (warning) body.warning = warning;
  return jsonResponse(body);
}

export function fail(msg: string, statusCode = 500): HTTPResponse {
  return jsonResponse({ code: statusCode, msg, data: null }, statusCode);
}

/** 解析请求 JSON body（容错）。 */
export function parseBody(req: HTTPRequest): any {
  if (!req.body) return {};
  try {
    const text = typeof req.body === 'string' ? req.body : bodyToString(req.body);
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function bodyToString(body: Uint8Array): string {
  try {
    return Buffer.from(body as any).toString('utf8');
  } catch {
    let s = '';
    for (let i = 0; i < body.length; i++) s += String.fromCharCode(body[i]);
    try { return Buffer.from(s, 'latin1').toString('utf8'); } catch { return s; }
  }
}
