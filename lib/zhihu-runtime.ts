// Shared by both route entry points; never imported by browser components.
import { createZhihuWeb } from './zhihu-web';
import { env } from 'cloudflare:workers';
import { d1AuthStore } from './zhihu-auth-store';
// Resolve Worker bindings at request time, not at module initialization.
let handler: ReturnType<typeof createZhihuWeb> | undefined;
export function handleZhihu(request: Request) {
  if (handler) return handler(request);
  const bindings = env as unknown as Record<string, unknown> & { ZHIHU_AUTH_DB?: D1Database };
  const config = Object.fromEntries(Object.entries(bindings).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  handler = createZhihuWeb({ ...config, NODE_ENV: 'production' }, fetch, Date.now,
    bindings.ZHIHU_AUTH_DB ? d1AuthStore(bindings.ZHIHU_AUTH_DB) : undefined);
  return handler(request);
}
