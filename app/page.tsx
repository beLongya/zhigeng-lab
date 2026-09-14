'use client';
/* Native raster images preserve the generated art; local history hydrates after SSR. */
/* oxlint-disable next/no-img-element, react/react-compiler */
import Link from 'next/link';
import { ZhihuAccountButton } from './zhihu-account';
import PracticeConversation from './practice-conversation';
import ResearchDraft from './research-draft';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Compass,
  Sparkles,
  Orbit,
  Pencil,
  Plus,
  X,
  Check,
  BookOpen,
  Download,
  ChevronLeft,
} from 'lucide-react';
import {
  examplePlan,
  themes,
  type Expedition,
  type Feedback,
  type Theme,
  type MissionTask,
} from '../lib/expedition';
import {
  DRAFT_KEY,
  readDraft,
  readJourneys,
  taskError,
  planError,
  changeWork,
  resetAssessment,
  needsGoalConfirmation,
  exportJourney,
  type Work,
  type Journey,
} from '../lib/expedition-session';

const themeNames: Record<Theme, string> = {
  space: '天文 · 深空',
  technology: '科技 · 蓝图',
  humanities: '人文 · 书页',
  nature: '自然 · 原野',
  studio: '灵感 · 工作室',
};
const blank = (): Work => ({ answer: '', notes: '' });
const topicSuggestions = [
  {
    category: '心理与生活',
    topic: '为什么音乐会影响情绪？',
    hint: '比较解释，设计一个小观察',
  },
  {
    category: '艺术与人文',
    topic: '怎样看懂一幅画？',
    hint: '从细节出发，形成自己的解读',
  },
  {
    category: '科技与创造',
    topic: '第一次做开源项目，怎么开始？',
    hint: '拆解需求，练习协作与交付',
  },
  {
    category: '校园与成长',
    topic: '如何判断一个社团活动值得办？',
    hint: '辨别需求，检验证据与假设',
  },
  {
    category: '自然与科学',
    topic: '植物是怎么知道季节变化的？',
    hint: '提出假设，比较不同观测方法',
  },
  {
    category: '表达与思辨',
    topic: '怎样识别一个论证里的漏洞？',
    hint: '拆开前提，用反例检验结论',
  },
];

export default function Page() {
  const [plan, setPlan] = useState<Expedition>(examplePlan);
  const [topic, setTopic] = useState('');
  const [goal, setGoal] = useState('');
  const [goalTopic, setGoalTopic] = useState('');
  const [themeOverride, setThemeOverride] = useState('auto');
  const [active, setActive] = useState<string | null>(null);
  const [work, setWork] = useState<Record<string, Work>>({});
  const [editing, setEditing] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [exportText, setExportText] = useState('');
  const controller = useRef<AbortController | null>(null);
  const theme =
    themeOverride === 'auto'
      ? showPlan
        ? plan.theme
        : 'technology'
      : (themeOverride as Theme);
  const task = plan.tasks.find((t) => t.id === active);
  const current = active ? work[active] || blank() : blank();
  const invalidPlan = planError(plan);
  const invalidTask = task ? taskError(task) : '';
  const completed = plan.tasks.filter((t) => work[t.id]?.done).length;
  const goalNeedsReview = needsGoalConfirmation(topic, goal, goalTopic);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [active, historyOpen, showPlan]);
  useEffect(() => {
    try {
      setJourneys(readJourneys(localStorage.getItem('zhixing-journeys-v2')));
      const draft = readDraft(localStorage.getItem(DRAFT_KEY));
      if (draft) {
        setPlan(draft.plan);
        setWork(draft.work);
        setTopic(draft.topic);
        setGoal(draft.goal);
        setGoalTopic(draft.goalTopic ?? '');
        setShowPlan(draft.showPlan ?? false);
        setActive(draft.active);
        setThemeOverride(draft.themeOverride);
        setNotice('已恢复上次的草稿与实践位置。');
      }
    } catch {
      setStorageFailed(true);
    }
    setReady(true);
    return () => controller.current?.abort();
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          version: 1,
          plan,
          work,
          topic,
          goal,
          goalTopic,
          showPlan,
          active,
          themeOverride,
        }),
      );
      setStorageFailed(false);
    } catch {
      setStorageFailed(true);
    }
  }, [
    ready,
    plan,
    work,
    topic,
    goal,
    goalTopic,
    showPlan,
    active,
    themeOverride,
  ]);
  function updateWork(patch: Partial<Work>) {
    if (active)
      setWork((w) => ({
        ...w,
        [active]: changeWork(w[active] || blank(), patch),
      }));
  }
  function archiveCurrent() {
    const next = [
      { plan, work, saved: new Date().toLocaleString('zh-CN') },
      ...journeys.filter((j) => j.plan.id !== plan.id),
    ].slice(0, 12);
    try {
      localStorage.setItem('zhixing-journeys-v2', JSON.stringify(next));
      setJourneys(next);
      return true;
    } catch {
      setError('浏览器存储不可用，请导出记录保存。');
      return false;
    }
  }
  function save() {
    if (archiveCurrent()) setNotice('已保存到此浏览器的「我的旅程」。');
  }
  async function request(action: 'plan' | 'respond') {
    if (busy || !ready) return;
    if (action === 'plan' && goalNeedsReview) {
      setError('话题变了，请先确认是否沿用之前的学习目标。');
      return;
    }
    if (action === 'respond' && (invalidPlan || invalidTask)) {
      setError(invalidPlan || invalidTask);
      setEditing(true);
      return;
    }
    setError('');
    setNotice('');
    setBusy(action);
    setEditing(false);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const response = await fetch('/api/explore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abort.signal,
        body: JSON.stringify(
          action === 'plan'
            ? { action, topic: topic.trim(), goal }
            : {
                action,
                plan: {
                  topic: plan.topic,
                  goal: plan.goal,
                  scene: plan.scene,
                  sources: plan.sources,
                },
                task,
                answer: current.answer,
                notes: current.notes,
                history: current.history || [],
              },
        ),
      });
      const result = (await response.json()) as {
        error?: string;
        plan?: Expedition;
        feedback?: Feedback;
      };
      if (!response.ok)
        throw new Error(result.error || '服务暂时不可用，请稍后重试。');
      if (action === 'plan') {
        if (!result.plan?.tasks?.length)
          throw new Error('返回的探索计划不完整。');
        if (
          (Object.keys(work).length || plan.mode === 'live') &&
          !archiveCurrent()
        )
          throw new Error(
            '新计划已生成，但旧旅程无法保存。请先导出旧记录，再重试。',
          );
        setPlan(result.plan);
        setShowPlan(true);
        setWork({
          [result.plan.tasks[0].id]: {
            answer: '',
            notes: '',
            dialogueDraft: result.plan.topic,
            recipient: 'mentor',
          },
        });
        setActive(result.plan.tasks[0].id);
        setEditing(false);
        setTopic('');
        setGoal('');
        setGoalTopic('');
      } else {
        if (!result.feedback) throw new Error('没有收到反馈，请重试。');
        updateWork({
          feedback: result.feedback,
          submittedAnswer: current.answer,
          submittedNotes: current.notes,
          done: false,
          history: [
            ...(current.history || []),
            { role: 'user', content: current.answer },
            { role: 'assistant', content: result.feedback.reply },
          ].slice(-6),
        });
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError'))
        setError(
          e instanceof Error ? e.message : '网络连接失败，你的输入已保留。',
        );
    } finally {
      setBusy('');
      controller.current = null;
    }
  }
  function exportWork() {
    const text = exportJourney(plan, work);
    setExportText(text);
    const url = URL.createObjectURL(
      new Blob([text], { type: 'text/markdown;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = '知更Lab-课题记录.md';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('已发起下载；若浏览器未保存文件，可在导出预览中全选复制。');
  }
  function move(index: number, offset: number) {
    const tasks = [...plan.tasks];
    [tasks[index], tasks[index + offset]] = [
      tasks[index + offset],
      tasks[index],
    ];
    setPlan({ ...plan, tasks });
  }
  function editTask(id: string, patch: Partial<MissionTask>) {
    setPlan((p) => ({
      ...p,
      tasks: p.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
    setWork((w) => {
      const next = { ...w };
      if (next[id]) next[id] = resetAssessment(next[id]);
      return next;
    });
  }
  function editPlan(key: 'title' | 'goal' | 'scene', value: string) {
    if (plan[key] === value) return;
    setPlan((p) => ({ ...p, [key]: value }));
    if (key !== 'title') {
      setWork((w) =>
        Object.fromEntries(
          Object.entries(w).map(([id, entry]) => [id, resetAssessment(entry)]),
        ),
      );
      setNotice('目标或场景已改变：回答和笔记已保留，旧反馈与完成状态已重置。');
    }
  }
  const field = (key: 'title' | 'goal' | 'scene', label: string) => (
    <label className="x-field">
      {label}
      <textarea
        value={plan[key]}
        maxLength={key === 'scene' ? 500 : key === 'title' ? 80 : 240}
        onChange={(e) => editPlan(key, e.target.value)}
      />
    </label>
  );
  return (
    <div className={`x-app x-${theme}`}>
      <header className="x-header">
        <Link className="x-logo" href="/" aria-label="知更 Lab 首页">
          <Compass size={32} />
          <span>知更 Lab</span>
        </Link>
        <nav>
          <button
            disabled={!!busy}
            className={!historyOpen ? 'selected' : ''}
            onClick={() => {
              setHistoryOpen(false);
              setShowPlan(false);
            }}
          >
            自选话题
          </button>
          <button
            disabled={!!busy}
            className={historyOpen ? 'selected' : ''}
            onClick={() => setHistoryOpen(true)}
          >
            我的旅程
          </button>
        </nav>
        <a href="/hot">知乎热榜</a>
        <ZhihuAccountButton />
        <label className="x-theme">
          <Orbit size={22} />
          <select
            aria-label="页面氛围"
            value={themeOverride}
            onChange={(e) => setThemeOverride(e.target.value)}
          >
            <option value="auto">随话题变化 · 自动</option>
            {themes.map((t) => (
              <option key={t} value={t}>
                {themeNames[t]}
              </option>
            ))}
          </select>
        </label>
      </header>
      {ready && (
        <output className="x-save-status">
          {storageFailed
            ? '自动保存不可用，请及时导出记录。'
            : '草稿自动保存在此浏览器 · 提交时由知乎 AI 处理'}
        </output>
      )}
      {historyOpen ? (
        <main className="x-history">
          <p className="x-eyebrow">每一次实践，都留下自己的方法</p>
          <h1>我的旅程</h1>
          <p>仅保存在当前浏览器，不会公开你的回答。</p>
          {journeys.length === 0 ? (
            <div className="x-empty">
              <BookOpen size={36} />
              <h2>第一段旅程，从一个问题开始。</h2>
              <button
                className="x-primary"
                onClick={() => setHistoryOpen(false)}
              >
                去探索 <ArrowRight size={18} />
              </button>
            </div>
          ) : (
            journeys.map((j) => (
              <article key={j.plan.id}>
                <div>
                  <small>{j.saved}</small>
                  <h2>{j.plan.title}</h2>
                  <p>{j.plan.topic}</p>
                </div>
                <button
                  onClick={() => {
                    if (
                      Object.keys(work).length &&
                      JSON.stringify(work) !== JSON.stringify(j.work) &&
                      !archiveCurrent()
                    )
                      return;
                    setPlan(j.plan);
                    setShowPlan(true);
                    setWork(j.work);
                    setGoal('');
                    setGoalTopic('');
                    setTopic('');
                    setEditing(false);
                    setActive(null);
                    setHistoryOpen(false);
                    setError('');
                  }}
                >
                  继续探索 <ArrowRight size={18} />
                </button>
              </article>
            ))
          )}
        </main>
      ) : !showPlan ? (
        <main className="x-topic-home">
          <p className="x-eyebrow">你的好奇，就是起点</p>
          <h1>你想探索什么？</h1>
          <p className="x-topic-description">
            一个概念、一段经历，或一个还没想明白的问题。
            <br />
            话题由你决定，和导师、同伴一起把好奇变成可以动手研究的课题。
          </p>
          <form
            className="x-topic-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (topic.trim()) void request('plan');
            }}
          >
            <label className="x-field">
              我想探索的话题
              <textarea
                aria-label="任意话题"
                placeholder="例如：为什么音乐会影响情绪？也可以写任何你自己的问题。"
                value={topic}
                maxLength={240}
                disabled={!!busy}
                onChange={(e) => setTopic(e.target.value)}
                rows={3}
              />
            </label>
            <details className="x-sources">
              <summary>
                {goal.trim()
                  ? '已填写学习目标 · 展开修改或清空'
                  : '补充学习目标（选填）'}
              </summary>
              <label className="x-field">
                这次想弄明白什么，或练会什么？
                <input
                  aria-label="自定义学习目标"
                  placeholder="不填也可以，AI 会帮你起草目标"
                  value={goal}
                  maxLength={500}
                  disabled={!!busy}
                  onChange={(e) => {
                    setGoal(e.target.value);
                    setGoalTopic(topic);
                  }}
                />
              </label>
            </details>
            {goalNeedsReview && (
              <section className="x-validation" aria-label="确认新话题的目标">
                <p>话题变了，之前的目标还合适吗？</p>
                <p>“{goal}”</p>
                <button
                  type="button"
                  onClick={() => {
                    setGoalTopic(topic);
                    setError('');
                  }}
                >
                  这次也沿用
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGoal('');
                    setGoalTopic(topic);
                    setError('');
                  }}
                >
                  让 AI 按新话题起草
                </button>
              </section>
            )}
            <div className="x-topic-submit">
              <span>无需选择分类 · 无需预设答案</span>
              <button
                className="x-primary"
                type="submit"
                disabled={!ready || !!busy || !topic.trim() || goalNeedsReview}
              >
                {busy ? '正在筹备你的课题…' : '创建我的实验室课题'}
                <ArrowRight size={20} />
              </button>
            </div>
          </form>
          {error && (
            <div className="x-error" role="alert">
              <p>{error}</p>
              <p>你的话题仍在输入框中。可以先查看已有课题、编辑材料或导出记录；实时讨论同样需要 AI 服务可用。</p>
              <button type="button" disabled={!ready || !!busy} onClick={() => setShowPlan(true)}>
                {plan.mode === 'live' ? '查看已有课题' : '查看预设课题（非实时生成）'}
                <ArrowRight size={16} />
              </button>
            </div>
          )}
          {busy && (
            <button onClick={() => controller.current?.abort()}>
              取消本次请求
            </button>
          )}
          <section className="x-topic-inspiration" aria-label="话题灵感">
            <h2>也许你会好奇</h2>
            <p>
              精选话题灵感 ·
              点击填入，仍可自由改写。不是范围限制，也不是实时热榜。
            </p>
            <div>
              {topicSuggestions.map((idea) => (
                <button
                  key={idea.topic}
                  disabled={!!busy}
                  onClick={() => {
                    setTopic(idea.topic);
                    document
                      .querySelector<HTMLTextAreaElement>(
                        'textarea[aria-label="任意话题"]',
                      )
                      ?.focus();
                  }}
                >
                  <small>{idea.category}</small>
                  <strong>
                    {idea.topic}
                    <ArrowUp size={14} />
                  </strong>
                  <span>{idea.hint}</span>
                </button>
              ))}
            </div>
          </section>
          <button
            className="x-topic-resume"
            disabled={!ready || !!busy}
            onClick={() => {
              setShowPlan(true);
              setError('');
            }}
          >
            {plan.mode === 'live' || Object.keys(work).length
              ? '继续上次的探索'
              : '查看预设课题（实时讨论仍需 AI）'}
            <ArrowRight size={16} />
          </button>
          <p className="x-footnote">
            生成需要知乎 AI
            服务。你的旧计划会在新计划生成成功后保存，不会因切换话题丢失。
          </p>
        </main>
      ) : (
        <main className={`x-main${task ? ' x-lab-active' : ''}`}>
          <section className="x-explore">
            {!task ? (
              <>
                <div className="x-intro">
                  <p className="x-eyebrow">这次，我们一起探索</p>
                  <h1>{plan.title}</h1>
                  <p>挑一件你想先动手的事，不必按固定顺序。</p>
                </div>
                <div className="x-conversation">
                  <div className="x-user">{plan.topic}</div>
                  <div className="x-ai">
                    <Sparkles size={30} />
                    <p>{plan.intro}</p>
                  </div>
                  <details className="x-sources">
                    <summary>想换个角度探索？</summary>
                    <div className="x-directions">
                      {plan.directions.map((d) => (
                        <button
                          key={d}
                          className={plan.goal === d ? 'selected' : ''}
                          disabled={!!busy}
                          title={d}
                          onClick={() => {
                            if (d === '自己描述') setEditing(true);
                            else editPlan('goal', d);
                          }}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </details>
                </div>
              </>
            ) : (
              <div className="x-task-work">
                <button
                  className="x-back"
                  disabled={!!busy}
                  onClick={() => setActive(null)}
                >
                  <ChevronLeft size={17} />
                  返回实验室课题
                </button>
                <p className="x-eyebrow">实验室 · 当前课题讨论</p>
                <h1>{task.title.trim() || '待完善的任务'}</h1>
                {(invalidPlan || invalidTask) && (
                  <p className="x-validation" role="alert">
                    {invalidPlan || invalidTask}。请在计划编辑区补齐后再继续。
                  </p>
                )}
                <p>先问导师你想弄懂的问题，再选择是否和伙伴一起探索。</p>
                <nav className="x-workspace-jumps" aria-label="课题工作区">
                  <a href="#lab-discussion">讨论与解惑</a>
                  <a
                    href="#lab-notebook"
                    onClick={() => {
                      const notes =
                        document.querySelector<HTMLDetailsElement>(
                          '#lab-notebook',
                        );
                      if (notes) notes.open = true;
                    }}
                  >
                    可选笔记{current.proposal ? ' · 有待确认修改' : ''}
                  </a>
                </nav>
                <div className="x-lab-desk">
                  {!invalidPlan && !invalidTask && (
                    <PracticeConversation
                      key={`${plan.id}:${task.id}`}
                      plan={plan}
                      task={task}
                      work={current}
                      onChange={updateWork}
                      onBusy={setBusy}
                      onReview={() => {
                        const notes =
                          document.querySelector<HTMLDetailsElement>(
                            '#lab-notebook',
                          );
                        if (notes) notes.open = true;
                        const review =
                          document.querySelector<HTMLElement>('.x-research');
                        if (review) {
                          review.scrollIntoView({ block: 'start' });
                          review
                            .querySelector<HTMLTextAreaElement>('.x-answer')
                            ?.focus();
                        }
                      }}
                    />
                  )}
                  <details id="lab-notebook" className="x-lab-notebook">
                    <summary>研究笔记与材料 · 随时整理，不必完成</summary>
                    <ResearchDraft
                      key={`research:${plan.id}:${task.id}`}
                      task={task}
                      work={current}
                      busy={!!busy}
                      onChange={updateWork}
                    />
                  </details>
                </div>
              </div>
            )}
            <div className="x-status" aria-live="polite">
              {error && <p role="alert">{error}</p>}
              {notice && <p>{notice}</p>}
              {busy && busy !== 'dialogue' && (
                <button onClick={() => controller.current?.abort()}>
                  取消本次请求
                </button>
              )}
            </div>
            {!task && (
              <button
                className="x-back"
                disabled={!!busy}
                onClick={() => setShowPlan(false)}
              >
                想探索别的话题？回到话题入口 <ArrowRight size={16} />
              </button>
            )}
          </section>
          <aside className="x-plan">
            {['space', 'technology', 'nature'].includes(theme) && (
              <img
                className="x-banner"
                src={`/art/${theme}-banner.png`}
                alt={
                  theme === 'space'
                    ? '黑洞与明亮的吸积盘'
                    : theme === 'nature'
                      ? '自然探索景观'
                      : '科技探索空间'
                }
              />
            )}
            <div className="x-plan-heading">
              <BookOpen size={28} />
              <h2>实验室课题计划</h2>
              <small>
                {plan.mode === 'example' ? '示例' : 'AI 起草'} · 可编辑
              </small>
              <button
                aria-label={editing ? '完成编辑' : '编辑计划'}
                disabled={!!busy}
                onClick={() => {
                  setEditing(!editing);
                  setEditingTaskId(null);
                }}
              >
                {editing ? <Check size={19} /> : <Pencil size={19} />}
              </button>
            </div>
            {editing ? (
              <div className="x-editor">
                {field('title', '探索主题')}
                {field('goal', '学习目标')}
                {field('scene', '应用场景')}
              </div>
            ) : (
              <div className="x-plan-summary">
                <div>
                  <small>探索主题</small>
                  <h3>{plan.title}</h3>
                </div>
                <div>
                  <small>学习目标</small>
                  <p>{plan.goal}</p>
                </div>
                <div>
                  <small>应用场景</small>
                  <p>{plan.scene}</p>
                </div>
              </div>
            )}
            <div className="x-task-list">
              {plan.tasks.map((t, i) => (
                <div
                  className={`x-task-row ${active === t.id ? 'selected' : ''}`}
                  key={t.id}
                >
                  <button
                    className="x-task-open"
                    disabled={!!busy || !!invalidPlan || !!taskError(t)}
                    onClick={() => {
                      setActive(t.id);
                      setError('');
                    }}
                  >
                    <span className="x-number">
                      {work[t.id]?.done ? (
                        <Check size={18} />
                      ) : (
                        String(i + 1).padStart(2, '0')
                      )}
                    </span>
                    <span>
                      <strong>{t.title.trim() || '待填写任务名称'}</strong>
                      <small>{t.description}</small>
                    </span>
                  </button>
                  {editing && editingTaskId === t.id ? (
                    <div className="x-task-editor">
                      <label>
                        任务名称
                        <input
                          value={t.title}
                          maxLength={80}
                          aria-invalid={!t.title.trim()}
                          onChange={(e) =>
                            editTask(t.id, { title: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        我的任务要求
                        <textarea
                          value={t.challenge}
                          maxLength={450}
                          aria-invalid={!t.challenge.trim()}
                          onChange={(e) =>
                            editTask(t.id, { challenge: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        任务材料
                        <textarea
                          value={t.material}
                          maxLength={1500}
                          aria-invalid={!t.material.trim()}
                          onChange={(e) =>
                            editTask(t.id, { material: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        自检标准（每行一条，最多 4 条）
                        <textarea
                          value={t.criteria.join('\n')}
                          maxLength={723}
                          onChange={(e) =>
                            editTask(t.id, {
                              criteria: e.target.value
                                .split('\n')
                                .slice(0, 4)
                                .map((c) => c.slice(0, 180)),
                            })
                          }
                        />
                      </label>
                      {taskError(t) && (
                        <p className="x-validation">{taskError(t)}</p>
                      )}
                      <div className="x-row">
                        <button
                          aria-label={`上移任务${i + 1}`}
                          disabled={i === 0}
                          onClick={() => move(i, -1)}
                        >
                          <ArrowUp size={17} />
                        </button>
                        <button
                          aria-label={`下移任务${i + 1}`}
                          disabled={i === plan.tasks.length - 1}
                          onClick={() => move(i, 1)}
                        >
                          <ArrowDown size={17} />
                        </button>
                        <button
                          disabled={plan.tasks.length <= 1}
                          onClick={() => {
                            setPlan({
                              ...plan,
                              tasks: plan.tasks.filter((a) => a.id !== t.id),
                            });
                            if (active === t.id) setActive(null);
                          }}
                        >
                          <X size={17} />
                          移除
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      aria-label={`编辑任务${i + 1}`}
                      disabled={!!busy}
                      onClick={() => {
                        setEditing(true);
                        setEditingTaskId(t.id);
                      }}
                    >
                      <Pencil size={18} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              className="x-add"
              disabled={!!busy || (editing && plan.tasks.length >= 4)}
              onClick={() => {
                if (!editing) {
                  setEditing(true);
                  return;
                }
                const newTaskId = crypto.randomUUID();
                setEditingTaskId(newTaskId);
                setPlan({
                  ...plan,
                  tasks: [
                    ...plan.tasks,
                    {
                      id: newTaskId,
                      title: '我的自选任务',
                      description: '根据自己的目标补充实践',
                      material: '自选实践：请在证据笔记中补充你要分析的材料。',
                      challenge:
                        '围绕当前话题提出一个需要验证的判断，并说明你的验证方法。',
                      criteria: ['判断具体可验证', '说明证据与结论的联系'],
                    },
                  ],
                });
              }}
            >
              <Plus size={18} />
              {editing ? '添加自选任务（最多 4 项）' : '调整或添加任务'}
            </button>
            {!task ? (
              <button
                className="x-primary x-start"
                disabled={
                  !!busy ||
                  !ready ||
                  plan.tasks.some((t) => !!taskError(t)) ||
                  !!invalidPlan
                }
                onClick={() => {
                  setActive(plan.tasks[0].id);
                  setEditing(false);
                  setError('');
                }}
              >
                开始探索
                <ArrowRight size={21} />
              </button>
            ) : (
              <div className="x-row x-actions">
                <button onClick={save}>保存旅程</button>
                <button onClick={exportWork}>
                  <Download size={17} />
                  导出记录
                </button>
              </div>
            )}
            {(active || completed > 0) && (
              <p className="x-footnote">
                已自评复盘 {completed} / {plan.tasks.length} 项 ·{' '}
                {completed === plan.tasks.length
                  ? '可以保存并导出这次探索'
                  : '可以按自己的顺序继续'}
              </p>
            )}
            {exportText && (
              <section className="x-sources" aria-label="导出预览">
                <p>导出快照 · 修改内容后请重新导出</p>
                <label className="x-field">
                  完整探索记录（点击全选，可复制保存）
                  <textarea
                    readOnly
                    value={exportText}
                    rows={8}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </label>
                <button onClick={() => setExportText('')}>关闭导出预览</button>
              </section>
            )}
            {invalidPlan && <p className="x-validation">{invalidPlan}</p>}
            <p className="x-footnote">AI 起草任务，你决定探索方式。</p>
            <details className="x-sources">
              <summary>
                内容来源与说明
                {plan.sources.length ? ` · ${plan.sources.length} 条资料` : ''}
              </summary>
              <p>{plan.warning}</p>
              {plan.sources.map((s) => (
                <a key={s.id} href={s.url} target="_blank" rel="noreferrer">
                  {s.title} · {s.author}
                </a>
              ))}
            </details>
          </aside>
        </main>
      )}
    </div>
  );
}
