import { LX_PRELUDE_JS } from './lx_prelude';
import type { InitedPayload, MusicUrlRequest, RuntimeStats } from './types';
import type { SourcePlatformInfo, MusicUrlResult, SongInfo } from '../types';

/** env 名生成：只保留安全字符，非 ASCII 编码成 hex，避开 `::` 和 `/`。 */
export function safeEnvName(id: string): string {
  let out = 'lxsrc_';
  for (let i = 0; i < id.length; i++) {
    const c = id.charCodeAt(i);
    const ch = id[i];
    if ((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || ch === '_' || ch === '-') {
      out += ch;
    } else {
      out += 'x' + c.toString(16);
    }
  }
  return out;
}

let reqCounter = 0;
function nextReqId(): string {
  reqCounter = (reqCounter + 1) % 1e9;
  return 'r' + Date.now().toString(36) + '_' + reqCounter.toString(36);
}

/** 归一化脚本返回的 URL 结果。 */
function normalizeUrlResult(result: unknown): MusicUrlResult | null {
  if (result == null) return null;
  if (typeof result === 'string') {
    return result ? { url: result } : null;
  }
  if (typeof result === 'object') {
    const o = result as Record<string, unknown>;
    if (typeof o.url === 'string' && o.url) {
      const r: MusicUrlResult = { url: o.url };
      if (o.headers && typeof o.headers === 'object') r.headers = o.headers as Record<string, string>;
      return r;
    }
  }
  return null;
}

/** 从 executeWait/executeParallel 的 events 里提取指定 reqId 的 dispatch 结果。 */
export function extractDispatch(
  events: SongloftJSEnvEvent[] | undefined,
  reqId: string,
): MusicUrlResult | null {
  if (!events) return null;
  for (const ev of events) {
    if (ev.name !== 'dispatchResult' && ev.name !== 'dispatchError') continue;
    let data: any;
    try { data = JSON.parse(ev.data); } catch { continue; }
    if (!data || data.id !== reqId) continue;
    if (ev.name === 'dispatchError') {
      throw new Error(String(data.error || 'dispatch error'));
    }
    return normalizeUrlResult(data.result);
  }
  return null;
}

/**
 * 单个音源实例。持有一个子 QuickJS env，脚本已 inited。
 */
export class SourceRuntime {
  readonly id: string;
  readonly name: string;
  readonly envName: string;
  platforms: Record<string, SourcePlatformInfo> = {};
  stats: RuntimeStats = { totalCalls: 0, successCalls: 0 };
  ready = false;

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
    this.envName = safeEnvName(id);
  }

  get successRate(): number {
    if (this.stats.totalCalls === 0) return 0;
    return this.stats.successCalls / this.stats.totalCalls;
  }

  supports(platform: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.platforms, platform);
  }

  /**
   * 创建子 env、注入 prelude、注入 currentScriptInfo（含真实 rawScript），
   * 执行脚本并等 inited。失败抛错。
   */
  async load(script: string, version?: string): Promise<void> {
    // 已存在同名 env 先销毁（best-effort）
    await songloft.jsenv.destroy(this.envName).catch(() => {});
    await songloft.jsenv.create(this.envName, LX_PRELUDE_JS);

    // ⚠️ rawScript 必须是真实源码：部分音源初始化会 md5(rawScript) 与远端校验。
    const scriptInfo = {
      name: this.name,
      version: version || '1.0.0',
      author: '',
      description: '',
      rawScript: script,
    };
    const injectCode =
      'globalThis.lx.currentScriptInfo = ' + JSON.stringify(scriptInfo) + ';';
    const injectRes = await songloft.jsenv.execute(this.envName, injectCode, 5000);
    if (injectRes.error) throw new Error('inject currentScriptInfo failed: ' + injectRes.error);

    // 执行脚本本体，等 inited
    const res = await songloft.jsenv.executeWait(this.envName, script, 30000, ['inited']);
    if (res.error) throw new Error('script execute failed: ' + res.error);

    const inited = (res.events || []).find((e) => e.name === 'inited');
    if (!inited) throw new Error('script did not emit inited within timeout');

    let payload: InitedPayload;
    try {
      payload = JSON.parse(inited.data) as InitedPayload;
    } catch {
      throw new Error('inited payload parse failed');
    }
    const sources = payload && payload.sources;
    if (!sources || typeof sources !== 'object' || Object.keys(sources).length === 0) {
      throw new Error('inited but no sources declared');
    }
    this.platforms = sources;
    this.ready = true;
  }

  /** 构造 executeParallel 用的调用描述（供 RuntimeManager 竞速）。 */
  buildMusicUrlCall(req: MusicUrlRequest, timeoutMs = 20000): { call: SongloftJSEnvCall; reqId: string } {
    const reqId = nextReqId();
    const data = {
      source: req.platform,
      action: 'musicUrl',
      info: { type: req.quality, musicInfo: sanitizeSongInfo(req.songInfo) },
    };
    const dataJSON = JSON.stringify(data);
    const code = 'lx._dispatch(' + JSON.stringify(reqId) + ', "request", ' + JSON.stringify(dataJSON) + ');';
    return {
      call: { name: this.envName, code, timeoutMs, waitEvents: ['dispatchResult', 'dispatchError'] },
      reqId,
    };
  }

  /** 单源直接解析（非竞速路径，如 direct 端点）。 */
  async getMusicUrl(req: MusicUrlRequest, timeoutMs = 20000): Promise<MusicUrlResult | null> {
    const { call, reqId } = this.buildMusicUrlCall(req, timeoutMs);
    this.stats.totalCalls++;
    const res = await songloft.jsenv.executeWait(this.envName, call.code, timeoutMs, call.waitEvents!);
    if (res.error) throw new Error(res.error);
    const out = extractDispatch(res.events, reqId);
    if (out) this.stats.successCalls++;
    return out;
  }

  async destroy(): Promise<void> {
    this.ready = false;
    await songloft.jsenv.destroy(this.envName).catch(() => {});
  }
}

/** 只保留可 JSON 序列化的字段，剔除函数等。 */
function sanitizeSongInfo(info: SongInfo): SongInfo {
  try {
    return JSON.parse(JSON.stringify(info));
  } catch {
    return info;
  }
}
