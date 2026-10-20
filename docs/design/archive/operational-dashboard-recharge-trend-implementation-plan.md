# 运营大盘 — 充值趋势图实现方案

> **已废止（2026-10-06）**：大盘报表（`/dashboard`、`/dashboard/global`）及其后端、DB 表已整体下线。本文仅作历史归档，**不再描述现网能力**。裁决见 [矛盾台账](../audit/doc-contradictions.md) §5。


**页面**：`/dashboard` — `RechargeTrendChart`  
**父文档**：[operational-dashboard-implementation-plan.md](operational-dashboard-implementation-plan.md)  
**版本**：v1.0（2026-06-23）

---

## 1. 现状

- 三线折线：充值总额、余额充值、算力券充值。
- 客群 Toggle：`all` | `new` | `old`（与消费趋势相同文案）。
- 数据：`fetchDailyRecharge` → `DailyRecharge`（`totalRecharge`, `balanceRecharge`, `voucherRecharge`）。

---

## 2. 目标

按日展示全平台充值趋势；支持新客/老客筛选；与 KPI「充值」卡区间合计一致。

---

## 3. 口径与数据缺口

### 3.1 余额充值（可落地）

| 字段 | 规则 |
|------|------|
| `balanceRecharge` | `recharge` 表 `SUM(amount - refund_amount)` 按日 |
| 状态 | `status = 'paid'` |
| 时间 | `coalesce(completed_at, created_at)` 东八区自然日 |
| 客群 | 经 `recharge.project_id` 或租户→项目→标签（同月报 §1.3） |

### 3.2 算力券充值（待产品确认）

当前 `recharge` 表仅有现金充值字段，**无算力券类型列**。Mock 的 `voucherRecharge` **无直接真源**。

可选实现路径（需业务择一）：

| 方案 | 数据源 | 说明 |
|------|--------|------|
| **A** | `coupon` 发放 | `type` 为算力券类、`issued_at` 按日 `SUM(value)` | 发放≠充值，可能与业务「算力券充值」语义不符 |
| **B** | 平台同步字段 | 若计费同步有券账户入账事件表 | 需新建同步表 |
| **C** | UI 降级 | 仅展示「充值总额」单线，隐藏券拆分 | 与 Mock 不一致，需产品签字 |

**建议**：首期 **方案 C 或 A** 并在图例标注口径；`totalRecharge = balanceRecharge`，`voucherRecharge = 0` 直至字段确认。

### 3.3 充值总额

- 若采用拆分：`totalRecharge = balanceRecharge + voucherRecharge`。
- 若不拆分：`totalRecharge = balanceRecharge`。

---

## 4. SQL 示意（余额充值）

```sql
SELECT
  (coalesce(r.completed_at, r.created_at) AT TIME ZONE 'Asia/Shanghai')::date AS date,
  SUM(r.amount - r.refund_amount) AS balance_recharge
FROM recharge r
JOIN billing_tenant t ON t.id = r.tenant_id
WHERE r.status = 'paid'
  AND coalesce(r.completed_at, r.created_at) >= :startUtc
  AND coalesce(r.completed_at, r.created_at) < :endExclusiveUtc
  AND NOT internal_tenant_excluded(...)
  -- segment: JOIN project + tags
GROUP BY 1
ORDER BY 1;
```

---

## 5. API

```typescript
type DailyRechargeRow = {
  date: string
  label: string
  totalRecharge: number
  balanceRecharge: number
  voucherRecharge: number
}

type RechargeTrendResponse = {
  rows: DailyRechargeRow[]
  voucherRechargeAvailable: boolean // false 时 UI 隐藏券线
  dataTier: 'preview' // 充值无 published 分层
}
```

Procedure：`dashboard.ops.rechargeTrend`。

---

## 6. 前端改造

- `voucherRechargeAvailable === false`：隐藏算力券线与 Legend 项，副标题去掉「算力券充值」。
- 客群切换逻辑同消费趋势。
- 补零日历与 Tooltip 日期格式同消费趋势。

---

## 7. 验收

| # | 场景 | 期望 |
|---|------|------|
| D1 | all + 区间 | 日合计 = KPI 充值卡 |
| D2 | new/old | 过滤正确，子集 ≤ all |
| D3 | 无充值日 | 折线为 0 |
| D4 | 券拆分 | 若未实现，UI 无券线且无误导文案 |

---

## 8. 非目标

- 不统计 `pending` / `failed` 充值。
- 不做支付方式拆分（银行/支付宝等）。
