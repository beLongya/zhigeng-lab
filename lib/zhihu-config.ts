// Server configuration only. Never import into a client component.
export function zhihuConfig(env: Record<string, string | undefined>) {
  const appId = env.ZHIHU_OAUTH_APP_ID?.trim() || '419';
  const appKey = env.ZHIHU_OAUTH_APP_KEY?.trim() || '';
  const accessSecret = env.ZHIHU_ACCESS_SECRET?.trim() || '';
  const redirectUri = env.ZHIHU_OAUTH_REDIRECT_URI?.trim() || '';
  const missing: string[] = [];
  if (!/^\d+$/.test(appId)) missing.push('有效的 ZHIHU_OAUTH_APP_ID');
  if (!appKey) missing.push('ZHIHU_OAUTH_APP_KEY');
  let validRedirect = false;
  try {
    const url = new URL(redirectUri);
    const local = env.NODE_ENV !== 'production' && url.origin === 'http://localhost:3000';
    validRedirect = (url.protocol === 'https:' || local) && url.pathname === '/callback' && !url.username && !url.password && !url.hash && !url.search;
  } catch { /* No guessed callback URL. */ }
  if (!validRedirect) missing.push('与知乎后台登记一致的 /callback 地址（本地允许 http://localhost:3000/callback）');
  return { appId, appKey, accessSecret, redirectUri, missing, oauthConfigured: !missing.length };
}
