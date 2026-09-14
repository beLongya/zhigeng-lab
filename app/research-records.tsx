'use client';
import { useState } from 'react';
import type { Work } from '../lib/expedition-session';

export default function ResearchRecords({
  work,
  onChange,
}: {
  work: Work;
  onChange: (patch: Partial<Work>) => void;
}) {
  const kind = work.recordScratchKind || '待验证';
  const [notice, setNotice] = useState('');
  const records = work.researchRecords || [];
  return (
    <section className="x-research-records" aria-label="共同研究记录">
      <h3>把想法留下来</h3>
      <p className="x-small">
        不必等 AI 回复，也可以先记下你的判断或疑问。保存不代表事实已被证实。
      </p>
      <label className="x-field">
        我想记下的内容
        <textarea
          value={work.recordScratch || ''}
          maxLength={1000}
          placeholder="例如：这个结论可能只在某个条件下成立，还需要一个反例来检验。"
          onChange={(e) => {
            onChange({ recordScratch: e.target.value });
            setNotice('');
          }}
        />
      </label>
      <div className="x-record-actions">
        <label>
          新记录类型{' '}
          <select
            value={kind}
            onChange={(e) =>
              onChange({ recordScratchKind: e.target.value as typeof kind })
            }
          >
            <option>判断</option>
            <option>支持与反例</option>
            <option>待验证</option>
          </select>
        </label>
        <button
          disabled={!work.recordScratch?.trim() || records.length >= 12}
          onClick={() => {
            onChange({
              researchRecords: [
                ...records,
                { kind, content: work.recordScratch!.trim(), turn: null },
              ],
              recordScratch: '',
            });
            setNotice('已保存到研究记录，仍可继续修改。');
          }}
        >
          保存我的记录
        </button>
      </div>
      <p role="status" className="x-small">
        {notice ||
          (records.length >= 12
            ? '已保留 12 条记录，请先整理现有内容；未保存草稿仍会保留。'
            : `已保存 ${records.length} / 12 条 · 输入草稿自动保留`)}
      </p>
      {records.map((r, i) => (
        <details className="x-record-item" key={i}>
          <summary>
            <span>{r.kind}</span>{' '}
            {r.content.trim().slice(0, 55) || '待补充内容'}
            {r.content.length > 55 ? '…' : ''}
          </summary>
          <label>
            记录 {i + 1} 类型{' '}
            <select
              value={r.kind}
              onChange={(e) =>
                onChange({
                  researchRecords: records.map((item, j) =>
                    j === i
                      ? { ...item, kind: e.target.value as typeof r.kind }
                      : item,
                  ),
                })
              }
            >
              <option>判断</option>
              <option>支持与反例</option>
              <option>待验证</option>
            </select>
          </label>
          <label className="x-field">
            记录 {i + 1} 内容
            <textarea
              maxLength={1000}
              value={r.content}
              onChange={(e) =>
                onChange({
                  researchRecords: records.map((item, j) =>
                    j === i ? { ...item, content: e.target.value } : item,
                  ),
                })
              }
            />
          </label>
          {r.turn === null ? (
            <small>你主动写下的记录</small>
          ) : work.turns?.[r.turn] ? (
            <a
              href={`#discussion-turn-${r.turn}`}
              onClick={() =>
                document
                  .getElementById(`discussion-turn-${r.turn}`)
                  ?.focus({ preventScroll: true })
              }
            >
              回到第 {r.turn + 1} 条讨论 · 核对原话与来源
            </a>
          ) : (
            <small>原讨论当前不可用，记录内容仍保留。</small>
          )}
        </details>
      ))}
    </section>
  );
}
