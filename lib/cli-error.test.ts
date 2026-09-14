/* oxlint-disable typescript/no-floating-promises -- Node test registration. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { cliFailure } from './cli-error.ts';
test('separates inaccessible credentials, rate limits and exhausted quota', () => {
  assert.match(
    cliFailure('{"error":{"code":"AUTH_REQUIRED"}}', 3).message,
    /无法读取/,
  );
  assert.match(cliFailure('{"Code":30002}', 4).message, /额度已用尽/);
  assert.match(
    cliFailure('{"error":{"code":"rate_limit"}}', 4).message,
    /限制请求/,
  );
  assert.equal(cliFailure('', 4).status, 429);
  assert.match(cliFailure('', 'ENOENT').message, /未找到/);
});
test('upstream sensitive text is not echoed to clients', () => {
  const e = cliFailure(
    '{"error":{"code":"unknown","message":"PRIVATE_SECRET"}}',
    6,
  );
  assert.ok(!e.message.includes('PRIVATE_SECRET'));
});
