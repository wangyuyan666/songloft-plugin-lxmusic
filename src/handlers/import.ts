import type { AppContext } from './context';
import { ok, fail, parseBody } from './response';
import { normalizeSongInfo, dedupKey } from './helpers';
import type { SourceData, SongInfo } from '../types';
import { intervalToSeconds } from '../musicSdk';

// songloft.songs.create 的输入型（SDK 未导出 CreateSongInput，本地复刻）。
interface CreateSongInput {
  url?: string;
  title: string;
  artist?: string;
  album?: string;
  coverUrl?: string;
  duration?: number;
  sourceData?: string;
  dedupKey?: string;
  lyric?: string;
  lyricSource?: string;
  lyricRemoteUrl?: string;
}

const LYRIC_BASE = '/api/v1/jsplugin/lxmusic/api/direct/lyric';

interface ImportItem {
  title?: string;
  artist?: string;
  album?: string;
  cover_url?: string;
  duration?: number;
  source_data?: any;
  songInfo?: any;
  platform?: string;
  quality?: string;
}

/** POST /api/songs/import —— 批量导入选中歌曲到音乐库。 */
export async function importSongs(ctx: AppContext, req: HTTPRequest): Promise<HTTPResponse> {
  const body = parseBody(req);
  const items: ImportItem[] = body.songs || body.items || [];
  if (!Array.isArray(items) || items.length === 0) return fail('no songs to import', 400);

  const inputs: CreateSongInput[] = [];
  for (const it of items) {
    const sd = resolveSourceData(it);
    if (!sd) continue;
    const info = sd.songInfo;
    const dk = dedupKey(info);
    const input: CreateSongInput = {
      title: it.title || info.name || 'Unknown',
      artist: it.artist || info.singer || '',
      album: it.album || info.albumName || '',
      coverUrl: it.cover_url || info.img || undefined,
      duration: it.duration || intervalToSeconds(info.interval),
      sourceData: JSON.stringify(sd),
      lyricSource: 'url',
      lyricRemoteUrl: buildLyricUrl(info),
    };
    if (dk) input.dedupKey = dk;
    inputs.push(input);
  }
  if (inputs.length === 0) return fail('no valid source_data in items', 400);

  let created;
  try {
    created = await songloft.songs.create(inputs);
  } catch (e) {
    return fail('songs.create failed: ' + String((e as Error)?.message || e), 500);
  }

  // 可选：加入歌单
  let playlistResult: unknown;
  const playlistId = body.playlist_id;
  const playlistName = body.playlist_name;
  if ((playlistId || playlistName) && created.length > 0) {
    playlistResult = await addToPlaylist(created.map((s) => s.id), playlistId, playlistName, created[0].cover_url);
  }

  return ok({ imported: created.length, songs: created, playlist: playlistResult });
}

function resolveSourceData(it: ImportItem): SourceData | null {
  const raw = it.source_data || (it.songInfo ? { platform: it.platform || it.songInfo.source, quality: it.quality, songInfo: it.songInfo } : null);
  if (!raw) return null;
  const platform = raw.platform || raw.songInfo?.source || it.platform;
  if (!platform) return null;
  const info: SongInfo = normalizeSongInfo(raw.songInfo || raw, platform);
  return { platform, quality: raw.quality || it.quality || '128k', songInfo: info };
}

function buildLyricUrl(info: SongInfo): string {
  const params: string[] = ['source=' + encodeURIComponent(info.source)];
  if (info.songmid != null) params.push('songmid=' + encodeURIComponent(String(info.songmid)));
  if (info.musicId != null) params.push('musicId=' + encodeURIComponent(String(info.musicId)));
  if (info.hash) params.push('hash=' + encodeURIComponent(String(info.hash)));
  return LYRIC_BASE + '?' + params.join('&');
}

async function addToPlaylist(
  songIds: number[],
  playlistId: number | undefined,
  playlistName: string | undefined,
  fallbackCover: string | undefined,
): Promise<unknown> {
  let pid = playlistId;
  if (!pid && playlistName) {
    const pl = await songloft.playlists.create({ name: playlistName, coverUrl: fallbackCover });
    pid = pl.id;
  }
  if (!pid) return null;
  const r = await songloft.playlists.addSongs(pid, songIds);
  return { playlist_id: pid, added: r.added, skipped: r.skipped };
}
