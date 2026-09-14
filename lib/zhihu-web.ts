import { zhihuConfig } from './zhihu-config.ts';
import { memoryAuthStore, type AuthStore } from './zhihu-auth-store.ts';

type Env = Record<string, string | undefined>;
type FailureReason = 'network' | 'timeout' | 'rejected' | 'limited' | 'service' | 'format';
class WebError extends Error {
  status: number;
  reason: FailureReason;
  constructor(message: string, status = 502, reason: FailureReason = 'format') { super(message); this.status = status; this.reason = reason; }
}
export function safeZhihuUrl(value: unknown, image = false): string {
  if (typeof value !== 'string') return '';
  try { const u = new URL(value); const root = image ? 'zhimg.com' : 'zhihu.com';
    return u.protocol === 'https:' && !u.username && !u.password && (u.hostname === root || u.hostname.endsWith('.' + root)) ? u.href : '';
  } catch { return ''; }
}
export function parseLossless(raw: string) {
  // Tokenize JSON strings too, so numeric-looking text inside strings stays untouched.
  return JSON.parse(raw.replace(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, token =>
    /^-?\d+$/.test(token) && !Number.isSafeInteger(Number(token)) ? JSON.stringify(token) : token));
}
export function pageOffset(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{1,19}$/.test(value) || BigInt(value) > BigInt('9223372036854775807'))
    throw new WebError('分页位置无效。', 400);
  return value;
}
const str = (x: unknown, max = 2000) => typeof x === 'string' ? x.slice(0, max) : '';
const random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), x => x.toString(16).padStart(2, '0')).join('');
export function createZhihuWeb(env: Env, fetcher: typeof fetch = fetch, now = Date.now, store: AuthStore = memoryAuthStore()) {
  let hotCache: { items: unknown[]; fetchedAt: string; until: number } | undefined;
  let hotFlight: Promise<{ items: unknown[]; fetchedAt: string; until: number }> | undefined;
  let hotBlockedUntil = 0;
  const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  const cookieValue = (r: Request, name: string) => (r.headers.get('cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(name + '='))?.slice(name.length + 1) || '';
  const cookie = (name: string, value: string, age: number) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${env.NODE_ENV === 'production' || env.ZHIHU_OAUTH_REDIRECT_URI?.startsWith('https:') ? '; Secure' : ''}`;
  function redirect(path: string, cookies: string[] = []) { const h = new Headers({ Location: path, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); for (const c of cookies) h.append('Set-Cookie', c); return new Response(null, { status: 303, headers: h }); }
  async function session(r: Request) { const s = await store.getSession(cookieValue(r, 'zx_session'), now()); if (!s) throw new WebError('请先使用知乎登录。', 401); return s; }
  async function upstream(url: string, init: RequestInit = {}) {
    let r: Response;
    // Workers supports manual/follow only. Reject non-2xx below, without forwarding credentials.
    try { r = await fetcher(url, { ...init, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(20000) }); }
    catch (e) { throw new WebError('连接知乎失败。', 502, e instanceof Error && ['TimeoutError', 'AbortError'].includes(e.name) ? 'timeout' : 'network'); }
    if (r.status === 401 || r.status === 403) throw new WebError('知乎授权已失效，请重新登录。', 401, 'rejected');
    if (r.status === 429) throw new WebError('知乎调用频率或额度受限，请稍后重试。', 429, 'limited');
    if (!r.ok) throw new WebError('知乎服务暂不可用。', r.status, r.status >= 500 ? 'service' : 'rejected');
    const raw = await r.text(); if (raw.length > 2_000_000) throw new WebError('知乎响应过大。');
    let data;
    try { data = parseLossless(raw); } catch { throw new WebError('知乎响应不是有效 JSON。'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new WebError('知乎响应结构无效。');
    const code = data.Code ?? data.code;
    if (code !== undefined && code !== 0 && code !== 20000) {
      if (code === 20001 || code === 401 || code === 403) throw new WebError('知乎授权已失效，请重新登录。', 401, 'rejected');
      if (code === 30001 || code === 30002) throw new WebError('知乎调用频率或额度受限，请稍后重试。', 429, 'limited');
      throw new WebError('知乎返回业务错误。', 502, 'rejected');
    }
    return data;
  }
  const dataHeaders = (token?: string) => {
    const secret = env.ZHIHU_ACCESS_SECRET?.trim();
    if (!secret) throw new WebError('服务端尚未配置 Access Secret；不影响已有的本地 CLI 学习功能。', 503);
    return { Authorization: `Bearer ${secret}`, 'X-Request-Timestamp': String(Math.floor(now() / 1000)), 'Content-Type': 'application/json', ...(token ? { 'X-OAuth-Token': token } : {}) };
  };
  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url); const path = url.pathname;
    try {
      if (path !== '/api/zhihu/hot' && env.NODE_ENV === 'production' && !store.shared && env.ZHIHU_SESSION_MODE !== 'single-process')
        throw new WebError('此部署尚未配置共享登录会话存储。请使用本地开发或独立单进程服务器。', 503);
      if (path === '/api/zhihu/session' && request.method === 'GET') {
        const s = await store.getSession(cookieValue(request, 'zx_session'), now());
        return json({ user: s?.user || null, loginConfigured: zhihuConfig(env).oauthConfigured });
      }
      if (path === '/api/zhihu/login' && request.method === 'GET') {
        const c = zhihuConfig(env);
        if (!c.oauthConfigured) return redirect('/account?auth_error=configuration');
        const expected = new URL(c.redirectUri);
        if (url.origin !== expected.origin) return redirect(expected.origin + '/api/zhihu/login');
        await store.sweep(now());
        if (await store.stateCount() >= 1000) throw new WebError('登录请求较多，请稍后重试。', 429);
        await store.deleteState(cookieValue(request, 'zx_login'));
        const browser = random(), state = random(); await store.putState(browser, { state, expires: now() + 600000 });
        const authorize = new URL('https://openapi.zhihu.com/authorize');
        for (const [k, v] of Object.entries({ app_id: c.appId, redirect_uri: c.redirectUri, response_type: 'code', state })) authorize.searchParams.set(k, v);
        return redirect(authorize.href, [cookie('zx_login', browser, 600)]);
      }
      if (path === '/callback' && request.method === 'GET') {
        const c = zhihuConfig(env); const browser = cookieValue(request, 'zx_login');
        const state = url.searchParams.get('state');
        if (!browser || !state || url.searchParams.getAll('state').length !== 1 || !await store.consumeState(browser, state, now()))
          return redirect('/account?auth_error=state', [cookie('zx_login', '', 0)]);
        if (!c.oauthConfigured || url.origin !== new URL(c.redirectUri).origin) return redirect('/account?auth_error=configuration', [cookie('zx_login', '', 0)]);
        const code = url.searchParams.get('authorization_code') || url.searchParams.get('code');
        if (!code || code.length > 4000 || url.searchParams.has('error')) return redirect('/account?auth_error=denied', [cookie('zx_login', '', 0)]);
        let phase: 'token' | 'profile' | 'session' = 'token';
        try {
          const body = new URLSearchParams({ app_id: c.appId, app_key: c.appKey, grant_type: 'authorization_code', redirect_uri: c.redirectUri, code });
          const response = await upstream('https://openapi.zhihu.com/access_token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
          const t = response.data ?? response;
          if (typeof t.access_token !== 'string' || !t.access_token || t.access_token.length > 16000 || !Number.isFinite(t.expires_in) || t.expires_in <= 0) throw new WebError('Token 响应无效。');
          phase = 'profile';
          const profile = await upstream('https://openapi.zhihu.com/user', { headers: { Authorization: `Bearer ${t.access_token}` } });
          const p = profile.data ?? profile;
          const uid = typeof p.uid === 'string' && /^\d+$/.test(p.uid) ? p.uid : Number.isSafeInteger(p.uid) && p.uid > 0 ? String(p.uid) : '';
          const id = str(p.hash_id, 200) || uid; if (!id) throw new WebError('用户资料缺少有效身份。');
          phase = 'session';
          if (await store.sessionCount() >= 10000) throw new WebError('会话数量已达上限。', 503, 'limited');
          const sid = random(); const seconds = Math.min(t.expires_in, 86400);
          await store.deleteSession(cookieValue(request, 'zx_session'));
          await store.putSession(sid, { token: t.access_token, expires: now() + seconds * 1000, user: { id, name: str(p.fullname, 200) || '知乎用户', avatar: safeZhihuUrl(p.avatar_path, true), headline: str(p.headline), description: str(p.description) } });
          return redirect('/account', [cookie('zx_login', '', 0), cookie('zx_session', sid, seconds)]);
        } catch (e) {
          const reason = e instanceof WebError ? e.reason : 'format';
          // Fixed categories only: never log raw exceptions, bodies, URLs, codes or credentials.
          console.warn('[zhihu-oauth]', JSON.stringify({ phase, reason, status: e instanceof WebError ? e.status : 502 }));
          return redirect(`/account?auth_error=${phase}_${reason}`, [cookie('zx_login', '', 0)]);
        }
      }
      if (path === '/api/zhihu/logout' && request.method === 'POST') {
        if (request.headers.get('origin') !== url.origin) throw new WebError('请求来源无效。', 403);
        await store.deleteSession(cookieValue(request, 'zx_session')); await store.deleteState(cookieValue(request, 'zx_login'));
        return redirect('/account', [cookie('zx_session', '', 0), cookie('zx_login', '', 0)]);
      }
      if (path === '/api/zhihu/hot' && request.method === 'GET') {
        if (hotCache && hotCache.until > now()) return json(hotCache);
        if (hotBlockedUntil > now()) throw new WebError('热榜暂不可用，请稍后再试。', 429);
        if (!hotFlight) hotFlight = (async () => {
          const data = await upstream('https://developer.zhihu.com/api/v1/content/hot_list?Limit=10', { headers: dataHeaders() });
          if (!Array.isArray(data.Data?.Items)) throw new WebError('热榜数据格式无效。');
          return { items: data.Data.Items.slice(0, 10).map((i: Record<string, unknown>) => ({ title: str(i.Title, 240), url: safeZhihuUrl(i.Url), summary: str(i.Summary, 700) })), fetchedAt: new Date(now()).toISOString(), until: now() + 60000 };
        })();
        try { hotCache = await hotFlight; return json(hotCache); } catch (e) { hotBlockedUntil = now() + 60000; throw e; } finally { hotFlight = undefined; }
      }
      if (['/api/zhihu/contents', '/api/zhihu/followees'].includes(path) && request.method === 'GET') {
        const s = await session(request); const offset = pageOffset(url.searchParams.get('offset') || '0');
        const endpoint = path.endsWith('contents') ? 'contents' : 'followees';
        const target = new URL('https://developer.zhihu.com/api/v1/user/' + endpoint);
        target.searchParams.set('Offset', offset); target.searchParams.set('Limit', '10'); if (endpoint === 'contents') target.searchParams.set('ContentType', 'all');
        let data;
        try { data = await upstream(target.href, { headers: dataHeaders(s.token) }); }
        catch (e) { if (e instanceof WebError && e.status === 401) await store.deleteSession(cookieValue(request, 'zx_session')); throw e; }
        if (!Array.isArray(data.Data?.Items) || typeof data.Data?.Paging?.IsEnd !== 'boolean') throw new WebError('分页响应不完整。');
        const paging = data.Data.Paging;
        const next = paging.IsEnd ? null : pageOffset(paging.NextOffset);
        if (next === offset) throw new WebError('分页位置没有前进，请稍后重试。');
        return json({ items: data.Data.Items.slice(0, 10).map((i: Record<string, unknown>) => ({ title: str(endpoint === 'contents' ? i.Title : i.Fullname, 240), url: safeZhihuUrl(i.Url), summary: str(endpoint === 'contents' ? i.Summary : i.Headline, 1000), avatar: safeZhihuUrl(i.AvatarUrl, true) })), next });
      }
      return json({ error: '不支持的请求。' }, 405);
    } catch (e) { return json({ error: e instanceof WebError ? e.message : '知乎连接暂时失败，请稍后重试。' }, e instanceof WebError ? e.status : 502); }
  };
}
