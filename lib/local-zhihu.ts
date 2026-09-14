import type { Plugin } from 'vite';
import { createZhihuWeb } from './zhihu-web';
import { createZhihuLocalTransport } from './zhihu-local-transport';

export function localZhihu(env: Record<string, string | undefined>): Plugin {
  const transport = createZhihuLocalTransport();
  const handle = createZhihuWeb({ ...env, NODE_ENV: 'development' }, transport.fetch);
  return { name: 'local-zhihu-web', configureServer(server) {
    server.httpServer?.once('close', () => { void transport.close(); });
    server.middlewares.use(async (req, res, next) => {
      const path = (req.url || '').split('?')[0];
      if (path !== '/callback' && !path.startsWith('/api/zhihu/')) return next();
      try {
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
        }
        const response = await handle(new Request(`http://${req.headers.host || 'localhost:3000'}${req.url}`, { method: req.method, headers }));
        res.statusCode = response.status;
        response.headers.forEach((v, k) => { if (k !== 'set-cookie') res.setHeader(k, v); });
        const cookies = response.headers.getSetCookie();
        if (cookies.length) res.setHeader('Set-Cookie', cookies);
        res.end(await response.text());
      } catch { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: '登录服务暂时不可用。' })); }
    });
  } };
}
