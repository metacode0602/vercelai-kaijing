# 跨境 ERP Console UED 实施计划（Phase 1+）

> 依据：`docs/design/haoshiyun-erp-database-schema.md`  
> 原则：侧栏 IA **尽量不动**；列表 / 详情 / 编辑可自由重做；本地 store 可先于 DB；体验按生产级运营台而非 Demo。  
> 日期：2026-10-29（Asia/Shanghai）

## 1. 信息架构（IA）

- **保持**现有左侧菜单分组与路由前缀（`/console/*`），不改 nav 结构。
- 主数据运营路径：`master-products` → `master-skus` → `supplier-skus` → `mappings` → `listings`。
- 采购路径：`purchase-requests` → `purchase-approvals` → `purchase-orders` → `purchase-receipts`。
- WMS 路径：`warehouse` / `warehouse-zones` → `inventory-balances` → `inventory-ledger` → `stock-inbounds` / `stock-outbounds` / `stock-adjustments`。
- 同步面：`sync-tasks`、settings 下 `integration-log` / 店铺连接；订单 / 评论 / 退货由平台 API 回写后只读为主、异常可处理。

## 2. 主数据（本 Phase 重点）

| 对象 | Schema | 列表 UED | 创建 / 编辑 | 详情关联自动带出 |
| --- | --- | --- | --- | --- |
| SPU `products` | §2.1 | KPI（启用/待确认/SKU 数）+ 筛选 + 封面表 | 先建主档（名称/品牌/品类/负责人），编码 `HSYxxxxxx` 只读 | SKU 行表、供应商货号、刊登/映射、图片 |
| 内部 SKU `product_variants` | §2.2 | KPI + 筛选 + 封面 | 归属 SPU 后生成 `SPU+三位`；规格字典选值 | 父 SPU、库存、供应源、映射、成本 |
| 供应商货号 `supplier_skus` | §2.5 | KPI（首选/启用） | SKU×供应商唯一；价/MOQ/交期 | 供应商主档、SKU、在途采购 |
| Seller 映射 `seller_sku_mappings` | §3.2 | KPI（启用/待确认/异常） | 店铺+Seller SKU 唯一 → 内部 SKU | 店铺、Listing、内部 SKU、异常队列 |
| 刊登 `listings` | §3.1 | KPI + 多维筛选 + 封面 | 主刊登信息；变体下沉映射行 | 映射行、评论、库存、价格 |

**头行分离**：与 schema 一致——SPU 主信息 + `variants` 行；Listing 主信息 + 映射行；采购申请/单已有两步范式可复用。

## 3. 刊登 / 映射

- 映射是订单占库前的权威路径；异常（未映射/冲突/停用 SKU）进 `mapping_exceptions`，禁止自动占库。
- Listing 详情展示平台态 / 内部态分离，并挂 Seller SKU 映射子表与评论入口。
- 同步任务面只展示结果与重试入口，不在本 Phase 接真实 connector 写回。

## 4. 采购 → 入库（P2）

- 已有：采购申请两步、审批转 PO、采购单头行。
- P2：`purchase_receipts` 分批到货 → 质检行 → 自动生成 `stock_inbounds`（待上架）→ 确认上架写 `inventory_ledger`（幂等）；回写 PO `qty_received` / `qty_qc_passed` / `qty_stocked` 并推进「部分到货 / 已收货」。
- 关联：收货/入库详情自动带出 SKU、供应商、仓库、来源采购单快照。

## 5. WMS（后续 Phase）

- 仓库 / 库位 / 余额 / 流水 / 调整单：列表 KPI + 详情关联 SKU / 来源单；一库位一启用 SKU 约束在 UI 明示。

## 6. 同步面（后续 Phase）

- `sync-tasks`、integration log、店铺授权：任务状态、错误摘要、人工重试；商品/订单/评论/退货只读详情链回主数据。

## 7. 图片上传

- 复用 / 扩展 `product-images.tsx` + `product-image-store`（本地预览；接入后走 `@workspace/storage`）。
- 必挂：SPU 详情、SKU 详情、Listing 详情；列表用封面缩略图。

## 8. 关联信息规则

- **父链可点**：SKU → SPU；映射 → SKU / Listing / 店铺；供应货号 → SKU / 供应商。
- **子项分表**：SPU 下 SKU；Listing 下映射；单据下明细行。
- **决策辅助**：库存可用量、首选供应价、映射状态、刊登在线态自动带出，避免运营二次查找。

## 9. 分阶段 PR

| Phase | 内容 | 状态 |
| --- | --- | --- |
| P1 | 计划文档；主数据 UED 加强（SPU/SKU/供应商货号/映射/刊登）：KPI 列表、头行创建、详情关联与图片 | 已合入 develop |
| **P2（本 PR）** | 采购申请→审批→采购单→到货质检→入库上架全链路 UED；PO 投影回写；关联 SKU/供应商/仓库自动带出 | 进行中 |
| P3 | WMS 余额/流水/调整/库位绑定 UED | 待开 |
| P4 | 同步任务 / 异常队列 / 评论退货只读面 | 待开 |
| P5 | 接 tRPC + DB（替换 localStorage），保留同一 UED | 待开 |

## 10. 验收（P1）

- 侧栏未改结构。
- SPU 可先建主信息，再在详情加 SKU 行；图片可上传预览。
- 映射 / 供应商货号 / SKU / 刊登详情能自动带出决策相关链接与子表。
- `pnpm --filter shop typecheck` 通过；PR → `develop`，不合并。

## 11. 验收（P2）

- 侧栏未改结构。
- 可从可收货采购单「登记到货」创建收货批次；草稿→待质检→质检完成生成待上架入库单；确认上架后 PO 投影与状态正确。
- 到货质检 / 入库单列表具备 KPI、筛选、空态与校验提示；详情关联自动带出。
- `pnpm --filter shop typecheck` 通过；PR → `develop`，不合并。

