# commerce-schema.ts 清理决策矩阵

> 对照 `haoshiyun-erp-database-schema.md`，对 `packages/db/src/commerce-schema.ts` 旧表做 KEEP / MERGE / DROP / ADD。
> 目标：去掉死表与重复语义，向设计对齐列；**不**一次落地 ~75 张生产表，**不**要求破坏性生产迁移。
> 控制台仍仅用 localStorage 原型（**调查时点 2026-10-31 口径**；2026-11-08 复核：控制台主路径已接 tRPC，`mock-data.ts` 已删）。本文件不接入 tRPC / DB。

调查结论（2026-10-31）：除 `shops` + `integrationCredentials` 被 OAuth 持久化引用外，其余 commerce 表在应用代码中**未被读写**，删除/改列对运行时安全；类型导出经 `packages/db/src/schema.ts` 再导出。

## 汇总

| 动作 | 数量 | 说明 |
| --- | ---: | --- |
| KEEP（原样或轻改） | 12 | 仍被设计或连接器需要 |
| MERGE（加列 / 改维 / 收窄） | 6 | shops、products、variants、listings、inventory_balances、settlements(+lines)、external_id_mappings |
| DROP | 1 | `cost_components` |
| ADD（精简占位） | 4 | `seller_sku_mappings`、`mapping_exceptions`、`sku_costs`、`audit_events` |

旧文件约 19 张表定义 → 清理后约 22 张（净增设计缺口表，去掉 1 张死表）。

## 决策矩阵

| 表 | 决策 | 理由 |
| --- | --- | --- |
| `shops` | **KEEP + MERGE** | OAuth 在用。合并 `seller_id` / `shop_group` / `fulfillment_mode`。`external_shop_id` = 平台店铺 ID；`seller_id` = 卖家侧标识，二者勿混。 |
| `integration_credentials` | **KEEP** | OAuth 凭证持久化。 |
| `integration_states` | **KEEP** | 同步游标与健康。 |
| `integration_logs` | **KEEP** | 接口审计投影。 |
| `products` | **KEEP + MERGE** | 对齐 SPU：`spu_code`、`material`、`style`、`owner_user_id`；保留 SPU 级默认尺寸。 |
| `product_variants` | **KEEP + MERGE** | 对齐内部 SKU：`sku_code`、`status`、`weight_grams`、`length_mm`/`width_mm`/`height_mm`；旧 `sku` 作兼容别名。 |
| `listings` | **KEEP + MERGE** | 加 `listing_title`、`primary_variant_id`、`marketplace_id`；变体明细下沉映射表，`variant_id` 标兼容。 |
| `external_id_mappings` | **KEEP + 收窄** | 仅非 SKU 实体。去掉 `(shop, entity, internal)` 唯一索引 → 普通索引（允许 1:N）。SKU 映射迁 `seller_sku_mappings`。 |
| `seller_sku_mappings` | **ADD** | 设计 F07 权威路径。含独立 `platform_sku_id`（与 itemId / sellerSku / internalSku 并列）。 |
| `mapping_exceptions` | **ADD** | 映射异常队列精简占位（控制台已有原型 store）。 |
| `orders` | **KEEP** | 订单主档；履约状态列已够 MVP。 |
| `order_lines` | **KEEP + MERGE** | 加 `seller_sku`、`platform_sku_id` 便于未映射行落库。 |
| `inventory_balances` | **KEEP + MERGE** | 从「店铺+SKU」迁向「仓+库位+SKU」：`warehouse_code`/`bin_code`、`qc_hold`/`damaged`/`in_transit`/`pending_inbound`/`version`；`shop_id` 可空（共享池）。可用量公式不落库，由应用投影。 |
| `stock_alerts` | **KEEP + MERGE** | `shop_id` 可空；加 `warehouse_code`。 |
| `cost_components` | **DROP** | 未被引用；语义被设计 `sku_costs` / 结算费用行替代。 |
| `sku_costs` | **ADD** | 替代 cost_components；`kind` 含 platform/logistics/ads/jsb/refund/fx 等占位。 |
| `settlements` | **KEEP + MERGE** | 加 `bill_amount`、`status`。 |
| `settlement_lines` | **KEEP + MERGE** | 加 `fee_kind` 费用拆分。 |
| `pending_actions` | **KEEP** | 人审 / 幂等动作队列，连接器仍需要。 |
| `product_candidates` | **KEEP** | 选品候选缓存。 |
| `platform_brands` | **KEEP** | 平台品牌缓存。 |
| `platform_categories` | **KEEP** | 平台类目缓存。 |
| `audit_events` | **ADD** | 设计有审计事件；精简占位供控制台审计列表对齐。 |

## 明确推迟（不在本 PR）

- 完整 WMS：`warehouses`、`bins`、`inventory_ledger`、`stock_outbounds`、拣货/出库单等（2026-11-08：控制台 WMS 已接 tRPC；调查时点为 localStorage 原型）。
- 采购域全表、JSB 交接正式表、财务利润快照表、字典/序列表等 ~75 表余量。
- Drizzle 生产 migration SQL（无破坏性要求；类型 + 文档足够；若 monorepo 强制 migration，另开最小空迁移）。
- 控制台接入 tRPC / 真实 DB（明确禁止）。

## 兼容说明

- `product_variants.sku` 与 `sku_code` 迁移期双写同值。
- `listings.variant_id` 保留至映射表写满后再弃用。
- `inventory_balances` 唯一键改为 `(org, warehouse, bin, variant)`；旧 `(shop, variant)` 唯一废弃。
- 删除的 TypeScript 符号：`costComponents`、`CostComponentKind`、`costComponentKinds` → 改用 `skuCosts` / `SkuCostKind` / `skuCostKinds`。

## Daraz LK P0 增量（2026-10-31）

| 表 / 列 | 决策 | 说明 |
| --- | --- | --- |
| `inventory_balances.customs_clearing` | **MERGE** | 清关中桶；不计入 available |
| `fx_rates` | **ADD（精简）** | platform + ccy + effective_date + source |
| `ocean_shipments` / `ocean_shipment_lines` | **ADD（精简）** | 海运柜次头/行 |
| `sku_costs` | **MERGE** | `container_lot_id` / `version_no` / `tax_breakdown` / `calculator_snapshot` |

仍不落地完整 75 表；无破坏性 migration；控制台 localStorage（调查时点口径；**2026-11-08**：控制台已接 tRPC，`mock-data.ts` 已删）。
