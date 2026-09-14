import { PracticeError } from './practice.ts';

export type LearningProbe = {
  kind: 'reason' | 'boundary' | 'diagnose' | 'transfer';
  target: string;
};
export type LearningEvidence = {
  quote: string;
  observation: string;
  next: string;
};
export const probeChoices = [
  { kind: 'boundary', label: '换个条件', description: '看看原来的判断在什么情况下不再成立' },
  { kind: 'diagnose', label: '找找漏洞', description: '一起检查一个看似合理的解释' },
  { kind: 'transfer', label: '实际用一次', description: '把刚学的知识用到另一个具体情境' },
] as const;
export function activeLearningProbe(turns: { role: string; probe?: LearningProbe; support?: string }[]) {
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    if (turn.role !== 'assistant') continue;
    if (turn.probe) return turn.probe;
    if (!turn.support) return undefined;
  }
  return undefined;
}
function field(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new PracticeError('理解反馈格式无效，本次未采用。');
  return value.trim();
}
export function readProbe(value: unknown): LearningProbe {
  const x = value as Record<string, unknown>;
  if (
    !x ||
    !['reason', 'boundary', 'diagnose', 'transfer'].includes(String(x.kind))
  )
    throw new PracticeError('提问没有明确的理解目标。');
  return {
    kind: x.kind as LearningProbe['kind'],
    target: field(x.target, 180),
  };
}
export function readEvidence(value: unknown): LearningEvidence {
  const x = value as Record<string, unknown>;
  if (!x) throw new PracticeError('理解反馈格式无效。');
  return {
    quote: field(x.quote, 500),
    observation: field(x.observation, 400),
    next: field(x.next, 250),
  };
}
export const learningPolicy = `学习主线：用户先带着真实疑问来实验室，导师先解答，不要求先写研究稿。研究稿仅是可选笔记，修改它不是每轮的目标。不要机械要求用户教小舟改稿。
probe动作表示用户自愿试一个新情境：由小舟以第一人称给出一个简短的应用场景或拿不准的判断，只问一个需要理由的问题。问题必须承接最近导师解释或用户的疑问，改变一个关键条件，不能只是换词复述定义；不在reply/application中泄露待判断的答案。添加probe:{kind:reason因果解释/boundary边界判断/diagnose错误诊断/transfer新情境迁移四者对应的英文值,target:本题具体要观察的理解}。
回答提问时，先看用户是否表达困惑、反问或换题；这些都不是作答，不评价，不强行追问。用户不知道时先给一个观察点或简化对比；仍不会就解释，不无限追问。具体错误要指出是哪一条推理不成立，用对比例子帮助，再按需给一次小尝试。表达正确但只重复导师用语时，不宣布学会，可换条件请其做判断并说明理由。理由充分则简短承接，不必继续出题。延伸知识必须补足当前推理所需条件，不随机拓展。
仅在用户确实尝试回答此前probe时，才可添加evidence:{quote:本次message中的连续原话,observation:这句话具体体现了什么判断或仍有什么缺口,next:尚需观察的表现}。禁止仅凭关键词判正确；依据是理由、条件和推理。没有证据就不输出evidence。quote必须逐字来自用户，不能引用导师或自行补全理由。提示后的表现不是独立完成，不声称已证明长期掌握；不要输出分数、掌握百分比或通关结论。
导师先直接回答，只有必要澄清才提问；同门提供平等的其他视角，不冒充真人。用户可随时问新问题、求助或停止。每次最多一个问句；每个用于检验理解的问题都带probe，但普通澄清不带。`;
