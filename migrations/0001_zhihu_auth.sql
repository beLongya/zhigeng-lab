CREATE TABLE IF NOT EXISTS zhihu_auth (
  kind TEXT NOT NULL CHECK(kind IN ('state', 'session')),
  id TEXT NOT NULL,
  payload TEXT NOT NULL,
  expires INTEGER NOT NULL,
  PRIMARY KEY (kind, id)
);
CREATE INDEX IF NOT EXISTS zhihu_auth_expiry ON zhihu_auth(expires);
CREATE TABLE IF NOT EXISTS demo_budget (bucket TEXT PRIMARY KEY, used INTEGER NOT NULL);
