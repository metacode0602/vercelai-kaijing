# @workspace/billing — 共享计费服务

把**资金与计费规则只实现一份**：充值、余额、支付网关、商户资金模型（预付 / 佣金）、定价与算力券。`apps/web`、`apps/merchant`、`apps/api` 共同调用，避免三个入口各算各的。

## 定位

| 项 | 说明 |
| --- | --- |
| 作用 | 平台的计费与资金内核（纯逻辑 + 数据访问），不承载 UI |
| 消费方 | `apps/web`（运营/推送）、`apps/merchant`（商户展示与充值）、`apps/api`（对外扣费） |
| 依赖 | `@workspace/db`（表定义） |
| 边界 | 只做资金正确性相关逻辑，不含页面与路由 |

## 主要模块

| 模块 | 说明 |
| --- | --- |
| `recharge` / `payment-order` / `order-number` | 充值流程、支付单与单号生成 |
| `payment-gateway` | 支付网关适配（微信 / 支付宝等渠道配置与调用） |
| `balance` | 余额查询与变更 |
| `merchant-account` / `merchant-account-math` | 商户资金账户（`merchant_account`）与逐池（`merchant_account_pool_balance`）金额运算 |
| `merchant-consume` | 消费扣减，**幂等 `requestId`**，资金正确性核心 |
| `merchant-prepay` / `merchant-transfer-proof` | 预付充值、对公转账到账凭证与核销 |
| `merchant-voucher` | 算力券：采购、发放、核销、过期回收 |
| `merchant-price-resolver` / `merchant-price-rules` / `pricing-resolver` | 定价解析与规则匹配（含平台进货价） |
| `ensure-tenant` | 租户存在性保障（首次消费自动建租户） |
| `money` / `types` | 金额精度工具与共享类型 |

资金口径以 `docs/design/merchant-open-items-design.md`「最终资金口径」为准：按 `merchant.funding_mode` 分流 `prepay`（收入 − 进货成本 − 券成本）与 `commission`（收入 × 分成 − 券消费），两条公式互不混用。

## 运行

本包没有可运行的服务，作为依赖被应用引用：

```bash
pnpm --filter @workspace/billing run test     # 单元测试（含资金幂等/并发用例）
pnpm --filter @workspace/billing run lint
pnpm --filter @workspace/billing run typecheck

# 支付链路诊断脚本
pnpm --filter @workspace/billing run diagnose:payment
```

## 部署

**不独立部署**，随宿主应用构建发布。改动本包会同时影响 `apps/web`、`apps/merchant`、`apps/api`，发布前应同时回归三端的充值与扣费链路。

## 脚本

| 脚本 | 说明 |
| --- | --- |
| `pnpm test` | `node:test` 单元测试 |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript |
| `pnpm diagnose:payment` | 支付问题诊断 |

## 相关文档

- 模块协作关系：[根 README](../../README.md#模块协作关系)
- 资金与设计决策：`docs/design/merchant-open-items-design.md`
- 数据模型：[packages/db](../db/README.md)
