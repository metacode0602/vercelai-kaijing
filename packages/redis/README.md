# @workspace/redis — 统一 Redis 连接

封装 Redis 连接与常用读写：本地/云上两种部署形态用同一套 API，调用方不需要关心底层是哪种实现。

## 定位

| 项 | 说明 |
| --- | --- |
| 作用 | 提供统一的 Redis 客户端与短信等共享读写封装 |
| 消费方 | 各应用中需要缓存、限流、幂等或临时态的模块 |
| 实现 | 默认 `ioredis`（本地/自建）；配置了 Upstash 凭证时切换为 `@upstash/redis`（REST） |

## 主要功能

- **连接自动选择**：存在 `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` → Upstash（Vercel 等云端）
- 否则回落本地 Redis：`REDIS_URL`（优先）或 `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `REDIS_DB`，默认 `localhost:6379`
- `sms.ts`：短信相关的 Redis 读写封装
- `index.ts`：客户端工厂与共享类型

## 运行

```bash
# 本地 Redis（可选，未配置时按需降级）
docker compose up -d redis

pnpm --filter @workspace/redis run lint
pnpm --filter @workspace/redis run typecheck
```

## 部署

**不独立部署**，随宿主应用发布。生产环境二选一：

- 自建/容器化 Redis：配置 `REDIS_*`
- 云端托管：配置 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`

## 相关文档

- 模块协作关系：[根 README](../../README.md#模块协作关系)
