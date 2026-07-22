// 移植自 lxserver src/modules/utils/index.js（平台代码 import '../../index' → 重写为 '../shared'）。

export const sizeFormate = (size: number): string => {
  if (!size) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const number = Math.floor(Math.log(size) / Math.log(1024));
  return `${(size / Math.pow(1024, Math.floor(number))).toFixed(2)} ${units[number]}`;
};

const numFix = (n: number): string => (n < 10 ? `0${n}` : n.toString());

export const decodeName = (str: string): string => {
  if (!str) return '';
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&nbsp;': ' ',
  };
  return str.replace(/&[a-zA-Z]+;/g, (match) => entities[match] || match);
};

export const formatPlayTime = (time: number): string => {
  const m = Math.trunc(time / 60);
  const s = Math.trunc(time % 60);
  return m === 0 && s === 0 ? '--/--' : numFix(m) + ':' + numFix(s);
};

export const dateFormat = (_date: number | string | Date, format = 'Y-M-D h:m:s'): string => {
  const date = new Date(_date);
  if (!date) return '';
  return format
    .replace('Y', date.getFullYear().toString())
    .replace('M', numFix(date.getMonth() + 1))
    .replace('D', numFix(date.getDate()))
    .replace('h', numFix(date.getHours()))
    .replace('m', numFix(date.getMinutes()))
    .replace('s', numFix(date.getSeconds()));
};

export const dateFormat2 = (time: number): string => {
  const differ = Math.trunc((Date.now() - time) / 1000);
  if (differ < 60) return differ + '秒前';
  if (differ < 3600) return Math.trunc(differ / 60) + '分钟前';
  if (differ < 86400) return Math.trunc(differ / 3600) + '小时前';
  return dateFormat(time);
};

export const formatPlayCount = (num: number): number | string => {
  if (num > 100000000) return parseInt(String(num / 10000000)) / 10 + '亿';
  if (num > 10000) return parseInt(String(num / 1000)) / 10 + '万';
  return num;
};
