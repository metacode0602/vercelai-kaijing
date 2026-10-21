# Shop OTP 登录 / 注册

入口：`/login`（营销头「登录」、CTA「开始使用」）。手机号 / 邮箱 Tab 共用「获取验证码 → 6 位 OTP → 登录/注册」流；首次验证成功即建用户并建 session，成功后跳转 `/console/dashboard`。

## 后端

- Better Auth `phoneNumber` + `emailOTP`（`apps/shop/src/lib/auth.ts`，对齐 packages/auth 模式），挂载 `/api/auth/[...all]`
- 短信 / 邮件：开发 stub（控制台打印；`NODE_ENV=development` 响应可附 `devCode`，生产绝不返回）
- 限流：`apps/shop/src/lib/otp-rate-limit.ts`，接口可换 Redis；**当前内存实现仅单进程有效**

## 限流规则

| 维度 | 规则 | 超限 |
|------|------|------|
| 标识（手机/邮箱） | 两次发送间隔 ≥ 60s | HTTP 429 中文提示 + `Retry-After` |
| 标识 | 滚动 15 分钟 ≤ 5 次 | 429 |
| IP | 滚动 15 分钟 ≤ 10 次 | 429 |
| 校验 | 每标识 15 分钟 ≤ 5 次尝试验证 | 429；插件 `allowedAttempts: 5` |

## 关联

见 `apps/web/content/design/auth-system-design.md`（租户端 phone OTP 模式）；本应用为 shop 域 cookiePrefix=`shop`。
