// 插件内部共享类型。与 plugin-sdk 的宿主契约类型分开。

/** musicSdk 归一化后的歌曲元数据（小写驼峰，防御性容忍首字母大写）。 */
export interface SongInfo {
  /** 平台标识：kw|kg|tx|wy|mg */
  source: string;
  name?: string;
  singer?: string;
  albumName?: string;
  albumId?: string | number;
  interval?: string; // "mm:ss"
  /** 各平台稳定 id，互为 fallback */
  songmid?: string | number;
  musicId?: string | number;
  hash?: string;
  copyrightId?: string;
  strMediaMid?: string;
  albumMid?: string;
  img?: string; // 封面
  types?: unknown[]; // 可用音质列表
  _qualitys?: Record<string, unknown>;
  [key: string]: unknown;
}

/** 传给主程序 / 机制 B 的 source_data（对主程序不透明）。 */
export interface SourceData {
  platform: string;
  quality: string;
  songInfo: SongInfo;
}

/** 音源脚本头解析出的元数据。 */
export interface SourceMeta {
  id: string;
  name: string;
  version?: string;
  description?: string;
  author?: string;
  homepage?: string;
}

/** 音源持久化状态。 */
export interface SourceState extends SourceMeta {
  enabled: boolean;
  /** 脚本声明支持的平台 → 能力，来自 inited 事件的 sources。 */
  platforms?: Record<string, SourcePlatformInfo>;
  /** 后台异步加载中 */
  loading?: boolean;
  /** 最近一次加载错误 */
  error?: string;
  importedAt?: number;
}

/** inited 事件里单个平台的能力描述。 */
export interface SourcePlatformInfo {
  name?: string;
  type?: string;
  actions?: string[];
  qualitys?: string[];
}

/** 解析播放 URL 的结果。 */
export interface MusicUrlResult {
  url: string;
  headers?: Record<string, string>;
}
