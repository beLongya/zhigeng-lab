// Explicit live smoke test: uses only the built-in example, never saved user work.
// Stops on the first failure; no automatic API retries.
import { examplePlan } from '../lib/expedition.ts';
import {
  dialogueMessage,
  type DialogueTurn,
  type DialogueReply,
} from '../lib/dialogue.ts';
const turns: DialogueTurn[] = [];
const task = examplePlan.tasks[1];
let draft = task.material;
const steps = [
  {
    recipient: 'mentor',
    message: '我不太懂事件视界为什么不是一堵墙。请先举个例子，不要考我。',
  },
  {
    recipient: 'peer',
    message:
      '小舟，先把墙这个比喻去掉。它不是物质表面，而是从内部发出的光也无法抵达外部远处的边界。请按这句话修改研究稿，不要声称我们看到了内部。',
  },
  {
    recipient: 'colleague',
    message: '这个解释还需要注意什么适用条件？请补一个值得核对的角度。',
  },
  {
    recipient: 'auto',
    message: '先到这里，不用再问了。简短总结我们还没验证的地方。',
  },
];
for (const step of steps) {
  const response = await fetch('http://localhost:3000/api/explore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'dialogue',
      intent: 'message',
      ...step,
      plan: examplePlan,
      task,
      researchDraft: draft,
      turns,
    }),
    signal: AbortSignal.timeout(75000),
  });
  const result = (await response.json()) as {
    error?: string;
    dialogue?: DialogueReply;
  };
  if (!response.ok || !result.dialogue)
    throw Error(
      `HTTP ${response.status}: ${result.error || 'Invalid response'}`,
    );
  const d = result.dialogue;
  console.log(JSON.stringify({ recipient: step.recipient, ...d }));
  turns.push(
    {
      role: 'user',
      recipient: step.recipient as 'mentor' | 'peer' | 'colleague' | 'auto',
      content: step.message,
    },
    { role: 'assistant', speaker: d.speaker, content: dialogueMessage(d) },
  );
  // Test-only adoption to examine subsequent dialogue, never changes browser work.
  if (d.revision) draft = d.revision.after;
}
