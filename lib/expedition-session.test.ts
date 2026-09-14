/* oxlint-disable typescript/no-floating-promises -- Registered with the Node test runner. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { examplePlan } from './expedition.ts';
import {
  readDraft,
  readJourneys,
  taskError,
  planError,
  changeWork,
  resetAssessment,
  needsGoalConfirmation,
  exportJourney,
  type Draft,
} from './expedition-session.ts';
const draft: Draft = {
  version: 1,
  plan: examplePlan,
  work: { 'task-1': { answer: '我的判断', notes: '我的证据', done: true } },
  topic: '绘画',
  goal: '观察色彩',
  active: 'task-1',
  themeOverride: 'nature',
};

test('changing task context drops assessment and conversation but preserves original writing', () => {
  const original = {
    answer: '自己的回答',
    notes: '调查笔记',
    done: true,
    submittedAnswer: '旧回答',
    submittedNotes: '旧笔记',
    history: [{ role: 'user', content: '旧情境' }],
  } as const;
  assert.deepEqual(
    resetAssessment({ ...original, history: [...original.history] }),
    {
      answer: '自己的回答',
      notes: '调查笔记',
      done: false,
    },
  );
  assert.equal(original.done, true);
});
test('draft round-trip preserves topic, goal, notes, answer, active task and theme', () => {
  assert.deepEqual(readDraft(JSON.stringify(draft)), draft);
});
test('changed topic asks to confirm the existing goal without silently dropping it', () => {
  assert.equal(needsGoalConfirmation('植物', '分析笔触', '绘画'), true);
  assert.equal(needsGoalConfirmation(' 绘画 ', '分析笔触', '绘画'), false);
  assert.equal(needsGoalConfirmation('植物', '', '绘画'), false);
  assert.equal(needsGoalConfirmation('绘画', '分析笔触', ''), true);
});
test('draft restores topic binding and the exact workspace visibility', () => {
  for (const showPlan of [true, false]) {
    const d = { ...draft, goalTopic: '绘画', showPlan };
    assert.deepEqual(readDraft(JSON.stringify(d)), d);
  }
});
test('incomplete editable task survives refresh but cannot be run', () => {
  const d = {
    ...draft,
    plan: { ...examplePlan, tasks: [{ ...examplePlan.tasks[0], title: '' }] },
  };
  const restored = readDraft(JSON.stringify(d));
  assert.ok(restored);
  assert.equal(restored.plan.tasks.length, 1);
  assert.equal(taskError(restored.plan.tasks[0]), '请补充任务名称');
});
test('malformed and oversized storage does not enter the app', () => {
  for (const raw of [
    '{',
    'null',
    '[]',
    JSON.stringify({ ...draft, plan: { tasks: [{}] } }),
    ' '.repeat(200001),
  ])
    assert.equal(readDraft(raw), null);
});
test('unknown active task falls back to plan, corrupted theme falls back to auto', () => {
  const d = readDraft(
    JSON.stringify({ ...draft, active: 'gone', themeOverride: 'wrong' }),
  );
  assert.ok(d);
  assert.equal(d.active, null);
  assert.equal(d.themeOverride, 'auto');
});
test('unsafe restored source links are rejected', () => {
  assert.equal(
    readDraft(
      JSON.stringify({
        ...draft,
        plan: {
          ...examplePlan,
          sources: [
            {
              id: 'S1',
              title: 'x',
              author: 'x',
              excerpt: 'x',
              url: 'javascript:alert(1)',
            },
          ],
        },
      }),
    ),
    null,
  );
});
test('valid history survives neighboring corrupted item', () => {
  const j = { plan: examplePlan, work: draft.work, saved: '2026-09-09' };
  assert.deepEqual(readJourneys(JSON.stringify([{}, j])), [j]);
});
test('editing evidence or answer resets self-completion but keeps writing', () => {
  assert.equal(
    changeWork(draft.work['task-1'], { notes: '新证据' }).done,
    false,
  );
  assert.equal(
    changeWork(draft.work['task-1'], { answer: '新判断' }).done,
    false,
  );
  assert.equal(
    changeWork(draft.work['task-1'], { answer: '我的判断' }).done,
    true,
  );
});
test('all task requirements are validated before launch', () => {
  for (const key of ['title', 'material', 'challenge'] as const)
    assert.ok(taskError({ ...examplePlan.tasks[0], [key]: '' }));
  assert.ok(taskError({ ...examplePlan.tasks[0], criteria: [''] }));
  assert.equal(taskError(examplePlan.tasks[0]), '');
  assert.ok(planError({ ...examplePlan, scene: '' }));
});
test('export contains task material, self checks, original answer and complete feedback', () => {
  const f = {
    reply: '反馈内容',
    strength: '优点',
    gap: '证据缺口',
    nextQuestion: '下一步追问',
    partnerBefore: '旧做法',
    partnerAfter: '新做法',
    changed: true,
    usedQuote: '我的判断',
    sourceIds: [],
  };
  const text = exportJourney(examplePlan, {
    'task-1': {
      ...draft.work['task-1'],
      feedback: f,
      submittedAnswer: '先前的回答',
    },
  });
  for (const expected of [
    examplePlan.tasks[0].material,
    '自检标准',
    '我的证据',
    '先前的回答',
    '旧做法',
    '新做法',
    '下一步追问',
    '不是能力认证',
  ])
    assert.ok(text.includes(expected));
});
