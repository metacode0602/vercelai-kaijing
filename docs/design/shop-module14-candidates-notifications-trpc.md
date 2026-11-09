# 模块14：候选选品 · 站内信 · Dashboard 残余 · 成本测算初始值（tRPC → DB）

> 状态：已在 `apps/shop` 落地。分支 `feat/shop-trpc-candidates-notifications`。
> 基线：`feat/shop-trpc-finance-sync-dashboard`（PR #50 栈，含 #44–#50）；**不依赖 / 不合并** 售后 #43。

## 范围

| 已接 PostgreSQL | 仍缺口 / 边界（非本模块） |
| --- | --- |
| `/console/candidates` 列表/详情 → `product_candidates` + `pending_actions` | 真实市场爬虫 / 选品 Agent 自动化（禁止假成功） |
| 手工录入 / 导入落库；审核通过 → SPU 草稿或关联 `products`；拒绝理由 | 平台 OpenAPI 刊登推送 |
| `console_notifications` 站内信 list/unreadCount/markRead/markAllRead | 飞书/邮件/短信外传 |
| 同步入队 / 订单异常 scan·sync 可写系统通知（不外传） | 店铺 OAuth 连接器 |
| Dashboard 平台占比 / AOV / 退款率 / 利润图用真实趋势；空→「暂无数据」 | 库存分类结构 / 周转示意图组件 |
| 今日预警 ← `dashboard.alerts`（订单异常 stats + 同步/库存） | 售后 #43 待合并 |
| 成本测算初始值 ← `sku_costs`（+ fee_templates.resolve）；localStorage 仅会话草稿 |  |

## 架构

```
console/candidates
  → trpc.candidates.* → dataaccess/candidates
  → product_candidates / pending_actions / products.create

ConsoleInboxSheet
  → trpc.notifications.* → console_notifications

console/dashboard
  → trpc.dashboard.platformMix / alerts / trends / costCalcSeed
  → orders×shops / order_exception_cases / sync_tasks / sku_costs

orderExceptions.sync ≡ scan（写异常案件 + 可选站内信）
sync.enqueue → 站内信（sourceType=sync_enqueue）
```

## 约定

- 候选 `source`：manual / import / sourcing；文案标明「非爬虫」
- 通过：`create_draft` 调 `products.create`（待确认草稿）或 `link_existing`
- 拒绝：必须 `reject_reason`
- 站内信 `userId=null` 为组织广播；有 userId 仅该用户可见
- **禁止**在结果中声称已爬取市场或已外传通知

## 迁移与种子

迁移：`packages/db/drizzle/0000_flashy_silver_samurai.sql`（`product_candidates` / `console_notifications` 基表；历史编号 `0018_commerce_candidates_notifications`，2026-11-08 重生成并入）

```bash
pnpm --filter @workspace/db db:migrate
pnpm --filter @workspace/db db:seed:commerce-products
pnpm --filter @workspace/db db:seed:commerce-candidates
pnpm --filter @workspace/db typecheck
pnpm --filter shop typecheck
```
