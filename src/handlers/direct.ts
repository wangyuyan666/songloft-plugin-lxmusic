import { parseQuery } from '@songloft/plugin-sdk';
import type { AppContext } from './context';
import { ok, fail, parseBody } from './response';
import { normalizeSongInfo } from './helpers';

/** POST /api/direct/music/url —— body {songInfo:{source,songmid,...}, quality}。 */
export async function directMusicUrl(ctx: AppContext, req: HTTPRequest): Promise<HTTPResponse> {
  const body = parseBody(req);
  const rawInfo = body.songInfo || body.info;
  if (!rawInfo || !rawInfo.source) return fail('missing songInfo.source', 400);
  const quality = body.quality || '128k';
  const info = normalizeSongInfo(rawInfo, rawInfo.source);
  const outcome = await ctx.runtimes.getMusicUrl(info.source, info, quality);
  if (!outcome) return fail('source_not_available', 404);
  return ok({ url: outcome.result.url, headers: outcome.result.headers, runtime_id: outcome.runtimeId });
}

/** GET /api/direct/lyric —— query {source, songmid|musicId|hash, ...}。 */
export async function directLyric(ctx: AppContext, req: HTTPRequest): Promise<HTTPResponse> {
  const q = parseQuery(req.query);
  const source = q.source;
  if (!source) return fail('missing source', 400);
  const p = ctx.musicSdk.get(source);
  if (!p) return fail('unknown source: ' + source, 400);
  const info = normalizeSongInfo(q, source);
  try {
    const res = await p.getLyric(info);
    return ok({ lyric: res.lyric || '', tlyric: res.tlyric, rlyric: res.rlyric });
  } catch (e) {
    return fail(String((e as Error)?.message || e), 502);
  }
}
