import test from 'node:test';
import assert from 'node:assert/strict';
import { createZhihuWeb, parseLossless, pageOffset, safeZhihuUrl } from './zhihu-web.ts';
import { authErrorMessage } from './zhihu-auth-message.ts';
const env = { ZHIHU_OAUTH_APP_ID: '419', ZHIHU_OAUTH_APP_KEY: 'mock-key', ZHIHU_ACCESS_SECRET: 'mock-secret', ZHIHU_OAUTH_REDIRECT_URI: 'http://localhost:3000/callback' };
const req = (path: string, cookie = '', extra: RequestInit = {}) => new Request('http://localhost:3000' + path, { ...extra, headers: { cookie, ...extra.headers } });

test('Workers-compatible OAuth transport rejects redirects without forwarding secrets', async () => {
  let calls = 0;
  const handle = createZhihuWeb(env, (async (_url, init) => {
    calls++;
    assert.equal(init?.redirect, 'manual');
    return new Response(null, { status: 302, headers: { Location: 'https://unexpected.example/' } });
  }) as typeof fetch);
  const start = await handle(req('/api/zhihu/login'));
  const state = new URL(start.headers.get('location')!).searchParams.get('state');
  const cookie = start.headers.getSetCookie()[0].split(';')[0];
  const callback = await handle(req(`/callback?state=${state}&authorization_code=test-code`, cookie));
  assert.equal(callback.headers.get('location'), '/account?auth_error=token_rejected');
  assert.equal(calls, 1);
  assert.equal(callback.headers.getSetCookie().some(c => c.startsWith('zx_session=')), false);
});
test('OAuth diagnostics isolate token/profile failures without exposing upstream secrets', async () => {
  for (const scenario of ['token_rejected', 'token_format', 'profile_rejected', 'profile_format', 'token_network', 'token_timeout']) {
    let calls = 0;
    const handle = createZhihuWeb(env, (async () => {
      calls++;
      if (scenario === 'token_network') throw new Error('mock-key private-token');
      if (scenario === 'token_timeout') throw new DOMException('private-token', 'TimeoutError');
      if (calls === 1 && scenario.startsWith('profile')) return Response.json({ access_token: 'private-token', expires_in: 3600 });
      if (scenario.endsWith('rejected')) return Response.json({ code: 401, message: 'private-token mock-key' });
      return Response.json({ unexpected: 'private-token mock-key' });
    }) as typeof fetch);
    const start = await handle(req('/api/zhihu/login'));
    const state = new URL(start.headers.get('location')!).searchParams.get('state');
    const cookie = start.headers.getSetCookie()[0].split(';')[0];
    const response = await handle(req(`/callback?state=${state}&authorization_code=private-code`, cookie));
    assert.equal(response.headers.get('location'), `/account?auth_error=${scenario}`);
    assert.equal(response.headers.getSetCookie().some(c => c.startsWith('zx_session=')), false);
    assert.equal(authErrorMessage(scenario).includes('失败'), true);
    assert.equal(JSON.stringify([...response.headers]).includes('private'), false);
    assert.equal(calls, scenario.startsWith('profile') ? 2 : 1);
  }
  assert.equal(authErrorMessage('private-token'), '登录未完成，请重新尝试。');
});
function fixture() {
  let time = 1800000000000;
  const calls: { url: string; init?: RequestInit }[] = [];
  let revoked = false;
  const handle = createZhihuWeb(env, (async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/access_token')) return Response.json({ access_token: 'mock-user-token', expires_in: 3600 });
    if (String(url).endsWith('/user')) return new Response('{"uid":969570047710216201,"fullname":"测试用户","avatar_path":"https://pic1.zhimg.com/a.jpg","phone_no":"private"}');
    if (revoked) return new Response('', { status: 401 });
    return Response.json({ Code: 0, Data: { Items: [{ Title: '测试问题', Url: 'https://www.zhihu.com/question/1', Summary: '测试摘要' }], Paging: { IsEnd: false, NextOffset: '9007199254740993' } } });
  }) as typeof fetch, () => time);
  async function login() {
    const start = await handle(req('/api/zhihu/login'));
    const state = new URL(start.headers.get('location')!).searchParams.get('state');
    const browser = start.headers.getSetCookie()[0].split(';')[0];
    const callback = `/callback?authorization_code=mock-code&state=${state}`;
    const result = await handle(req(callback, browser));
    const cookie = result.headers.getSetCookie().find(c => c.startsWith('zx_session='))!.split(';')[0];
    return { cookie, browser, callback, result };
  }
  return { handle, calls, login, expire: () => { time += 3601000; }, revoke: () => { revoked = true; } };
}
test('lossless IDs and strict trusted links', () => {
  assert.equal(parseLossless('{"uid":969570047710216201}').uid, '969570047710216201');
  assert.equal(pageOffset('9007199254740993'), '9007199254740993');
  assert.throws(() => pageOffset('1e3'));
  assert.equal(safeZhihuUrl('https://zhihu.com.evil.com/a'), '');
});
test('OAuth login binds browser, consumes state, exposes only public profile', async () => {
  const f = fixture(); const { cookie, browser, callback, result } = await f.login();
  assert.equal(result.headers.get('location'), '/account');
  const session = await (await f.handle(req('/api/zhihu/session', cookie))).json() as { user: { id: string; name: string } };
  assert.equal(session.user.id, '969570047710216201');
  assert.equal(session.user.name, '测试用户');
  assert.equal(JSON.stringify(session).includes('mock-user-token'), false);
  assert.equal(JSON.stringify(session).includes('private'), false);
  assert.equal((await f.handle(req(callback, browser))).headers.get('location'), '/account?auth_error=state');
  assert.equal(f.calls.length, 2);
  assert.equal(new URLSearchParams(String(f.calls[0].init?.body)).get('redirect_uri'), env.ZHIHU_OAUTH_REDIRECT_URI);
});
test('missing, wrong, cross-browser and expired states never exchange tokens', async () => {
  const f = fixture();
  const start = await f.handle(req('/api/zhihu/login'));
  const state = new URL(start.headers.get('location')!).searchParams.get('state');
  const cookie = start.headers.getSetCookie()[0].split(';')[0];
  for (const [path, c] of [['/callback?code=x', cookie], ['/callback?state=wrong&code=x', cookie], [`/callback?state=${state}&code=x`, '']]) {
    assert.equal((await f.handle(req(path, c))).headers.get('location'), '/account?auth_error=state');
  }
  f.expire(); await f.handle(req(`/callback?state=${state}&code=x`, cookie));
  assert.equal(f.calls.length, 0);
});
test('user pagination preserves offset and uses both credentials; revoked token never falls back', async () => {
  const f = fixture(); const { cookie } = await f.login();
  const result = await (await f.handle(req('/api/zhihu/contents', cookie))).json() as { next: string };
  assert.equal(result.next, '9007199254740993');
  await f.handle(req('/api/zhihu/contents?offset=' + result.next, cookie));
  const call = f.calls.at(-1)!;
  assert.equal(new URL(call.url).searchParams.get('Offset'), result.next);
  assert.equal(new Headers(call.init?.headers).get('X-OAuth-Token'), 'mock-user-token');
  f.revoke(); assert.equal((await f.handle(req('/api/zhihu/followees', cookie))).status, 401);
  assert.equal((await f.handle(req('/api/zhihu/contents', cookie))).status, 401);
  assert.equal(f.calls.length, 5);
});
test('logout enforces origin and deletes session; expiry also stops data access', async () => {
  const f = fixture(); const { cookie } = await f.login();
  assert.equal((await f.handle(req('/api/zhihu/logout', cookie, { method: 'POST', headers: { origin: 'https://evil.test' } }))).status, 403);
  assert.equal((await f.handle(req('/api/zhihu/logout', cookie, { method: 'POST', headers: { origin: 'http://localhost:3000' } }))).status, 303);
  assert.equal((await f.handle(req('/api/zhihu/contents', cookie))).status, 401);
  const second = await f.login(); f.expire();
  assert.equal((await f.handle(req('/api/zhihu/contents', second.cookie))).status, 401);
});
test('hot requests are deduplicated and cached; unconfigured routes fail clearly', async () => {
  const f = fixture(); await Promise.all([f.handle(req('/api/zhihu/hot')), f.handle(req('/api/zhihu/hot'))]);
  await f.handle(req('/api/zhihu/hot')); assert.equal(f.calls.length, 1);
  const missing = createZhihuWeb({});
  assert.equal((await missing(req('/api/zhihu/login'))).headers.get('location'), '/account?auth_error=configuration');
  assert.equal((await missing(req('/api/zhihu/hot'))).status, 503);
  const production = createZhihuWeb({ ...env, NODE_ENV: 'production' });
  assert.equal((await production(req('/api/zhihu/session'))).status, 503);
});
