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

迁移：`0005_crossborder_commerce.sql` → `0006_commerce_lean_payload.sql` → `0007_commerce_platform_enrichment.sql`（编号以 journal 实际为准）。

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
| timezone | varchar(64) | IANA，如 Asia/Colombo |
| seller_name | text | 平台侧卖家名 |
| marketplace_country | varchar(16) | 站点/国家码 lk/my/… |
| auth_expires_at | timestamptz | token 过期（列表用） |
| last_sync_at | timestamptz | 最近成功同步 |
| meta | jsonb | 平台扩展（cipher 提示等） |
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

**products：** id, organization_id, title, status, source(`manual`|`sourcing`|`import`), brand, category_hint, images jsonb, weight_grams, length_mm / width_mm / height_mm, payload jsonb（description 等）, created_at, updated_at, deleted_at  

**product_variants：** id, organization_id, product_id, sku, barcode, attrs jsonb, created_at, updated_at  

### 3.6 listings

| 列 | 说明 |
|----|------|
| id | |
| organization_id | |
| shop_id | |
| product_id / variant_id | |
| status | listing_status |
| title | 列表展示标题（长文案进 payload） |
| external_item_id | 平台 item / product id |
| brand_external_id / brand_name | 平台品牌 |
| category_external_id | 平台类目 id |
| category_path | 类目面包屑（列表） |
| attributes | jsonb 结构化属性 |
| price_amount / price_currency | 列表金额 |
| stock_on_hand | 可售库存 |
| warehouse_code | 仓编码 |
| logistics_channel | 物流渠道 |
| publish_state | 平台上架态 ACTIVE/… |
| last_error | |
| payload | jsonb 平台原稿 / description / 图片 |
| submitted_at / live_at | |
| 唯一 | (shop_id, external_item_id) |

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

**orders：** id, organization_id, shop_id, external_order_id, status, platform_status, fulfillment_status, placed_at, paid_at, currency, total_amount, buyer_region, payment_method, shipping_provider, tracking_number, package_id, raw jsonb（buyerNameMask / shippingAmount / city 等）, created_at, updated_at  

**order_lines：** id, order_id, organization_id, external_line_id, sku, title, qty, unit_price, variant_id null, fulfillment_status, package_id, tracking_number, shipping_provider  

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

### 3.14 platform_brands / platform_categories（平台缓存）

按 shop 缓存品牌/类目，供控制台筛选与刊登表单：

- **platform_brands：** organization_id, shop_id, external_id, name, raw jsonb；唯一 `(shop_id, external_id)`
- **platform_categories：** organization_id, shop_id, external_id, name, parent_external_id, path, leaf, raw jsonb；唯一 `(shop_id, external_id)`

---

## 3.x 列策略（marketplace connectors）

原则：列表/过滤所需字段用结构化列；平台易变 / 原文进 jsonb。

| 表 | 列（摘要） | jsonb |
|----|----|-------|
| shops | … + timezone, seller_name, marketplace_country, auth_expires_at, last_sync_at | meta |
| products | … + brand, category_hint, images, weight/dims | payload |
| listings | … + external_item_id, brand_*, category_path, stock_on_hand, warehouse_code, logistics_channel, publish_state | attributes, payload |
| orders | … + platform_status, fulfillment_status, buyer_region, payment_method, shipping_provider, tracking_number, package_id | raw |
| order_lines | … + fulfillment_status, package_id, tracking_number, shipping_provider | — |
| platform_brands / platform_categories | shop + external_id + name (+ path) | raw |
| integration_credentials | kind, expires_at | payload_encrypted（密文） |
| integration_states | orders/inventory/products/listings cursors + last_*_sync_at, health | — |

迁移：
- `0006_commerce_lean_payload.sql` — 初版 lean jsonb
- `0007_commerce_platform_enrichment.sql` — 多平台 enriched 列 + brand/category 缓存表

Seed：`packages/db/seeds/commerce-daraz-lk-shop.sql`（canonical cuid shop ids，与 console mock 对齐）。

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
    meta: jsonb("meta").$type<Record<string, unknown>>().default({}),
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
- Canonical shops（cuid，与 `apps/shop` mock 一致）见 `packages/db/seeds/commerce-daraz-lk-shop.sql`：
  - Daraz LK `b5ofcwj2mzauov29y08m0q99`
  - Lazada MY `s8v7xkqw0asyz4zhswxwzdd3`
  - TikTok `kqw7alhkgefjmffogbib1z79`
- 若干 product_candidates、pending_actions、orders、inventory、alerts、listings  

供 Demo 页 mock 同源；OAuth authorize 的 `shopId` 必须等于 `shops.id`。
