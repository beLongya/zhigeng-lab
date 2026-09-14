/* oxlint-disable typescript/no-floating-promises -- Node test registration. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { processDialogue } from './dialogue.ts';
import { examplePlan } from './expedition.ts';
import {
  researchText,
  revisionSpan,
  applyResearchProposal,
  undoResearchProposal,
  changeWork,
  readDraft,
  exportJourney,
} from './expedition-session.ts';
const revision = {
  before: '  原稿\n',
  after: '改后的稿',
  usedQuote: '请加上条件',
};
const input = {
  intent: 'message',
  recipient: 'peer',
  message: '请加上条件，不要一概而论',
  researchDraft: revision.before,
  plan: examplePlan,
  task: examplePlan.tasks[0],
  turns: [],
};
const reply = {
  reply: '这是一份供你确认的改稿。',
  question: '',
  status: 'continue',
  application: '',
  revision,
};
test('revision highlighting preserves full text including Unicode and insertions', () => {
  for (const [before, after] of [
    ['前文旧说法后文', '前文新说法后文'],
    ['', '新内容'],
    ['删除', ''],
    ['😀甲🌟', '😀乙🌟'],
    ['不变', '不变'],
    ['首尾', '首新增尾'],
  ]) {
    const d = revisionSpan(before, after);
    assert.equal(d.prefix + d.removed + d.suffix, before);
    assert.equal(d.prefix + d.added + d.suffix, after);
  }
  assert.deepEqual(revisionSpan('前旧后', '前新后'), {
    prefix: '前',
    removed: '旧',
    added: '新',
    suffix: '后',
  });
});
test('unconfirmed discussion note and chosen note category survive reload without becoming confirmed', () => {
  const task = examplePlan.tasks[0];
  const pendingRecord = { kind: '支持与反例', content: '整理到一半', turn: 0 };
  const raw = {
    version: 1,
    plan: examplePlan,
    topic: '',
    goal: '',
    active: task.id,
    themeOverride: 'auto',
    work: {
      [task.id]: {
        answer: '保留的稿',
        notes: '',
        pendingRecord,
        recordScratchKind: '判断',
      },
    },
  };
  const restored = readDraft(JSON.stringify(raw))!;
  assert.deepEqual(restored.work[task.id].pendingRecord, pendingRecord);
  assert.equal(restored.work[task.id].recordScratchKind, '判断');
  assert.equal(restored.work[task.id].researchRecords, undefined);
  raw.work[task.id].pendingRecord.turn = -1;
  const damaged = readDraft(JSON.stringify(raw))!;
  assert.equal(damaged.work[task.id].pendingRecord, undefined);
  assert.equal(damaged.work[task.id].answer, '保留的稿');
});
test('self-authored records and unfinished note survive refresh without fabricated attribution', () => {
  const task = examplePlan.tasks[0];
  const researchRecords = [
    { kind: '判断', content: '我自己的假设', turn: null },
  ];
  const restored = readDraft(
    JSON.stringify({
      version: 1,
      plan: examplePlan,
      topic: '',
      goal: '',
      active: task.id,
      themeOverride: 'auto',
      work: {
        [task.id]: {
          answer: '',
          notes: '',
          researchRecords,
          recordScratch: '还没写完',
        },
      },
    }),
  );
  assert.deepEqual(restored?.work[task.id].researchRecords, researchRecords);
  assert.equal(restored?.work[task.id].recordScratch, '还没写完');
  const exported = exportJourney(examplePlan, restored!.work);
  assert.ok(exported.includes('本人记录'));
  assert.ok(!exported.includes('讨论第1条'));
});
test('selected quotation is passed to the model and stale quotations fail before a call', async () => {
  let calls = 0;
  const provider = {
    search: async () => null,
    complete: async (prompt: string) => {
      calls++;
      assert.ok(prompt.includes('"focusQuote":"原稿"'));
      return JSON.stringify(reply);
    },
  };
  await processDialogue(
    {
      ...input,
      focusQuote: '原稿',
      researchRecords: [{ kind: '待验证', content: '检查条件' }],
    },
    provider,
  );
  await assert.rejects(
    processDialogue({ ...input, focusQuote: '不存在的句子' }, provider),
  );
  assert.equal(calls, 1);
});
test('selected quotation and confirmed records survive refresh and export', () => {
  const task = examplePlan.tasks[0];
  const researchRecords = [
    { kind: '待验证', content: '还需要补充证据', turn: 1 },
  ];
  const discussionFocus = {
    quote: '原稿',
    start: 2,
    end: 4,
    draft: revision.before,
  };
  const restored = readDraft(
    JSON.stringify({
      version: 1,
      plan: examplePlan,
      topic: '',
      goal: '',
      active: task.id,
      themeOverride: 'auto',
      work: {
        [task.id]: {
          answer: revision.before,
          notes: '',
          researchRecords,
          discussionFocus,
        },
      },
    }),
  );
  assert.deepEqual(restored?.work[task.id].discussionFocus, discussionFocus);
  assert.deepEqual(restored?.work[task.id].researchRecords, researchRecords);
  assert.ok(
    exportJourney(examplePlan, restored!.work).includes('还需要补充证据'),
  );
});
test('revision is grounded in exact current draft and actual learner wording', async () => {
  const response = await processDialogue(input, {
    search: async () => null,
    complete: async (prompt) => {
      assert.ok(prompt.includes('researchDraft'));
      return JSON.stringify(reply);
    },
  });
  assert.deepEqual(response.dialogue.revision, revision);
  for (const changed of [
    { ...revision, before: '旧稿' },
    { ...revision, usedQuote: '用户没有说过' },
    { ...revision, after: revision.before },
  ]) {
    await assert.rejects(
      processDialogue(input, {
        search: async () => null,
        complete: async () => JSON.stringify({ ...reply, revision: changed }),
      }),
    );
  }
});
test('mentor and unknown sources cannot masquerade as a learner-guided revision', async () => {
  await assert.rejects(
    processDialogue(
      { ...input, recipient: 'mentor' },
      { search: async () => null, complete: async () => JSON.stringify(reply) },
    ),
  );
  await assert.rejects(
    processDialogue(input, {
      search: async () => null,
      complete: async () => JSON.stringify({ ...reply, sourceIds: ['fake'] }),
    }),
  );
});
test('adoption and undo preserve edits, and conflicts cannot overwrite current work', () => {
  const original = { answer: '', notes: '', proposal: revision };
  assert.equal(researchText(original, revision.before), revision.before);
  const adopted = changeWork(
    original,
    applyResearchProposal(original, revision.before),
  );
  assert.equal(adopted.answer, revision.after);
  assert.equal(adopted.proposal, undefined);
  assert.equal(
    changeWork(adopted, undoResearchProposal(adopted)).answer,
    revision.before,
  );
  assert.throws(() =>
    applyResearchProposal(
      { ...original, answer: '继续编辑后的稿' },
      revision.before,
    ),
  );
  assert.throws(() =>
    undoResearchProposal({ ...adopted, answer: '采用后又有编辑' }),
  );
  assert.equal(
    researchText({ answer: '', notes: '', researchStarted: true }, '材料'),
    '',
  );
});
test('suggestions, adopted changes and deliberate empty drafts survive refresh and export', () => {
  const task = examplePlan.tasks[0];
  const work = {
    answer: '',
    notes: '',
    researchStarted: true,
    proposal: revision,
    lastApplied: revision,
  };
  const draft = readDraft(
    JSON.stringify({
      version: 1,
      plan: examplePlan,
      topic: '',
      goal: '',
      active: task.id,
      themeOverride: 'auto',
      work: { [task.id]: work },
    }),
  );
  assert.deepEqual(draft?.work[task.id].proposal, revision);
  assert.equal(researchText(draft!.work[task.id], task.material), '');
  const exported = exportJourney(examplePlan, draft!.work);
  assert.ok(exported.includes('待确认建议（未采用）'));
  assert.ok(exported.includes(revision.usedQuote));
});
