import { PracticeError } from './practice.ts';
/** Classify CLI envelopes without leaking upstream output, queries or credentials. */
export function cliFailure(
  stdout: string,
  exitCode?: string | number | null,
): PracticeError {
  let code = '';
  try {
    const value = JSON.parse(stdout);
    code = String(value?.error?.code ?? value?.Code ?? value?.code ?? '');
  } catch {
    /* Use process failure code only; never expose raw output. */
  }
  if (code === '30002' || code === 'quota_exceeded')
    return new PracticeError(
      '知乎接口额度已用尽。输入已保留；需等待额度恢复或在开放平台检查用量。',
      429,
    );
  if (code === '30001' || code === 'rate_limit' || exitCode === 4)
    return new PracticeError(
      '知乎接口暂时限制请求。请先继续编辑，稍后再试；不要连续提交。输入已保留。',
      429,
    );
  if (
    code === 'AUTH_REQUIRED' ||
    code === 'KEYCHAIN_UNAVAILABLE' ||
    exitCode === 7
  )
    return new PracticeError(
      '当前服务进程无法读取知乎授权。若已配置密钥，请在可访问系统凭证的用户环境启动本地服务，无需先重置密钥。',
      503,
    );
  if (
    code === 'AUTH_INVALID' ||
    code === 'ENV_SHADOWS_KEYCHAIN' ||
    exitCode === 3
  )
    return new PracticeError(
      '知乎授权验证失败或被环境配置覆盖。请检查服务端凭证配置，输入已保留。',
      503,
    );
  if (code === 'TIMEOUT' || code === 'NETWORK_ERROR' || exitCode === 5)
    return new PracticeError(
      '连接知乎服务超时或网络不可用。本次未自动重试，输入已保留。',
      502,
    );
  if (exitCode === 'ENOENT')
    return new PracticeError(
      '未找到已配置的知乎 CLI，请检查本地服务的安装路径。',
      503,
    );
  return new PracticeError(
    '知乎服务未完成本次请求。输入已保留，请稍后再试。',
    502,
  );
}
