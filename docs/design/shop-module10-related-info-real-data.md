# 模块10：详情 related-info 去演示样本，接真实关联行

> 状态：落地于 `feat/shop-related-info-real-data`（基于 `feat/shop-wms-zones-typecheck` / PR#46，**不含** #43 售后）。
> Org：`org_shop_dev_demo`。无新 migration。

## 1. 问题

列表页已陆续接 tRPC / Postgres，但详情「关联信息」主路径仍通过 `buildUedRelatedInfo` **同步 bulk import** `ERP_DEMO_*` / `RELATED_DEMO_*` / `DEMO_*`，把看起来像真实订单/库存的演示行塞进子表。

## 2. 做法

| 层 | 变更 |
| --- | --- |
| `apps/shop/src/lib/console/related-info.ts` | 去掉全部 demo 数组 import；`buildUedRelatedInfo(module, row, data?)` 只根据行字段拼 parents，子表只吃 `RelatedDataBag` 真实行；无袋时已接库域 →「暂无关联数据」，未接库域 →「待接入」 |
| `UedRecordDetail` | 删除 `buildRelated`（ERP_DEMO 扫描）回退；不再用假关联组 |
| WMS 详情 | `inventory-balances` / `inventory-ledger` / `stock-adjustments` / `warehouse` 从 `wms-store` 改为 `trpc.wms.*`，关联行来自 listBalances / listMovements / listOutbounds / listAdjustments / listBins |
| 商品 | `master-skus` 传入余额+流水；`master-products` 去掉假刊登/采购子表（SKU 表已在页内） |
| 库区 | `warehouse-zones` 传入真实 bins + 区余额 |

**刻意不做（本 PR 边界，2026-11-08 备注）：** 不合并 #43；不把 aftersale `reverse_*` 写进本 PR。后续 listings/sync/finance 等已接库（模块11/13），详情关联不再显示假 ERP 行。

## 3. 已清掉的 demo 主路径

- `related-info.ts` ← `ERP_DEMO_PRODUCTS/MAPPINGS/INVENTORY/BINS/PURCHASES/AFTERSALES`、`RELATED_DEMO_*`、`DEMO_PURCHASE_ORDERS/RECEIPTS/STOCK_INBOUNDS`、`DEMO_SUPPLIER_SKUS`、`DEMO_FREIGHT_*`、`getDemoListings*`、`getDemoSkuPricing`
- `erp-ued-detail.tsx` ← `buildRelated`（ERP_DEMO 扫描已随 demo 清理移除）
- WMS 四详情 ← `trpc.wms.*`（`wms-store` 主路径已停用，仅余类型/常量）

## 4. 仍保留的非 ERP Demo（本 PR 不收）

| 域 | 说明 |
| --- | --- |
| `erp-ued-data.ts` | 文件仍在（UED 示例常量）；`related-ops-data.ts` **零引用，待删**（2026-11-08）；**不再**被 related-info 主链路 import |
| reviews / reports等少数页 | 详情关联显示「待接入」或「暂无关联数据」；listings/sync/finance 等列表已接 tRPC |
| 图片编辑器会话缓存 | master 商品图仍本机缓存 |
| aftersale 详情 `toRelated*` | 3 个详情页仍 import `aftersale-store` 兼容壳（进行中，见 cost-finance §9.1） |

## 5. 验证

```bash
pnpm --filter @workspace/db typecheck
pnpm --filter shop typecheck
```

## 6. 侧栏 / 文案

Console 中文；左侧菜单不动。
