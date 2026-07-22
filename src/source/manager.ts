import { RuntimeManager, SourceRuntime } from '../engine';
import { SourceStorage } from './storage';
import { parseSourceMeta, slugify } from './parser';
import type { SourceState } from '../types';
import type { ImportResult, BatchProgress } from './types';

/**
 * 音源导入/删除/启用禁用/持久化。协调 storage、parser、RuntimeManager。
 * 构造器只建空状态，必须 await init() 异步加载。
 */
export class SourceManager {
  private storage = new SourceStorage();
  private states: SourceState[] = [];

  // 批量导入进度
  private batchLoading = false;
  private batchCurrentId?: string;
  private batchPendingIds: string[] = [];

  constructor(private runtimes: RuntimeManager) {}

  /** 加载持久化索引（不加载 runtime）。 */
  async init(): Promise<void> {
    this.states = await this.storage.loadIndex();
  }

  /** 加载所有 enabled 音源的 runtime（best-effort）。 */
  async loadEnabled(): Promise<void> {
    for (const st of this.states) {
      if (!st.enabled) continue;
      await this.loadSource(st.id).catch((e) => {
        st.error = String((e as Error)?.message || e);
      });
    }
  }

  list(): SourceState[] {
    return this.states.map((s) => ({ ...s }));
  }

  getState(id: string): SourceState | undefined {
    return this.states.find((s) => s.id === id);
  }

  batchProgress(): BatchProgress {
    return {
      loading: this.batchLoading,
      batch_current_id: this.batchCurrentId,
      batch_pending_ids: this.batchPendingIds.slice(),
    };
  }

  private uniqueId(base: string): string {
    if (!this.states.some((s) => s.id === base)) return base;
    let n = 2;
    while (this.states.some((s) => s.id === base + '_' + n)) n++;
    return base + '_' + n;
  }

  /**
   * 导入单个脚本：解析元数据 → 持久化 → 立即加载 runtime（enabled=true）。
   * 同名（同 slug）先删旧再导入。
   */
  async importScript(script: string, filename?: string): Promise<ImportResult> {
    const meta = parseSourceMeta(script, filename);
    // 同名先删旧
    if (this.states.some((s) => s.id === meta.id)) {
      await this.deleteSource(meta.id).catch(() => {});
    }
    const state: SourceState = {
      ...meta,
      enabled: false,
      importedAt: Date.now(),
    };
    this.states.push(state);
    await this.storage.saveScript(meta.id, script);
    await this.storage.saveIndex(this.states);

    try {
      await this.loadSource(meta.id);
      state.enabled = true;
      state.error = undefined;
      await this.storage.saveIndex(this.states);
      return { id: meta.id, name: meta.name, ok: true };
    } catch (e) {
      state.error = String((e as Error)?.message || e);
      await this.storage.saveIndex(this.states);
      return { id: meta.id, name: meta.name, ok: false, error: state.error };
    }
  }

  /** 从持久化脚本加载 runtime，注册到 RuntimeManager。 */
  async loadSource(id: string): Promise<void> {
    const st = this.getState(id);
    if (!st) throw new Error('source not found: ' + id);
    const script = await this.storage.loadScript(id);
    if (!script) throw new Error('script missing for: ' + id);

    st.loading = true;
    try {
      const rt = new SourceRuntime(id, st.name);
      await rt.load(script, st.version);
      st.platforms = rt.platforms;
      st.error = undefined;
      this.runtimes.add(rt);
    } finally {
      st.loading = false;
    }
  }

  async enableSource(id: string): Promise<void> {
    const st = this.getState(id);
    if (!st) throw new Error('source not found: ' + id);
    st.enabled = true;
    await this.storage.saveIndex(this.states);
    await this.loadSource(id);
    await this.storage.saveIndex(this.states);
  }

  async disableSource(id: string): Promise<void> {
    const st = this.getState(id);
    if (!st) throw new Error('source not found: ' + id);
    st.enabled = false;
    await this.runtimes.remove(id);
    st.platforms = undefined;
    await this.storage.saveIndex(this.states);
  }

  async toggleSource(id: string, enabled: boolean): Promise<void> {
    if (enabled) await this.enableSource(id);
    else await this.disableSource(id);
  }

  async deleteSource(id: string): Promise<void> {
    await this.runtimes.remove(id).catch(() => {});
    await this.storage.deleteScript(id);
    this.states = this.states.filter((s) => s.id !== id);
    await this.storage.saveIndex(this.states);
  }

  /**
   * 批量导入（ZIP）：每个脚本先以 enabled=false 持久化并立即返回，
   * 后台 setTimeout 链逐个 loadSource+enable，间隔 ~1000ms 让出 env 锁。
   */
  async importBatch(scripts: { filename: string; content: string }[]): Promise<ImportResult[]> {
    const results: ImportResult[] = [];
    const toLoad: string[] = [];
    for (const { filename, content } of scripts) {
      const meta = parseSourceMeta(content, filename);
      if (this.states.some((s) => s.id === meta.id)) {
        await this.deleteSource(meta.id).catch(() => {});
      }
      const state: SourceState = { ...meta, enabled: false, loading: true, importedAt: Date.now() };
      this.states.push(state);
      await this.storage.saveScript(meta.id, content);
      toLoad.push(meta.id);
      results.push({ id: meta.id, name: meta.name, ok: true });
    }
    await this.storage.saveIndex(this.states);

    // 后台异步逐个加载
    this.batchPendingIds = toLoad.slice();
    this.batchLoading = true;
    this.processBatch();
    return results;
  }

  private processBatch(): void {
    if (this.batchPendingIds.length === 0) {
      this.batchLoading = false;
      this.batchCurrentId = undefined;
      return;
    }
    const id = this.batchPendingIds.shift()!;
    this.batchCurrentId = id;
    setTimeout(() => {
      this.loadOneInBatch(id).finally(() => {
        // 间隔 ~1000ms 让出 env 锁
        setTimeout(() => this.processBatch(), 1000);
      });
    }, 0);
  }

  private async loadOneInBatch(id: string): Promise<void> {
    const st = this.getState(id);
    if (!st) return;
    try {
      await this.loadSource(id);
      st.enabled = true;
      st.error = undefined;
    } catch (e) {
      st.enabled = false;
      st.error = String((e as Error)?.message || e);
      st.loading = false;
    }
    await this.storage.saveIndex(this.states).catch(() => {});
  }
}
