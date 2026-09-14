// Explicit live demo check; stops at first failure and never retries billable requests.
import assert from 'node:assert/strict';
import { fetch, Agent, EnvHttpProxyAgent } from 'undici';
import { dialogueMessage, type DialogueReply, type DialogueTurn } from '../lib/dialogue.ts';
import type { Expedition } from '../lib/expedition.ts';

const base = new URL(process.argv[2] || 'https://zhixing-lab.zhixing-campus.workers.dev').origin;
const dispatcher = process.argv.includes('--proxy') ? new EnvHttpProxyAgent() : new Agent();
async function post(input: unknown) {
  const response = await fetch(base + '/api/explore', {
    dispatcher, method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify(input), signal: AbortSignal.timeout(90000),
  });
  const data = await response.json() as { error?: string; plan?: Expedition; dialogue?: DialogueReply };
  assert.equal(response.status, 200, data.error || `HTTP ${response.status}`);
  return data;
}
try {
  for (const path of ['/', '/hot', '/account', '/api/zhihu/session', '/api/zhihu/hot']) {
    const r = await fetch(base + path, { dispatcher, signal: AbortSignal.timeout(25000) });
    assert.equal(r.status, 200, path);
    await r.arrayBuffer();
    console.log('PASS', path);
  }
  const { plan } = await post({ action: 'plan', topic: '为什么音乐会影响情绪？' });
  assert.ok(plan && plan.tasks.length >= 2);
  console.log('PASS plan', plan.title, 'sources', plan.sources.length);
  const turns: DialogueTurn[] = [];
  for (const step of [
    { recipient: 'mentor', intent: 'message', message: '为什么同一首歌，有时候让我开心，有时候让我难过？先帮我理解。' },
    { recipient: 'peer', intent: 'probe', probeKind: 'transfer', message: '' },
    { recipient: 'peer', intent: 'hint', message: '' },
    { recipient: 'mentor', intent: 'explain', message: '' },
  ]) {
    const { dialogue: d } = await post({ action: 'dialogue', ...step, plan, task: plan.tasks[0], turns });
    assert.ok(d?.reply);
    if (step.intent === 'probe') assert.equal(d.probe?.kind, 'transfer');
    if (['hint', 'explain'].includes(step.intent)) {
      assert.equal(d.question, ''); assert.equal(d.probe, undefined); assert.equal(d.evidence, undefined);
    }
    console.log('PASS', step.intent, JSON.stringify(d));
    turns.push({ role: 'user', recipient: step.recipient as 'mentor' | 'peer', content: step.message || (step.intent === 'probe' ? '邀请小舟给一个应用情境' : step.intent === 'hint' ? '给我一个提示' : '请先解释清楚') },
      { role: 'assistant', speaker: d.speaker, content: dialogueMessage(d), ...(d.probe ? { probe: d.probe } : {}), ...(d.support ? { support: d.support } : {}) });
  }
} finally { await dispatcher.close(); }
