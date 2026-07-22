// 移植自 lxserver src/modules/utils/musicSdk/utils.js
// 沙箱适配：crypto.createHash('md5') → 宿主 crypto.md5；dns.lookup → noop（fetch 自解析）。
import { decodeName } from './shared';

export const toMD5 = (str: string): string => crypto.md5(str);

/** 沙箱无 dns 模块，fetch 自行解析主机名，这里保留签名做 noop。 */
export const getHostIp = (_hostname: string): void => {};

export const dnsLookup = (
  hostname: string,
  options: any,
  callback: (err: any, address?: string, family?: number) => void,
): void => {
  // 直接回退：交给运行时解析
  if (typeof options === 'function') callback = options;
  callback(new Error('dns lookup not supported in sandbox'));
};

/**
 * 格式化歌手
 */
export const formatSingerName = (
  singers: any,
  nameKey = 'name',
  join = '、',
): string => {
  if (Array.isArray(singers)) {
    const singer: string[] = [];
    singers.forEach((item) => {
      const name = item[nameKey];
      if (!name) return;
      singer.push(name);
    });
    return decodeName(singer.join(join));
  }
  return decodeName(String(singers ?? ''));
};
