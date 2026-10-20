/**
 * 调度引擎与资源池域表结构（Drizzle ORM / PostgreSQL）
 *
 * 设计依据：resource-pool-optimization.md v3.0
 * 包含：
 *   - resource_scheduling_rule: 调度策略规则表
 *   - device_availability_snapshot: 设备可用性快照（运营看板用）
 *   - scheduling_rule_change_log: 规则变更审计日志
 *
 * 约定：
 * - 主键 text (cuid2)
 * - JSONB 用于扩展条件
 * - 数组列用于结构化匹配条件
 */

import { createId } from "@paralleldrive/cuid2"
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"

import { supplierDevice, dataCenter, gpuCardType } from "./supply-schema"

const ts = (n: string) =>
  timestamp(n, { withTimezone: true }).defaultNow().notNull()

// ---------------------------------------------------------------------------
// §1 调度策略规则表
// ---------------------------------------------------------------------------

export const resourceSchedulingRule = pgTable(
  "resource_scheduling_rule",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    name: varchar("name", { length: 128 }).notNull(),
    priority: integer("priority").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),

    // 结构化匹配列（高频查询字段）
    tenantTier: text("tenant_tier").array(),
    productLine: text("product_line").array(),
    billingMode: text("billing_mode").array(),
    taskCategory: text("task_category").array(),

    // 扩展匹配条件（JSONB）
    matchExtra: jsonb("match_extra").notNull().default({}),

    // 调度动作
    action: jsonb("action").notNull(),

    // 生效范围
    scope: varchar("scope", { length: 16 }).notNull().default("global"),
    scopeId: text("scope_id"),

    description: text("description"),
    createdBy: text("created_by"),
    ...tsColumns(),
  },
  (table) => [
    index("rsr_priority_idx").on(table.priority.desc()),
    index("rsr_enabled_idx").on(table.enabled),
    index("rsr_scope_idx").on(table.scope, table.scopeId),
    index("rsr_tenant_tier_idx").on(table.tenantTier),
    index("rsr_product_line_idx").on(table.productLine),
  ],
)

// ---------------------------------------------------------------------------
// §2 设备可用性快照（运营看板 + 调度决策参考）
// ---------------------------------------------------------------------------

export const deviceAvailabilitySnapshot = pgTable(
  "device_availability_snapshot",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    supplierDeviceId: text("supplier_device_id")
      .notNull()
      .references(() => supplierDevice.id, { onDelete: "cascade" }),
    dataCenterId: text("data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "restrict" }),
    gpuCardTypeId: text("gpu_card_type_id")
      .notNull()
      .references(() => gpuCardType.id, { onDelete: "restrict" }),
    gpuCount: integer("gpu_count").notNull(),

    // 池归属（由调度引擎计算）
    pool: varchar("pool", { length: 16 }).notNull(),
    poolUpdatedAt: ts("pool_updated_at"),

    // 占用状态
    allocatedTo: varchar("allocated_to", { length: 64 }),
    allocatedGpuCount: integer("allocated_gpu_count").default(0),
    allocatableGpuCount: integer("allocatable_gpu_count").notNull(),

    // 优先级
    currentPriorityClass: varchar("current_priority_class", {
      length: 32,
    })
      .notNull()
      .default("od-normal"),
    currentWeight: integer("current_weight").notNull().default(50),

    // 可抢占标记
    preemptible: boolean("preemptible").notNull().default(false),
    preemptNoticeSeconds: integer("preempt_notice_seconds").default(120),

    // 快照时间
    snapshotAt: ts("snapshot_at"),
  },
  (table) => [
    uniqueIndex("das_device_uk").on(table.supplierDeviceId),
    index("das_pool_allocatable_idx").on(
      table.pool,
      table.allocatableGpuCount.desc(),
    ),
    index("das_card_dc_idx").on(table.gpuCardTypeId, table.dataCenterId),
  ],
)

// ---------------------------------------------------------------------------
// §3 规则变更审计日志
// ---------------------------------------------------------------------------

export const schedulingRuleChangeLog = pgTable(
  "scheduling_rule_change_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    ruleId: text("rule_id")
      .notNull()
      .references(() => resourceSchedulingRule.id, { onDelete: "cascade" }),
    changedBy: text("changed_by").notNull(),
    changeType: varchar("change_type", { length: 16 }).notNull(),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    changedAt: ts("changed_at"),
  },
  (table) => [
    index("srcl_rule_id_idx").on(table.ruleId),
    index("srcl_changed_at_idx").on(table.changedAt.desc()),
  ],
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tsColumns() {
  return {
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  }
}
