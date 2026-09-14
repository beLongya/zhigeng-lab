'use client';
import { useState } from 'react';
import ResearchRecords from './research-records';
import type { MissionTask } from '../lib/expedition';
import {
  researchText,
  revisionSpan,
  applyResearchProposal,
  undoResearchProposal,
  type Work,
} from '../lib/expedition-session';

export default function ResearchDraft({
  task,
  work,
  busy,
  onChange,
}: {
  task: MissionTask;
  work: Work;
  busy: boolean;
  onChange: (patch: Partial<Work>) => void;
}) {
  const draft = researchText(work, task.material);
  const [selection, setSelection] = useState<{
    quote: string;
    start: number;
    end: number;
    draft: string;
  } | null>(null);
  const proposal = work.proposal;
  const stale = !!proposal && proposal.before !== draft;
  const changes = proposal
    ? revisionSpan(proposal.before, proposal.after)
    : null;
  return (
    <section id="research-draft" className="x-research" aria-label="共同研究稿">
      <div className="x-research-heading">
        <div>
          <p className="x-eyebrow">共同研究稿</p>
          <h2>把讨论变成一份看得见的成果</h2>
        </div>
        <span>
          {work.done
            ? '已自检'
            : work.researchStarted || work.answer
              ? '编辑中'
              : '待研究初稿'}
        </span>
      </div>
      <p>
        从这份模拟材料开始。你可以直接改写；小舟的建议需要你确认，不会自动覆盖。
      </p>
      <label className="x-field">
        当前研究稿
        <textarea
          className="x-answer"
          value={draft}
          maxLength={2400}
          onSelect={(e) => {
            const el = e.currentTarget;
            const quote = el.value.slice(el.selectionStart, el.selectionEnd);
            if (quote.trim())
              setSelection({
                quote,
                start: el.selectionStart,
                end: el.selectionEnd,
                draft: el.value,
              });
          }}
          onChange={(e) =>
            onChange({
              answer: e.target.value,
              researchStarted: true,
              done: false,
            })
          }
        />
      </label>
      <div className="x-quote-actions">
        <p className="x-small">
          在稿中选中一句话，再围绕它讨论。不会替换输入框里的草稿。
        </p>
        {selection && selection.draft === draft && (
          <blockquote>{selection.quote}</blockquote>
        )}
        <button
          disabled={
            busy ||
            !selection ||
            selection.draft !== draft ||
            selection.quote.length > 800
          }
          onClick={() => {
            if (!selection) return;
            onChange({
              discussionFocus: selection,
              dialogueStatus: 'continue',
            });
            document
              .getElementById('lab-discussion')
              ?.scrollIntoView({ behavior: 'instant', block: 'start' });
            document
              .querySelector<HTMLTextAreaElement>('#discussion-composer')
              ?.focus({ preventScroll: true });
          }}
        >
          围绕选中内容讨论
        </button>
        {selection && selection.quote.length > 800 && (
          <p>请缩小到 800 字以内，先讨论一个具体问题。</p>
        )}
      </div>
      <ResearchRecords work={work} onChange={onChange} />
      <details>
        <summary>查看最初材料</summary>
        <p className="x-research-original">{task.material}</p>
      </details>
      {proposal && (
        <section className="x-revision" aria-label="小舟的修改建议">
          <h3>小舟根据你的指导提出了修改</h3>
          <blockquote>采用你的原话：“{proposal.usedQuote}”</blockquote>
          <p className="x-small">
            高亮标出变化所在范围；多处修改之间可能包含未变文字。先检查，再决定是否采用。
          </p>
          <div className="x-compare">
            <div>
              <small>本次讨论时的研究稿</small>
              <p className="x-revision-text">
                {changes?.prefix}
                {changes?.removed && <del>{changes.removed}</del>}
                {changes?.suffix}
                {!proposal.before && '空白'}
              </p>
            </div>
            <div>
              <small>建议修改为 · 尚未采用</small>
              <p className="x-revision-text">
                {changes?.prefix}
                {changes?.added && <ins>{changes.added}</ins>}
                {changes?.suffix}
              </p>
            </div>
          </div>
          {stale && (
            <p role="status">
              你已继续编辑研究稿，这份建议基于旧稿。请在讨论里让小舟按当前稿重新修改。
            </p>
          )}
          <button
            className="x-primary"
            disabled={busy || stale}
            onClick={() => onChange(applyResearchProposal(work, task.material))}
          >
            采用这版修改
          </button>
          <button
            disabled={busy}
            onClick={() => onChange({ proposal: undefined })}
          >
            暂不采用
          </button>
        </section>
      )}
      {work.lastApplied && (
        <div className="x-revision-receipt">
          <p>已采用小舟的修改，你仍可以继续编辑。</p>
          <button
            disabled={busy || work.answer !== work.lastApplied.after}
            onClick={() => onChange(undoResearchProposal(work))}
          >
            撤回这次采用
          </button>
          {work.answer !== work.lastApplied.after && (
            <p>之后已有手动编辑，为保护新内容，不能直接撤回。</p>
          )}
        </div>
      )}
      <details className="x-research-check">
        <summary>检查这份成果</summary>
        <ul>
          {task.criteria.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <label className="x-check">
          <input
            type="checkbox"
            disabled={busy || !work.answer.trim()}
            checked={!!work.done}
            onChange={(e) => onChange({ done: e.target.checked })}
          />
          我已对照以上要求检查研究稿
        </label>
        {!work.answer.trim() && (
          <p>
            先编辑研究稿或采用一份修改建议，再确认自检。自检不代表 AI 认证。
          </p>
        )}
      </details>
      <details className="x-personal-review">
        <summary>证据笔记（可选）</summary>
        <label className="x-field">
          证据笔记
          <textarea
            value={work.notes}
            maxLength={3000}
            placeholder="记下来源、判断依据，或仍需确认的地方。"
            onChange={(e) => onChange({ notes: e.target.value })}
          />
        </label>
      </details>
      {work.feedback && (
        <details>
          <summary>查看旧版反馈记录（只读）</summary>
          <p>{work.feedback.reply}</p>
          <p>原提交：{work.submittedAnswer || '未记录'}</p>
          <p>指导前：{work.feedback.partnerBefore}</p>
          <p>指导后：{work.feedback.partnerAfter}</p>
        </details>
      )}
    </section>
  );
}
