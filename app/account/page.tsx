'use client';
import { useEffect, useState } from 'react';
import { ZhihuHeader, type ZhihuUser } from '../zhihu-account';
import ZhihuList from '../zhihu-list';
import { authErrorMessage } from '../../lib/zhihu-auth-message';
export default function AccountPage() {
  const [user, setUser] = useState<ZhihuUser | null>(null);
  const [busy, setBusy] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'contents' | 'followees'>('contents');
  useEffect(() => {
    const controller = new AbortController();
    const reason = new URLSearchParams(location.search).get('auth_error');
    if (reason) { setError(authErrorMessage(reason)); history.replaceState(null, '', '/account'); }
    fetch('/api/zhihu/session', { signal: controller.signal, cache: 'no-store' }).then(async r => { const d = await r.json() as { error?: string; user: ZhihuUser | null; loginConfigured: boolean }; if (!r.ok) throw new Error(d.error); setUser(d.user); setReady(d.loginConfigured); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message || '无法读取登录状态。'); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, []);
  return <div className="zh-page"><ZhihuHeader /><main className="zh-main">
    <p className="zh-eyebrow">YOUR KNOWLEDGE, CONNECTED</p><h1>我的知乎</h1>
    {error && <div className="zh-notice" role="alert">{error}</div>}
    {busy ? <p role="status">正在确认登录状态…</p> : user ? <>
      <section className="zh-profile">{user.avatar && <img className="zh-avatar zh-avatar-large" src={user.avatar} alt={`${user.name}的头像`} referrerPolicy="no-referrer" />}<div><h2>{user.name}</h2><p>{user.headline || '欢迎回到知行实验室'}</p>{user.description && <p>{user.description}</p>}</div><form method="post" action="/api/zhihu/logout"><button>退出登录</button></form></section>
      <div className="zh-tabs" role="tablist" aria-label="知乎公开数据">{(['contents', 'followees'] as const).map(t => <button key={t} role="tab" id={`tab-${t}`} aria-controls="zh-panel" aria-selected={tab === t} onClick={() => setTab(t)}>{t === 'contents' ? '我的创作' : '关注的人'}</button>)}</div>
      <div id="zh-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}><ZhihuList key={tab} kind={tab} /></div>
    </> : <section className="zh-profile"><div><h2>把你的知乎带进实验室</h2><p>登录后查看个人资料、公开创作与关注的人。未登录也可以继续使用实验室。</p>{ready ? <a className="zh-button" href="/api/zhihu/login">使用知乎登录 ↗</a> : <p className="zh-notice">登录暂未就绪：服务端需要配置 App Key 和已登记的回调地址。</p>}<p className="zh-muted">授权在知乎官方页面完成。你的登录令牌仅保存在服务端。</p><a href="/">返回实验室 →</a></div></section>}
  </main></div>;
}
