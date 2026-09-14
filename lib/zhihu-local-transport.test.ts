import test from 'node:test';
import assert from 'node:assert/strict';
import { createZhihuLocalTransport } from './zhihu-local-transport.ts';

test('Zhihu requests have an isolated dispatcher and never follow credential redirects', async () => {
  let count = 0;
  const transport = createZhihuLocalTransport((async (_url, init) => {
    count++;
    assert.ok((init as RequestInit & { dispatcher: unknown }).dispatcher);
    assert.equal(init?.redirect, 'error');
    assert.equal(init?.body, 'test-body');
    return new Response('{}');
  }) as typeof fetch);
  try {
    await transport.fetch('https://openapi.zhihu.com/access_token', { method: 'POST', body: 'test-body', redirect: 'follow' });
    for (const url of ['https://example.com', 'http://openapi.zhihu.com', 'https://openapi.zhihu.com.evil.test', 'https://user:pass@openapi.zhihu.com', 'https://openapi.zhihu.com:8443'])
      await assert.rejects(transport.fetch(url));
    assert.equal(count, 1);
  } finally { await transport.close(); }
});
test('transport does not retry failed token exchanges', async () => {
  let count = 0;
  const transport = createZhihuLocalTransport((async () => { count++; throw new TypeError('fetch failed'); }) as typeof fetch);
  try { await assert.rejects(transport.fetch('https://openapi.zhihu.com/access_token', { method: 'POST' })); assert.equal(count, 1); }
  finally { await transport.close(); }
});
