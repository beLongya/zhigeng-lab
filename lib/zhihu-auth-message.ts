// Public fixed messages only. Never render arbitrary upstream response text.
export function authErrorMessage(code: string): string {
  const legacy: Record<string, string> = {
    configuration: '服务端登录配置尚未完成，请联系项目维护者。',
    state: '这次登录已过期或与当前浏览器不匹配，请重新发起登录。',
    denied: '本次授权未完成。你仍可以返回实验室继续学习。',
    exchange: '上次登录未完成，旧提示未记录具体失败环节。请重新登录以获取诊断。',
  };
  if (legacy[code]) return legacy[code];
  const [phase, reason] = code.split('_');
  const stages: Record<string, string> = { token: '换取登录令牌', profile: '读取用户资料', session: '建立本地登录会话' };
  const reasons: Record<string, string> = {
    network: '服务器连接知乎失败，请稍后重新登录。',
    timeout: '知乎响应超时，请重新发起登录；不要刷新旧回调地址。',
    rejected: '知乎拒绝了本次请求。',
    limited: '请求频率、额度或会话数量受限，请稍后再试。',
    service: '知乎服务暂时异常，请稍后再试。',
    format: '返回数据缺少必要字段或格式不符合接口约定，需要检查服务端兼容性。',
  };
  if (!stages[phase] || !reasons[reason]) return '登录未完成，请重新尝试。';
  const detail = code === 'token_rejected' ? '需核对 App ID、App Key、回调地址和授权码有效性，不能仅凭此错误认定密钥有误。' : '';
  return `${stages[phase]}失败：${reasons[reason]}${detail}（诊断：${phase}_${reason}）`;
}
