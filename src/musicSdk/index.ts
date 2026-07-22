// 共享工具（移植自 lxserver modules/utils/index.js）。
// 机制 A 阶段逐平台填充；此处先放通用格式化函数。

/** 文件大小格式化。 */
export function sizeFormate(size: number | string): string {
  const n = typeof size === 'string' ? parseFloat(size) : size;
  if (!n || n <= 0) return '0B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return v.toFixed(2).replace(/\.00$/, '') + units[i];
}

/** HTML 实体解码歌名等。 */
export function decodeName(str: string | undefined | null): string {
  if (str == null) return '';
  return String(str)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/** 毫秒/秒 → mm:ss。 */
export function formatPlayTime(sec: number): string {
  if (!sec || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return (m < 10 ? '0' + m : '' + m) + ':' + (s < 10 ? '0' + s : '' + s);
}

/** "mm:ss" → 秒。 */
export function intervalToSeconds(interval: string | undefined): number {
  if (!interval) return 0;
  const parts = interval.split(':').map((x) => parseInt(x, 10) || 0);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

/** 播放次数格式化（万/亿）。 */
export function formatPlayCount(num: number): string {
  if (num >= 100000000) return (num / 100000000).toFixed(1) + '亿';
  if (num >= 10000) return (num / 10000).toFixed(1) + '万';
  return String(num || 0);
}
