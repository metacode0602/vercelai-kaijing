# CRM 裸金属订单合并：`commerce_order` → `bare_metal_order`

**版本**：v1.0（2026-06-23）  
**状态**：**已实施**

## 1. 背景

历史上裸金属平台订单存在 **双写**：

| 表 | 写入路径 | 问题 |
|----|----------|------|
| `commerce_order` + `commerce_order_item` | 租户账单导入 / 账单定时同步 | 宽表 + GPU 摘要行，无设备明细 |
| `bare_metal_order` + `bare_metal_order_device` | 裸金属 Cron / 账单导入（合并后） | 供应链/财务/探测真源 |

同一 `POST /admin/metal_order/list` 响应被两条链路分别落库，造成重复与口径不一致。

## 2. 合并决策

**唯一真源**：`bare_metal_order` + `bare_metal_order_device`（供应域 `supply-schema.ts`）

**废弃并删除**：

- `commerce_order`
- `commerce_order_item`
- `bare_metal_order.commerce_order_id`（兼容 FK 列）

## 3. 写入路径（合并后）

| 场景 | 实现 |
|------|------|
| 裸金属 Cron | `upsertPlatformBareMetalOrder`（不变） |
| 租户账单导入 / 账单定时同步 | `tenant-billing-import.ts` → 同上，**不再**写 `commerce_order` |
| 线下 Excel | `bare_metal_order` + `bare_metal_order_device`（不变） |

共享 upsert 逻辑：`apps/web/src/lib/server/dataaccess/supplier/bare-metal-order-sync.ts`

## 4. 读取路径（合并后）

| UI / API | 读表 |
|----------|------|
| 租户详情 · 裸金属订单 | `bare_metal_order` + `bare_metal_order_device` |
| 项目详情 · 订单列表 | `bare_metal_order`（`project_id` 过滤） |
| 客户合并 | `bare_metal_order.customer_id` |

列表映射：`apps/web/src/lib/server/dataaccess/crm/bare-metal-order-list.ts`

## 5. 数据库迁移

`packages/db/drizzle/0013_drop_commerce_order.sql`：

```sql
ALTER TABLE bare_metal_order DROP COLUMN commerce_order_id;
DROP TABLE commerce_order_item;
DROP TABLE commerce_order;
```

## 6. 预留资源包

原 `commerce_order.product_line = reserved_resource_pack` **无对应新表**；`listReservedPackOrders` 暂返回空列表，待平台 API 与表结构单独设计。

## 7. 与财务账期

账期计算 **从不**读取 `commerce_order`；裸金属收入/成本来自 `billing_period_raw_baremetal_order` 或读库导入（`bare_metal_order` → Raw）。合并不影响财务 pipeline。

## 8. 关联文档

- [bare-metal-order-schema-design.md](bare-metal-order-schema-design.md)
- [tenant-billing-import-design.md](tenant-billing-import-design.md)
- [crm-database.md](crm-database.md)
