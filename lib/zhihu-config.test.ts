import test from 'node:test';
import assert from 'node:assert/strict';
import { zhihuConfig } from './zhihu-config.ts';
test('confirmed loopback callback is preserved exactly but not marked production-ready', () => {
  const config = zhihuConfig({ ZHIHU_OAUTH_REDIRECT_URI: 'http://127.0.0.1', ZHIHU_OAUTH_APP_KEY: 'test-only' });
  assert.equal(config.redirectUri, 'http://127.0.0.1');
  assert.equal(config.oauthConfigured, false);
});
test('configuration does not fabricate missing credentials or callback', () => {
  const config = zhihuConfig({});
  assert.equal(config.appId, '419');
  assert.equal(config.oauthConfigured, false);
  assert.equal(config.appKey, '');
  assert.equal(config.redirectUri, '');
});
test('callback must use HTTPS and contain no credentials or fragment', () => {
  for (const uri of ['http://localhost:3000/callback', 'https://user:pass@example.com/callback', 'https://example.com/callback#token', 'bad']) {
    assert.equal(zhihuConfig({ NODE_ENV: 'production', ZHIHU_OAUTH_APP_KEY: 'test-only', ZHIHU_OAUTH_REDIRECT_URI: uri }).oauthConfigured, false);
  }
  const uri = 'https://example.com/callback';
  assert.equal(zhihuConfig({ ZHIHU_OAUTH_APP_KEY: 'test-only', ZHIHU_OAUTH_REDIRECT_URI: uri }).redirectUri, uri);
  assert.equal(zhihuConfig({ ZHIHU_OAUTH_APP_KEY: 'test-only', ZHIHU_OAUTH_REDIRECT_URI: uri }).oauthConfigured, true);
});
test('confirmed localhost callback works in development only', () => {
  const env = { ZHIHU_OAUTH_APP_KEY: 'test-only', ZHIHU_OAUTH_REDIRECT_URI: 'http://localhost:3000/callback' };
  assert.equal(zhihuConfig(env).oauthConfigured, true);
  assert.equal(zhihuConfig({ ...env, NODE_ENV: 'production' }).oauthConfigured, false);
});
