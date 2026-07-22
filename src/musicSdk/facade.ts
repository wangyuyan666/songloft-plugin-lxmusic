// musicSdk facade —— 机制 A 的顶层入口（只做元数据，永不解析播放直链）。
//
// 阶段一：桩实现。五平台 kw/kg/tx/wy/mg 的真实逻辑移植自 lxserver 后填充到
// 各平台目录，再在此接线。当前返回空结果并记录警告，使契约端点可运行。

import type { SongInfo } from '../types';
// @ts-ignore 移植的 .js 平台模块（默认导出对象）
import tx from './tx/index';
// @ts-ignore
import mg from './mg/index';
// @ts-ignore
import wy from './wy/index';
// @ts-ignore
import kg from './kg/index';
// @ts-ignore
import kw from './kw/index';

export interface SearchResult {
  list: SongInfo[];
  total: number;
  page: number;
  limit: number;
}

export interface LyricResult {
  lyric: string;
  tlyric?: string;
  rlyric?: string;
}

/** 单平台 API 形态（照 lxserver 各 index.js）。 */
export interface PlatformApi {
  id: string;
  name: string;
  musicSearch: {
    search(str: string, page?: number, limit?: number): Promise<SearchResult>;
  };
  getLyric(songInfo: SongInfo): Promise<LyricResult>;
  songList?: unknown;
  leaderboard?: unknown;
  implemented: boolean;
}

const NOT_IMPL = 'musicSdk platform not implemented yet (mechanism A pending)';

function stubPlatform(id: string, name: string): PlatformApi {
  return {
    id,
    name,
    implemented: false,
    musicSearch: {
      async search(str: string, page = 1, limit = 30): Promise<SearchResult> {
        songloft.log.warn('[musicSdk:' + id + '] search stub, keyword=' + str);
        return { list: [], total: 0, page, limit };
      },
    },
    async getLyric(_songInfo: SongInfo): Promise<LyricResult> {
      throw new Error(NOT_IMPL);
    },
  };
}

/** 用移植的平台模块（.js 默认导出）构造 PlatformApi。 */
function realPlatform(id: string, name: string, mod: any): PlatformApi {
  return {
    id,
    name,
    implemented: true,
    musicSearch: {
      search(str: string, page = 1, limit = 30): Promise<SearchResult> {
        return mod.musicSearch.search(str, page, limit);
      },
    },
    getLyric(songInfo: SongInfo): Promise<LyricResult> {
      const r = mod.getLyric(songInfo);
      // 平台 getLyric 多返回 requestObj({promise,cancelHttp})，也可能直接返回 Promise
      if (r && typeof r.then === 'function') return r;
      if (r && r.promise && typeof r.promise.then === 'function') return r.promise;
      return Promise.resolve(r);
    },
    songList: mod.songList,
    leaderboard: mod.leaderboard,
  };
}

const PLATFORMS: Record<string, PlatformApi> = {
  kw: realPlatform('kw', '酷我音乐', kw),
  kg: realPlatform('kg', '酷狗音乐', kg),
  tx: realPlatform('tx', 'QQ音乐', tx),
  wy: realPlatform('wy', '网易云音乐', wy),
  mg: realPlatform('mg', '咪咕音乐', mg),
};

export const facade = {
  sources: Object.values(PLATFORMS).map((p) => ({ id: p.id, name: p.name })),
  get(id: string): PlatformApi | undefined {
    return PLATFORMS[id];
  },
  kw: PLATFORMS.kw,
  kg: PLATFORMS.kg,
  tx: PLATFORMS.tx,
  wy: PLATFORMS.wy,
  mg: PLATFORMS.mg,
};

export type MusicSdkFacade = typeof facade;
