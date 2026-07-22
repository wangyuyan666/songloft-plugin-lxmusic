import type { SongInfo, SourcePlatformInfo } from '../types';

/** SourceRuntime.load 的入参：脚本源码 + 元数据。 */
export interface RuntimeScript {
  id: string;
  name: string;
  version?: string;
  script: string; // 真实脚本源码（rawScript，用于 md5 自校验）
}

/** inited 事件 payload 中的 sources 结构。 */
export interface InitedPayload {
  openDevTools?: boolean;
  sources: Record<string, SourcePlatformInfo>;
}

/** getMusicUrl 请求描述。 */
export interface MusicUrlRequest {
  platform: string;
  songInfo: SongInfo;
  quality: string;
}

/** 单个 runtime 的成功率统计。 */
export interface RuntimeStats {
  totalCalls: number;
  successCalls: number;
}
