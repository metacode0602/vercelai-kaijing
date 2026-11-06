# 模块15：Console 演示主路径清理（tRPC → DB）

> 状态：已在 `apps/shop` 落地。分支 `feat/shop-console-ops-cleanup`。
> 基线：`feat/shop-trpc-candidates-notifications`（PR #51 栈，含 #44–#51）；**不依赖 / 不合并** 售后 #43。

## 范围

| 已接 PostgreSQL / 真实配置 | 仍 stub / 待平台 OpenAPI |
| --- | --- |
| `/console/reviews` → `product_reviews` + `product_review_media`（列表/详情/回复状态） | 平台卖家回复 API（仅 `stub_queued`，禁止假成功） |
| `/console/carriers` → `commerce_carriers`；运费页继续 `fee_templates` + `ocean_shipments` | 承运商实时报价 API |
| `/console/(ops)/categories` → `commerce_categories` | `platform_categories` 平台类目树同步 |
| `/console/dictionaries` → `commerce_dictionaries` | — |
| `/console/settings/import-templates` → `commerce_import_templates` | 导入批处理作业 / 回滚流水 |
| `/console/settings/audit` → `audit_events` | — |
| `/console/settings/members` → better-auth `member` + `invitation` | 真实邀请邮件发送 |
| `/console/settings/shops` + credentials → `shops` / `integration_*` | OAuth / connector 真实授权 |
| Dashboard 分类库存 / 周转 → `inventory_balances` + `inventory_movements`（空→空态） | 在途按柜次补齐（可选） |
| `/console/reports` 平台销售占比 ← `dashboard.platformMix` | 完整报表口径（汇率/费用分摊） |
| `/console/settings/erp-access` 去掉 DEMO 角色行 | 细粒度 RBAC / 店铺 scope |
| `/console/settings/imports` 去掉 DEMO 批次 | 导入流水表 |

## 架构

```
reviews.*          → product_reviews / product_review_media
carriers.*         → commerce_carriers
categories.*       → commerce_categories
dictionaries.*     → commerce_dictionaries
importTemplates.*  → commerce_import_templates
audit.list         → audit_events
members.*          → member / invitation / users
shops.*            → shops / integration_credentials / integration_states
dashboard.inventoryByCategory → balances × products.categoryHint + movements
finance.listFreight → fee_templates + ocean（模块13已有）
```

## 约定

- **禁止**假 OAuth 成功、假平台回复成功、假承运商报价、假导入成功
- 店铺「排队重授权」仅标记待授权 / connecting，并写明「待平台授权」
- 评论「排队平台回复」→ `reply_status=stub_queued`，文案标明未发往平台
- 无数据页面显示空态 + 真实下一步，不塞演示行充 KPI

## 迁移与种子

迁移：`packages/db/drizzle/0019_commerce_console_ops.sql`

```bash
pnpm --filter @workspace/db db:migrate
pnpm --filter @workspace/db db:seed:commerce-products
pnpm --filter @workspace/db db:seed:commerce-console-ops
pnpm --filter @workspace/db typecheck
pnpm --filter shop typecheck
```

## 仍依赖真实 OpenAPI / 外部通道的清单

1. Daraz / Lazada / TikTok / Shopee **OAuth 授权与 token 刷新**
2. 平台 **评论抓取 / 卖家回复**（Review OpenAPI）
3. 平台 **类目 / 品牌** 同步（`platform_categories` / `platform_brands`）
4. 承运商 / 物流商 **实时运费报价**
5. 平台 **结算账单 / 财务对账** 拉取
6. 平台 **刊登推送 / 库存同步 / 订单拉取**（既有 sync 任务骨架，connector 未全联调）
7. 组织成员 **邀请邮件** / 外部通知（飞书/短信）
8. 导入批次 **作业执行与回滚**
9. 细粒度 **ERP RBAC + 店铺 scope** 策略服务

## 本 PR 后仍可能残留 demo 的 page（及原因）

| 页面 | 原因 |
| --- | --- |
| `/console/products`、`/console/inventory`、`/console/pending`、成本/财务部分旧 detail | 仍直接读 `mock-data` 列表；主档已有 `products`/`wms` tRPC，列表页迁移未纳入本模块优先清单 |
| `/console/products/[sku]` 供应商子表 | 仍可能引用 `ERP_DEMO_SUPPLIERS` 片段；供应商主路径在 module12，SKU 详情边车未清 |
| `/console/carton-specs` | 箱规本身仍可能是 createDemoStore；本模块只把字典选项改为 tRPC |
| `/console/reports/sell-through` 等专题报表子页 | 专题算法/口径未冻结，保持示意或空壳说明 |
| 各类 `*-store.ts` 文件本身 | 客户端 store 文件仍在仓库，供未迁移页或相关组件引用；主路径页已不再 import |

