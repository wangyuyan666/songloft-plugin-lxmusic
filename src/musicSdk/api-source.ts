// 桩：本插件不接 getMusicUrl→userApi 直链链（照 PROMPT）。
// 直链解析一律走机制 B 的 RuntimeManager。此处仅为让平台 index.js 的
// `import { apis } from '../api-source'` 编译通过；运行时不应被调用。

export const supportQuality: Record<string, Record<string, string[]>> = {};

export const apis = (source: string) => {
  throw new Error(
    'musicSdk getMusicUrl 已禁用（直链走机制 B lxmusic 引擎）: ' + source,
  );
};
