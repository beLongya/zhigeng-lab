import { processPractice, PracticeError } from '@/lib/practice';
export async function POST(request: Request) {
  if (Number(request.headers.get('content-length') || 0) > 12000)
    return Response.json({ error: '请求过长。' }, { status: 413 });
  const secret = process.env.ZHIHU_ACCESS_SECRET;
  if (!secret)
    return Response.json(
      { error: '线上 AI 尚未配置。你的输入已保留，请稍后重试。' },
      { status: 503 },
    );
  try {
    const body = await request.text();
    if (body.length > 12000)
      return Response.json({ error: '请求过长。' }, { status: 413 });
    const result = await processPractice(JSON.parse(body), async (prompt) => {
      const res = await fetch(
        'https://developer.zhihu.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${secret}`,
            'X-Request-Timestamp': String(Math.floor(Date.now() / 1000)),
          },
          body: JSON.stringify({
            model: 'zhida-fast-1p5',
            messages: [{ role: 'user', content: prompt }],
            stream: false,
          }),
          signal: AbortSignal.timeout(35000),
        },
      );
      if (res.status === 429)
        throw new PracticeError(
          '知乎接口额度或请求频率受限，输入已保留，请稍后再试。',
          429,
        );
      if (!res.ok)
        throw new Error('知乎直答暂时不可用，输入已保留，请稍后重试。');
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error('知乎直答未返回有效内容。');
      return text;
    });
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof PracticeError
            ? error.message
            : '这次 AI 判断未完成或格式未通过校验。输入已保留，可以重试。',
      },
      { status: error instanceof PracticeError ? error.status : 502 },
    );
  }
}
