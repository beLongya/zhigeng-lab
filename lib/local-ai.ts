import { execFile } from 'node:child_process';
import { processPractice, PracticeError } from './practice';
import type { Plugin } from 'vite';
export function localAI(): Plugin {
  return {
    name: 'zhihu-local-private-bridge',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/practice', async (req, res, next) => {
        if (req.method !== 'POST') return next();
        let body = '';
        try {
          for await (const chunk of req) {
            body += chunk;
            if (body.length > 12000) throw new Error('请求过长');
          }
          const result = await processPractice(
            JSON.parse(body),
            (prompt) =>
              new Promise<string>((resolve, reject) => {
                const binary =
                  process.env.ZHIHU_CLI_PATH ||
                  `${process.env.LOCALAPPDATA}\\ZhihuCLI\\current\\zhihu-cli.exe`;
                execFile(
                  binary,
                  [
                    'answer',
                    '--query',
                    prompt,
                    '--model',
                    'zhida-fast-1p5',
                    '--timeout',
                    '35s',
                  ],
                  { timeout: 40000, maxBuffer: 1024 * 1024, windowsHide: true },
                  (err, stdout, stderr) => {
                    if (err) {
                      if (`${stdout}${stderr}`.includes('rate_limit'))
                        return reject(
                          new PracticeError(
                            '知乎接口额度或请求频率受限，输入已保留，请稍后再试。',
                            429,
                          ),
                        );
                      return reject(new Error('本机知乎接口不可用'));
                    }
                    try {
                      const data = JSON.parse(stdout);
                      const text = data.choices?.[0]?.message?.content;
                      if (typeof text !== 'string') throw new Error('无内容');
                      resolve(text);
                    } catch {
                      reject(new Error('知乎返回格式错误'));
                    }
                  },
                );
              }),
          );
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(result));
        } catch (error) {
          res.statusCode = error instanceof PracticeError ? error.status : 502;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(
            JSON.stringify({
              error:
                error instanceof PracticeError
                  ? error.message
                  : '本机知乎直答暂不可用。输入已保留，请重试。',
            }),
          );
        }
      });
    },
  };
}
