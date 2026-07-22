import type { SearchResultItem } from '@songloft/plugin-sdk';
import type { SongInfo, SourceData } from '../types';
import { intervalToSeconds } from '../musicSdk';

/** 首字母大写字段的防御性归一化（musicSdk 偶尔返回 Name/Singer 等）。 */
export function normalizeSongInfo(raw: any, platform: string): SongInfo {
  if (!raw || typeof raw !== 'object') return { source: platform };
  const pick = (a: string, b: string) => raw[a] ?? raw[b];
  const info: SongInfo = {
    source: raw.source || platform,
    name: pick('name', 'Name'),
    singer: pick('singer', 'Singer'),
    albumName: raw.albumName ?? raw.AlbumName ?? raw.album,
    albumId: raw.albumId ?? raw.AlbumId,
    interval: raw.interval ?? raw.Interval,
    songmid: raw.songmid ?? raw.songMid ?? raw.SongMid,
    musicId: raw.musicId ?? raw.MusicId ?? raw.id,
    hash: raw.hash ?? raw.Hash,
    copyrightId: raw.copyrightId ?? raw.CopyrightId,
    strMediaMid: raw.strMediaMid,
    albumMid: raw.albumMid,
    img: raw.img ?? raw.Img ?? raw.cover ?? raw.albumImg,
    types: raw.types,
    _qualitys: raw._qualitys,
  };
  // musicId 与 songmid 互为 fallback
  if (info.musicId == null && info.songmid != null) info.musicId = info.songmid;
  if (info.songmid == null && info.musicId != null) info.songmid = info.musicId;
  // 保留其余原始字段
  for (const k in raw) {
    if (!(k in info)) (info as any)[k] = raw[k];
  }
  return info;
}

/** SongInfo → 主程序契约的 SearchResultItem。 */
export function toSearchResultItem(info: SongInfo, quality: string): SearchResultItem {
  const sourceData: SourceData = { platform: info.source, quality, songInfo: info };
  return {
    title: info.name || '',
    artist: info.singer || '',
    album: info.albumName || '',
    duration: intervalToSeconds(info.interval),
    cover_url: info.img || undefined,
    source_data: sourceData as unknown as Record<string, unknown>,
  };
}

/** dedup_key = "<platform>:<稳定id>"，优先 songmid→musicId→hash→copyrightId。 */
export function dedupKey(info: SongInfo): string {
  const id = info.songmid ?? info.musicId ?? info.hash ?? info.copyrightId;
  if (id == null || id === '') return '';
  return info.source + ':' + String(id);
}

/** 从不透明 source_data 还原为 SourceData（容错）。 */
export function parseSourceData(raw: any): SourceData | null {
  if (!raw || typeof raw !== 'object') return null;
  const platform = raw.platform || raw.songInfo?.source;
  if (!platform) return null;
  return {
    platform,
    quality: raw.quality || '128k',
    songInfo: normalizeSongInfo(raw.songInfo || raw, platform),
  };
}
