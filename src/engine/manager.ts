import { SourceRuntime, extractDispatch } from './runtime';
import type { MusicUrlRequest } from './types';
import type { MusicUrlResult, SongInfo } from '../types';

export interface GetMusicUrlOutcome {
  result: MusicUrlResult;
  runtimeId: string;
}

/**
 * 管理多个 SourceRuntime，维护 平台→runtime[] 反向索引。
 * 取 URL 时对支持该平台的多源用 executeParallel 并行竞速，首个成功者胜出。
 */
export class RuntimeManager {
  private runtimes = new Map<string, SourceRuntime>();
  private platformIndex = new Map<string, SourceRuntime[]>();

  add(rt: SourceRuntime): void {
    this.runtimes.set(rt.id, rt);
    this.rebuildIndex();
  }

  async remove(id: string): Promise<void> {
    const rt = this.runtimes.get(id);
    if (rt) {
      await rt.destroy();
      this.runtimes.delete(id);
      this.rebuildIndex();
    }
  }

  get(id: string): SourceRuntime | undefined {
    return this.runtimes.get(id);
  }

  list(): SourceRuntime[] {
    return [...this.runtimes.values()];
  }

  supportedPlatforms(): string[] {
    return [...this.platformIndex.keys()];
  }

  private rebuildIndex(): void {
    this.platformIndex.clear();
    for (const rt of this.runtimes.values()) {
      if (!rt.ready) continue;
      for (const platform of Object.keys(rt.platforms)) {
        const arr = this.platformIndex.get(platform) || [];
        arr.push(rt);
        this.platformIndex.set(platform, arr);
      }
    }
  }

  /** 支持该平台的 runtime，按成功率降序。 */
  private candidatesFor(platform: string): SourceRuntime[] {
    const arr = (this.platformIndex.get(platform) || []).slice();
    arr.sort((a, b) => b.successRate - a.successRate);
    return arr;
  }

  /**
   * 解析播放 URL：多源并行竞速，首个返回有效 URL 者胜出。
   * 无支持该平台的源 → null。
   */
  async getMusicUrl(platform: string, songInfo: SongInfo, quality: string): Promise<GetMusicUrlOutcome | null> {
    const req: MusicUrlRequest = { platform, songInfo, quality };
    let pool = this.candidatesFor(platform);
    if (pool.length === 0) return null;

    while (pool.length > 0) {
      const built = pool.map((rt) => rt.buildMusicUrlCall(req));
      const calls = built.map((b) => b.call);
      pool.forEach((rt) => { rt.stats.totalCalls++; });

      const par = await songloft.jsenv.executeParallel(calls, 3);
      if (par.successIndex < 0 || !par.result) {
        // 全部 env 层失败
        break;
      }
      const idx = par.successIndex;
      const winner = pool[idx];
      let out: MusicUrlResult | null = null;
      try {
        out = extractDispatch(par.result.events, built[idx].reqId);
      } catch {
        out = null;
      }
      if (out) {
        winner.stats.successCalls++;
        return { result: out, runtimeId: winner.id };
      }
      // 胜出 env 没给出有效 URL（dispatchError/空）→ 剔除后重试其余
      pool = pool.filter((_, i) => i !== idx);
    }
    return null;
  }

  async destroyAll(): Promise<void> {
    for (const rt of this.runtimes.values()) {
      await rt.destroy();
    }
    this.runtimes.clear();
    this.platformIndex.clear();
  }
}
