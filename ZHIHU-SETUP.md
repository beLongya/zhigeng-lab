# 知乎接入说明

## 已实现

首页账号入口；/account 个人资料、创作摘要、关注列表及加载更多；/hot 热榜（缓存 60 秒）。OAuth 回调使用一次性、绑定浏览器的 state，过期或退出后不回退为开发者身份。OAuth Token 仅留服务端，浏览器使用 HttpOnly Cookie。

App ID：419。本地回调已按用户截图设置为 http://localhost:3000/callback。

## 尚未完成真实授权

本地 .env.local 已配置 ZHIHU_OAUTH_APP_KEY 和 ZHIHU_ACCESS_SECRET；前者用于登录，后者用于热榜和授权用户列表。热榜已真实获取成功，App Key 仍待真实 Token 交换验证。CLI 系统凭据不会自动注入 Web 服务。不要把密钥放入前端、聊天或 Git，建议轮换曾公开发送的密钥。

用户本人在知乎页面确认授权，才能验证真实头像、昵称、关注和创作。Mock 测试通过不代表真实联调成功。

## 2026-09-13 登录网络排查

复现：普通 Node 进程可连接令牌接口；导入 Cloudflare 插件后，Wrangler 安装全局代理 dispatcher，同一请求报 ECONNRESET。本地代理环境影响了应用 OAuth 请求。

修复：本地知乎中间件使用独立 Undici Agent，仅允许两个官方 HTTPS 主机，不影响其他服务的代理，不关闭 TLS 校验，不自动重试授权码 POST。

验收：加载相同插件后，用不含凭据的测试表单请求令牌接口，已返回 HTTP 200 / JSON 业务码 20001（测试未携带凭据，鉴权失败符合预期）。这证明网络连接恢复，不代表真实用户登录已通过。需要重新从登录入口授权；不可刷新或重放旧回调。

## 运行与验证

- npm run dev -- --port 3000
- node --experimental-strip-types --test lib/zhihu-config.test.ts lib/zhihu-web.test.ts
- npx tsc --noEmit
- npm run build

测试覆盖：state 缺失、错误、跨浏览器、过期和重放，用户 ID 无损解析，分页双凭据、退出和授权失效、热榜缓存、配置缺失。

## 部署边界

目前会话使用单进程内存，重启后需重新登录。本地 HTTP 是开发例外，公网需登记 HTTPS /callback，Cookie 使用 Secure。

当前 Cloudflare 多实例部署未接入共享会话存储，生产登录主动返回错误。ZHIHU_SESSION_MODE=single-process 仅用于真正的独立单进程服务，不得用于绕过 Cloudflare 限制。上线前需增加共享存储及公网授权验收。

实现依据：官方 zhihu skill 0.7.2 的 OAuth、用户资料、用户数据和热榜协议。
