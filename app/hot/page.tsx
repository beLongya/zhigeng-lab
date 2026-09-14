import { ZhihuHeader } from '../zhihu-account';
import ZhihuList from '../zhihu-list';
export default function HotPage() {
  return <div className="zh-page"><ZhihuHeader /><main className="zh-main"><p className="zh-eyebrow">DISCOVER WHAT MATTERS</p><h1>从一个好问题开始</h1><p className="zh-intro">看看此刻知乎正在讨论什么。发现感兴趣的问题，再带回实验室深入研究。</p><ZhihuList kind="hot" /></main></div>;
}
