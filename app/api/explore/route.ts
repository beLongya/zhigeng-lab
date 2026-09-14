import { processExpedition } from '@/lib/expedition';
import { PracticeError } from '@/lib/practice';
import { readExploreRequest } from '@/lib/explore-request';
import { env } from 'cloudflare:workers';
export async function POST(request: Request) {
  let stage = 'request';
  const bindings = env as unknown as { ZHIHU_ACCESS_SECRET?: string; ZHIHU_AUTH_DB?: D1Database };
  const secret = bindings.ZHIHU_ACCESS_SECRET;
  if (!secret)
    return Response.json(
      { error: 'AI 服务尚未配置；你可以体验明确标注的示例。' },
      { status: 503 },
    );
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin)
      return Response.json({ error: '请从实验室页面发起讨论。' }, { status: 403 });
    const input = await readExploreRequest(request);
    if (bindings.ZHIHU_AUTH_DB) {
      stage = 'budget';
      const bucket = 'ai:' + new Date().toISOString().slice(0, 10);
      const result = await bindings.ZHIHU_AUTH_DB.prepare('INSERT INTO demo_budget(bucket, used) VALUES (?, 1) ON CONFLICT(bucket) DO UPDATE SET used = used + 1 WHERE used < 80').bind(bucket).run();
      if (!result.meta.changes) return Response.json({ error: '今日演示调用已达保护上限，草稿仍会保留。' }, { status: 429 });
    }
    const headers = {
      Authorization: `Bearer ${secret}`,
      'X-Request-Timestamp': String(Math.floor(Date.now() / 1000)),
      'Content-Type': 'application/json',
    };
    const result = await processExpedition(input, {
      search: async (topic) => {
        stage = 'search';
        const url = new URL(
          'https://developer.zhihu.com/api/v1/content/zhihu_search',
        );
        url.searchParams.set('Query', topic);
        url.searchParams.set('Count', '3');
        const r = await fetch(url, {
          redirect: 'manual',
          headers,
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(45000)]),
        });
        if (r.status === 429)
          throw new PracticeError('知乎检索频率受限，请稍后重试。', 429);
        if (!r.ok) throw new PracticeError('知乎资料检索暂不可用。');
        return r.json();
      },
      complete: async (prompt) => {
        stage = 'completion';
        const r = await fetch(
          'https://developer.zhihu.com/v1/chat/completions',
          {
            method: 'POST',
            redirect: 'manual',
            headers,
            body: JSON.stringify({
              model: 'zhida-fast-1p5',
              messages: [{ role: 'user', content: prompt }],
              stream: false,
            }),
            signal: AbortSignal.any([
              request.signal,
              AbortSignal.timeout(60000),
            ]),
          },
        );
        if (r.status === 429)
          throw new PracticeError(
            '知乎直答额度或频率受限。草稿已保留，请稍后重试。',
            429,
          );
        if (!r.ok) throw new PracticeError('知乎直答暂不可用。');
        const data = (await r.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new PracticeError('知乎直答未返回有效内容。');
        stage = 'validation';
        return content;
      },
    });
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    // Only fixed diagnostic categories; never log upstream bodies or credentials.
    console.error('explore_failure', stage, error instanceof SyntaxError ? 'json' : error instanceof TypeError ? 'type' : error instanceof PracticeError ? 'provider' : 'other');
    return Response.json(
      {
        error:
          error instanceof PracticeError
            ? error.message
            : stage === 'validation' ? 'AI 返回内容未通过检查，草稿已保留。' : '服务连接暂时失败，草稿已保留。',
      },
      { status: error instanceof PracticeError ? error.status : 502 },
    );
  }
}
