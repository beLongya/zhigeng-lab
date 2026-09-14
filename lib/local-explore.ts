import { execFile } from 'node:child_process';
import type { Plugin } from 'vite';
import { processExpedition } from './expedition';
import { PracticeError } from './practice';
import { cliFailure } from './cli-error';
import { MAX_REQUEST_BYTES, parseExploreRequest } from './explore-request';
function cli(args: string[], signal: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const binary =
      process.env.ZHIHU_CLI_PATH ||
      `${process.env.LOCALAPPDATA}\\ZhihuCLI\\current\\zhihu-cli.exe`;
    execFile(
      binary,
      args,
      { windowsHide: true, timeout: 70000, maxBuffer: 2 * 1024 * 1024, signal },
      (error, stdout) => {
        if (error) {
          return reject(cliFailure(stdout, error.code));
        }
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new PracticeError('知乎返回内容无法解析。'));
        }
      },
    );
  });
}
export function localExplore(): Plugin {
  return {
    name: 'zhixing-expedition-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/explore', async (req, res, next) => {
        if (req.method !== 'POST') return next();
        const controller = new AbortController();
        const cancel = () => {
          if (!res.writableEnded) controller.abort();
        };
        res.on('close', cancel);
        try {
          const chunks: Buffer[] = [];
          let bytes = 0;
          for await (const chunk of req) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            bytes += buffer.length;
            if (bytes > MAX_REQUEST_BYTES)
              throw new PracticeError('请求过长。', 413);
            chunks.push(buffer);
          }
          const data = await processExpedition(
            parseExploreRequest(Buffer.concat(chunks).toString('utf8')),
            {
              search: (topic) =>
                cli(
                  [
                    'search',
                    'zhihu',
                    '--query',
                    topic,
                    '--count',
                    '3',
                    '--timeout',
                    '45s',
                  ],
                  controller.signal,
                ),
              complete: async (prompt) => {
                const r = (await cli(
                  [
                    'answer',
                    '--query',
                    prompt,
                    '--model',
                    'zhida-fast-1p5',
                    '--timeout',
                    '60s',
                  ],
                  controller.signal,
                )) as { choices?: { message?: { content?: string } }[] };
                const content = r.choices?.[0]?.message?.content;
                if (!content)
                  throw new PracticeError('知乎直答没有返回任务内容。');
                return content;
              },
            },
          );
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(data));
        } catch (error) {
          if (res.destroyed) return;
          res.statusCode = error instanceof PracticeError ? error.status : 502;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(
            JSON.stringify({
              error:
                error instanceof PracticeError
                  ? error.message
                  : '本次生成未通过格式检查。输入已保留，请重试。',
            }),
          );
        } finally {
          res.off('close', cancel);
        }
      });
    },
  };
}
