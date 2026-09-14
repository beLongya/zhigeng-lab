import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { d1AuthStore } from './zhihu-auth-store.ts';
test('shared SQL store atomically consumes state across instances and respects session expiry/logout', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_zhihu_auth.sql', import.meta.url), 'utf8'));
  const db = { prepare: (sql: string) => ({ bind: (...args: (string | number)[]) => ({
    run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }),
    first: async () => sqlite.prepare(sql).get(...args) || null,
  }) }) } as unknown as D1Database;
  const a = d1AuthStore(db), b = d1AuthStore(db);
  try {
    await a.putState('browser', { state: 'random-state', expires: 1000 });
    assert.equal(await b.consumeState('browser', 'wrong', 1), false);
    assert.deepEqual(await Promise.all([a.consumeState('browser', 'random-state', 1), b.consumeState('browser', 'random-state', 1)]), [true, false]);
    const value = { token: 'test-only', user: { id: '1', name: 'test', avatar: '', headline: '', description: '' }, expires: 1000 };
    await a.putSession('session', value);
    assert.deepEqual(await b.getSession('session', 999), value);
    assert.equal(await b.getSession('session', 1000), undefined);
    await b.deleteSession('session'); assert.equal(await a.getSession('session', 1), undefined);
    await a.putState('expired', { state: 'old', expires: 2 });
    assert.equal(await a.consumeState('expired', 'old', 3), false);
    await a.sweep(3); assert.equal(await b.stateCount(), 0);
  } finally { sqlite.close(); }
});
