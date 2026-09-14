'use client';
import { useEffect, useState } from 'react';
export type ZhihuUser = { id: string; name: string; avatar: string; headline: string; description: string };
export function ZhihuAccountButton() {
  const [user, setUser] = useState<ZhihuUser | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/zhihu/session', { signal: controller.signal, cache: 'no-store' }).then(async r => r.ok ? await r.json() as { user?: ZhihuUser } : null).then(d => setUser(d?.user || null)).catch(() => {});
    return () => controller.abort();
  }, []);
  return <a className="zh-account-link" href="/account">{user?.avatar && <img src={user.avatar} alt="" referrerPolicy="no-referrer" />}<span>{user?.name || '知乎登录'}</span></a>;
}
export function ZhihuHeader() {
  return <header className="zh-header"><a href="/">知行实验室 <small> / ZHIXING LAB</small></a><nav><a href="/hot">知乎热榜</a><ZhihuAccountButton /></nav></header>;
}
