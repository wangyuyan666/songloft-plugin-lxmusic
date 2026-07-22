import type { SourceState } from '../types';
import { K_INDEX, K_SCRIPT_PREFIX } from './types';

/**
 * 音源持久化：索引存所有 SourceState（不含脚本正文），
 * 每个脚本单独存 source_script_<id>。
 */
export class SourceStorage {
  async loadIndex(): Promise<SourceState[]> {
    const raw = await songloft.storage.get(K_INDEX);
    if (!raw || !Array.isArray(raw)) return [];
    return raw as SourceState[];
  }

  async saveIndex(states: SourceState[]): Promise<void> {
    // 剔除易变的运行期字段再持久化
    const clean = states.map((s) => ({
      id: s.id,
      name: s.name,
      version: s.version,
      description: s.description,
      author: s.author,
      homepage: s.homepage,
      enabled: s.enabled,
      platforms: s.platforms,
      importedAt: s.importedAt,
    }));
    await songloft.storage.set(K_INDEX, clean);
  }

  async loadScript(id: string): Promise<string | null> {
    const raw = await songloft.storage.get(K_SCRIPT_PREFIX + id);
    return typeof raw === 'string' ? raw : null;
  }

  async saveScript(id: string, script: string): Promise<void> {
    await songloft.storage.set(K_SCRIPT_PREFIX + id, script);
  }

  async deleteScript(id: string): Promise<void> {
    await songloft.storage.delete(K_SCRIPT_PREFIX + id).catch(() => {});
  }
}
