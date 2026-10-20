# 算力券与模板同步设计方案

> 版本：v1.0  
> 日期：2026-07-09  
> 状态：**已实施**  
> 关联：[crm-database.md](crm-database.md)、[tenant-billing-import-design.md](tenant-billing-import-design.md)、[project-billing-scheduled-sync-design.md](project-billing-scheduled-sync-design.md)

---

## 1. 目标

| # | 目标 | 说明 |
|---|------|------|
| G1 | 同步租户算力券实例 | 账单同步 / 定时同步时拉取 `discount_relation_list` 写入 `coupon` |
| G2 | 同步算力券模板 | 每日全量拉取 `discount_template/list` 写入 `discount_template` |
| G3 | 三处列表 | 项目详情、租户详情、客户详情分页展示，支持按月度、状态、产品线过滤 |
| G4 | 金额口径 | 平台 `count` / `surplus_count` ÷ 10⁶ = 人民币元（与账单 `discount_value` 一致） |

## 2. 平台 API

### 2.1 租户算力券实例

`GET /admin/tenant/discount_relation_list`

| 参数 | 说明 |
|------|------|
| `tenant_ids` | 平台租户 ID |
| `template_ids` | 可选，模板过滤 |
| `start_time` / `end_time` | 可选时间窗（与账单同步窗口一致） |
| `page` / `page_size` | 分页，CRM 侧拉全量 |

关键字段：`id`（幂等键）、`template_id`、`count`、`surplus_count`、`status`、`template_title`、`end_date`、`create_time`、`remark`。

### 2.2 算力券模板

`GET /admin/discount_template/list`

| 参数 | 说明 |
|------|------|
| `status` | 可空；日更时不传以拉全量状态 |
| `start_time` / `end_time` | 日更留空 |
| `page` / `page_size` | 分页拉全量 |

`support_products`（如 `MaasToken,`）按逗号拆分后经 `mapPlatformProductLine` 写入 `support_product_lines`。

## 3. 表结构

### 3.1 `discount_template`

| 列 | 说明 |
|----|------|
| `platform_template_id` | UK，平台模板 ID |
| `title` / `status` / `validity_day` | 模板元数据 |
| `support_products` | 平台原始字符串 |
| `support_product_lines` | 映射后产品线，逗号分隔 |
| `face_amount` | `count` ÷ 10⁶ |
| `total_amount` | `total` ÷ 10⁶（可空） |
| `synced_at` | 最近同步时间 |

### 3.2 `coupon`（扩展）

| 列 | 说明 |
|----|------|
| `platform_relation_id` | UK（可空兼容历史行），平台发放记录 ID |
| `platform_template_id` / `template_id` | 关联模板 |
| `value` | 面值（元） |
| `surplus_amount` | 剩余额度（元） |
| `status` | 保留平台状态（`Open` 等） |
| `issued_at` / `expired_at` | `create_time` / `end_date` |

## 4. 同步编排

```
账单同步（手动 / 定时 full scope）
  └─ importBillingStream
       └─ streamCouponsSection  → upsert coupon（按 platform_relation_id）

每日 Cron（默认 0 6 * * * Asia/Shanghai）
  └─ runDiscountTemplateSync
       └─ fetchAllTemplates → upsert discount_template
```

- 券实例同步与账单同窗口；`scope=daily_bills_only` **不同步**券。
- 模板日更独立于账单；券 upsert 时按 `platform_template_id` 回填 `template_id`（模板尚未入库则留空，下次模板同步后列表仍可按 `platform_template_id` join）。

## 5. 列表过滤

| 过滤 | 实现 |
|------|------|
| 月度 | `issued_at` 落在东八区该自然月 |
| 状态 | `coupon.status` 精确匹配 |
| 产品线 | `discount_template.support_product_lines` 包含该产品线（`LIKE` / `position`） |

分页：`page` + `pageSize`（默认 20）。

## 6. 非目标

- 不实现「发放算力券」写回平台
- 不把券面值计入 `total_consumption`
- 不替代账单中的 `coupon_amount`（消费抵扣金额）
