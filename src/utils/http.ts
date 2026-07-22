// 调宿主 API 辅助。

let cachedHostUrl: string | null = null;

async function hostUrl(): Promise<string> {
  if (cachedHostUrl == null) cachedHostUrl = await songloft.plugin.getHostUrl();
  return cachedHostUrl;
}

export interface HostAPIOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * 调宿主 REST API（带 Bearer token）。path 以 / 开头。
 * body 为对象时自动 JSON。返回解析后的 JSON（失败返回文本）。
 */
export async function callHostAPI(path: string, opts: HostAPIOptions = {}): Promise<any> {
  const base = await hostUrl();
  const token = await songloft.plugin.getToken();
  const headers: Record<string, string> = {
    Authorization: 'Bearer ' + token,
    ...(opts.headers || {}),
  };
  const init: RequestInit = { method: opts.method || 'GET', headers };
  if (opts.body !== undefined) {
    if (typeof opts.body === 'object') {
      headers['Content-Type'] = 'application/json';
      (init as any).body = JSON.stringify(opts.body);
    } else {
      (init as any).body = String(opts.body);
    }
  }
  const resp = await fetch(base + path, init);
  const text = await resp.text();
  let parsed: any = text;
  try { parsed = JSON.parse(text); } catch { /* keep text */ }
  if (!resp.ok) {
    throw new Error('host API ' + path + ' -> ' + resp.status + ': ' + text.slice(0, 200));
  }
  return parsed;
}
