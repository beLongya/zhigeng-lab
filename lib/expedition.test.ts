/* oxlint-disable typescript/no-floating-promises -- node:test registers promises with the runner. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  examplePlan,
  normalizeSources,
  processExpedition,
  validateFeedback,
} from './expedition.ts';

test('source URLs reject lookalikes and unsafe protocols', () => {
  const items = [
    'https://www.zhihu.com/question/1',
    'https://zhihu.com.evil.test/1',
    'javascript:alert(1)',
  ].map((Url) => ({ Url, Title: '<b>资料</b>', ContentText: '摘要' }));
  const sources = normalizeSources({ Code: 0, Data: { Items: items } });
  assert.equal(sources.length, 1);
  assert.equal(sources[0].title, '资料');
});
test('plan generation receives arbitrary topic and selected goal', async () => {
  for (const topic of ['印象派绘画', '植物的光合作用']) {
    let received = '';
    const result = await processExpedition(
      { action: 'plan', topic, goal: '辨别常见误解' },
      {
        search: async (query) => {
          assert.equal(query, topic);
          return { Code: 0, Data: { Items: [] } };
        },
        complete: async (prompt) => {
          received = prompt;
          return JSON.stringify(examplePlan);
        },
      },
    );
    assert.ok(received.includes(topic));
    assert.ok(received.includes('辨别常见误解'));
    assert.ok(received.includes('恰好 2 个对象的数组'));
    assert.ok(received.includes('title 80、goal 240、scene 500、intro 500'));
    assert.ok(!received.includes('所有字段为中文字符串'));
    assert.ok(!received.includes('至少一个任务包含带教小舟'));
    assert.ok(result.plan);
    assert.equal(result.plan.topic, topic);
    assert.equal(result.plan.mode, 'live');
    assert.match(result.plan.warning, /未检索到/);
  }
});
const feedback = {
  reply: '具体反馈',
  strength: '指出概念',
  gap: '补充证据',
  nextQuestion: '能举例吗？',
  partnerBefore: '一堵墙',
  partnerAfter: '不是物质墙',
  changed: true,
  usedQuote: '不是物质墙',
  sourceIds: ['S1', 'FAKE'],
};
test('response includes evidence notes and user-edited learning goal', async () => {
  let sent = '';
  await processExpedition(
    {
      action: 'respond',
      plan: { ...examplePlan, goal: '我修改过的目标' },
      task: examplePlan.tasks[0],
      answer: '不是物质墙',
      notes: '我记录的证据',
      history: [],
    },
    {
      search: async () => null,
      complete: async (prompt) => {
        sent = prompt;
        return JSON.stringify(feedback);
      },
    },
  );
  assert.ok(sent.includes('我记录的证据'));
  assert.ok(sent.includes('我修改过的目标'));
});
test('feedback only accepts exact user quotation and known sources', () => {
  const result = validateFeedback(feedback, '事件视界不是物质墙', ['S1']);
  assert.deepEqual(result.sourceIds, ['S1']);
  assert.throws(() => validateFeedback(feedback, '加油', []));
});
test('unchanged feedback must not fabricate changed behavior', () => {
  assert.throws(() =>
    validateFeedback(
      { ...feedback, changed: false, usedQuote: '' },
      '加油',
      [],
    ),
  );
  assert.equal(
    validateFeedback(
      { ...feedback, changed: false, usedQuote: '', partnerAfter: '一堵墙' },
      '加油',
      [],
    ).changed,
    false,
  );
});
test('empty topic is rejected before provider invocation', async () => {
  await assert.rejects(
    processExpedition(
      { action: 'plan', topic: '' },
      {
        search: async () => {
          throw new Error('must not call');
        },
        complete: async () => '',
      },
    ),
    /不完整/,
  );
});
