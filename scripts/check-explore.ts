import { execFile } from 'node:child_process';
import { processExpedition } from '../lib/expedition.ts';
const cli = (args: string[]): Promise<unknown> =>
  new Promise((resolve, reject) =>
    execFile(
      `${process.env.LOCALAPPDATA}/ZhihuCLI/current/zhihu-cli.exe`,
      args,
      { windowsHide: true, timeout: 70000, maxBuffer: 2000000 },
      (error, stdout) => {
        if (error) return reject(new Error('CLI request failed'));
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new Error('CLI JSON invalid'));
        }
      },
    ),
  );
const shape = (v: unknown): unknown =>
  typeof v === 'string'
    ? `string(${v.length})`
    : Array.isArray(v)
      ? v.map(shape)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)]))
        : typeof v;
try {
  const result = await processExpedition(
    { action: 'plan', topic: '如何读懂印象派绘画？' },
    {
      search: (topic) =>
        cli(['search', 'zhihu', '--query', topic, '--count', '3']),
      complete: async (prompt) => {
        const r = (await cli([
          'answer',
          '--query',
          prompt,
          '--model',
          'zhida-fast-1p5',
          '--timeout',
          '60s',
        ])) as { choices: { message: { content: string } }[] };
        const content = r.choices[0].message.content;
        console.log(
          JSON.stringify(
            shape(
              JSON.parse(
                content.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''),
              ),
            ),
          ),
        );
        return content;
      },
    },
  );
  console.log('PASS', result.plan?.title, result.plan?.theme);
} catch (e) {
  console.error(e instanceof Error ? e.message : 'Failed');
  process.exitCode = 1;
}
