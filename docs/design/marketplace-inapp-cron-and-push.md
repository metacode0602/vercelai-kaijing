# Marketplace 应用内 cron 与 LAZOP Push

> 状态：**已实现（2026-11-06）**
> 代码：`packages/marketplace`（签名 / connector）、`apps/api/src/lib/marketplace/`、`apps/api/src/routes/{cron,webhooks}.ts`
> 关联：[marketplace-connectors.md](marketplace-connectors.md)、[platform-apis/lazada/lazada-logistics-api.md](platform-apis/lazada/lazada-logistics-api.md)

## 1. 目标与边界

- 在 `apps/api`（Hono 长驻服务）内运行应用内 cron，周期性同步 Daraz / Lazada 的订单、物流轨迹与评论。
- 被动接收 LAZOP Push（webhook）订单事件，验签后异步补单；不替代低频拉取，二者互补。
- 不在 `apps/shop` 内新增调度；`apps/shop` 的 CLI sync 继续保留用于本地 dry-run。

## 2. 调度

| 任务 | 默认 cron | 资源 |
| --- | --- | --- |
| 订单增量 | `*/15 * * * *` | `/orders/get` + `/order/get` |
| 物流轨迹 | `*/30 * * * *` | `/logistic/order/trace`（仅 RTS 后） |
| 评论 | `0 */6 * * *` | `/review/seller/history/list` + `/review/seller/list/v2` |

- 时区默认 `Asia/Shanghai`，由 `MARKETPLACE_SYNC_CRON_TIMEZONE` 覆盖。
- 总开关 `MARKETPLACE_SYNC_CRON_ENABLED`（默认开启）。croner `protect: true` + 进程内单飞，避免同实例重入。
- 多实例部署时应只在一个实例开启 cron，或将进程内单飞替换为 Postgres advisory lock。
- 手动触发：`POST /api/v1/cron/marketplace-sync`，`x-cron-secret` 或 `Authorization: Bearer $CRON_SECRET`，body `{ "resource": "orders|logistics|reviews|all" }`，返回 `202`。

### 2.1 增量窗口

- 订单：首次回填 `MARKETPLACE_SYNC_ORDERS_BACKFILL_DAYS`（默认 7 天）；之后按 `last_orders_sync_at - overlap`（默认 60 分钟）拉取，最多 `MAX_PAGES` 页。
- 评论：Lazada 历史评论时间窗 **不能超过 7 天**；每次以 `last_reviews_sync_at - 1 天` 与 `now - 7 天` 的较大者为起点，逐商品翻页（`current` 最大 50）。
- 物流：只追踪最近 `LOGISTICS_LOOKBACK_DAYS` 内、状态为 `ready_to_ship` / `shipped` 的订单，单轮上限 `LOGISTICS_LIMIT`。

## 3. 落库

| 平台实体 | 表 | 幂等键 |
| --- | --- | --- |
| 订单 | `orders` | `(shop_id, external_order_id)` |
| 订单行 | `order_lines` | `(order_id, external_line_id)` |
| 状态事件 | `order_status_events` | 状态变化时追加 |
| 包裹 | `shipments` | `(shop_id, external_package_id)` |
| 轨迹 | `tracking_events` | `(shipment_id, event_time, status_code)` |
| 评论 | `product_reviews` | `(shop_id, external_review_id)` |
| 评论图片 | `product_review_media` | `(review_id, url)` |
| Push 原始事件 | `marketplace_webhook_events` | 追加 |

- 评论字段对齐设计稿 §10.1：`rating/title/content/review_at/buyer_*/seller_sku/sku_attrs/raw`，图片拆入 `product_review_media`。
- `integration_states` 新增 `reviews_cursor`、`last_logistics_sync_at`、`last_reviews_sync_at`；每次运行写 `integration_logs(action='<resource>.sync')`。
- 平台返回的 `external_review_id` 缺失时，用 `hash(itemId + reviewAt + content + buyer)` 生成稳定 ID。

## 4. LAZOP Push 签名与接收

签名（Lazada 官方）：

```text
Authorization: HEX( HMAC-SHA256( appKey + rawBody, appSecret ) )
```

- 必须使用**原始请求体**验签，不能先 `JSON.parse` 再序列化。
- 实现：`packages/marketplace/src/signing/lazop.ts` 的 `computeLazopPushSignature` / `verifyLazopPushSignature`（常量时间比较）。
- 路由：`POST /api/v1/webhooks/lazop`。
  - 从 `site`（如 `lazada_vn` / `daraz_lk`）或 `app_key` 解析平台；
  - 用对应 `LAZADA_APP_SECRET` / `DARAZ_APP_SECRET` 验签；
  - 按 `seller_id` 匹配 `shops.seller_id` 或 `shops.external_shop_id`；
  - 原始事件写入 `marketplace_webhook_events` 后立即返回 `200`；
  - 命中店铺且 `MARKETPLACE_WEBHOOK_SYNC_ENABLED=true` 时，`setImmediate` 异步调用单订单同步（含轨迹），满足平台 <500ms 响应要求。
- 本地联调可设 `MARKETPLACE_WEBHOOK_SKIP_VERIFY=true`；生产禁止。

## 5. 平台能力结论

| 平台 | Push | 依据 |
| --- | --- | --- |
| Lazada | **官方支持**，HTTPS/OV-EV 证书，订单状态变更可推送 | Lazada Open Platform Push 文档；签名规则已确认 |
| Daraz | 官方门户**未公开说明** Push；同属 Lazop 协议家族，不能直接断言 LK 站点已开通 | 需在 Daraz 开放平台后台确认/申请，或用真实回调实测 |

因此：

- 订单主链路仍以 cron 拉取为准，Push 只做低延迟补充；
- Daraz webhook 路由按 Lazop 格式实现，文档标注「待 Daraz 实测/门户确认」；
- 评论与物流继续走拉取（Push 不覆盖评论）。

## 6. 环境变量

见根 `.env.example` 的「In-app cron + LAZOP push receiver」段。关键项：

```text
CRON_SECRET
MARKETPLACE_SYNC_CRON_ENABLED
MARKETPLACE_SYNC_ORDERS_CRON
MARKETPLACE_SYNC_LOGISTICS_CRON
MARKETPLACE_SYNC_REVIEWS_CRON
MARKETPLACE_WEBHOOK_SYNC_ENABLED
MARKETPLACE_WEBHOOK_SKIP_VERIFY
```

## 7. 已知限制与后续

- 进程内单飞不跨实例；生产多副本需共享锁（advisory lock / 分布式锁）或独立 worker。
- 评论接口对 Daraz 的实际路径/字段未实测；`lazop-base` 已做字段兼容映射，失败会写入 `integration_logs` 而不阻断其他店铺。
- `product_reviews` 只落主表 + 媒体表；分析、报告、抓取批次（设计稿 §10.3–10.7）后续按需补。
- 物流 `order/trace` 仅 RTS 后可用；未 RTS 的订单错误按单条记录，不影响整轮同步。
