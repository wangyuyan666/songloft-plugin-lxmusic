import { bytesToLatin1, latin1ToUtf8 } from './encoding';

export interface MultipartFile {
  field: string;
  filename: string;
  /** 文件内容，latin1 字节串（保持二进制安全，供 ZIP/文本各自解码）。 */
  data: string;
  contentType: string;
}

/** 从 Content-Type 头取 boundary。 */
export function getBoundary(headers: Record<string, string>): string | null {
  let ct = '';
  for (const k in headers) {
    if (k.toLowerCase() === 'content-type') { ct = headers[k]; break; }
  }
  const m = ct.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!m) return null;
  return (m[1] || m[2] || '').trim();
}

/**
 * 解析 multipart/form-data。body 为原始字节，boundary 用字节匹配。
 * 只提取带 filename 的文件部分。
 */
export function parseMultipart(body: Uint8Array, boundary: string): MultipartFile[] {
  const s = bytesToLatin1(body);
  const delim = '--' + boundary;
  const files: MultipartFile[] = [];

  let pos = s.indexOf(delim);
  if (pos < 0) return files;
  pos += delim.length;

  while (pos < s.length) {
    // 结束标记 --boundary--
    if (s.substr(pos, 2) === '--') break;
    // 跳过 CRLF
    if (s.substr(pos, 2) === '\r\n') pos += 2;

    const headerEnd = s.indexOf('\r\n\r\n', pos);
    if (headerEnd < 0) break;
    const rawHeaders = s.substring(pos, headerEnd);
    const bodyStart = headerEnd + 4;

    const nextDelim = s.indexOf('\r\n' + delim, bodyStart);
    if (nextDelim < 0) break;
    const partData = s.substring(bodyStart, nextDelim);

    const { field, filename, contentType } = parsePartHeaders(rawHeaders);
    if (filename) {
      files.push({ field, filename, data: partData, contentType });
    }
    pos = nextDelim + 2 + delim.length;
  }
  return files;
}

function parsePartHeaders(raw: string): { field: string; filename: string; contentType: string } {
  let field = '';
  let filename = '';
  let contentType = '';
  const lines = raw.split('\r\n');
  for (const line of lines) {
    const low = line.toLowerCase();
    if (low.startsWith('content-disposition:')) {
      const fn = line.match(/filename\*?=(?:"([^"]*)"|([^;]+))/i);
      if (fn) filename = latin1ToUtf8((fn[1] || fn[2] || '').trim());
      const nm = line.match(/[^\w]name=(?:"([^"]*)"|([^;]+))/i);
      if (nm) field = (nm[1] || nm[2] || '').trim();
    } else if (low.startsWith('content-type:')) {
      contentType = line.slice(line.indexOf(':') + 1).trim();
    }
  }
  return { field, filename, contentType };
}
