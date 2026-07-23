import { jsonResponse } from '@songloft/plugin-sdk';
import type { AppContext } from './context';
import { parseBody } from './response';
import { aggregateSearch, pickBestMatch } from './search';
import { dedupKey } from './helpers';
import { intervalToSeconds } from '../musicSdk';

/** POST /api/search/topone — miot topone spec compatible. */
export async function searchTopOne(ctx: AppContext, req: HTTPRequest): Promise<HTTPResponse> {
  const body = parseBody(req);
  const hint = body.hint as { title?: string; artist?: string; duration?: number } | undefined;
  const keyword: string = body.keyword || [hint?.title || body.title, hint?.artist || body.artist].filter(Boolean).join(' ');
  if (!keyword) return jsonResponse({ code: 400, msg: 'missing keyword', data: null }, 400);
  const quality: string = body.quality || '128k';

  const list = await aggregateSearch(ctx, keyword, 1, 20, body.platforms);
  if (list.length === 0) return jsonResponse({ code: -1, msg: 'no results', data: null });

  const matchTitle = hint?.title || body.title || keyword;
  const matchArtist = hint?.artist || body.artist || '';
  const ordered = [pickBestMatch(list, matchTitle, matchArtist)]
    .concat(list)
    .filter((x, i, a) => x && a.indexOf(x) === i) as typeof list;

  for (const info of ordered) {
    try {
      const outcome = await ctx.runtimes.getMusicUrl(info.source, info, quality);
      if (outcome) {
        return jsonResponse({
          code: 0,
          msg: 'ok',
          data: {
            title: info.name || '',
            artist: info.singer || '',
            album: info.albumName || '',
            duration: intervalToSeconds(info.interval),
            cover_url: info.img || undefined,
            url: outcome.result.url,
            dedup_key: dedupKey(info),
            source_data: { platform: info.source, quality, songInfo: info },
          },
        });
      }
    } catch {
      // try next
    }
  }
  return jsonResponse({ code: -1, msg: 'no playable url', data: null });
}
