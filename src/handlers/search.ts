import type { SearchResultItem, MusicUrlFallbackHint, FallbackMatch, ResolvedMusicUrl } from '@songloft/plugin-sdk';
import type { AppContext } from './context';
import type { SongInfo } from '../types';
import { normalizeSongInfo, toSearchResultItem, parseSourceData } from './helpers';

const DEFAULT_QUALITY = '128k';

/** 跨平台聚合搜索，返回归一化 SongInfo 列表（带平台标签）。 */
export async function aggregateSearch(
  ctx: AppContext,
  keyword: string,
  page = 1,
  limit = 30,
  platforms?: string[],
): Promise<SongInfo[]> {
  const ids = platforms && platforms.length ? platforms : ctx.musicSdk.sources.map((s) => s.id);
  const tasks = ids.map(async (id) => {
    const p = ctx.musicSdk.get(id);
    if (!p) return [] as SongInfo[];
    try {
      const res = await p.musicSearch.search(keyword, page, limit);
      return (res.list || []).map((it) => normalizeSongInfo(it, id));
    } catch (e) {
      songloft.log.warn('[search] ' + id + ' failed: ' + String((e as Error)?.message || e));
      return [] as SongInfo[];
    }
  });
  const lists = await Promise.all(tasks);
  return ([] as SongInfo[]).concat(...lists);
}

/** 单平台搜索（内部 UI / topone 用）。 */
export async function searchOnePlatform(
  ctx: AppContext,
  platform: string,
  keyword: string,
  page = 1,
  limit = 30,
): Promise<SongInfo[]> {
  const p = ctx.musicSdk.get(platform);
  if (!p) return [];
  const res = await p.musicSearch.search(keyword, page, limit);
  return (res.list || []).map((it) => normalizeSongInfo(it, platform));
}

/** createSearchHandler 的 search 实现（跨平台聚合）。 */
export function buildSearchFn(ctx: AppContext) {
  return async (keyword: string, page?: number, pageSize?: number): Promise<SearchResultItem[]> => {
    const list = await aggregateSearch(ctx, keyword, page || 1, pageSize || 30);
    return list.map((info) => toSearchResultItem(info, DEFAULT_QUALITY));
  };
}

/** createMusicUrlHandler 的 resolveUrl 实现（走机制 B）。 */
export function buildResolveUrl(ctx: AppContext) {
  return async (sourceDataRaw: Record<string, unknown>): Promise<ResolvedMusicUrl> => {
    const sd = parseSourceData(sourceDataRaw);
    if (!sd) throw new Error('invalid source_data');
    const outcome = await ctx.runtimes.getMusicUrl(sd.platform, sd.songInfo, sd.quality);
    if (!outcome) throw new Error('no source resolved url for ' + sd.platform);
    return outcome.result.headers
      ? { url: outcome.result.url, headers: outcome.result.headers }
      : outcome.result.url;
  };
}

/** createMusicUrlHandler 的 fallbackSearch（主源失败时跨平台自搜最匹配）。 */
export function buildFallbackSearch(ctx: AppContext) {
  return async (hint: MusicUrlFallbackHint): Promise<FallbackMatch | null> => {
    if (!hint.enabled) return null;
    const keyword = [hint.title, hint.artist].filter(Boolean).join(' ').trim();
    if (!keyword) return null;
    const list = await aggregateSearch(ctx, keyword, 1, 20);
    const best = pickBestMatch(list, hint.title, hint.artist);
    if (!best) return null;
    const sd = { platform: best.source, quality: DEFAULT_QUALITY, songInfo: best };
    return { source_data: sd as unknown as Record<string, unknown>, title: best.name, artist: best.singer };
  };
}

/** 简单相似度匹配：标题包含 + 歌手包含加权。 */
export function pickBestMatch(list: SongInfo[], title: string, artist: string): SongInfo | null {
  if (!list.length) return null;
  const nt = norm(title);
  const na = norm(artist);
  let best: SongInfo | null = null;
  let bestScore = -1;
  for (const it of list) {
    const t = norm(it.name || '');
    const a = norm(it.singer || '');
    let score = 0;
    if (t === nt) score += 3;
    else if (nt && (t.indexOf(nt) >= 0 || nt.indexOf(t) >= 0)) score += 2;
    if (na && a) {
      if (a === na) score += 2;
      else if (a.indexOf(na) >= 0 || na.indexOf(a) >= 0) score += 1;
    }
    if (score > bestScore) { bestScore = score; best = it; }
  }
  return bestScore > 0 ? best : list[0];
}

function norm(s: string): string {
  return String(s || '').toLowerCase().replace(/[\s\-_（）()【】\[\]]/g, '');
}
