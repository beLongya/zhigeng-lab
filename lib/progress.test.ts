import test from 'node:test';
import assert from 'node:assert/strict';
import { fresh, restoreProgress, canConfirm } from './progress.ts';
void test('刷新恢复调查、草稿、带教与成果', () => {
  const state = {
    ...fresh,
    step: 2,
    instruction: '先问上次经历',
    draftQuestion: '上周你怎么解决的？',
    notes: [
      {
        person: 1,
        question: '实际经历？',
        answer: '固定回答',
        label: '受访者自述，尚未核验',
      },
    ],
  };
  assert.deepEqual(restoreProgress(JSON.stringify(state)), state);
});
void test('损坏进度不进入业务流程', () => {
  assert.throws(() => restoreProgress('{'));
  assert.throws(() =>
    restoreProgress(JSON.stringify({ ...fresh, notes: [{ person: 999 }] })),
  );
  assert.throws(() => restoreProgress(JSON.stringify({ ...fresh, step: 9 })));
});
void test('有方法和具体计划才能确认成果', () => {
  assert.equal(canConfirm(fresh), false);
  const s = {
    ...fresh,
    step: 4,
    report: '现有证据不足',
    nextPlan: '邀请同学试用，记录实际到场',
    lesson: { ...fresh.lesson, e1: true },
  };
  assert.equal(canConfirm(s), true);
  assert.equal(canConfirm({ ...s, nextPlan: '' }), false);
});
