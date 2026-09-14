import { PracticeError } from './practice.ts';
export const MAX_REQUEST_BYTES = 256000;
/** Bound memory while reading, including bodies without Content-Length. */
export async function readExploreRequest(request: Request): Promise<unknown> {
  request.signal.throwIfAborted();
  const reader = request.body?.getReader();
  if (!reader) return parseExploreRequest('');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  request.signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      request.signal.throwIfAborted();
      const { value, done } = await reader.read();
      request.signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new PracticeError('请求过长，请缩短输入。', 413);
      }
      try {
        text += decoder.decode(value, { stream: true });
      } catch {
        throw new PracticeError('请求编码无效，请使用 UTF-8。', 400);
      }
    }
    try {
      text += decoder.decode();
    } catch {
      throw new PracticeError('请求编码无效，请使用 UTF-8。', 400);
    }
    return parseExploreRequest(text);
  } finally {
    request.signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}
export function parseExploreRequest(raw: string): unknown {
  if (raw.length > 64000)
    throw new PracticeError('请求过长，请缩短输入。', 413);
  try {
    return JSON.parse(raw);
  } catch {
    throw new PracticeError('请求格式无效，请刷新页面后重试。', 400);
  }
}
