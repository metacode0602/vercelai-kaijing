# @workspace/sms-captcha — 短信验证码

短信验证码的**服务端 + 客户端**一体化实现：图形滑块校验、IP 限流、频次控制与短信下发，用于登录/注册等场景的人机校验。

## 定位

| 项 | 说明 |
| --- | --- |
| 作用 | 提供「先人机校验、后发短信」的验证码闭环 |
| 消费方 | 需要手机号验证的 Next.js 应用 |
| 边界 | 只负责验证码本身，不承载业务绑定逻辑 |

## 主要功能

| 模块 | 说明 |
| --- | --- |
| `src/server/puzzle-generator.ts` | 生成滑块拼图挑战 |
| `src/server/handlers/challenge.ts` | 挑战下发与校验端点 |
| `src/server/rate-limiter.ts` / `ip.ts` | 频次与 IP 维度限流 |
| `src/server/sms-captcha-server.ts` | 服务端入口 |
| `src/client/sms-slider-captcha.tsx` | 滑块验证码 React 组件 |
| `src/types.ts` | 客户端/服务端共享类型 |

## 运行

```bash
pnpm --filter @workspace/sms-captcha run lint
pnpm --filter @workspace/sms-captcha run typecheck
```

接入方需在 `.env` 配置短信通道变量（见 `.env.example`），并在自己的路由里挂载 challenge 端点。

## 部署

**不独立部署**，随宿主应用发布。生产环境需保证短信服务商凭证可用，并按需调整限流阈值。

## 相关文档

- 模块协作关系：[根 README](../../README.md#模块协作关系)
