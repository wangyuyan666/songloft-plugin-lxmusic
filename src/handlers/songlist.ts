import { parseQuery } from '@songloft/plugin-sdk';
import type { AppContext } from './context';
import { ok } from './response';

const PENDING = 'songlist metadata pending mechanism A (musicSdk port)';

/** GET /api/songlist/:action —— tags|list|detail|search|sorts，带 source_id。 */
export async function songlist(ctx: AppContext, req: HTTPRequest, action: string): Promise<HTTPResponse> {
  const q = parseQuery(req.query);
  const sourceId = q.source_id;
  const p = sourceId ? ctx.musicSdk.get(sourceId) : undefined;
  const api = p && (p.songList as any);
  if (!api || typeof api[action] !== 'function') {
    // 机制 A 未接入时返回空占位
    const empty = action === 'detail' ? { list: [], info: {} } : { list: [], tags: [], sorts: [] };
    return ok(empty, PENDING);
  }
  try {
    const data = await api[action](q);
    return ok(data);
  } catch (e) {
    return ok({ list: [] }, String((e as Error)?.message || e));
  }
}
