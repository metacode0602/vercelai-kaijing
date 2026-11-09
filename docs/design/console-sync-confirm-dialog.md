# 控制台同步入口确认对话框设计

> 状态：设计稿，待实现
> 范围：`apps/shop` 控制台所有"同步 / 提交交运 / 重试"入口
> 关联：[marketplace-connectors.md](marketplace-connectors.md)、[marketplace-inapp-cron-and-push.md](marketplace-inapp-cron-and-push.md)、[shop-module13-finance-sync-dashboard-trpc.md](shop-module13-finance-sync-dashboard-trpc.md)

## 1. 背景与问题

控制台现有 17 处"同步 / 提交 / 重试"按钮均为**点击即执行**，用户在点击前无法预知：

- 操作会作用在**哪个店铺 / 哪些店铺**上
- 会触发**什么样的平台 OpenAPI 调用**（拉单、推送交运、读轨迹…）
- 会产生**什么不可逆影响**（外部已发货、批次状态推进…）

其中 6 处会**真实调用平台 OpenAPI**（订单同步、刊登同步、LGS 提交交运、sync-task 重试），外部副作用不可撤销，必须让用户在执行前明确知晓范围与后果。

## 2. 设计目标

1. **执行前提示**：所有真实调平台 + 关键本地写操作前，弹确认对话框，说明"在哪个店铺、做了什么、有什么影响"。
2. **按操作差异化文案**：不同入口显示不同标题 / 范围 / 影响，不复用一句通用提示。
3. **范围明确**：禁止"当前组织下所有已激活、未暂停的店铺"这类模糊表述；必须列出具体店铺名或明确"全部 N 家店铺"。
4. **视觉一致**：复用现有 `UedDialog` 视觉风格（同款遮罩、圆角、footer 按钮），不引入 shadcn AlertDialog。
5. **不暴露实现细节**：文案不提"凭据从数据库读取""服务间环境变量"等用户不关心的内部机制。

## 3. 入口清单与分级

按"是否真实调用平台 OpenAPI + 影响可逆性"分三级：

### A 级：真实调平台 OpenAPI，必须确认（6 处）

| # | 页面路径 | 按钮 | 平台动作 | 影响可逆性 |
| --- | --- | --- | --- | --- |
| 1 | `/console/orders` | 人工增量同步 | Lazop `/orders/get` + `/order/items/get` 拉增量订单 | 订单可重复 upsert（幂等），但外部已拉取不可撤回 |
| 2 | `/console/listings/[id]` | 请求刊登读同步 | Lazop `/products/get` 读单刊登 | 本地状态更新，可重跑 |
| 3 | `/console/logistics-lgs` | 提交交运 | Lazop `/order/fulfill/pack` + `/order/package/rts` | **不可逆**：平台侧已标记发货 |
| 4 | `/console/logistics-lgs/[id]` | 提交交运 | 同上 | 同上 |
| 5 | `/console/sync-tasks` | 重试 · {taskNo} | 按 task type 路由（orders/listings/logistics/reviews/settlements） | 取决于 task type |
| 6 | `/console/sync-tasks/[id]` | 重试入队 | 同上 | 同上 |

### B 级：本地写但用户易误解为"调平台"，建议确认（8 处）

| # | 页面路径 | 按钮 | 实际行为 |
| --- | --- | --- | --- |
| 7 | `/console/logistics-jsb` | 提交交接 | JSB 无可靠 API，仅写本地批次状态 |
| 8 | `/console/logistics-jsb/[id]` | 提交交接 | 同上 |
| 9 | `/console/logistics-lgs` | 关闭批次 | 本地状态 closed，不可逆 |
| 10 | `/console/logistics-lgs/[id]` | 关闭批次 | 同上 |
| 11 | `/console/logistics-jsb` | 关闭批次 | 同上 |
| 12 | `/console/logistics-jsb/[id]` | 关闭批次 | 同上 |
| 13 | `/console/shipments` | 同步平台轨迹（stub） | 写 `fulfillment_attempts`，不调平台 |
| 14 | `/console/shipments/[id]` | 同步平台轨迹 | 同上 |

### C 级：纯本地操作，可选确认（3 处）

| # | 页面路径 | 按钮 | 实际行为 |
| --- | --- | --- | --- |
| 15 | `/console/order-exceptions` | 扫描规则 | 本地规则扫描 DB 生成异常案件 |
| 16 | `/console/dashboard` | 同步订单异常统计 | 本地统计聚合 |
| 17 | `/console/sync-tasks` | 入队库存同步 | 后端拒绝（写未接通），直接 failed |

## 4. 组件设计

### 4.1 新建 `SyncConfirmDialog`

路径：`apps/shop/src/components/console/sync-confirm-dialog.tsx`

```tsx
export interface SyncConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** 一句话说明做什么 */
  description: string
  /** 明确范围：店铺名列表或"全部 N 家店铺"；单店铺直接给店铺名 */
  scope: {
    label: string          // 如"作用店铺"
    value: string          // 如"Daraz LK · 斯里兰卡站"或"全部 3 家店铺"
  }
  /** 影响条目（每条一行，最多 4 条） */
  impacts: string[]
  /** 平台调用说明；undefined 表示不调平台 */
  platformCall?: {
    label: string          // 如"将调用 Daraz OpenAPI"
    detail: string          // 如"/orders/get + /order/items/get"
  }
  confirmLabel?: string
  cancelLabel?: string
  /** 确认按钮 loading 态（跟随 mutation.isPending） */
  pending?: boolean
  /** 确认按钮 variant；默认 default，不可逆操作用 destructive */
  destructive?: boolean
  onConfirm: () => void
}
```

### 4.2 视觉规格

- 复用 `UedDialog` 的遮罩（`fixed inset-0 z-50 bg-background/75`）、圆角卡片、header / footer 布局
- header：标题 + description（同 `UedDialog`）
- body（无表单字段）：
  - `scope` 行：label 左对齐 + value 右对齐，分隔线
  - `impacts` 列表：`•` 前缀，每条一行，`text-sm`
  - `platformCall` 块（如有）：浅色背景框，label + detail
- footer：取消（outline）+ 确认（default 或 destructive），右侧对齐
- 不显示"带 * 为必填字段"提示（无表单）

### 4.3 范围文案规则

| 场景 | scope.value 写法 |
| --- | --- |
| 单店铺（详情页 / 指定 shopId） | `{平台} {站点} · {店铺名}`，如 `Daraz LK · 斯里兰卡站` |
| 全部店铺（未指定 shopId） | `全部 N 家店铺：{店铺1}、{店铺2}、{店铺3}`（N≤5 时全列）；`全部 N 家店铺（{店铺1}、{店铺2} 等 N 家）`（N>5 时列前 2 + 等） |
| 单批次 | `批次 {batchNo} · {N} 个包裹 · {店铺名}` |
| 单刊登 | `刊登 {externalItemId} · {店铺名}` |
| 单 sync task | `任务 {taskNo} · {type} · {店铺名或全部}` |

店铺名 / 数量由调用方在打开对话框前从已有 query 数据取（列表页已有 `shops` query 或行数据），不新增网络请求。

## 5. 各入口文案规格

### 5.1 `/console/orders` 人工增量同步

```
title: 人工增量同步订单
description: 从平台拉取增量订单写入控制台。
scope.label: 作用店铺
scope.value:
  - 单店铺：Daraz LK · 斯里兰卡站
  - 全部：全部 3 家店铺：Daraz LK、Lazada TH、TikTok MY
impacts:
  - 拉取窗口：上次同步时间 ~ 现在（首次回填近 7 天，每店铺最多 500 单）
  - 同步完成后，已支付订单会自动占库（映射确认后生效）
  - 订单数据可重复同步（幂等），不会重复下单
platformCall:
  label: 将调用平台 OpenAPI
  detail: Daraz/Lazada /orders/get + /order/items/get
confirmLabel: 开始同步
destructive: false
```

### 5.2 `/console/listings/[id]` 请求刊登读同步

```
title: 请求刊登读同步
description: 从平台拉取该刊登的最新头信息与状态。
scope.label: 作用刊登
scope.value: 刊登 {externalItemId} · {店铺名}
impacts:
  - 仅读取平台刊登头信息，不会推送任何修改到平台
  - 本地 publishState / 售价 / 上下架状态会按平台返回更新
platformCall:
  label: 将调用平台 OpenAPI
  detail: Lazop /products/get
confirmLabel: 开始同步
destructive: false
```

### 5.3 `/console/logistics-lgs` + `[id]` 提交交运

```
title: 提交 LGS 交运
description: 将批次内所有包裹提交到平台，标记为已发货。
scope.label: 作用批次
scope.value: 批次 {batchNo} · {N} 个包裹 · {店铺名}
impacts:
  - 提交后平台侧会标记这些订单为已发货，不可撤销
  - 成功包裹的 shipment 状态会推进为 shipped
  - 全部成功 → 批次状态 accepted；部分失败 → rejected（可修正后重提）
platformCall:
  label: 将调用平台 OpenAPI
  detail: Lazop /order/fulfill/pack + /order/package/rts
confirmLabel: 确认提交交运
destructive: true
```

### 5.4 `/console/sync-tasks` + `[id]` 重试

```
title: 重试同步任务
description: 重新执行该同步任务，按任务类型调用对应平台接口。
scope.label: 作用任务
scope.value: 任务 {taskNo} · {type} · {店铺名或全部}
impacts:
  - 会按任务类型（订单/刊登/物流/评论/结算）真实调用平台 OpenAPI
  - 结果会回写 sync_job_runs 与 integration_logs
  - 失败可在任务详情查看错误详情
platformCall:
  label: 将调用平台 OpenAPI
  detail: 按 task.type 路由（orders/listings/logistics/reviews/settlements）
confirmLabel: 确认重试
destructive: false
```

### 5.5 `/console/logistics-jsb` + `[id]` 提交交接

```
title: 提交 JSB 交接
description: 将批次标记为已交接给 JSB 物流。
scope.label: 作用批次
scope.value: 批次 {batchNo} · {N} 个包裹
impacts:
  - JSB 无可靠平台 API，仅更新本地批次状态为已交接
  - 实际物流节点需在批次详情手工补录
  - 提交后批次状态不可自动回退
platformCall: undefined  // 不显示平台调用块
confirmLabel: 确认提交交接
destructive: false
```

### 5.6 `/console/logistics-lgs` + `[id]` 关闭批次

```
title: 关闭批次
description: 关闭该批次，后续不可再追加包裹或提交交运。
scope.label: 作用批次
scope.value: 批次 {batchNo} · {N} 个包裹
impacts:
  - 批次状态变更为 closed，不可逆
  - 已关联的 shipment 不受影响
platformCall: undefined
confirmLabel: 确认关闭
destructive: true
```

### 5.7 `/console/shipments` + `[id]` 同步平台轨迹

```
title: 同步平台物流轨迹
description: 拉取该包裹的最新物流轨迹。
scope.label: 作用包裹
scope.value: 包裹 {externalPackageId} · {店铺名}
impacts:
  - 当前为 stub：仅写一条 fulfillment_attempts 记录，不调用平台
  - 真实轨迹同步需待 connector 联调
platformCall: undefined  // stub 阶段不显示
confirmLabel: 同步轨迹
destructive: false
```

### 5.8 C 级（可选确认）

`/console/order-exceptions` 扫描规则、`/console/dashboard` 异常统计：纯本地操作，**不加确认对话框**，保持点击即执行（避免过度打扰）。

`/console/sync-tasks` 入队库存同步：后端本就拒绝，**不加确认**，失败 notice 已足够说明。

## 6. 实现步骤

1. 新建 `apps/shop/src/components/console/sync-confirm-dialog.tsx`
2. 改造 A 级 6 处入口（orders / listings/[id] / logistics-lgs × 2 / sync-tasks × 2）
3. 改造 B 级 8 处入口（logistics-jsb × 2 提交 + 4 处关闭 + shipments × 2）
4. C 级 3 处不改
5. 验证：`pnpm --filter shop lint` + `typecheck`

## 7. 不在本次范围

- 不改后端 dataaccess / router 逻辑
- 不改 `UedDialog` 组件本身（新建独立组件复用其样式）
- 不引入 shadcn AlertDialog
- 不为 C 级纯本地操作加确认
- 不改 i18n 文案（保持中文硬编码，与现有 `UedDialog` 一致）

## 8. 验证

- `pnpm --filter shop lint` + `typecheck` 通过
- 浏览器验证（用户后续手动）：
  - `/console/orders` 点同步 → 弹对话框，显示店铺列表 / 全部 N 家
  - `/console/logistics-lgs/[id]` 点提交交运 → 弹 destructive 对话框，显示批次号 + 包裹数 + 不可逆提示
  - 取消按钮不触发 mutation，确认按钮触发并显示 loading
