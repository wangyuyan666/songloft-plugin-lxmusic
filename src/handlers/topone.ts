import type { AppContext } from './context';
import { ok, fail, parseBody } from './response';
import { aggregateSearch, pickBestMatch } from './search';
import { dedupKey } from './helpers';

/** POST /api/search/topone —— 搜索+匹配+解析 URL，返回最佳可播放项。 */
export async function searchTopOne(ctx: AppContext, req: HTTPRequest): Promise<HTTPResponse> {
  const body = parseBody(req);
  const keyword: string = body.keyword || [body.title, body.artist].filter(Boolean).join(' ');
  if (!keyword) return fail('missing keyword', 400);
  const quality: string = body.quality || '128k';

  const list = await aggregateSearch(ctx, keyword, 1, 20, body.platforms);
  if (list.length === 0) return ok({ found: false });

  // 从最佳匹配开始逐个尝试解析，直到拿到可播放 URL
  const ordered = [pickBestMatch(list, body.title || keyword, body.artist || '')]
    .concat(list)
    .filter((x, i, a) => x && a.indexOf(x) === i) as typeof list;

  for (const info of ordered) {
    try {
      const outcome = await ctx.runtimes.getMusicUrl(info.source, info, quality);
      if (outcome) {
        return ok({
          found: true,
          url: outcome.result.url,
          headers: outcome.result.headers,
          dedup_key: dedupKey(info),
          songInfo: info,
          source_data: { platform: info.source, quality, songInfo: info },
        });
      }
    } catch {
      // 尝试下一个
    }
  }
  return ok({ found: false, reason: 'no playable url' });
}
