import { createSearchHandler, createMusicUrlHandler } from '@songloft/plugin-sdk';
import type { Router } from '@songloft/plugin-sdk';
import type { AppContext } from './context';
import { buildSearchFn, buildResolveUrl, buildFallbackSearch } from './search';
import { listSources, importSources, importSourceUrl, deleteSource, toggleSource } from './source';
import { directMusicUrl, directLyric } from './direct';
import { importSongs } from './import';
import { searchTopOne } from './topone';
import { songlist } from './songlist';
import { leaderboard } from './leaderboard';
import { ok } from './response';

export type { AppContext } from './context';

/** 注册所有路由。 */
export function registerRoutes(router: Router, ctx: AppContext): void {
  // ===== 主程序集成契约（走 SDK 工厂，返回裸 {results}/{url}）=====
  router.post('/api/search', createSearchHandler({ search: buildSearchFn(ctx) }));
  router.post('/api/music/url', createMusicUrlHandler({
    resolveUrl: buildResolveUrl(ctx),
    fallbackSearch: buildFallbackSearch(ctx),
  }));

  // ===== 歌曲导入库 =====
  router.post('/api/songs/import', (req) => importSongs(ctx, req));

  // ===== 音源管理 =====
  router.get('/api/sources', () => listSources(ctx));
  router.post('/api/sources/import', (req) => importSources(ctx, req));
  router.post('/api/sources/import-url', (req) => importSourceUrl(ctx, req));
  router.delete('/api/sources', (req) => deleteSource(ctx, req));
  router.put('/api/sources/toggle', (req) => toggleSource(ctx, req));

  // ===== 歌单浏览（转发 musicSdk）=====
  router.get('/api/songlist/:action', (req, params) => songlist(ctx, req, params.action));

  // ===== 排行榜 =====
  router.get('/api/leaderboard/:action', (req, params) => leaderboard(ctx, req, params.action));

  // ===== Direct =====
  router.post('/api/direct/music/url', (req) => directMusicUrl(ctx, req));
  router.get('/api/direct/lyric', (req) => directLyric(ctx, req));

  // ===== 三合一 =====
  router.post('/api/search/topone', (req) => searchTopOne(ctx, req));

  // ===== 元信息 =====
  router.get('/api/meta', () => ok({
    plugin: 'lxmusic',
    platforms: ctx.musicSdk.sources,
    supported_platforms: ctx.runtimes.supportedPlatforms(),
    source_count: ctx.sources.list().length,
  }));
}
