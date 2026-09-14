'use client';
import { useEffect, useRef, useState } from 'react';
import type { Expedition, MissionTask } from '../lib/expedition';
import { activeLearningProbe, probeChoices, type LearningProbe } from '../lib/learning';
import { researchText, type Work } from '../lib/expedition-session';
import {
  dialogueMessage,
  resolveLabRecipient,
  labNames,
  type LabRecipient,
  type DialogueIntent,
  type DialogueReply,
} from '../lib/dialogue';

export default function PracticeConversation({
  plan,
  task,
  work,
  onChange,
  onBusy,
  onReview,
}: {
  plan: Expedition;
  task: MissionTask;
  work: Work;
  onChange: (patch: Partial<Work>) => void;
  onBusy: (value: string) => void;
  onReview: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [pendingMessage, setPendingMessage] = useState('');
  const [pendingRole, setPendingRole] = useState<LabRecipient>('auto');
  const [freshIndex, setFreshIndex] = useState<number | null>(null);
  const [error, setError] = useState('');
  const recordDraft = work.pendingRecord;
  const setRecordDraft = (value: Work['pendingRecord'] | null) =>
    onChange({ pendingRecord: value || undefined });
  const abort = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const transcript = useRef<HTMLDivElement | null>(null);
  const draftRef = useRef(work.dialogueDraft || '');
  const turns = work.turns || [];
  const activeProbe = activeLearningProbe(turns);
  const focus = work.discussionFocus;
  const staleFocus =
    !!focus && focus.draft !== researchText(work, task.material);
  draftRef.current = work.dialogueDraft || '';
  const recipient = work.recipient || (turns.length ? 'auto' : 'mentor');
  const recipientName = labNames[recipient];
  let sendName = recipientName;
  try {
    sendName =
      labNames[resolveLabRecipient(work.dialogueDraft || '', recipient)];
  } catch {
    /* Explain ambiguous mentions when the user submits. */
  }
  useEffect(() => {
    if (transcript.current)
      transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [turns.length, pendingMessage]);
  useEffect(() => () => abort.current?.abort(), []);
  const full = turns.length >= 23;
  async function send(action: DialogueIntent, target = recipient, probeKind?: LearningProbe['kind']) {
    if (lock.current || full) return;
    if (staleFocus) {
      setError('研究稿已变化，请重新选中原句，或移除引用后继续。');
      return;
    }
    const message = work.dialogueDraft?.trim() || '';
    if (['reply', 'ask', 'message'].includes(action) && !message) return;
    let addressed: LabRecipient;
    try {
      addressed = resolveLabRecipient(
        ['reply', 'ask', 'message'].includes(action) ? message : '',
        target,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '请先选择一位回应。');
      return;
    }
    setPendingRole(addressed);
    lock.current = true;
    setPending(true);
    onBusy('dialogue');
    setError('');
    const control = new AbortController();
    abort.current = control;
    const label =
      action === 'start'
        ? ''
        : action === 'hint'
          ? '我还不确定，能给我一点提示吗？'
          : action === 'probe'
            ? `小舟，围绕刚才的知识，${probeChoices.find(c => c.kind === probeKind)?.label || '换个情境'}，和我一起试试。`
            : action === 'explain'
              ? '我想先听明白，请讲讲这个问题的思路和适用条件。'
              : message;
    setPendingMessage(label);
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      control.abort();
    }, 75000);
    try {
      const response = await fetch('/api/explore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: control.signal,
        body: JSON.stringify({
          action: 'dialogue',
          intent: action,
          probeKind,
          recipient: addressed,
          message: label,
          plan: {
            topic: plan.topic,
            goal: plan.goal,
            scene: plan.scene,
            sources: plan.sources,
          },
          task,
          researchDraft: researchText(work, task.material),
          focusQuote: focus?.quote,
          researchRecords: work.researchRecords,
          notes: work.notes,
          turns,
        }),
      });
      const result = (await response.json()) as {
        dialogue?: DialogueReply;
        error?: string;
      };
      if (!response.ok || !result.dialogue)
        throw Error(result.error || '伙伴暂时没能回应，你的输入仍然保留。');
      const speaker = result.dialogue.speaker;
      if (!speaker || !['mentor', 'peer', 'colleague'].includes(speaker))
        throw Error('本次没有收到明确的发言角色，你的输入已保留。');
      const additions = label
        ? [
            {
              role: 'user' as const,
              content: label,
              recipient: addressed,
              focusQuote: focus?.quote,
            },
          ]
        : [];
      setFreshIndex(turns.length + additions.length);
      onChange({
        ...(action === 'probe' ? { recipient: 'peer' as const } : {}),
        turns: [
          ...turns,
          ...additions,
          {
            role: 'assistant',
            content: dialogueMessage(result.dialogue),
            speaker,
            insight: result.dialogue.insight,
            probe: result.dialogue.probe,
            evidence: result.dialogue.evidence,
            support: result.dialogue.support,
            sourceIds: result.dialogue.sourceIds || [],
            focusQuote: focus?.quote,
          },
        ],
        dialogueStatus:
          speaker === 'mentor' ? 'continue' : result.dialogue.status,
        ...(result.dialogue.revision
          ? { proposal: result.dialogue.revision }
          : {}),
        ...(['reply', 'ask', 'message'].includes(action) &&
        draftRef.current.trim() === message
          ? { dialogueDraft: '' }
          : {}),
      });
    } catch (e) {
      setError(
        e instanceof Error && e.name === 'AbortError'
          ? timedOut
            ? '这次等待有些久，还没有收到完整回复。你的输入已保留，可以稍后再试。'
            : '已取消，原来的对话和输入都还在。'
          : e instanceof Error
            ? e.message
            : '连接中断，请稍后再试。',
      );
    } finally {
      window.clearTimeout(timeout);
      lock.current = false;
      setPending(false);
      setPendingMessage('');
      onBusy('');
      abort.current = null;
    }
  }
  return (
    <section
      id="lab-discussion"
      className="x-dialogue"
      data-motion={work.reducedMotion ? 'reduced' : 'full'}
      aria-label="实验室课题讨论"
    >
      <p className="x-eyebrow">课题讨论室</p>
      <h2>从你的疑问开始，一起想明白</h2>
      <p>导师帮你解惑，小舟陪你换个情境想一想，同门带来其他视角。</p>
      <div className="x-lab-people" aria-label="AI 讨论伙伴">
        {(['mentor', 'peer', 'colleague'] as const).map((role) => (
          <span key={role} data-active={turns.at(-1)?.speaker === role}>
            <strong>{labNames[role]}</strong>
            <small>
              AI 模拟 ·{' '}
              {role === 'mentor'
                ? '梳理疑问'
                : role === 'peer'
                  ? '一起尝试'
                  : '补充视角'}
            </small>
          </span>
        ))}
      </div>
      {!turns.length ? (
        <>
          <p>
            直接问你真正好奇的问题，不必先写笔记或完成任务。解释后，你可以继续追问，也可以和小舟试试怎么用。
          </p>
          <button
            disabled={pending}
            onClick={() => {
              if (!work.dialogueDraft?.trim())
                onChange({ dialogueDraft: plan.topic, recipient: 'mentor' });
              document.getElementById('discussion-composer')?.focus();
            }}
          >
            从我选择的话题开始问
          </button>
        </>
      ) : null}
      {
        <>
          <div
            ref={transcript}
            className="x-dialogue-transcript"
            role="log"
            aria-label="课题讨论记录"
            aria-live="polite"
            aria-relevant="additions"
          >
            {turns.map((turn, i) => (
              <article
                className={`x-dialogue-turn x-dialogue-${turn.role}${turn.speaker === 'mentor' ? ' x-dialogue-mentor' : ''}`}
                key={i}
                id={`discussion-turn-${i}`}
                tabIndex={-1}
                data-fresh={i === freshIndex}
              >
                <small>
                  {turn.role === 'user'
                    ? `你${turn.recipient && turn.recipient !== 'auto' ? ` → @${labNames[turn.recipient]}` : ''}`
                    : `${labNames[turn.speaker || 'peer']} · AI 模拟`}
                </small>
                <p>{turn.content}</p>
                {turn.probe && (
                  <small className="x-learning-target">
                    这次一起想清楚：{turn.probe.target}
                  </small>
                )}
                {turn.evidence && (
                  <aside className="x-lab-insight" aria-label="本轮理解线索">
                    <strong>这句话提供了一条理解线索</strong>
                    <blockquote>{turn.evidence.quote}</blockquote>
                    <p>{turn.evidence.observation}</p>
                    <p>还可以观察：{turn.evidence.next}</p>
                    <small>
                      基于本轮交流的 AI
                      暂定反馈，可能有误；不代表独立完成或长期掌握。你可以直接提出异议。
                    </small>
                  </aside>
                )}
                {turn.focusQuote && (
                  <blockquote className="x-focus-quote">
                    讨论的原句：{turn.focusQuote}
                  </blockquote>
                )}
                {turn.role === 'assistant' && (
                  <button
                    disabled={
                      pending ||
                      !!recordDraft ||
                      (work.researchRecords?.length || 0) >= 12
                    }
                    onClick={() =>
                      setRecordDraft({
                        kind: '待验证',
                        content: (turn.insight || turn.content).slice(0, 1000),
                        turn: i,
                      })
                    }
                  >
                    整理为研究记录
                  </button>
                )}
                {turn.insight && !work.parkedInsights?.includes(i) && (
                  <aside className="x-lab-insight" aria-label="待验证的启发">
                    <strong>一个值得验证的新角度</strong>
                    <p>{turn.insight}</p>
                    <button
                      type="button"
                      disabled={
                        pending ||
                        full ||
                        work.dialogueStatus === 'paused' ||
                        !!work.dialogueDraft?.trim()
                      }
                      onClick={() => {
                        const draft = `关于你提到的“${turn.insight}”，我们可以怎样验证？`;
                        draftRef.current = draft;
                        onChange({
                          dialogueDraft: draft,
                          recipient: turn.speaker || 'auto',
                          discussionFocus: undefined,
                        });
                      }}
                    >
                      展开讨论
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onChange({
                          parkedInsights: [...(work.parkedInsights || []), i],
                        })
                      }
                    >
                      先放一边
                    </button>
                    {!!work.dialogueDraft?.trim() && (
                      <small>先处理输入框里的草稿，再展开这个角度。</small>
                    )}
                  </aside>
                )}
                {!!turn.sourceIds?.length && (
                  <div className="x-dialogue-citations">
                    参考资料：
                    {plan.sources
                      .filter((s) => turn.sourceIds?.includes(s.id))
                      .map((s) => (
                        <a
                          key={s.id}
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {s.title}
                        </a>
                      ))}
                  </div>
                )}
              </article>
            ))}
            {pendingMessage && (
              <article className="x-dialogue-turn x-dialogue-user">
                <small>你 · {labNames[pendingRole]} · 等待回应</small>
                <p>{pendingMessage}</p>
              </article>
            )}
          </div>
          {!!work.parkedInsights?.some((i) => turns[i]?.insight) && (
            <details className="x-parked-insights">
              <summary>
                暂时搁置的启发（
                {work.parkedInsights.filter((i) => turns[i]?.insight).length}）
              </summary>
              <p className="x-small">
                搁置不是删除。恢复只展开卡片，不会发送消息或覆盖你的草稿。
              </p>
              {work.parkedInsights
                .filter((i) => turns[i]?.insight)
                .map((i) => (
                  <article key={i}>
                    <p>{turns[i].insight}</p>
                    <button
                      onClick={() =>
                        onChange({
                          parkedInsights: work.parkedInsights!.filter(
                            (id) => id !== i,
                          ),
                        })
                      }
                    >
                      恢复第 {i + 1} 条启发
                    </button>
                    <a href={`#discussion-turn-${i}`}>查看原讨论</a>
                  </article>
                ))}
            </details>
          )}
          {work.dialogueStatus === 'resolved' && (
            <div className="x-dialogue-closure">
              <p>这一处，我们先理清了。</p>
              <p>可以继续问、换个情境验证，也可以先停在这里。不必提交成果。</p>
              <button onClick={onReview}>查看研究稿与修改建议</button>
            </div>
          )}
          {(turns.at(-1)?.speaker === 'mentor' || work.dialogueStatus === 'resolved') && !pending && !activeProbe && (
            <div className="x-dialogue-bridge">
              <p>
                讲解听起来有道理，换个情境还能判断吗？也可以继续向导师追问，不急着回答。
              </p>
              {probeChoices.map(choice => <button
                key={choice.kind}
                title={choice.description}
                disabled={
                  full ||
                  !!work.dialogueDraft?.trim() ||
                  work.dialogueStatus === 'paused' ||
                  staleFocus
                }
                onClick={() => void send('probe', 'peer', choice.kind)}
              >
                {choice.label}
              </button>)}
              <small>每次只讨论一个问题，不计分，也可以随时先听讲解。</small>
              {!!work.dialogueDraft?.trim() && (
                <small>先发送或整理输入框里的草稿，再开启新情境。</small>
              )}
            </div>
          )}
          {work.proposal && (
            <button onClick={onReview}>查看小舟提出的修改 · 等你确认</button>
          )}
          {recordDraft && (
            <section className="x-record-confirm" aria-label="确认研究记录">
              <h3>把这次讨论留下来</h3>
              <p>
                这是讨论内容的草稿，请删去不需要的部分，并选择它在研究中的用途。
              </p>
              <p className="x-small">
                整理中的内容自动保留，确认后才进入研究记录。
              </p>
              <label>
                记录类型{' '}
                <select
                  value={recordDraft.kind}
                  onChange={(e) =>
                    setRecordDraft({
                      ...recordDraft,
                      kind: e.target.value as typeof recordDraft.kind,
                    })
                  }
                >
                  <option>判断</option>
                  <option>支持与反例</option>
                  <option>待验证</option>
                </select>
              </label>
              <label className="x-field">
                记录内容
                <textarea
                  maxLength={1000}
                  value={recordDraft.content}
                  onChange={(e) =>
                    setRecordDraft({ ...recordDraft, content: e.target.value })
                  }
                />
              </label>
              <button
                disabled={
                  !recordDraft.content.trim() ||
                  (work.researchRecords?.length || 0) >= 12
                }
                onClick={() => {
                  onChange({
                    pendingRecord: undefined,
                    researchRecords: [
                      ...(work.researchRecords || []),
                      { ...recordDraft, content: recordDraft.content.trim() },
                    ],
                  });
                }}
              >
                确认保存到研究记录
              </button>
              <button onClick={() => setRecordDraft(null)}>暂不保存</button>
            </section>
          )}
          {(work.researchRecords?.length || 0) >= 12 && (
            <p>已保留 12 条研究记录，可以回到研究稿整理现有内容。</p>
          )}
          <details className="x-dialogue-sources">
            <summary>本课题可核对的资料（{plan.sources.length}）</summary>
            {plan.sources.length ? (
              plan.sources.map((s) => (
                <p key={s.id}>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.title} · {s.author}
                  </a>
                </p>
              ))
            ) : (
              <p>
                本课题尚未接入可核对的知乎资料；模拟材料和 AI
                解释都不应直接当作已证实的结论。
              </p>
            )}
          </details>
          {work.dialogueStatus === 'paused' ? (
            <div>
              <p>先放一放也没关系，对话已保留。</p>
              <button onClick={() => onChange({ dialogueStatus: 'continue' })}>
                继续聊这个问题
              </button>
            </div>
          ) : (
            !full && (
              <>
                <fieldset className="x-dialogue-tools" aria-label="请谁回应">
                  <legend>自由讨论，也可以指定一位伙伴</legend>
                  {(['auto', 'mentor', 'peer', 'colleague'] as const).map(
                    (role) => (
                      <button
                        key={role}
                        type="button"
                        aria-pressed={recipient === role}
                        disabled={pending}
                        onClick={() => onChange({ recipient: role })}
                      >
                        {role === 'auto' ? '自由讨论' : `@${labNames[role]}`}
                      </button>
                    ),
                  )}
                </fieldset>
                {activeProbe && <aside className="x-dialogue-bridge" aria-label="当前一起研究的问题">
                  <p>正在想清楚：{activeProbe.target}</p>
                  <small>可以写判断和理由，也可以说哪里卡住。不必一次答完整。</small>
                  <div>
                    <button disabled={pending || !!work.dialogueDraft?.trim()} onClick={() => void send('hint', 'peer')}>给我一点线索</button>
                    <button disabled={pending || !!work.dialogueDraft?.trim()} onClick={() => void send('explain', 'mentor')}>先听导师讲清楚</button>
                  </div>
                </aside>}
                <details className="x-dialogue-support">
                  <summary>没想好怎么说？</summary>
                  <fieldset
                    className="x-dialogue-tools"
                    aria-label="需要一点帮助"
                  >
                    <button
                      disabled={pending || !turns.length}
                      onClick={() => void send('hint')}
                    >
                      给我一点提示
                    </button>
                    <button
                      disabled={pending}
                      onClick={() => void send('explain')}
                    >
                      先讲清楚这个问题
                    </button>
                  </fieldset>
                </details>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send('message');
                  }}
                >
                  {focus && (
                    <aside
                      className="x-focus-quote"
                      aria-label="当前讨论的原句"
                    >
                      <strong>围绕这句话讨论</strong>
                      <blockquote>{focus.quote}</blockquote>
                      {staleFocus && (
                        <p role="status">
                          研究稿已变化，请重新选句或移除引用。
                        </p>
                      )}
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => onChange({ discussionFocus: undefined })}
                      >
                        移除引用，继续自由讨论
                      </button>
                    </aside>
                  )}
                  <label className="x-field">
                    在课题里说说
                    <textarea
                      id="discussion-composer"
                      placeholder="说说你的疑问、不同看法，或刚想到的例子。也可以 @导师、@小舟、@同门……"
                      value={work.dialogueDraft || ''}
                      maxLength={2400}
                      onKeyDown={(e) => {
                        if (
                          e.key === 'Enter' &&
                          (e.ctrlKey || e.metaKey) &&
                          !e.nativeEvent.isComposing
                        ) {
                          e.preventDefault();
                          void send('message');
                        }
                      }}
                      onChange={(e) => {
                        draftRef.current = e.target.value;
                        onChange({ dialogueDraft: e.target.value });
                      }}
                    />
                  </label>
                  <p className="x-small">
                    {pending
                      ? `正在等待回应。你可以继续写下一句，新的草稿会保留。`
                      : 'Enter 换行 · Ctrl / ⌘ + Enter 发送'}
                  </p>
                  <button
                    className="x-primary"
                    disabled={
                      pending || staleFocus || !work.dialogueDraft?.trim()
                    }
                    type="submit"
                  >
                    {pending
                      ? '正在回应…'
                      : sendName === '自由讨论'
                        ? '加入讨论'
                        : `发送给${sendName}`}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onChange({ dialogueStatus: 'paused' })}
                  >
                    先放一放
                  </button>
                </form>
              </>
            )
          )}
          {full && (
            <div>
              <p>
                这段对话已经很长了，先把所得整理进下方的个人复盘吧。记录会保留。
              </p>
              <button onClick={onReview}>整理我的发现</button>
            </div>
          )}
        </>
      }
      {pending && (
        <output>
          <span className="x-lab-thinking">
            {pendingRole === 'auto'
              ? '正在结合上下文整理回应'
              : `${labNames[pendingRole]}正在整理想法`}
            …
          </span>{' '}
          <button onClick={() => abort.current?.abort()}>取消等待</button>
        </output>
      )}
      {error && (
        <p role="alert" className="x-validation">
          {error}
        </p>
      )}
      <label className="x-motion-setting">
        <input
          type="checkbox"
          checked={!!work.reducedMotion}
          onChange={(e) => onChange({ reducedMotion: e.target.checked })}
        />
        减少动态效果
      </label>
    </section>
  );
}
