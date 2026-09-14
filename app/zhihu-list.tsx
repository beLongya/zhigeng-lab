'use client';
import { useEffect, useRef, useState } from 'react';
type Item = { title: string; url: string; summary: string; avatar?: string };
export default function ZhihuList({ kind }: { kind: 'hot' | 'contents' | 'followees' }) {
  const [items, setItems] = useState<Item[]>([]);
  const [next, setNext] = useState<string | null>('0');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [authLost, setAuthLost] = useState(false);
  const [updated, setUpdated] = useState('');
  const controller = useRef<AbortController | null>(null);
  const locked = useRef(false);
  async function load(offset: string, replace = false) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    const active = new AbortController(); controller.current = active;
    try {
      const r = await fetch(`/api/zhihu/${kind}?offset=${encodeURIComponent(offset)}`, { signal: active.signal, cache: 'no-store' });
      const d = await r.json() as { error?: string; items: Item[]; next?: string | null; fetchedAt?: string };
      if (!r.ok) { if (r.status === 401) { setItems([]); setAuthLost(true); } throw new Error(d.error || '暂时无法读取，请稍后重试。'); }
      if (!Array.isArray(d.items)) throw new Error('数据格式异常，请稍后重试。');
      setItems(old => replace ? d.items : [...old, ...d.items]); setNext(d.next ?? null);
      if (d.fetchedAt) setUpdated(new Date(d.fetchedAt).toLocaleTimeString('zh-CN'));
    } catch (e) { if (!active.signal.aborted) setError(e instanceof Error ? e.message : '网络连接失败。'); }
    finally { if (!active.signal.aborted) { locked.current = false; setBusy(false); } }
  }
  useEffect(() => { void load('0', true); return () => { controller.current?.abort(); locked.current = false; }; }, []);
  return <section className="zh-list" aria-busy={busy}>
    {updated && <p className="zh-muted">更新于 {updated} · 服务端缓存 60 秒</p>}
    {items.map((item, index) => <article className="zh-item" key={`${item.url}-${index}`}>
      {kind === 'hot' && <span className="zh-rank">{String(index + 1).padStart(2, '0')}</span>}
      {item.avatar && <img className="zh-avatar" src={item.avatar} alt="" referrerPolicy="no-referrer" loading="lazy" />}
      <div><h2>{item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer">{item.title || '查看知乎原文'} ↗</a> : item.title || '未命名内容'}</h2>{item.summary && <p>{item.summary}</p>}</div>
    </article>)}
    {busy && <p className="zh-loading" role="status">正在连接知乎，读取{kind === 'hot' ? '热门话题' : kind === 'contents' ? '创作' : '关注'}…</p>}
    {error && <div className="zh-notice" role="alert"><p>{error}</p>{authLost ? <a className="zh-button" href="/api/zhihu/login">重新登录知乎</a> : <button onClick={() => void load(next || '0', kind === 'hot')} disabled={busy}>重试</button>}</div>}
    {!busy && !error && !items.length && <p className="zh-muted">{kind === 'hot' ? '知乎暂未返回热榜内容。' : '目前没有可展示的公开数据。'}</p>}
    {!busy && !error && next !== null && <button className="zh-button" onClick={() => void load(next)}>加载更多</button>}
    {!busy && !error && kind === 'hot' && <button onClick={() => void load('0', true)}>刷新热榜</button>}
    {!busy && !error && kind !== 'hot' && next === null && items.length > 0 && <p className="zh-muted">已加载全部公开内容</p>}
  </section>;
}
