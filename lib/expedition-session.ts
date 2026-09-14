import {
  themes,
  validateFeedback,
  type Expedition,
  type Feedback,
  type MissionTask,
} from './expedition.ts';

import {
  labRole,
  type DialogueTurn,
  type LabRecipient,
  labRecipient,
  labNames,
  type ResearchRevision,
} from './dialogue.ts';
import { readProbe, readEvidence } from './learning.ts';
export type Work = {
  discussionFocus?: {
    quote: string;
    start: number;
    end: number;
    draft: string;
  };
  researchRecords?: {
    kind: '判断' | '支持与反例' | '待验证';
    content: string;
    turn: number | null;
  }[];
  recordScratch?: string;
  recordScratchKind?: '判断' | '支持与反例' | '待验证';
  pendingRecord?: {
    kind: '判断' | '支持与反例' | '待验证';
    content: string;
    turn: number;
  };
  researchStarted?: boolean;
  proposal?: ResearchRevision;
  lastApplied?: ResearchRevision;
  recipient?: LabRecipient;
  reducedMotion?: boolean;
  parkedInsights?: number[];
  dialogueDraft?: string;
  turns?: DialogueTurn[];
  dialogueStatus?: 'continue' | 'resolved' | 'paused';
  answer: string;
  notes: string;
  feedback?: Feedback;
  done?: boolean;
  history?: { role: string; content: string }[];
  submittedAnswer?: string;
  submittedNotes?: string;
};

/** Keep the learner's writing, but never reuse an assessment for a changed task. */
export function resetAssessment(work: Work): Work {
  return {
    answer: work.answer,
    notes: work.notes,
    done: false,
    ...(work.researchStarted ? { researchStarted: true } : {}),
  };
}
export function researchText(work: Work, material: string): string {
  return work.researchStarted || work.answer ? work.answer : material;
}
/** Highlight the changed span without splitting Unicode code points. */
export function revisionSpan(before: string, after: string) {
  const a = Array.from(before),
    b = Array.from(after);
  let start = 0,
    end = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  while (
    end < a.length - start &&
    end < b.length - start &&
    a[a.length - 1 - end] === b[b.length - 1 - end]
  )
    end++;
  return {
    prefix: a.slice(0, start).join(''),
    removed: a.slice(start, a.length - end).join(''),
    added: b.slice(start, b.length - end).join(''),
    suffix: end ? a.slice(a.length - end).join('') : '',
  };
}
export function applyResearchProposal(
  work: Work,
  material: string,
): Partial<Work> {
  const p = work.proposal;
  if (!p || researchText(work, material) !== p.before)
    throw Error('研究稿已变化，请先重新讨论修改。');
  return {
    answer: p.after,
    researchStarted: true,
    proposal: undefined,
    lastApplied: p,
    done: false,
  };
}
export function undoResearchProposal(work: Work): Partial<Work> {
  if (!work.lastApplied || work.answer !== work.lastApplied.after)
    throw Error('采用后已有新编辑，不能直接撤回覆盖。');
  return {
    answer: work.lastApplied.before,
    researchStarted: true,
    lastApplied: undefined,
    done: false,
  };
}
export type Journey = {
  plan: Expedition;
  work: Record<string, Work>;
  saved: string;
};
export type Draft = {
  goalTopic?: string;
  showPlan?: boolean;
  version: 1;
  plan: Expedition;
  work: Record<string, Work>;
  topic: string;
  goal: string;
  active: string | null;
  themeOverride: string;
};
export const DRAFT_KEY = 'zhixing-draft-v1';
const record = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw Error('Invalid object');
  return v as Record<string, unknown>;
};
const str = (v: unknown, max: number) => {
  if (typeof v !== 'string' || v.length > max) throw Error('Invalid text');
  return v;
};
const arr = (v: unknown, max: number) => {
  if (!Array.isArray(v) || v.length > max) throw Error('Invalid list');
  return v as unknown[];
};
function readPlan(value: unknown): Expedition {
  const p = record(value);
  const tasks = arr(p.tasks, 4).map((v) => {
    const t = record(v);
    return {
      id: str(t.id, 100),
      title: str(t.title, 80),
      description: str(t.description, 220),
      material: str(t.material, 1500),
      challenge: str(t.challenge, 450),
      criteria: arr(t.criteria, 4).map((c) => str(c, 180)),
    };
  });
  if (
    !tasks.length ||
    tasks.some((t) => !t.id) ||
    new Set(tasks.map((t) => t.id)).size !== tasks.length
  )
    throw Error('Invalid tasks');
  if (
    !themes.includes(p.theme as Expedition['theme']) ||
    !['example', 'live'].includes(String(p.mode))
  )
    throw Error('Invalid theme');
  const sources = arr(p.sources, 3).map((v) => {
    const s = record(v),
      url = new URL(str(s.url, 2000));
    if (
      url.protocol !== 'https:' ||
      !(url.hostname === 'zhihu.com' || url.hostname.endsWith('.zhihu.com'))
    )
      throw Error('Invalid source');
    return {
      id: str(s.id, 10),
      title: str(s.title, 160),
      author: str(s.author, 60),
      url: url.href,
      excerpt: str(s.excerpt, 700),
    };
  });
  return {
    id: str(p.id, 100),
    topic: str(p.topic, 240),
    title: str(p.title, 80),
    goal: str(p.goal, 240),
    scene: str(p.scene, 500),
    theme: p.theme as Expedition['theme'],
    intro: str(p.intro, 500),
    directions: arr(p.directions, 3).map((d) => str(d, 180)),
    tasks,
    sources,
    mode: p.mode as Expedition['mode'],
    warning: str(p.warning, 1000),
  };
}
function readWork(value: unknown, plan: Expedition): Record<string, Work> {
  const raw = record(value),
    result: Record<string, Work> = {};
  for (const task of plan.tasks) {
    if (!Object.hasOwn(raw, task.id)) continue;
    const w = record(raw[task.id]);
    const answer = str(w.answer, 2400),
      notes = str(w.notes, 3000);
    const work: Work = { answer, notes, done: w.done === true };
    if (typeof w.recordScratch === 'string')
      work.recordScratch = str(w.recordScratch, 1000);
    if (['判断', '支持与反例', '待验证'].includes(String(w.recordScratchKind)))
      work.recordScratchKind = w.recordScratchKind as Work['recordScratchKind'];
    if (w.pendingRecord) {
      try {
        const r = record(w.pendingRecord);
        if (
          ['判断', '支持与反例', '待验证'].includes(String(r.kind)) &&
          Number.isInteger(r.turn) &&
          Number(r.turn) >= 0 &&
          Number(r.turn) < 24
        )
          work.pendingRecord = {
            kind: r.kind as '判断' | '支持与反例' | '待验证',
            content: str(r.content, 1000),
            turn: Number(r.turn),
          };
      } catch {
        /* A damaged pending note must not discard the research draft. */
      }
    }
    if (w.discussionFocus) {
      try {
        const f = record(w.discussionFocus);
        const draft = str(f.draft, 2400),
          quote = str(f.quote, 800);
        if (
          Number.isInteger(f.start) &&
          Number.isInteger(f.end) &&
          Number(f.start) >= 0 &&
          Number(f.end) <= draft.length &&
          quote &&
          draft.slice(Number(f.start), Number(f.end)) === quote
        )
          work.discussionFocus = {
            quote,
            draft,
            start: Number(f.start),
            end: Number(f.end),
          };
      } catch {
        /* Preserve writing if an old selection is damaged. */
      }
    }
    if (Array.isArray(w.researchRecords)) {
      work.researchRecords = w.researchRecords.slice(0, 12).flatMap((v) => {
        try {
          const r = record(v);
          if (
            !['判断', '支持与反例', '待验证'].includes(String(r.kind)) ||
            (r.turn !== null &&
              (!Number.isInteger(r.turn) ||
                Number(r.turn) < 0 ||
                Number(r.turn) >= 24))
          )
            return [];
          return [
            {
              kind: r.kind as '判断' | '支持与反例' | '待验证',
              content: str(r.content, 1000),
              turn: r.turn === null ? null : Number(r.turn),
            },
          ];
        } catch {
          return [];
        }
      });
    }
    if (typeof w.reducedMotion === 'boolean')
      work.reducedMotion = w.reducedMotion;
    if (Array.isArray(w.parkedInsights))
      work.parkedInsights = w.parkedInsights
        .filter((v): v is number => Number.isInteger(v) && v >= 0 && v < 24)
        .slice(0, 24);
    if (w.researchStarted === true) work.researchStarted = true;
    for (const key of ['proposal', 'lastApplied'] as const) {
      if (w[key]) {
        try {
          const p = record(w[key]);
          work[key] = {
            before: str(p.before, 2400),
            after: str(p.after, 2400),
            usedQuote: str(p.usedQuote, 500),
          };
        } catch {
          /* A damaged suggestion must not discard the learner's draft. */
        }
      }
    }
    if (w.recipient !== undefined) work.recipient = labRecipient(w.recipient);
    if (typeof w.dialogueDraft === 'string')
      work.dialogueDraft = str(w.dialogueDraft, 2400);
    if (w.turns)
      work.turns = arr(w.turns, 24).map((v) => {
        const h = record(v);
        if (h.role !== 'user' && h.role !== 'assistant')
          throw Error('Invalid dialogue role');
        return {
          role: h.role,
          content: str(h.content, h.role === 'user' ? 2400 : 2000),
          ...(typeof h.focusQuote === 'string'
            ? { focusQuote: str(h.focusQuote, 800) }
            : {}),
          ...(h.probe ? { probe: readProbe(h.probe) } : {}),
          ...(['hint', 'explain'].includes(String(h.support)) ? { support: h.support as 'hint' | 'explain' } : {}),
          ...(h.evidence ? { evidence: readEvidence(h.evidence) } : {}),
          ...(typeof h.insight === 'string'
            ? { insight: str(h.insight, 400) }
            : {}),
          ...(h.speaker !== undefined ? { speaker: labRole(h.speaker) } : {}),
          ...(Array.isArray(h.sourceIds)
            ? {
                sourceIds: arr(h.sourceIds, 3)
                  .map((id) => str(id, 10))
                  .filter((id) => plan.sources.some((s) => s.id === id)),
              }
            : {}),
          ...(h.recipient !== undefined
            ? { recipient: labRecipient(h.recipient) }
            : {}),
        };
      });
    if (['continue', 'resolved', 'paused'].includes(String(w.dialogueStatus)))
      work.dialogueStatus = w.dialogueStatus as Work['dialogueStatus'];
    if (typeof w.submittedAnswer === 'string')
      work.submittedAnswer = str(w.submittedAnswer, 2400);
    if (typeof w.submittedNotes === 'string')
      work.submittedNotes = str(w.submittedNotes, 3000);
    if (w.history)
      work.history = arr(w.history, 6).map((v) => {
        const h = record(v);
        return {
          role: h.role === 'user' ? 'user' : 'assistant',
          content: str(h.content, 2400),
        };
      });
    if (w.feedback) {
      try {
        work.feedback = validateFeedback(
          w.feedback,
          work.submittedAnswer ?? answer,
          plan.sources.map((s) => s.id),
        );
      } catch {
        /* Keep user writing if old feedback is invalid. */
      }
    }
    Object.defineProperty(result, task.id, {
      value: work,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  return result;
}
export function readDraft(raw: string | null): Draft | null {
  try {
    if (!raw || raw.length > 200000) return null;
    const d = record(JSON.parse(raw));
    if (d.version !== 1) return null;
    const plan = readPlan(d.plan);
    return {
      version: 1,
      ...(typeof d.goalTopic === 'string'
        ? { goalTopic: str(d.goalTopic, 240) }
        : {}),
      ...(typeof d.showPlan === 'boolean' ? { showPlan: d.showPlan } : {}),
      plan,
      work: readWork(d.work, plan),
      topic: str(d.topic, 240),
      goal: str(d.goal, 500),
      active:
        typeof d.active === 'string' &&
        plan.tasks.some((t) => t.id === d.active)
          ? d.active
          : null,
      themeOverride:
        d.themeOverride === 'auto' ||
        themes.includes(d.themeOverride as Expedition['theme'])
          ? String(d.themeOverride)
          : 'auto',
    };
  } catch {
    return null;
  }
}
export function readJourneys(raw: string | null): Journey[] {
  try {
    if (!raw || raw.length > 2500000) return [];
    return arr(JSON.parse(raw), 12).flatMap((v) => {
      try {
        const j = record(v),
          plan = readPlan(j.plan);
        return [
          { plan, work: readWork(j.work, plan), saved: str(j.saved, 80) },
        ];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}
export function taskError(task: MissionTask): string {
  if (!task.title.trim()) return '请补充任务名称';
  if (!task.material.trim()) return '请补充任务材料';
  if (!task.challenge.trim()) return '请补充任务要求';
  if (!task.criteria.length || task.criteria.some((c) => !c.trim()))
    return '请补充自检标准';
  return '';
}
export function planError(plan: Expedition): string {
  if (!plan.title.trim()) return '请补充探索主题';
  if (!plan.goal.trim()) return '请补充学习目标';
  if (!plan.scene.trim()) return '请补充应用场景';
  return '';
}
export function changeWork(previous: Work, patch: Partial<Work>): Work {
  return {
    ...previous,
    ...patch,
    ...(('answer' in patch && patch.answer !== previous.answer) ||
    ('notes' in patch && patch.notes !== previous.notes)
      ? { done: false }
      : {}),
  };
}
export function needsGoalConfirmation(
  topic: string,
  goal: string,
  goalTopic: string,
): boolean {
  return !!goal.trim() && topic.trim() !== goalTopic.trim();
}
export function exportJourney(
  plan: Expedition,
  work: Record<string, Work>,
): string {
  const research = plan.tasks
    .map((t) => {
      const w = work[t.id];
      if (!w) return '';
      return `## ${t.title} · 研究稿\n${researchText(w, t.material)}\n${(w.researchRecords || []).map((r) => `研究记录 · ${r.kind}（用户确认，非事实认证；${r.turn === null ? '本人记录' : `讨论第${r.turn + 1}条`}）：${r.content}`).join('\n')}${w.proposal ? `\n待确认建议（未采用）：\n${w.proposal.after}\n指导原话：${w.proposal.usedQuote}` : ''}${w.lastApplied ? `\n最近采用的修改：\n修改前：${w.lastApplied.before}\n修改后：${w.lastApplied.after}\n指导原话：${w.lastApplied.usedQuote}` : ''}`;
    })
    .filter(Boolean)
    .join('\n\n');
  const dialogue = plan.tasks
    .filter((t) => work[t.id]?.turns?.length)
    .map(
      (t) =>
        `## ${t.title} · 课题讨论\n\n${work[t.id].turns!.map((h) => `### ${h.role === 'user' ? `你${h.recipient ? ` → @${labNames[h.recipient]}` : ''}` : `${labNames[h.speaker || 'peer']}（AI 模拟）`}\n${h.content}${h.focusQuote ? `\n讨论原句：${h.focusQuote}` : ''}${h.insight ? `\n待验证的启发：${h.insight}` : ''}`).join('\n\n')}\n\n未发送草稿：${work[t.id].dialogueDraft || '无'}`,
    )
    .join('\n\n');
  return `# ${plan.title}\n\n${research}\n\n${dialogue}\n\n话题：${plan.topic}\n目标：${plan.goal}\n场景：${plan.scene}\n\n${plan.tasks
    .map((t) => {
      const w = work[t.id],
        f = w?.feedback;
      return `## ${t.title}\n\n任务材料：\n${t.material}\n\n任务要求：${t.challenge}\n自检标准：${t.criteria.join('；')}\n\n我的证据：${w?.notes || '未记录'}\n我的回答：${w?.answer || '未回答'}\n\n${f ? `### 上一次 AI 反馈（模拟）\n针对回答：${w.submittedAnswer ?? w.answer}\n${f.reply}\n已经做到：${f.strength}\n还需验证：${f.gap}\n指导前：${f.partnerBefore}\n指导后：${f.partnerAfter}\n采用原话：${f.usedQuote || '无'}\n下一步：${f.nextQuestion}` : 'AI 反馈：未生成'}\n\n自评完成：${w?.done ? '是' : '否'}`;
    })
    .join(
      '\n\n',
    )}\n\n## 来源与边界\n${plan.warning}\n${plan.sources.map((s) => `- ${s.title} · ${s.author}\n  ${s.url}`).join('\n')}\n\n此记录不是能力认证。`;
}
