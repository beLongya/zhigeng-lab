'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Compass,
  ArrowRight,
  BookOpen,
  Check,
  RotateCcw,
  Download,
  MessageCircle,
  FlaskConical,
  LoaderCircle,
} from 'lucide-react';
import {
  people,
  source,
  interview,
  behavior,
  initialLesson,
  type Lesson,
  type PracticeRequest,
  type QuestionKind,
} from '@/lib/practice';

import { fresh, restoreProgress, canConfirm, type State } from '@/lib/progress';
const stages = ['接收任务', '调查取证', '带教小舟', '验证变化', '交付方法'];
const before = behavior(initialLesson);
export default function Page() {
  const [state, setState] = useState<State>(fresh),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [hint, setHint] = useState(''),
    [showSource, setShowSource] = useState(false),
    [reset, setReset] = useState(false),
    [storageWarning, setStorageWarning] = useState('');
  const stateRef = useRef(state);
  const confirmPending = useRef<((value: { saved: boolean }) => void) | null>(
    null,
  );
  const question = state.draftQuestion;
  const setQuestion = (value: string) =>
    setState((s) => ({ ...s, draftQuestion: value }));
  useEffect(() => {
    stateRef.current = state;
    if (state.saved && confirmPending.current) {
      confirmPending.current({ saved: true });
      confirmPending.current = null;
    }
  }, [state]);
  function confirmResult() {
    const current = stateRef.current;
    if (!canConfirm(current))
      return Promise.reject(
        new Error('请先完成成果、具体验证计划和至少一项方法。'),
      );
    if (current.saved) return Promise.resolve({ saved: true });
    return new Promise<{ saved: boolean }>((resolve) => {
      confirmPending.current = resolve;
      setState((s) => ({ ...s, saved: true }));
    });
  }
  const patch = (data: Partial<State>) => setState((s) => ({ ...s, ...data }));
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const raw = localStorage.getItem('zhixing-case-v1');
        if (raw) {
          setState(restoreProgress(raw));
        }
      } catch {
        setStorageWarning('无法读取本地进度，本次从任务开始。');
      }
      setReady(true);
    });
  }, []);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem('zhixing-case-v1', JSON.stringify(state));
      } catch {
        queueMicrotask(() =>
          setStorageWarning('浏览器不允许保存进度；请在离开前导出成果。'),
        );
      }
  }, [state, ready]);
  useEffect(() => {
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool: (tool: unknown, options: unknown) => Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const life = new AbortController();
    try {
      Promise.resolve(
        context.registerTool(
          {
            name: 'read_practice_progress',
            description:
              '读取当前知行副本阶段、调查笔记和已确认的方法，不改变进度。',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute: () => ({
              stage: stages[stateRef.current.step],
              notes: stateRef.current.notes,
              lesson: stateRef.current.lesson,
              saved: stateRef.current.saved,
            }),
          },
          { signal: life.signal },
        ),
      ).catch(() => {});
      Promise.resolve(
        context.registerTool(
          {
            name: 'confirm_practice_result',
            description:
              '确认当前已填写的需求成果和方法卡，保存到此浏览器。必须在交付阶段，且已填写验证计划、有至少一项方法。',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: true },
            execute: (input: unknown) => {
              if (
                !input ||
                typeof input !== 'object' ||
                Object.keys(input).length
              )
                throw new Error('此操作不接受参数。');
              return confirmResult();
            },
          },
          { signal: life.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => life.abort();
  }, []);
  const go = (step: number) => {
    patch({ step });
    setError('');
    setHint('');
  };
  async function request(input: PracticeRequest) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(45000),
      });
      const data = (await res.json()) as {
        error?: string;
        lesson?: Lesson;
        kind?: QuestionKind;
        answer?: string;
      };
      if (!res.ok) throw new Error(data.error || 'AI 请求未完成');
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : '连接失败，输入已保留。');
      return null;
    } finally {
      setBusy(false);
    }
  }
  function note(q: string, kind: QuestionKind, answer?: string) {
    patch({
      notes: [
        ...state.notes,
        {
          person: state.person,
          question: q,
          answer: answer || interview(state.person, kind),
          label: '',
        },
      ],
    });
    setHint(
      kind === 'past'
        ? '你问到了已经发生的行为。注意：这些仍是受访者的自述，不是我们亲眼观察的事实。'
        : kind === 'leading'
          ? '对方表达了态度，但你还不知道实际行为。试着问一次过去的经历。'
          : kind === 'hostile'
            ? '对方开始防卫。可以换成中性、具体的问法。'
            : '得到一个方向了。再追问过去的实际经历，会更容易形成证据。',
    );
  }
  async function ask() {
    if (!question.trim()) return;
    const q = question;
    const data = await request({
      action: 'question',
      text: q,
      person: state.person,
    });
    if (data?.kind && data.answer) {
      note(q, data.kind, data.answer);
      setQuestion('');
    }
  }
  async function teach() {
    const data = await request({ action: 'teach', text: state.instruction });
    if (data?.lesson) {
      patch({ lesson: data.lesson, step: 3, saved: false, mode: 'live' });
      setHint(
        '知乎直答已理解指导。下方行为由固定情境规则执行，不是模型随机生成的成功动画。',
      );
    }
  }
  function guided(e1: boolean, e2: boolean) {
    const e1Quote = e1
      ? '用中性问法询问上一次找座位的经历和当时的解决办法。'
      : '';
    const e2Quote = e2
      ? '将受访者原话和推断分开记录，不把客气话当购买承诺。'
      : '';
    patch({
      mode: 'scripted',
      instruction: [e1Quote, e2Quote].filter(Boolean).join('\n'),
      lesson: {
        e1,
        e2,
        e1Quote,
        e2Quote,
        feedback:
          '这是你主动选择的预设指导练习，未调用 AI。可以观察两项方法各自如何影响行为。',
      },
      step: 3,
      saved: false,
    });
    setError('');
    setHint('预设练习不验证自由输入理解能力。返回带教可切换到真实 AI。');
  }
  function finish() {
    const l = state.lesson;
    patch({
      step: 4,
      report:
        state.report ||
        `当前判断：现有访谈不足以证明大家会购买付费自习舱。\n\n我找到的证据：\n${state.notes
          .filter((n) => n.label)
          .map((n) => `- ${people[n.person].name}（${n.label}）：${n.answer}`)
          .join(
            '\n',
          )}\n\n还不能确定：在具体价格、位置与使用条件下，是否有人愿意试用或付费。\n\n下一步验证：`,
    });
    if (!l.e1 && !l.e2)
      setHint(
        '你可以先交付复盘，也可以返回继续带教。没有学会的方法不会被写入方法卡。',
      );
  }
  function download() {
    const text = `# 知行副本 · 需求调查成果\n\n${state.report}\n\n下一步验证计划：${state.nextPlan}\n\n## 我教给小舟的方法（${state.mode === 'scripted' ? '预设指导练习' : 'AI 理解自由指导'}）\n${state.lesson.e1 ? `中性提问：${state.lesson.e1Quote}\n` : ''}${state.lesson.e2 ? `证据分层：${state.lesson.e2Quote}\n` : ''}\n适用边界：访谈提供线索，不保证商业成功；自述不等于经过核验的事实。\n\n资料：${source.title} — ${source.author}\n${source.url}\n\n本案例人物及经历均为虚构，资料摘要为转述。`;
    const url = URL.createObjectURL(
      new Blob([text], { type: 'text/markdown;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = '知行副本-我的实践成果.md';
    a.click();
    URL.revokeObjectURL(url);
  }
  const after = behavior(state.lesson),
    visited = new Set(state.notes.map((n) => n.person)).size;
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <Compass size={28} />
          知行副本<span>BETA</span>
        </Link>
        <div className="side-label">我的实践空间</div>
        <div className="nav-item">
          <FlaskConical size={18} />
          进行中的副本
        </div>
        <div className="side-motto">
          从「我懂了」
          <br />
          走到「我会了」。
        </div>
        <div className="side-bottom">
          知识炼金场 · 校园新锐季
          <br />
          {ready ? '进度保存在当前浏览器' : '正在恢复进度…'}
        </div>
      </aside>
      <main>
        <header>
          <span>
            校园项目组 <span className="slash">/</span> 需求调查
          </span>
          <span className="pill">模拟实践 · 非真实商业预测</span>
        </header>
        <div className="content">
          <div className="eyebrow">
            CASE 001 <span>从一次访谈开始</span>
          </div>
          <h1>
            大家说愿意，
            <br />
            就真的会买吗？
          </h1>
          <p className="lead">
            你是校园项目负责人。和小舟一起，找出一句「我愿意」背后的真实需求。
          </p>
          <nav className="steps" aria-label="副本进度">
            {stages.map((s, i) => (
              <div
                key={s}
                className={
                  state.step === i ? 'current' : state.step > i ? 'done' : ''
                }
                aria-current={state.step === i ? 'step' : undefined}
              >
                <span>{state.step > i ? <Check size={13} /> : i + 1}</span>
                {s}
              </div>
            ))}
          </nav>
          {storageWarning && (
            <output className="status error">{storageWarning}</output>
          )}
          <div className="work-grid">
            <section className="panel task-panel">
              <div className="section-head">
                <span className="eyebrow">
                  {String(state.step + 1).padStart(2, '0')} /{' '}
                  {stages[state.step]}
                </span>
                <span className="pill">
                  {state.step === 0
                    ? '你的下一步'
                    : state.step === 1
                      ? `已访谈 ${visited}/3 人`
                      : state.step === 2
                        ? '让方法足够具体'
                        : state.step === 3
                          ? '新情境 · 许澄'
                          : '把这次经历带走'}
                </span>
              </div>
              {state.step === 0 && (
                <>
                  <h2>先别急着点头。</h2>
                  <p>
                    团队想在校园里做付费自习空间。预算有限，你要判断：现在就投入搭建，还是先验证需求？
                  </p>
                  <div className="message">
                    <div className="avatar">舟</div>
                    <div>
                      <strong>
                        小舟 <small>你的 AI 项目伙伴</small>
                      </strong>
                      <p>
                        我问了三位同学：「你肯定也觉得付费自习舱很需要吧？」他们都说挺好的。我觉得大家都有购买意愿，可以开始做了！
                      </p>
                    </div>
                  </div>
                  <div className="callout">
                    <BookOpen size={20} />
                    <div>
                      <strong>本次交付</strong>
                      <p>
                        一份有证据边界的需求判断，以及一条你亲自教会小舟的方法。
                      </p>
                    </div>
                  </div>
                  <div className="actions">
                    <Button disabled={!ready} onClick={() => go(1)}>
                      我想先看看证据
                      <ArrowRight />
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!ready}
                      onClick={() =>
                        setHint(
                          '这是一个可以提出的假设，但三句「挺好的」还不是购买承诺。先写清楚依据，再决定是否投入。',
                        )
                      }
                    >
                      我倾向先做起来
                    </Button>
                  </div>
                </>
              )}
              {state.step === 1 && (
                <>
                  <h2>别问「会不会」，先听「发生过什么」。</h2>
                  <div className="person-tabs" aria-label="选择受访者">
                    {people.map((p, i) => (
                      <button
                        key={p.name}
                        disabled={busy}
                        onClick={() => {
                          patch({ person: i });
                          setHint('');
                        }}
                        className={state.person === i ? 'selected' : ''}
                        aria-pressed={state.person === i}
                      >
                        <strong>{p.name}</strong>
                        <small>{p.role}</small>
                      </button>
                    ))}
                  </div>
                  <p className="caption">
                    选择一种问法，或自己输入。预设问题使用策展情境，自由输入由知乎直答分类后匹配固定人物事实。
                  </p>
                  {[
                    [
                      '最近一次找学习或面试空间是什么时候？当时怎么解决的？',
                      'past',
                    ],
                    ['你肯定也觉得有个付费自习舱很需要吧？', 'leading'],
                    ['你对学习空间有什么需求？', 'broad'],
                  ].map(([q, k]) => (
                    <Button
                      className="choice"
                      variant="outline"
                      disabled={busy || state.notes.length >= 18}
                      key={q}
                      onClick={() => note(q, k as QuestionKind)}
                    >
                      {q}
                    </Button>
                  ))}
                  <label htmlFor="question">换你来问</label>
                  <Textarea
                    id="question"
                    value={question}
                    maxLength={1500}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="从对方最近一次实际经历问起…"
                    disabled={busy}
                  />
                  <div className="actions">
                    <Button
                      onClick={ask}
                      disabled={
                        busy || !question.trim() || state.notes.length >= 18
                      }
                    >
                      {busy ? (
                        <LoaderCircle className="spin" />
                      ) : (
                        <MessageCircle />
                      )}
                      发送问题
                    </Button>
                    <span className="caption">最多保留 18 条记录</span>
                  </div>
                  {state.notes
                    .filter((n) => n.person === state.person)
                    .map((n) => {
                      const index = state.notes.indexOf(n);
                      return (
                        <div className="note-row" key={index}>
                          <small>你：{n.question}</small>
                          <div className="message">
                            <div className="avatar">
                              {people[n.person].name.slice(0, 1)}
                            </div>
                            <div>
                              <strong>{people[n.person].name}</strong>
                              <p>{n.answer}</p>
                            </div>
                          </div>
                          <label htmlFor={`label-${index}`}>
                            你会如何记录这条信息？
                          </label>
                          <select
                            id={`label-${index}`}
                            value={n.label}
                            onChange={(e) =>
                              patch({
                                notes: state.notes.map((item, i) =>
                                  i === index
                                    ? { ...item, label: e.target.value }
                                    : item,
                                ),
                              })
                            }
                          >
                            <option value="">选择证据类型</option>
                            <option>受访者自述，尚未核验</option>
                            <option>购买承诺</option>
                            <option>需要进一步追问</option>
                          </select>
                          {n.label === '购买承诺' && (
                            <p className="status error">
                              这段话没有形成明确交易承诺。态度、过往支付和对本方案的购买承诺，需要分开记录。
                            </p>
                          )}
                        </div>
                      );
                    })}
                  <div className="actions">
                    <Button
                      variant="outline"
                      onClick={() => go(0)}
                      disabled={busy}
                    >
                      返回任务
                    </Button>
                    <Button
                      onClick={() => go(2)}
                      disabled={
                        busy || visited < 2 || !state.notes.some((n) => n.label)
                      }
                    >
                      带着证据，去教小舟
                      <ArrowRight />
                    </Button>
                  </div>
                  <p className="caption">
                    先访谈至少两个人，并为至少一条记录标注证据类型。
                  </p>
                </>
              )}
              {state.step === 2 && (
                <>
                  <h2>把你发现的方法，教给小舟。</h2>
                  <div className="message">
                    <div className="avatar">舟</div>
                    <div>
                      <strong>小舟</strong>
                      <p>
                        我哪里问得不对？下次该怎么问，又该怎么写结论？请给我能照着做的方法。
                      </p>
                    </div>
                  </div>
                  <p>
                    你不必一次教会全部。只指导提问，小舟就只改变提问；只指导证据判断，它就只改变结论写法。
                  </p>
                  <label htmlFor="instruction">你的指导</label>
                  <Textarea
                    id="instruction"
                    className="large-input"
                    value={state.instruction}
                    onChange={(e) => patch({ instruction: e.target.value })}
                    maxLength={1500}
                    disabled={busy}
                    placeholder="指出具体一句话的问题，再告诉小舟下一次该怎么做。可以给一个问法示范。"
                  />
                  <p className="caption">
                    例如思考：应该问过去的哪次经历？对方的原话能支持多强的结论？
                  </p>
                  <div className="actions">
                    <Button
                      variant="outline"
                      onClick={() => go(1)}
                      disabled={busy}
                    >
                      回看调查
                    </Button>
                    <Button
                      onClick={teach}
                      disabled={busy || !state.instruction.trim()}
                    >
                      {busy ? (
                        <>
                          <LoaderCircle className="spin" />
                          小舟正在理解…
                        </>
                      ) : (
                        <>
                          让小舟试一次
                          <ArrowRight />
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}
              {state.step === 2 && (
                <details className="guided-mode">
                  <summary>接口限流时，可选择预设指导练习</summary>
                  <p className="caption">
                    不调用
                    AI，也不评价你输入的文字。选择预设方法，单独观察它对小舟行为的影响；会替换当前指导草稿。
                  </p>
                  <div className="actions">
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => guided(true, false)}
                    >
                      只练中性提问
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => guided(false, true)}
                    >
                      只练证据分层
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => guided(true, true)}
                    >
                      练习两项方法
                    </Button>
                  </div>
                </details>
              )}
              {state.step === 3 && (
                <>
                  <h2>
                    {state.lesson.e1 || state.lesson.e2
                      ? '你教的东西，开始改变它的做法。'
                      : '这次指导还不够具体。'}
                  </h2>
                  <span className="pill">
                    {state.mode === 'scripted'
                      ? '预设练习 · 未调用 AI'
                      : '知乎直答 · 真实指导判断'}
                  </span>
                  <p>{state.lesson.feedback}</p>
                  <div className="skill-tags">
                    <span className={state.lesson.e1 ? 'learned' : 'not-yet'}>
                      {state.lesson.e1 ? '✓' : '○'} 中性提问
                    </span>
                    <span className={state.lesson.e2 ? 'learned' : 'not-yet'}>
                      {state.lesson.e2 ? '✓' : '○'} 证据分层
                    </span>
                  </div>
                  <p className="caption">
                    同一位新受访者、同样的隐藏事实。只改变你实际指导的能力。本轮结果替换上一轮，不自动累积。
                  </p>
                  <div className="comparison">
                    <div>
                      <h3>指导前</h3>
                      <small>小舟的问法</small>
                      <p>{before.question}</p>
                      <small>许澄的回答</small>
                      <p>{before.answer}</p>
                      <small>小舟的结论</small>
                      <p>{before.conclusion}</p>
                    </div>
                    <div className="after">
                      <h3>这次指导后</h3>
                      <small>小舟的问法 {state.lesson.e1 && '· 已改变'}</small>
                      <p>{after.question}</p>
                      <small>许澄的回答</small>
                      <p>{after.answer}</p>
                      <small>小舟的结论 {state.lesson.e2 && '· 已改变'}</small>
                      <p className="preline">{after.conclusion}</p>
                    </div>
                  </div>
                  {state.lesson.e1 && (
                    <p className="source-quote">
                      改变依据：你说「{state.lesson.e1Quote}」
                    </p>
                  )}
                  {state.lesson.e2 && (
                    <p className="source-quote">
                      改变依据：你说「{state.lesson.e2Quote}」
                    </p>
                  )}
                  <div className="actions">
                    <Button variant="outline" onClick={() => go(2)}>
                      修改指导，再试一次
                    </Button>
                    <Button onClick={finish}>
                      整理我的成果
                      <ArrowRight />
                    </Button>
                  </div>
                </>
              )}
              {state.step === 4 && (
                <>
                  <h2>把一次「做过」，留下成自己的方法。</h2>
                  <label htmlFor="report">
                    需求判断 · 请补完下一步验证计划
                  </label>
                  <Textarea
                    id="report"
                    className="report"
                    value={state.report}
                    maxLength={6000}
                    onChange={(e) =>
                      patch({ report: e.target.value, saved: false })
                    }
                  />
                  <label htmlFor="next-plan">你下一步要怎样验证？</label>
                  <Textarea
                    id="next-plan"
                    value={state.nextPlan}
                    maxLength={1000}
                    placeholder="写出对象、具体行动和你要观察的证据，例如邀请不同使用场景的同学试用，并记录是否实际到场。"
                    onChange={(e) =>
                      patch({ nextPlan: e.target.value, saved: false })
                    }
                  />
                  <div className="method-card">
                    <div className="eyebrow">我的方法卡</div>
                    <h3>
                      {state.lesson.e1 && state.lesson.e2
                        ? '先问经历，再分证据'
                        : state.lesson.e1
                          ? '先问真实经历'
                          : state.lesson.e2
                            ? '不要把态度当承诺'
                            : '待形成：具体的指导方法'}
                    </h3>
                    {state.lesson.e1 && <p>中性提问：{state.lesson.e1Quote}</p>}
                    {state.lesson.e2 && <p>证据分层：{state.lesson.e2Quote}</p>}
                    <p className="caption">
                      适用：早期需求访谈。边界：自述仍需核验；过去愿意支付不保证未来购买。本版本不声称已验证跨副本迁移或学习提升。
                    </p>
                    <a
                      className="source-link"
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      方法参考：{source.title} ↗
                    </a>
                  </div>
                  <div className="actions">
                    <Button variant="outline" onClick={() => go(3)}>
                      回看变化
                    </Button>
                    <Button
                      onClick={() => {
                        void confirmResult().catch((error) =>
                          setError(error.message),
                        );
                      }}
                      disabled={state.saved || !canConfirm(state)}
                    >
                      {state.saved ? (
                        <>
                          <Check />
                          已确认入库
                        </>
                      ) : (
                        '确认成果与方法卡'
                      )}
                    </Button>
                    <Button variant="outline" onClick={download}>
                      <Download />
                      导出成果
                    </Button>
                  </div>
                  {state.saved && (
                    <output className="status">
                      已保存到此浏览器。你可以导出成果，带到真实的下一次访谈中使用。
                    </output>
                  )}
                </>
              )}
              {hint && <output className="status">{hint}</output>}
              {error && (
                <p role="alert" className="status error">
                  {error}
                </p>
              )}
            </section>
            <aside className="context">
              <section className="panel">
                <BookOpen size={24} />
                <h3>
                  先有依据，
                  <br />
                  再有判断。
                </h3>
                <p>资料不是标准答案。把其中的方法用到你眼前这次访谈里。</p>
                <Button
                  variant="outline"
                  onClick={() => setShowSource(!showSource)}
                  aria-expanded={showSource}
                >
                  {showSource ? '收起资料' : '查阅知乎资料'}
                  <BookOpen />
                </Button>
                {showSource && (
                  <div className="source-block">
                    <strong>{source.title}</strong>
                    <p>{source.summary}</p>
                    <p className="caption">
                      作者：{source.author}
                      <br />
                      {source.kind}
                    </p>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="source-link"
                    >
                      前往知乎核对原文 ↗
                    </a>
                    <hr />
                    <p>
                      本副本的设计提示：用中性问法询问实际经历，而不是把你希望听到的答案放进问题中。
                    </p>
                    <small>此项是产品教学提示，不冒充上文作者原话。</small>
                  </div>
                )}
              </section>
              <section className="panel companion">
                <div className="avatar">舟</div>
                <h3>小舟的成长记录</h3>
                <div className="ability">
                  <span>中性提问</span>
                  <strong>
                    {state.lesson.e1 ? '本轮已应用' : '等待你的指导'}
                  </strong>
                </div>
                <div className="ability">
                  <span>证据分层</span>
                  <strong>
                    {state.lesson.e2 ? '本轮已应用' : '等待你的指导'}
                  </strong>
                </div>
                <p className="caption">
                  成长来自具体指导，不是通关后自动加分。
                </p>
              </section>
              <p className="caption">
                人物、访谈与项目均为虚构。真实资料单独溯源。自由输入与带教使用知乎直答；行为演示由固定规则执行。
              </p>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setReset(true)}
              >
                <RotateCcw />
                重新开始本副本
              </Button>
              {reset && (
                <div className="status error" role="alert">
                  <p>这会清除当前浏览器内本副本的进度。可先导出成果。</p>
                  <div className="actions">
                    <Button
                      onClick={() => {
                        setState(fresh);
                        setReset(false);
                        setHint('');
                        setError('');
                        setQuestion('');
                      }}
                    >
                      确认重新开始
                    </Button>
                    <Button variant="outline" onClick={() => setReset(false)}>
                      取消
                    </Button>
                  </div>
                </div>
              )}
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
