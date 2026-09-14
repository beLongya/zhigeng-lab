import test from 'node:test';
import assert from 'node:assert/strict';
import { processDialogue } from './dialogue.ts';
import { examplePlan } from './expedition.ts';
import { readDraft } from './expedition-session.ts';
import { activeLearningProbe } from './learning.ts';
const probe = { kind: 'boundary' as const, target: '区分物质表面与因果边界' };
const base = {
  reply: '我换一个情境来想。',
  question: '如果没有物质墙，光为什么仍出不来？',
  status: 'continue',
  application: '',
  probe,
};
const mentor = {
  role: 'assistant',
  speaker: 'mentor',
  content: '事件视界不是物质表面。',
};
const input = {
  plan: examplePlan,
  task: examplePlan.tasks[0],
  recipient: 'peer',
  intent: 'probe',
  message: '',
  turns: [mentor],
};
const provider = (value: unknown) => ({
  search: async () => null,
  complete: async () => JSON.stringify(value),
});
test('selected practice style is enforced and invalid selection avoids model call', async () => {
  assert.equal((await processDialogue({ ...input, probeKind: 'boundary' }, provider(base))).dialogue.probe?.kind, 'boundary');
  await assert.rejects(processDialogue({ ...input, probeKind: 'transfer' }, provider(base)));
  await assert.rejects(processDialogue({ ...input, probeKind: 'unknown' }, { search: async () => null, complete: async () => { throw Error('must not call'); } }), { status: 400 });
});
test('help stays anchored and never produces another assessment', async () => {
  const history = [{ ...mentor, probe }];
  const help = { ...base, question: '', probe: undefined };
  for (const intent of ['hint', 'explain']) {
    const result = await processDialogue({ ...input, intent, turns: history }, provider(help));
    assert.equal(result.dialogue.support, intent);
    assert.deepEqual(activeLearningProbe([...history, { role: 'assistant', support: intent }]), probe);
    await assert.rejects(processDialogue({ ...input, intent, turns: history }, provider(base)));
  }
  assert.equal(activeLearningProbe([...history, { ...mentor }]), undefined);
});
test('an attempt after a hint can receive evidence tied to its original probe', async () => {
  const evidence = { quote: '不是墙', observation: '借助提示，区分了物质表面。', next: '还需说明因果路径。' };
  const turns = [{ ...mentor, probe }, { role: 'user', content: '给我提示' }, { ...mentor, support: 'hint' }];
  const result = await processDialogue({ ...input, intent: 'message', message: '不是墙', turns }, provider({ ...base, probe: undefined, question: '', evidence }));
  assert.deepEqual(result.dialogue.evidence, evidence);
  const saved = readDraft(JSON.stringify({ version: 1, plan: examplePlan, topic: '', goal: '', themeOverride: 'auto', work: { [examplePlan.tasks[0].id]: { answer: '', notes: '', turns } } }));
  assert.equal(saved?.work[examplePlan.tasks[0].id].turns?.at(-1)?.support, 'hint');
});
test('new-context invitation requires context and a diagnostic target', async () => {
  assert.equal(
    (await processDialogue(input, provider(base))).dialogue.probe?.kind,
    'boundary',
  );
  await assert.rejects(
    processDialogue({ ...input, turns: [] }, provider(base)),
  );
  await assert.rejects(
    processDialogue(input, provider({ ...base, probe: undefined })),
  );
  await assert.rejects(
    processDialogue(
      input,
      provider({ ...base, application: '答案是时空结构' }),
    ),
  );
});
test('learning observations require actual user evidence and a preceding probe', async () => {
  const evidence = {
    quote: '不是墙',
    observation: '能区分物质墙，但尚未说明光的路径。',
    next: '换条件后解释光的路径。',
  };
  const output = { ...base, question: '', probe: undefined, evidence };
  const attempt = {
    ...input,
    intent: 'message',
    message: '我觉得它不是墙。',
    turns: [{ ...mentor, probe }],
  };
  assert.deepEqual(
    (await processDialogue(attempt, provider(output))).dialogue.evidence,
    evidence,
  );
  await assert.rejects(
    processDialogue({ ...attempt, message: '不知道' }, provider(output)),
  );
  await assert.rejects(
    processDialogue({ ...attempt, turns: [mentor] }, provider(output)),
  );
  await assert.rejects(
    processDialogue({ ...attempt, intent: 'hint' }, provider(output)),
  );
});
test('diagnostic question metadata survives local draft restoration', () => {
  const work = {
    [examplePlan.tasks[0].id]: {
      answer: '',
      notes: '',
      turns: [{ ...mentor, probe }],
    },
  };
  const restored = readDraft(
    JSON.stringify({
      version: 1,
      plan: examplePlan,
      work,
      topic: '',
      goal: '',
      themeOverride: 'auto',
    }),
  );
  assert.deepEqual(
    restored?.work[examplePlan.tasks[0].id].turns?.[0].probe,
    probe,
  );
});
