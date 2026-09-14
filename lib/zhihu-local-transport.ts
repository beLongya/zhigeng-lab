// Node development server only; not imported by Worker or browser bundles.
import { Agent } from 'undici';

export function createZhihuLocalTransport(baseFetch: typeof fetch = fetch) {
  // Wrangler installs a global proxy dispatcher. Keep these two official hosts
  // on their own connection pool without changing global/system proxy settings.
  // TLS certificate and hostname verification remain enabled by default.
  const dispatcher = new Agent({ connect: { timeout: 15000 } });
  const request: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !['openapi.zhihu.com', 'developer.zhihu.com'].includes(url.hostname)) {
      throw new Error('Unsupported Zhihu transport destination');
    }
    // Explicit dispatcher wins over Wrangler's global setting. No automatic
    // retries: an authorization code may have been consumed before a disconnect.
    const options = { ...init, dispatcher, redirect: 'error' as const };
    return baseFetch(input, options);
  };
  return { fetch: request, close: () => dispatcher.close() };
}
