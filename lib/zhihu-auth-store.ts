export type ZhihuUser = { id: string; name: string; avatar: string; headline: string; description: string };
export type ZhihuSession = { token: string; user: ZhihuUser; expires: number };
type Pending = { state: string; expires: number };
export interface AuthStore {
  shared: boolean;
  stateCount(): Promise<number>;
  sessionCount(): Promise<number>;
  putState(key: string, value: Pending): Promise<void>;
  deleteState(key: string): Promise<void>;
  consumeState(key: string, state: string, now: number): Promise<boolean>;
  getSession(key: string, now: number): Promise<ZhihuSession | undefined>;
  putSession(key: string, value: ZhihuSession): Promise<void>;
  deleteSession(key: string): Promise<void>;
  sweep(now: number): Promise<void>;
}
export function memoryAuthStore(): AuthStore {
  const states = new Map<string, Pending>(), sessions = new Map<string, ZhihuSession>();
  return {
    shared: false,
    stateCount: async () => states.size, sessionCount: async () => sessions.size,
    putState: async (k, v) => { states.set(k, v); }, deleteState: async k => { states.delete(k); },
    consumeState: async (k, state, now) => { const v = states.get(k); if (!v || v.state !== state || v.expires <= now) return false; states.delete(k); return true; },
    getSession: async (k, now) => { const v = sessions.get(k); return v && v.expires > now ? v : undefined; },
    putSession: async (k, v) => { sessions.set(k, v); }, deleteSession: async k => { sessions.delete(k); },
    sweep: async now => { for (const [k, v] of states) if (v.expires <= now) states.delete(k); for (const [k, v] of sessions) if (v.expires <= now) sessions.delete(k); },
  };
}
export function d1AuthStore(db: D1Database): AuthStore {
  const count = async (kind: string) => (await db.prepare('SELECT COUNT(*) AS n FROM zhihu_auth WHERE kind = ?').bind(kind).first<{ n: number }>())?.n || 0;
  const put = async (kind: string, key: string, value: Pending | ZhihuSession) => { await db.prepare('INSERT OR REPLACE INTO zhihu_auth(kind, id, payload, expires) VALUES (?, ?, ?, ?)').bind(kind, key, JSON.stringify(value), value.expires).run(); };
  const remove = async (kind: string, key: string) => { if (key) await db.prepare('DELETE FROM zhihu_auth WHERE kind = ? AND id = ?').bind(kind, key).run(); };
  return {
    shared: true,
    stateCount: () => count('state'), sessionCount: () => count('session'),
    putState: (k, v) => put('state', k, v), deleteState: k => remove('state', k),
    consumeState: async (key, state, now) => {
      // One write statement: concurrent callbacks cannot both consume a state.
      const result = await db.prepare("DELETE FROM zhihu_auth WHERE kind = 'state' AND id = ? AND expires > ? AND json_extract(payload, '$.state') = ?").bind(key, now, state).run();
      return result.meta.changes === 1;
    },
    getSession: async (key, now) => {
      if (!key) return undefined;
      const row = await db.prepare("SELECT payload FROM zhihu_auth WHERE kind = 'session' AND id = ? AND expires > ?").bind(key, now).first<{ payload: string }>();
      return row ? JSON.parse(row.payload) as ZhihuSession : undefined;
    },
    putSession: (k, v) => put('session', k, v), deleteSession: k => remove('session', k),
    sweep: async now => { await db.prepare('DELETE FROM zhihu_auth WHERE expires <= ?').bind(now).run(); },
  };
}
