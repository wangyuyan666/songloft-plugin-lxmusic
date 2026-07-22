import type { SourceState, SourceMeta } from '../types';

export type { SourceState, SourceMeta };

/** 导入一个音源脚本的结果。 */
export interface ImportResult {
  id: string;
  name: string;
  ok: boolean;
  error?: string;
}

/** 批量导入（ZIP）的进度，供前端轮询。 */
export interface BatchProgress {
  loading: boolean;
  batch_current_id?: string;
  batch_pending_ids: string[];
}

/** storage key 常量。 */
export const K_INDEX = 'source_index';
export const K_SCRIPT_PREFIX = 'source_script_';
