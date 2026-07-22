import { parseQuery } from '@songloft/plugin-sdk';
import type { AppContext } from './context';
import { ok, fail, parseBody } from './response';
import { getBoundary, parseMultipart } from '../utils/multipart';
import { parseZip } from '../utils/zip';
import type { ImportResult } from '../source';

/** GET /api/sources —— 列表 + 批量加载进度。 */
export async function listSources(ctx: AppContext): Promise<HTTPResponse> {
  const progress = ctx.sources.batchProgress();
  return ok({
    sources: ctx.sources.list(),
    supported_platforms: ctx.runtimes.supportedPlatforms(),
    loading: progress.loading,
    batch_current_id: progress.batch_current_id,
    batch_pending_ids: progress.batch_pending_ids,
  });
}

/**
 * POST /api/sources/import
 * 两种 body：
 *  - multipart/form-data（.js/.zip 文件，供外部调用）
 *  - JSON `{ files: [{ filename, content? , base64? }] }`（内置 UI 用，避免 multipart 鉴权/编码问题）
 * base64 = 文件 base64；.zip 走 ZIP 解析，.js 直接文本。
 */
export async function importSources(ctx: AppContext, req: HTTPRequest): Promise<HTTPResponse> {
  const jsFiles: { filename: string; content: string }[] = [];
  const boundary = getBoundary(req.headers);

  if (boundary && req.body) {
    // —— multipart 分支 ——
    const files = parseMultipart(req.body, boundary);
    for (const f of files) collectFromFile(f.filename, f.data, jsFiles);
  } else {
    // —— JSON 分支 ——
    const body = parseBody(req);
    const files = Array.isArray(body.files) ? body.files : [];
    if (files.length === 0) return fail('no files: expected multipart or JSON {files:[...]}', 400);
    for (const f of files) {
      const filename: string = f.filename || 'source.js';
      let latin1 = '';
      if (typeof f.base64 === 'string' && f.base64) {
        latin1 = base64ToLatin1(f.base64);
      } else if (typeof f.content === 'string') {
        latin1 = utf8ToLatin1(f.content);
      }
      collectFromFile(filename, latin1, jsFiles);
    }
  }

  if (jsFiles.length === 0) return fail('no .js source scripts found', 400);

  if (jsFiles.length === 1) {
    const r = await ctx.sources.importScript(jsFiles[0].content, jsFiles[0].filename);
    return ok({ imported: [r] }, r.ok ? undefined : r.error);
  }
  const results: ImportResult[] = await ctx.sources.importBatch(jsFiles);
  return ok({ imported: results, batch: ctx.sources.batchProgress() });
}

/** 从单个文件（latin1 字节串）提取 .js 脚本（.zip 解压，.js 转 UTF-8）。 */
function collectFromFile(filename: string, latin1: string, out: { filename: string; content: string }[]): void {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.zip')) {
    const entries = parseZip(latin1);
    for (const e of entries) {
      if (e.name.toLowerCase().endsWith('.js')) out.push({ filename: e.name, content: e.content });
    }
  } else if (lower.endsWith('.js')) {
    out.push({ filename, content: latin1Text(latin1) });
  }
}

function base64ToLatin1(b64: string): string {
  try {
    return Buffer.from(b64, 'base64').toString('latin1');
  } catch {
    return '';
  }
}
function utf8ToLatin1(s: string): string {
  try {
    return Buffer.from(s, 'utf8').toString('latin1');
  } catch {
    return s;
  }
}

/** POST /api/sources/import-url —— 从 URL 拉取脚本。 */
export async function importSourceUrl(ctx: AppContext, req: HTTPRequest): Promise<HTTPResponse> {
  const body = parseBody(req);
  const url: string = body.url;
  if (!url) return fail('missing url', 400);
  let text: string;
  try {
    const resp = await fetch(url, { headers: { 'User-Agent': 'lx-music' } });
    text = await resp.text();
  } catch (e) {
    return fail('fetch failed: ' + String((e as Error)?.message || e), 502);
  }
  const filename = url.replace(/[?#].*$/, '').replace(/^.*\//, '') || 'source.js';
  const r = await ctx.sources.importScript(text, filename);
  return ok({ imported: [r] }, r.ok ? undefined : r.error);
}

/** DELETE /api/sources?id= */
export async function deleteSource(ctx: AppContext, req: HTTPRequest): Promise<HTTPResponse> {
  const q = parseQuery(req.query);
  const id = q.id;
  if (!id) return fail('missing id', 400);
  await ctx.sources.deleteSource(id);
  return ok({ deleted: id });
}

/** PUT /api/sources/toggle —— body {id, enabled}。 */
export async function toggleSource(ctx: AppContext, req: HTTPRequest): Promise<HTTPResponse> {
  const body = parseBody(req);
  const id: string = body.id;
  if (!id) return fail('missing id', 400);
  const enabled = !!body.enabled;
  try {
    await ctx.sources.toggleSource(id, enabled);
  } catch (e) {
    return fail(String((e as Error)?.message || e), 500);
  }
  const st = ctx.sources.getState(id);
  return ok({ id, enabled, state: st }, st?.error);
}

function latin1Text(latin1: string): string {
  try {
    return Buffer.from(latin1, 'latin1').toString('utf8');
  } catch {
    return latin1;
  }
}
