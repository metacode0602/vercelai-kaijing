# 跨境运营域：数据库设计（Drizzle / PostgreSQL）

**归属：** `packages/db`  
**原则：** 复用 `auth-schema` 的 `organization` / `member` / `session.activeOrganizationId`；业务表强制 `organization_id`；外部平台 ID 只进映射表。

---

## 1. 文件规划

```
packages/db/src/
  auth-schema.ts          # 已有，保留
  feishu-schema.ts        # 已有，MVP 不依赖
  commerce-schema.ts      # 新增：跨境运营域
  schema.ts               # 聚合导出
```

迁移：`packages/db/drizzle/0005_crossborder_commerce.sql`（编号以 journal 实际为准）。

---

## 2. 枚举

```ts
platform: 'daraz' | 'lazada' | 'shopee' | 'tiktok_shop'
shop_status: 'draft' | 'connecting' | 'active' | 'error' | 'disabled'
sync_status: 'idle' | 'running' | 'success' | 'error'
listing_status: 'draft' | 'pending_review' | 'submitted' | 'live' | 'failed' | 'archived'
order_status: 'created' | 'paid' | 'ready_to_ship' | 'shipped' | 'delivered' | 'cancelled' | 'unknown'
pending_action_status: 'pending' | 'confirmed' | 'executing' | 'failed' | 'cancelled' | 'expired'
pending_action_kind: 'sourcing_upsert' | 'listing_submit' | 'price_change' | 'inventory_push' | 'settlement_post'
entity_type: 'product' | 'variant' | 'listing' | 'order' | 'shop'
```

MVP 运行时只启用 `daraz`。

---

## 3. 表设计

### 3.1 shops（店铺）

| 列 | 类型 | 说明 |
|----|------|------|
| id | text pk | cuid |
| organization_id | text not null | → organization |
| platform | varchar | 见枚举 |
| name | text | 展示名 |
| external_shop_id | text | 平台侧店铺 id（可空至连接成功） |
| status | varchar | shop_status |
| region | varchar | 如 `pk` / `bd` |
| currency | varchar(3) | 默认店铺币种 |
| created_at / updated_at | timestamptz | |
| deleted_at | timestamptz | 软删 |

唯一：`(organization_id, platform, external_shop_id)` where external not null。

### 3.2 integration_credentials

| 列 | 说明 |
|----|------|
| id | pk |
| organization_id | |
| shop_id | → shops |
| kind | oauth / api_key / … |
| payload_encrypted | text/bytea | 密文 |
| expires_at | |
| created_at / updated_at | |

### 3.3 integration_states

| 列 | 说明 |
|----|------|
| id | pk |
| shop_id | unique |
| orders_cursor | text |
| inventory_cursor | text |
| last_orders_sync_at | |
| last_inventory_sync_at | |
| health | sync_status |
| last_error | text |

### 3.4 integration_logs

审计：shop_id、direction(in/out)、action、request_id、status、message、payload_summary、created_at。索引 `(shop_id, created_at desc)`。

### 3.5 products / product_variants

本地主数据（非平台交易源）。

**products：** id, organization_id, title, description, status, source(`manual`|`sourcing`|`import`), created_at, updated_at, deleted_at  

**product_variants：** id, organization_id, product_id, sku, barcode, attrs jsonb, created_at, updated_at  

### 3.6 listings

| 列 | 说明 |
|----|------|
| id | |
| organization_id | |
| shop_id | |
| product_id / variant_id | |
| status | listing_status |
| title / description | 刊登文案 |
| category_external_id | 平台类目 |
| attributes | jsonb |
| price_amount / price_currency | |
| last_error | |
| submitted_at / live_at | |

### 3.7 external_id_mappings

| 列 | 说明 |
|----|------|
| id | |
| organization_id | |
| shop_id | |
| entity_type | |
| internal_id | |
| external_id | |
| sync_status | |
| last_synced_at | |
| meta | jsonb |

唯一：`(shop_id, entity_type, external_id)`；`(shop_id, entity_type, internal_id)`。

### 3.8 orders / order_lines

平台订单镜像。

**orders：** id, organization_id, shop_id, external_order_id, status, buyer_name_mask, placed_at, paid_at, currency, total_amount, shipping_amount, raw jsonb, created_at, updated_at  

**order_lines：** id, order_id, organization_id, external_line_id, sku, title, qty, unit_price, variant_id null  

唯一：`(shop_id, external_order_id)`。

### 3.9 inventory_balances / stock_alerts

**inventory_balances：** organization_id, shop_id, variant_id, on_hand, reserved, updated_at；唯一 `(shop_id, variant_id)`  

**stock_alerts：** organization_id, shop_id, variant_id, threshold, triggered_at, status(`open`|`acked`)

### 3.10 cost_components

SKU 落地成本组件：organization_id, variant_id, component(`purchase`|`freight`|`duty`|`other`), amount, currency, note, effective_from。

### 3.11 settlements / settlement_lines

平台结算导入：settlements(shop_id, external_settlement_id, period_start/end, currency, raw)；lines 分摊到 order/variant。

### 3.12 pending_actions（B 级核心）

| 列 | 说明 |
|----|------|
| id | |
| organization_id | |
| shop_id | nullable |
| kind | pending_action_kind |
| status | pending_action_status |
| title | |
| payload | jsonb | 拟写入数据 |
| field_diff | jsonb | 可选 |
| idempotency_key | text | 唯一 per org |
| created_by | user id / `mcp:` / `system` |
| expires_at | |
| confirmed_by / confirmed_at | |
| executed_at / error | |
| created_at / updated_at | |

### 3.13 product_candidates（选品）

OpenWork 写入的候选：organization_id, title, url, category_hint, score, rationale jsonb, status(`new`|`accepted`|`rejected`), pending_action_id null, created_at。

---

## 4. 查询约定

1. 所有租户业务查询：`WHERE organization_id = ?`，且服务端校验 membership。  
2. 列表：`count` + `limit/offset`（遵守 AGENTS.md）。  
3. 不在表间乱加跨模块强 FK（除 shop→org、variant→product 等聚合内）。  

---

## 5. Drizzle 草图（commerce-schema.ts 片段）

```ts
import { pgTable, text, timestamp, varchar, integer, jsonb, numeric, uniqueIndex, index } from "drizzle-orm/pg-core"
import { createId } from "@paralleldrive/cuid2"
import { organization } from "./auth-schema"

export const shops = pgTable(
  "shops",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    organizationId: text("organization_id").notNull().references(() => organization.id),
    platform: varchar("platform", { length: 32 }).notNull(),
    name: text("name").notNull(),
    externalShopId: text("external_shop_id"),
    status: varchar("status", { length: 32 }).notNull().default("draft"),
    region: varchar("region", { length: 16 }),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("shops_org_idx").on(t.organizationId),
    uniqueIndex("shops_org_platform_ext_uidx").on(t.organizationId, t.platform, t.externalShopId),
  ]
)

// pending_actions / products / orders … 同目录实现
```

完整实现在 P0 PR 的 `packages/db/src/commerce-schema.ts`。

---

## 6. Seed（Demo）

- 1 个 platform org + 1 个 tenant org  
- 1 个 Daraz shop（status=active）  
- 若干 product_candidates、pending_actions、orders、inventory、alerts  

供 Demo 页 mock 同源或直接读库（P0 Demo 页先用前端 mock，与 seed 字段对齐）。
