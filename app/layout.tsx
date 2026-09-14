import type { Metadata } from 'next';
import './globals.css';
import './expedition.css';
import './zhihu.css';
export const metadata: Metadata = {
  title: '知行实验室 · 把知识用出来',
  description: '在调查、决策与带教中，把读过的知识变成自己的方法。',
};
export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
