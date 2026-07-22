import { parseQuery } from '@songloft/plugin-sdk';
import type { AppContext } from './context';
import { ok } from './response';

const PENDING = 'leaderboard metadata pending mechanism A (musicSdk port)';

/** GET /api/leaderboard/:action —— boards|list，带 source_id。 */
export async function leaderboard(ctx: AppContext, req: HTTPRequest, action: string): Promise<HTTPResponse> {
  const q = parseQuery(req.query);
  const sourceId = q.source_id;
  const p = sourceId ? ctx.musicSdk.get(sourceId) : undefined;
  const api = p && (p.leaderboard as any);
  if (!api || typeof api[action] !== 'function') {
    const empty = action === 'boards' ? { boards: [] } : { list: [] };
    return ok(empty, PENDING);
  }
  try {
    const data = await api[action](q);
    return ok(data);
  } catch (e) {
    return ok({ list: [] }, String((e as Error)?.message || e));
  }
}
