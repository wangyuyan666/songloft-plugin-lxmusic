import type { SourceMeta } from '../types';

/**
 * 从脚本头 JSDoc（`/** *​/` 或 `/*! *​/`）解析元数据。
 * 支持 @name @version @description @author @homepage。
 * 缺 @name → 用文件名推断。
 */
export function parseSourceMeta(script: string, filename?: string): SourceMeta {
  const header = extractHeaderComment(script);
  const tags = header ? parseJsDocTags(header) : {};

  let name = tags['name'];
  if (!name && filename) name = filenameToName(filename);
  if (!name) name = 'unknown';

  const id = slugify(name);
  return {
    id,
    name,
    version: tags['version'],
    description: tags['description'],
    author: tags['author'],
    homepage: tags['homepage'],
  };
}

/** 取脚本开头第一个块注释（跳过前导空白 / shebang / BOM）。 */
function extractHeaderComment(script: string): string | null {
  let s = script.replace(/^﻿/, '');
  // 允许注释前有少量空白或换行
  const m = s.match(/\/\*[!*]?([\s\S]*?)\*\//);
  if (!m) return null;
  // 只接受出现在文件靠前位置（前 2KB）的块注释，避免误取正文注释
  if ((m.index ?? 0) > 2048) return null;
  return m[1];
}

function parseJsDocTags(body: string): Record<string, string> {
  const tags: Record<string, string> = {};
  const re = /@(\w+)[ \t]+([^\r\n]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const key = m[1].toLowerCase();
    const val = m[2].trim().replace(/^\*+\s*/, '').trim();
    if (val && !(key in tags)) tags[key] = val;
  }
  return tags;
}

function filenameToName(filename: string): string {
  let n = filename.replace(/\.[^./\\]+$/, ''); // 去扩展名
  n = n.replace(/^.*[\\/]/, ''); // 去目录
  return n || 'unknown';
}

/**
 * slug 化：保留中文与字母数字，其余转 `_`，压缩连续下划线。
 */
export function slugify(name: string): string {
  let out = '';
  for (const ch of name) {
    const c = ch.codePointAt(0)!;
    const isAsciiAlnum =
      (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
    const isCjk = c >= 0x4e00 && c <= 0x9fff;
    if (isAsciiAlnum || isCjk) out += ch;
    else out += '_';
  }
  out = out.replace(/_+/g, '_').replace(/^_|_$/g, '');
  return out || 'src';
}
