import test from 'node:test';
import assert from 'node:assert/strict';
import {
  behavior,
  initialLesson,
  interview,
  processPractice,
  validateLesson,
} from './practice.ts';
void test('只教提问，不改变证据判断', () => {
  const base = behavior(initialLesson),
    after = behavior({ ...initialLesson, e1: true });
  assert.notEqual(after.question, base.question);
  assert.equal(after.conclusion, base.conclusion);
  assert.notEqual(after.answer, base.answer);
});
void test('只教证据，不改变提问与回答', () => {
  const base = behavior(initialLesson),
    after = behavior({ ...initialLesson, e2: true });
  assert.equal(after.question, base.question);
  assert.equal(after.answer, base.answer);
  assert.notEqual(after.conclusion, base.conclusion);
});
void test('两项都教才同时改变；无指导不变', () => {
  const base = behavior(initialLesson),
    after = behavior({ ...initialLesson, e1: true, e2: true });
  assert.notEqual(after.question, base.question);
  assert.notEqual(after.conclusion, base.conclusion);
  assert.deepEqual(behavior(initialLesson), base);
});
void test('人物事实稳定；态度与经历不同', () => {
  assert.equal(interview(0, 'past'), interview(0, 'past'));
  assert.notEqual(interview(0, 'past'), interview(0, 'leading'));
  assert.throws(() => interview(9, 'past'));
});
void test('AI 必须给出用户指导原文，不得编造依据', () => {
  assert.throws(() =>
    validateLesson(
      { ...initialLesson, e1: true, e1Quote: '假装用户说过' },
      '认真点',
    ),
  );
  assert.throws(() => validateLesson({ e1: 'true' }, '认真点'));
  assert.equal(
    validateLesson(
      { ...initialLesson, e1: true, e1Quote: '问过去经历' },
      '请问过去经历',
    ).e1,
    true,
  );
});
void test('拒绝无效输入且不调用上游', async () => {
  let calls = 0;
  const complete = async () => {
    calls++;
    return '{}';
  };
  await assert.rejects(
    processPractice({ action: 'teach', text: '' }, complete),
  );
  await assert.rejects(
    processPractice({ action: 'question', text: '你好', person: 9 }, complete),
  );
  assert.equal(calls, 0);
});
void test('模型响应校验和下游固定输出', async () => {
  const data = await processPractice(
    { action: 'question', text: '上周发生了什么', person: 1 },
    async () => '```json\n{"kind":"past"}\n```',
  );
  assert.equal('answer' in data && data.answer, interview(1, 'past'));
  await assert.rejects(
    processPractice({ action: 'teach', text: '加油' }, async () => '不是JSON'),
  );
});
