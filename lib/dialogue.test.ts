/* oxlint-disable typescript/no-floating-promises -- Node test registration. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  processDialogue,
  validateDialogue,
  dialogueMessage,
  resolveLabRecipient,
} from './dialogue.ts';
import { examplePlan } from './expedition.ts';
import { readDraft, exportJourney } from './expedition-session.ts';
const reply = {
  reply: '我正在改这段科普稿，对这个比喻有点拿不准。',
  question: '你觉得墙这个说法哪里不合适？',
  status: 'continue',
  application: '',
};
test('free discussion selects one speaker and retains an optional insight', async () => {
  let calls = 0;
  const result = await processDialogue(
    {
      intent: 'message',
      recipient: 'auto',
      message: '还有其他解释吗',
      plan: examplePlan,
      task: examplePlan.tasks[0],
      turns: [],
    },
    {
      search: async () => null,
      complete: async () => {
        calls++;
        return JSON.stringify({
          ...reply,
          speaker: 'colleague',
          insight: '可以先比较两个假设的边界。',
        });
      },
    },
  );
  assert.equal(calls, 1);
  assert.equal(result.dialogue.speaker, 'colleague');
  assert.equal(result.dialogue.insight, '可以先比较两个假设的边界。');
  assert.equal(resolveLabRecipient('@同门 看看反例', 'auto'), 'colleague');
  for (const speaker of [undefined, 'auto', 'stranger']) {
    await assert.rejects(
      processDialogue(
        {
          intent: 'message',
          recipient: 'auto',
          message: '看看反例',
          plan: examplePlan,
          task: examplePlan.tasks[0],
          turns: [],
        },
        {
          search: async () => null,
          complete: async () => JSON.stringify({ ...reply, speaker }),
        },
      ),
    );
  }
});
test('resolved responses do not introduce a new insight', () => {
  assert.equal(
    validateDialogue({
      ...reply,
      status: 'resolved',
      question: '',
      insight: '换个话题',
    }).insight,
    undefined,
  );
});
test('free discussion preferences and insights survive refresh', () => {
  const work = {
    answer: '',
    notes: '',
    recipient: 'auto',
    reducedMotion: true,
    parkedInsights: [1],
    turns: [
      { role: 'user', recipient: 'auto', content: '一起研究' },
      {
        role: 'assistant',
        speaker: 'colleague',
        content: '一个假设',
        insight: '尚需验证',
      },
    ],
  };
  const restored = readDraft(
    JSON.stringify({
      version: 1,
      plan: examplePlan,
      topic: '',
      goal: '',
      active: 'task-1',
      themeOverride: 'auto',
      work: { 'task-1': work },
    }),
  );
  assert.deepEqual(restored?.work['task-1'], { ...work, done: false });
  assert.ok(exportJourney(examplePlan, restored!.work).includes('尚需验证'));
});
test('lab mentions route to one participant without losing the message', () => {
  assert.equal(resolveLabRecipient('@导师 这个概念是什么？', 'peer'), 'mentor');
  assert.equal(resolveLabRecipient('@小舟 先区分证据和推断', 'mentor'), 'peer');
  assert.equal(resolveLabRecipient('我想请教一下', 'mentor'), 'mentor');
  assert.throws(() => resolveLabRecipient('@导师 @小舟 一起说', 'peer'));
});
test('mentor sees shared peer context and returns an attributed explanation', async () => {
  const result = await processDialogue(
    {
      intent: 'message',
      recipient: 'peer',
      message: '@导师 帮我解释一下',
      plan: examplePlan,
      task: examplePlan.tasks[0],
      turns: [
        { role: 'assistant', speaker: 'peer', content: '我不明白事件视界。' },
      ],
    },
    {
      search: async () => null,
      complete: async (prompt) => {
        assert.ok(prompt.includes('"speaker":"peer"'));
        assert.ok(prompt.includes('本次仅由该角色回应：mentor'));
        assert.ok(prompt.includes('不要代替小舟发言'));
        return JSON.stringify({
          ...reply,
          reply: '导师的解释',
          question: '',
          status: 'resolved',
        });
      },
    },
  );
  assert.equal(result.dialogue.speaker, 'mentor');
  assert.equal(result.dialogue.status, 'continue');
});
test('mentor cannot claim an application on behalf of the peer', async () => {
  await assert.rejects(
    processDialogue(
      {
        intent: 'message',
        recipient: 'mentor',
        message: '请解释',
        plan: examplePlan,
        task: examplePlan.tasks[0],
        turns: [],
      },
      {
        search: async () => null,
        complete: async () =>
          JSON.stringify({ ...reply, application: '小舟已经学会了' }),
      },
    ),
  );
});
test('lab participants and long learner messages survive storage and export', () => {
  const turns = [
    { role: 'user', recipient: 'mentor', content: '问'.repeat(2400) },
    { role: 'assistant', speaker: 'mentor', content: '解释' },
    { role: 'user', recipient: 'peer', content: '我来指导你' },
    { role: 'assistant', speaker: 'peer', content: '具体修改' },
  ];
  const restored = readDraft(
    JSON.stringify({
      version: 1,
      plan: examplePlan,
      topic: '',
      goal: '',
      active: 'task-1',
      themeOverride: 'auto',
      work: { 'task-1': { answer: '', notes: '', recipient: 'mentor', turns } },
    }),
  );
  assert.deepEqual(restored?.work['task-1'].turns, turns);
  assert.equal(restored?.work['task-1'].recipient, 'mentor');
  const output = exportJourney(examplePlan, restored!.work);
  assert.ok(output.includes('导师（AI 模拟）'));
  assert.ok(output.includes('小舟（AI 模拟）'));
  assert.ok(output.includes('你 → @导师'));
});
test('opening and follow-up preserve the exact question in context', async () => {
  const turns = [
    { role: 'assistant', content: dialogueMessage(validateDialogue(reply)) },
  ];
  let prompt = '';
  await processDialogue(
    {
      intent: 'reply',
      plan: examplePlan,
      task: examplePlan.tasks[0],
      message: '不是物质表面',
      turns,
    },
    {
      search: async () => {
        throw Error('should not search');
      },
      complete: async (p) => {
        prompt = p;
        return JSON.stringify(reply);
      },
    },
  );
  assert.ok(prompt.includes(reply.question));
  assert.ok(prompt.includes('不是物质表面'));
});
test('resolved conversation may close without another forced question', () => {
  assert.equal(
    validateDialogue({ ...reply, status: 'resolved', question: '' }).question,
    '',
  );
  assert.throws(() => validateDialogue({ ...reply, status: 'resolved' }));
  assert.throws(() =>
    validateDialogue({ ...reply, question: '是什么？为什么？' }),
  );
});

test('a helpful reply can leave space without asking another question', () => {
  const result = validateDialogue({
    ...reply,
    reply: '我先用你给的例子解释一下，等你想继续时我们再看另一句。',
    question: '',
  });
  assert.equal(result.status, 'continue');
  assert.equal(result.question, '');
});

test('natural messages retain their exact wording without a forced question mode', async () => {
  const message = '我还是不懂，你能先举个例子吗？';
  let sent = '';
  await processDialogue(
    {
      intent: 'message',
      message,
      plan: examplePlan,
      task: examplePlan.tasks[0],
      turns: [],
    },
    {
      search: async () => null,
      complete: async (p) => {
        sent = p;
        return JSON.stringify({ ...reply, question: '' });
      },
    },
  );
  assert.ok(sent.includes(message));
  assert.ok(sent.includes('"intent":"message"'));
});

test('opening still needs one specific question, unlike an ordinary response', async () => {
  await assert.rejects(
    processDialogue(
      {
        intent: 'start',
        plan: examplePlan,
        task: examplePlan.tasks[0],
        turns: [],
      },
      {
        search: async () => null,
        complete: async () => JSON.stringify({ ...reply, question: '' }),
      },
    ),
  );
});
test('help intents work without a typed answer and are explicit in the prompt', async () => {
  for (const intent of ['start', 'hint', 'explain']) {
    await processDialogue(
      { intent, plan: examplePlan, task: examplePlan.tasks[0], turns: [] },
      {
        search: async () => null,
        complete: async (p) => {
          assert.ok(p.includes(`"intent":"${intent}"`));
          return JSON.stringify({ ...reply, question: intent === 'start' ? reply.question : '' });
        },
      },
    );
  }
});
test('invalid intent or empty reply never invokes model', async () => {
  for (const intent of ['invalid', 'reply', 'ask'])
    await assert.rejects(
      processDialogue(
        { intent, plan: examplePlan, task: examplePlan.tasks[0], turns: [] },
        {
          search: async () => null,
          complete: async () => {
            throw Error('unexpected provider call');
          },
        },
      ),
      { status: 400 },
    );
});
test('dialogue, pause and unsent draft survive refresh', () => {
  const turns = [
    { role: 'assistant', content: dialogueMessage(validateDialogue(reply)) },
  ];
  const restored = readDraft(
    JSON.stringify({
      version: 1,
      plan: examplePlan,
      topic: '',
      goal: '',
      active: 'task-1',
      themeOverride: 'auto',
      work: {
        'task-1': {
          answer: '',
          notes: '',
          turns,
          dialogueStatus: 'paused',
          dialogueDraft: '我想先问',
        },
      },
    }),
  );
  assert.deepEqual(restored?.work['task-1'].turns, turns);
  assert.equal(restored?.work['task-1'].dialogueStatus, 'paused');
  assert.equal(restored?.work['task-1'].dialogueDraft, '我想先问');
});

test('export retains asked question and unsent dialogue draft', () => {
  const output = exportJourney(examplePlan, {
    'task-1': {
      answer: '',
      notes: '',
      turns: [{ role: 'assistant', content: reply.question }],
      dialogueDraft: '我还在想',
    },
  });
  assert.ok(output.includes(reply.question));
  assert.ok(output.includes('我还在想'));
});
