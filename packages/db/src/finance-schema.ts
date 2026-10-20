/**
 * 财务账期与经营月结域表结构（Drizzle ORM / PostgreSQL）
 *
 * 设计依据：apps/web/content/design/billing-period-import-design.md（v1.4）
 *
 * 领域模型：
 * - 原始层（Raw）：账期内可替换；每账期每 file_type 仅一组 batch（DB 唯一约束）
 * - 个人收入：personal_tenant_bill / personal_baremetal_order + billing_period_personal_income_summary
 * - 派生层：platform_income_monthly / platform_cost_monthly，计算前 DELETE 再 INSERT
 * - 重新生成：应用层 purge 后物理删除子表行；不保留历史 batch / calc 快照
 * - 主数据衔接：CRM tenant / project / user_staff；供应商 supplier_unit_cost
 *
 * 约定：
 * - 主键 text；金额 numeric(15,4)；卡时 numeric(15,4)；分成比例 numeric(7,4)
 * - 扩展与追溯字段 jsonb
 */

import { relations, sql } from "drizzle-orm"
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core"

import { billingTenant, crmProject, customer, userStaff } from "./crm-schema"
import {
  dataCenter,
  gpuCardType,
  supplier,
  supplierBill,
  supplierPricingRecord,
  supplierUnitCost,
} from "./supply-schema"

/** 金额 decimal(15,4) */
const money = (name: string) => numeric(name, { precision: 15, scale: 4 })

/** 卡时 decimal(15,4) */
const cardHours = (name: string) => numeric(name, { precision: 15, scale: 4 })

/** 成本分成比例 0~100，decimal(7,4) */
const allocationPercent = (name: string) =>
  numeric(name, { precision: 7, scale: 4 })

/** 成交/刊例比例 decimal(9,6) */
const dealToListRatio = (name: string) => numeric(name, { precision: 9, scale: 6 })

const financeTimestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}

// ---------------------------------------------------------------------------
// §4.2 派生层 — 账期主表
// ---------------------------------------------------------------------------

/**
 * 账期 billing_period
 * status: draft | imported | pending_allocation | computed | published | void
 */
export const billingPeriod = pgTable(
  "billing_period",
  {
    id: text("id").primaryKey(),
    periodCode: varchar("period_code", { length: 32 }).notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("draft"),
    /** purge / 重新生成后置 NULL，计算完成后写入 */
    totalIncome: money("total_income"),
    /** 企业收入：platform_income_monthly 总消费合计 */
    enterpriseIncome: money("enterprise_income"),
    /** 个人收入：billing_period_personal_income_summary.non_project 总消费 */
    personalIncome: money("personal_income"),
    /** 收入合计：企业收入 + 个人收入 */
    incomeTotal: money("income_total"),
    totalCost: money("total_cost"),
    /** 项目成本：外部租户（有项目绑定）成本合计 */
    projectCost: money("project_cost"),
    /** 内部用户成本：内部租户成本合计 */
    internalUserCost: money("internal_user_cost"),
    totalGrossProfit: money("total_gross_profit"),
    supplementary: money("supplementary"),
    balanceIncome: money("balance_income"),
    baremetalIncome: money("baremetal_income"),
    lastComputedAt: timestamp("last_computed_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    /** 为 true 时整月单窗口上传客户账单，成本按账期结束日刊例价计算 */
    ignoreListPriceWindows: boolean("ignore_list_price_windows")
      .notNull()
      .default(false),
    ...financeTimestamps,
  },
  (table) => [
    uniqueIndex("billing_period_period_code_uk").on(table.periodCode),
    index("billing_period_status_idx").on(table.status),
    index("billing_period_period_start_idx").on(table.periodStart),
  ],
)

/** 平台月度收入明细 platform_income_monthly */
export const platformIncomeMonthly = pgTable(
  "platform_income_monthly",
  {
    id: text("id").primaryKey(),
    billingPeriodId: text("billing_period_id")
      .notNull()
      .references(() => billingPeriod.id, { onDelete: "cascade" }),
    /** B | C */
    customerType: varchar("customer_type", { length: 8 }).notNull(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => billingTenant.id, { onDelete: "restrict" }),
    tenantPlatformId: varchar("tenant_platform_id", { length: 128 }).notNull(),
    tenantName: varchar("tenant_name", { length: 255 }).notNull(),
    customerId: text("customer_id").references(() => customer.id, {
      onDelete: "restrict",
    }),
    customerFullName: varchar("customer_full_name", { length: 255 }),
    projectId: text("project_id").references(() => crmProject.id, {
      onDelete: "set null",
    }),
    projectName: varchar("project_name", { length: 255 }),
    supplementaryConsumption: money("supplementary_consumption"),
    balanceConsumption: money("balance_consumption"),
    /** 裸金属产品线 detail.amount 合计（含券） */
    bareMetalConsumption: money("bare_metal_consumption"),
    /** 裸金属产品线 detail.balance_amount 合计（线上裸金属余额消费） */
    bareMetalBalanceConsumption: money("bare_metal_balance_consumption"),
    totalConsumption: money("total_consumption").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("platform_income_monthly_period_tenant_project_uk").on(
      table.billingPeriodId,
      table.tenantId,
      table.projectId,
    ),
    index("platform_income_monthly_billing_period_id_idx").on(table.billingPeriodId),
    index("platform_income_monthly_tenant_platform_id_idx").on(table.tenantPlatformId),
  ],
)

/**
 * 平台月度成本 platform_cost_monthly
 * type: record | sum
 */
// ---------------------------------------------------------------------------
// §4.1 原始层 — 导入批次与 Raw 行
// ---------------------------------------------------------------------------

/**
 * 账期租户账单子窗口（平台刊例价变动时按时间段拆分上传 tenant_bill）
 */
export const billingPeriodTenantBillWindow = pgTable(
  "billing_period_tenant_bill_window",
  {
    id: text("id").primaryKey(),
    billingPeriodId: text("billing_period_id")
      .notNull()
      .references(() => billingPeriod.id, { onDelete: "cascade" }),
    windowStart: date("window_start").notNull(),
    windowEnd: date("window_end").notNull(),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("billing_period_tenant_bill_window_uk").on(
      table.billingPeriodId,
      table.windowStart,
      table.windowEnd,
    ),
    index("billing_period_tenant_bill_window_period_id_idx").on(table.billingPeriodId),
  ],
)

/**
 * 导入批次 billing_period_import_batch
 * file_type: customer_consumption | baremetal_order | tenant_bill |
 *   personal_tenant_bill | personal_baremetal_order
 *
 * customer / baremetal：每账期至多一条；tenant_bill：每 window 至多一条；
 * personal_*：每账期各至多一条（个人收入页独立批次）。
 */
export const billingPeriodImportBatch = pgTable(
  "billing_period_import_batch",
  {
    id: text("id").primaryKey(),
    billingPeriodId: text("billing_period_id")
      .notNull()
      .references(() => billingPeriod.id, { onDelete: "cascade" }),
    /** tenant_bill 必填；其他 file_type 为 null */
    windowId: text("window_id").references(() => billingPeriodTenantBillWindow.id, {
      onDelete: "cascade",
    }),
    fileType: varchar("file_type", { length: 32 }).notNull(),
    fileName: varchar("file_name", { length: 512 }).notNull(),
    /** 相对 DATA_DIR/finance-imports 的路径 */
    storagePath: varchar("storage_path", { length: 1024 }).notNull().default(""),
    /** 标注错误单元格后的 xlsx 路径 */
    errorReportPath: varchar("error_report_path", { length: 1024 }),
    fileSha256: varchar("file_sha256", { length: 64 }).notNull(),
    fileSizeBytes: integer("file_size_bytes"),
    /** ok | error */
    parseStatus: varchar("parse_status", { length: 16 }).notNull().default("ok"),
    parseErrorCount: integer("parse_error_count").notNull().default(0),
    rowCount: integer("row_count").notNull().default(0),
    uploadedBy: text("uploaded_by").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("billing_period_import_batch_period_customer_uk")
      .on(table.billingPeriodId)
      .where(sql`${table.fileType} = 'customer_consumption'`),
    uniqueIndex("billing_period_import_batch_period_baremetal_uk")
      .on(table.billingPeriodId)
      .where(sql`${table.fileType} = 'baremetal_order'`),
    uniqueIndex("billing_period_import_batch_period_tenant_window_uk")
      .on(table.billingPeriodId, table.windowId)
      .where(sql`${table.fileType} = 'tenant_bill'`),
    uniqueIndex("billing_period_import_batch_period_personal_tenant_bill_uk")
      .on(table.billingPeriodId)
      .where(sql`${table.fileType} = 'personal_tenant_bill'`),
    uniqueIndex("billing_period_import_batch_period_personal_baremetal_uk")
      .on(table.billingPeriodId)
      .where(sql`${table.fileType} = 'personal_baremetal_order'`),
    index("billing_period_import_batch_period_id_idx").on(table.billingPeriodId),
    index("billing_period_import_batch_window_id_idx").on(table.windowId),
  ],
)

/**
 * 个人收入汇总（B 端 / 非项目 / 黑名单 / 内部租户）
 * summary_kind: enterprise_project | non_project | blacklist | internal
 */
export const billingPeriodPersonalIncomeSummary = pgTable(
  "billing_period_personal_income_summary",
  {
    id: text("id").primaryKey(),
    billingPeriodId: text("billing_period_id")
      .notNull()
      .references(() => billingPeriod.id, { onDelete: "cascade" }),
    summaryKind: varchar("summary_kind", { length: 32 }).notNull(),
    balanceConsumption: money("balance_consumption").notNull().default("0"),
    bareMetalConsumption: money("bare_metal_consumption").notNull().default("0"),
    totalConsumption: money("total_consumption").notNull(),
    matchedTenantCount: integer("matched_tenant_count").notNull().default(0),
    tenantBillBatchId: text("tenant_bill_batch_id").references(
      () => billingPeriodImportBatch.id,
      { onDelete: "set null" },
    ),
    baremetalBatchId: text("baremetal_batch_id").references(
      () => billingPeriodImportBatch.id,
      { onDelete: "set null" },
    ),
    ruleVersion: varchar("rule_version", { length: 32 }),
    lastComputedAt: timestamp("last_computed_at", { withTimezone: true }),
    ...financeTimestamps,
  },
  (table) => [
    uniqueIndex("billing_period_personal_income_summary_period_kind_uk").on(
      table.billingPeriodId,
      table.summaryKind,
    ),
    index("billing_period_personal_income_summary_period_id_idx").on(
      table.billingPeriodId,
    ),
  ],
)

/** 个人收入计算 · 租户级明细（四段互斥） */
export const billingPeriodPersonalIncomeTenantLine = pgTable(
  "billing_period_personal_income_tenant_line",
  {
    id: text("id").primaryKey(),
    billingPeriodId: text("billing_period_id")
      .notNull()
      .references(() => billingPeriod.id, { onDelete: "cascade" }),
    platformTenantId: varchar("platform_tenant_id", { length: 128 }).notNull(),
    segment: varchar("segment", { length: 32 }).notNull(),
    customerTypeLabel: varchar("customer_type_label", { length: 16 }),
    customerName: varchar("customer_name", { length: 255 }),
    balanceConsumption: money("balance_consumption").notNull().default("0"),
    bareMetalConsumption: money("bare_metal_consumption").notNull().default("0"),
    totalConsumption: money("total_consumption").notNull(),
    voucherConsumption: money("voucher_consumption").notNull().default("0"),
    ruleVersion: varchar("rule_version", { length: 32 }),
    lastComputedAt: timestamp("last_computed_at", { withTimezone: true }),
    ...financeTimestamps,
  },
  (table) => [
    uniqueIndex("billing_period_personal_income_tenant_line_period_tenant_uk").on(
      table.billingPeriodId,
      table.platformTenantId,
    ),
    index("billing_period_personal_income_tenant_line_period_segment_idx").on(
      table.billingPeriodId,
      table.segment,
    ),
  ],
)

/** Raw：客户消费明细 */
export const billingPeriodRawCustomerConsumption = pgTable(
  "billing_period_raw_customer_consumption",
  {
    id: text("id").primaryKey(),
    batchId: text("batch_id")
      .notNull()
      .references(() => billingPeriodImportBatch.id, { onDelete: "cascade" }),
    rowNo: integer("row_no").notNull(),
    tenantPlatformId: varchar("tenant_platform_id", { length: 128 }).notNull(),
    productType: varchar("product_type", { length: 128 }),
    tenantType: varchar("tenant_type", { length: 32 }),
    customerType: varchar("customer_type", { length: 8 }).notNull(),
    projectNameExcel: varchar("project_name_excel", { length: 255 }),
    totalConsumption: money("total_consumption").notNull(),
    voucherConsumption: money("voucher_consumption").notNull().default("0"),
    balanceConsumption: money("balance_consumption").notNull(),
    rawJson: jsonb("raw_json").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("billing_period_raw_customer_consumption_batch_id_idx").on(table.batchId),
    index("billing_period_raw_customer_consumption_tenant_idx").on(
      table.tenantPlatformId,
    ),
  ],
)

/** Step I0：客户消费按租户×客户类型预汇总 */
export const billingPeriodAggCustomerConsumption = pgTable(
  "billing_period_agg_customer_consumption",
  {
    id: text("id").primaryKey(),
    billingPeriodId: text("billing_period_id")
      .notNull()
      .references(() => billingPeriod.id, { onDelete: "cascade" }),
    tenantPlatformId: varchar("tenant_platform_id", { length: 128 }).notNull(),
    customerType: varchar("customer_type", { length: 8 }).notNull(),
    tenantId: text("tenant_id").references(() => billingTenant.id, {
      onDelete: "restrict",
    }),
    customerId: text("customer_id").references(() => customer.id, {
      onDelete: "restrict",
    }),
    customerFullName: varchar("customer_full_name", { length: 255 }),
    projectId: text("project_id").references(() => crmProject.id, {
      onDelete: "set null",
    }),
    projectName: varchar("project_name", { length: 255 }),
    allocationPercent: allocationPercent("allocation_percent"),
    totalConsumption: money("total_consumption").notNull(),
    voucherConsumption: money("voucher_consumption").notNull().default("0"),
    balanceConsumption: money("balance_consumption").notNull(),
    sourceRawIds: jsonb("source_raw_ids").$type<string[]>().notNull(),
    rowCountByType: integer("row_count_by_type").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("billing_period_agg_customer_consumption_uk").on(
      table.billingPeriodId,
      table.tenantPlatformId,
      table.projectId,
    ),
    index("billing_period_agg_customer_consumption_period_id_idx").on(
      table.billingPeriodId,
    ),
  ],
)

/** Raw：裸金属消费订单 */
export const billingPeriodRawBaremetalOrder = pgTable(
  "billing_period_raw_baremetal_order",
  {
    id: text("id").primaryKey(),
    batchId: text("batch_id")
      .notNull()
      .references(() => billingPeriodImportBatch.id, { onDelete: "cascade" }),
    rowNo: integer("row_no").notNull(),
    orderId: varchar("order_id", { length: 128 }).notNull(),
    orderNo: varchar("order_no", { length: 128 }),
    tenantPlatformId: varchar("tenant_platform_id", { length: 128 }).notNull(),
    idcName: varchar("idc_name", { length: 128 }),
    deviceModel: varchar("device_model", { length: 128 }),
    payStatus: varchar("pay_status", { length: 32 }).notNull(),
    deviceStatus: varchar("device_status", { length: 32 }),
    purchaseQtyText: varchar("purchase_qty_text", { length: 128 }),
    deviceQty: integer("device_qty"),
    orderAmount: money("order_amount"),
    refundAmount: money("refund_amount").default("0"),
    finalAmount: money("final_amount").notNull(),
    orderedAt: timestamp("ordered_at", { withTimezone: true }).notNull(),
    rawJson: jsonb("raw_json").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("billing_period_raw_baremetal_order_batch_id_idx").on(table.batchId),
    index("billing_period_raw_baremetal_order_tenant_idx").on(table.tenantPlatformId),
    index("billing_period_raw_baremetal_order_ordered_at_idx").on(table.orderedAt),
  ],
)

/** Raw：客户账单详情（除 CPU 任务外） */
export const billingPeriodRawTenantBill = pgTable(
  "billing_period_raw_tenant_bill",
  {
    id: text("id").primaryKey(),
    batchId: text("batch_id")
      .notNull()
      .references(() => billingPeriodImportBatch.id, { onDelete: "cascade" }),
    rowNo: integer("row_no").notNull(),
    tenantPlatformId: varchar("tenant_platform_id", { length: 128 }).notNull(),
    billLineType: varchar("bill_line_type", { length: 64 }),
    tenantTypeLabel: varchar("tenant_type_label", { length: 32 }),
    customerTypeLabel: varchar("customer_type_label", { length: 16 }),
    customerName: varchar("customer_name", { length: 255 }),
    totalConsumption: money("total_consumption").notNull(),
    voucherConsumption: money("voucher_consumption").notNull().default("0"),
    balanceConsumption: money("balance_consumption").notNull(),
    totalCardHours: cardHours("total_card_hours"),
    voucherCardHours: cardHours("voucher_card_hours").default("0"),
    balanceCardHours: cardHours("balance_card_hours").notNull(),
    gpuModel: varchar("gpu_model", { length: 128 }).notNull(),
    regionCode: varchar("region_code", { length: 64 }).notNull(),
    rawJson: jsonb("raw_json").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("billing_period_raw_tenant_bill_batch_id_idx").on(table.batchId),
    index("billing_period_raw_tenant_bill_tenant_idx").on(table.tenantPlatformId),
    index("billing_period_raw_tenant_bill_region_gpu_idx").on(
      table.regionCode,
      table.gpuModel,
    ),
  ],
)

// ---------------------------------------------------------------------------
// §4.4 / §4.5 租户项目补全与成本分成
// ---------------------------------------------------------------------------

/**
 * 账期内租户→项目→AM 补全结果
 * source: auto_single | auto_preset | manual_period
 */
export const billingPeriodTenantProjectEnrichment = pgTable(
  "billing_period_tenant_project_enrichment",
  {
    id: text("id").primaryKey(),
    billingPeriodId: text("billing_period_id")
      .notNull()
      .references(() => billingPeriod.id, { onDelete: "cascade" }),
    tenantPlatformId: varchar("tenant_platform_id", { length: 128 }).notNull(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => billingTenant.id, { onDelete: "restrict" }),
    projectId: text("project_id")
      .notNull()
      .references(() => crmProject.id, { onDelete: "restrict" }),
    projectName: varchar("project_name", { length: 255 }).notNull(),
    staffId: text("staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    accountManagerName: varchar("account_manager_name", { length: 128 }),
    source: varchar("source", { length: 32 }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("billing_period_tenant_project_enrichment_uk").on(
      table.billingPeriodId,
      table.tenantPlatformId,
      table.projectId,
    ),
    index("billing_period_tenant_project_enrichment_period_id_idx").on(
      table.billingPeriodId,
    ),
    index("billing_period_tenant_project_enrichment_tenant_id_idx").on(table.tenantId),
  ],
)

/**
 * 预置：同一租户多项目默认成本分成 tenant_project_cost
 * effective_to NULL = 当前生效
 */
export const tenantProjectCost = pgTable(
  "tenant_project_cost",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => billingTenant.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => crmProject.id, { onDelete: "cascade" }),
    allocationPercent: allocationPercent("allocation_percent").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    remark: text("remark"),
    createdBy: text("created_by").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("tenant_project_cost_current_uk")
      .on(table.tenantId, table.projectId)
      .where(sql`${table.effectiveTo} IS NULL`),
    index("tenant_project_cost_tenant_id_idx").on(table.tenantId),
    index("tenant_project_cost_project_id_idx").on(table.projectId),
  ],
)

/** 本账期租户多项目成本分成 billing_tenant_cost_allocation */
export const billingTenantCostAllocation = pgTable(
  "billing_tenant_cost_allocation",
  {
    id: text("id").primaryKey(),
    billingPeriodId: text("billing_period_id")
      .notNull()
      .references(() => billingPeriod.id, { onDelete: "cascade" }),
    tenantPlatformId: varchar("tenant_platform_id", { length: 128 }).notNull(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => billingTenant.id, { onDelete: "restrict" }),
    projectId: text("project_id")
      .notNull()
      .references(() => crmProject.id, { onDelete: "restrict" }),
    allocationPercent: allocationPercent("allocation_percent").notNull(),
    presetId: text("preset_id").references(() => tenantProjectCost.id, {
      onDelete: "set null",
    }),
    createdBy: text("created_by").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("billing_tenant_cost_allocation_uk").on(
      table.billingPeriodId,
      table.tenantId,
      table.projectId,
    ),
    index("billing_tenant_cost_allocation_period_id_idx").on(table.billingPeriodId),
    index("billing_tenant_cost_allocation_tenant_id_idx").on(table.tenantId),
  ],
)

/**
 * 项目月度成本毛利快照 project_monthly_cost_snapshot
 * 由财务「项目月度成本」页确认后写入（monthly-cost/confirm.ts），供月报毛利口径读取。
 */
export const projectMonthlyCostSnapshot = pgTable(
  "project_monthly_cost_snapshot",
  {
    id: text("id").primaryKey(),
    billingPeriodId: text("billing_period_id")
      .notNull()
      .references(() => billingPeriod.id, { onDelete: "cascade" }),
    settlementMonth: varchar("settlement_month", { length: 7 }).notNull(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => billingTenant.id, { onDelete: "restrict" }),
    tenantPlatformId: varchar("tenant_platform_id", { length: 128 }).notNull(),
    tenantName: varchar("tenant_name", { length: 255 }).notNull(),
    projectId: text("project_id").references(() => crmProject.id, {
      onDelete: "set null",
    }),
    projectName: varchar("project_name", { length: 255 }),
    customerId: text("customer_id").references(() => customer.id, {
      onDelete: "set null",
    }),
    customerFullName: varchar("customer_full_name", { length: 255 }),
    accountManager: varchar("account_manager", { length: 128 }),
    opportunitySource: varchar("opportunity_source", { length: 64 }),
    balanceConsumption: money("balance_consumption").notNull().default("0"),
    balanceCardHours: cardHours("balance_card_hours").notNull().default("0"),
    voucherCardHours: cardHours("voucher_card_hours").notNull().default("0"),
    confirmedRevenueExclTax: money("confirmed_revenue_excl_tax").notNull().default("0"),
    soldDurationCostExclTax: money("sold_duration_cost_excl_tax").notNull().default("0"),
    giftedDurationCostExclTax: money("gifted_duration_cost_excl_tax").notNull().default("0"),
    grossProfit: money("gross_profit").notNull().default("0"),
    metadata: jsonb("metadata").notNull().default({}),
    savedBy: text("saved_by").references(() => userStaff.id, { onDelete: "set null" }),
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull(),
    ...financeTimestamps,
  },
  (table) => [
    uniqueIndex("project_monthly_cost_snapshot_period_tenant_uk").on(
      table.billingPeriodId,
      table.tenantPlatformId,
    ),
    index("project_monthly_cost_snapshot_project_month_idx").on(
      table.projectId,
      table.settlementMonth,
    ),
    index("project_monthly_cost_snapshot_tenant_month_idx").on(
      table.tenantId,
      table.settlementMonth,
    ),
  ],
)

// ---------------------------------------------------------------------------
// 对账报告与操作审计（v1.4：不保留被 purge 的业务行副本）
// ---------------------------------------------------------------------------

/** 对账报告 §7.2；每账期仅保留当前一份，purge(derived|full) 时删除 */
export const billingPeriodReconciliationReport = pgTable(
  "billing_period_reconciliation_report",
  {
    id: text("id").primaryKey(),
    billingPeriodId: text("billing_period_id")
      .notNull()
      .references(() => billingPeriod.id, { onDelete: "cascade" }),
    /** 检查项列表、diff、警告等，结构见设计 §7.2 */
    reportJson: jsonb("report_json").notNull(),
    ruleVersion: varchar("rule_version", { length: 32 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("billing_period_reconciliation_report_period_uk").on(
      table.billingPeriodId,
    ),
  ],
)

/**
 * 账期操作审计 billing_period_operation_log
 * operation: import_batch | purge | regenerate | compute | publish | unpublish | override
 */
export const billingPeriodOperationLog = pgTable(
  "billing_period_operation_log",
  {
    id: text("id").primaryKey(),
    billingPeriodId: text("billing_period_id")
      .notNull()
      .references(() => billingPeriod.id, { onDelete: "cascade" }),
    operation: varchar("operation", { length: 32 }).notNull(),
    /** purge 时：file_type | derived | full */
    purgeScope: varchar("purge_scope", { length: 32 }),
    actorId: text("actor_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("billing_period_operation_log_period_id_idx").on(table.billingPeriodId),
    index("billing_period_operation_log_operation_idx").on(table.operation),
    index("billing_period_operation_log_created_at_idx").on(table.createdAt),
  ],
)

// ---------------------------------------------------------------------------
// 调账与审计历史（应用层 override，不回写 Raw；purge(derived) 时随派生行 cascade 删除）
// ---------------------------------------------------------------------------

/** 补充消费修改历史 */
export const supplementaryConsumptionHistory = pgTable(
  "supplementary_consumption_history",
  {
    id: text("id").primaryKey(),
    incomeId: text("income_id")
      .notNull()
      .references(() => platformIncomeMonthly.id, { onDelete: "cascade" }),
    previousValue: money("previous_value"),
    newValue: money("new_value").notNull(),
    /** offline_order | manual_correction | promotion | compensation | other */
    type: varchar("type", { length: 32 }).notNull(),
    remark: text("remark").notNull(),
    createdBy: text("created_by").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("supplementary_consumption_history_income_id_idx").on(table.incomeId),
  ],
)

/** 收入调账历史（余额消费、裸金属消费） */
// ---------------------------------------------------------------------------
// 弹性算力提成派生（独立于 platform_cost_monthly）
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 月度成本与提成（tenant_region_gpu 驱动，与账期成本 pipeline 独立）
// 设计：apps/web/content/design/monthly-cost-from-gpu-consumption-design.md
// ---------------------------------------------------------------------------

export const monthlyCostRun = pgTable(
  "monthly_cost_run",
  {
    id: text("id").primaryKey(),
    billingPeriodId: text("billing_period_id")
      .notNull()
      .references(() => billingPeriod.id, { onDelete: "restrict" }),
    billingPeriodCode: varchar("billing_period_code", { length: 32 }).notNull(),
    usageMonth: varchar("usage_month", { length: 7 }).notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    baseLineCount: integer("base_line_count").notNull().default(0),
    commissionProjectLineCount: integer("commission_project_line_count").notNull().default(0),
    commissionAmLineCount: integer("commission_am_line_count").notNull().default(0),
    deptPoolLineCount: integer("dept_pool_line_count").notNull().default(0),
    deptPoolProjectLineCount: integer("dept_pool_project_line_count").notNull().default(0),
    deptDistributionLineCount: integer("dept_distribution_line_count").notNull().default(0),
    warningCount: integer("warning_count").notNull().default(0),
    deptDistributionStatus: varchar("dept_distribution_status", { length: 16 })
      .notNull()
      .default("not_applicable"),
    errorSummary: text("error_summary"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    triggeredBy: text("triggered_by").references(() => userStaff.id, { onDelete: "set null" }),
    /** 财务确认固化到账期正式数据 */
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    confirmedBy: text("confirmed_by").references(() => userStaff.id, { onDelete: "set null" }),
    confirmedCostBranch: varchar("confirmed_cost_branch", { length: 32 }),
    ...financeTimestamps,
  },
  (table) => [
    index("monthly_cost_run_billing_period_idx").on(table.billingPeriodId),
    index("monthly_cost_run_usage_month_idx").on(table.usageMonth),
    index("monthly_cost_run_period_month_idx").on(table.billingPeriodId, table.usageMonth),
    index("monthly_cost_run_confirmed_idx").on(
      table.billingPeriodId,
      table.usageMonth,
      table.confirmedAt,
    ),
  ],
)

export const monthlyCostBaseLine = pgTable(
  "monthly_cost_base_line",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => monthlyCostRun.id, { onDelete: "cascade" }),
    usageMonth: varchar("usage_month", { length: 7 }).notNull(),
    projectId: text("project_id").references(() => crmProject.id, { onDelete: "set null" }),
    tenantPlatformId: varchar("tenant_platform_id", { length: 128 }).notNull(),
    tenantId: text("tenant_id").references(() => billingTenant.id, { onDelete: "set null" }),
    productLine: varchar("product_line", { length: 64 }).notNull(),
    regionCode: varchar("region_code", { length: 64 }).notNull(),
    gpuCardTypeId: text("gpu_card_type_id"),
    gpuCardTypeName: varchar("gpu_card_type_name", { length: 128 }),
    dataCenterId: text("data_center_id"),
    customerFullName: varchar("customer_full_name", { length: 255 }),
    accountManagerStaffId: text("account_manager_staff_id"),
    accountManagerName: varchar("account_manager_name", { length: 128 }),
    opportunitySource: varchar("opportunity_source", { length: 32 }),
    opportunitySourceLabel: varchar("opportunity_source_label", { length: 32 }),
    customerIncentiveType: varchar("customer_incentive_type", { length: 32 }),
    customerIncentiveLabel: varchar("customer_incentive_label", { length: 16 }),
    balanceConsumption: money("balance_consumption").notNull().default("0"),
    balanceCardHours: cardHours("balance_card_hours").notNull().default("0"),
    voucherCardHours: cardHours("voucher_card_hours").notNull().default("0"),
    confirmedRevenueExclTax: money("confirmed_revenue_excl_tax").notNull().default("0"),
    pcSoldDurationCostExclTax: money("pc_sold_duration_cost_excl_tax").notNull().default("0"),
    pcGiftedDurationCostExclTax: money("pc_gifted_duration_cost_excl_tax").notNull().default("0"),
    pcGrossProfit: money("pc_gross_profit").notNull().default("0"),
    spSoldDurationCostExclTax: money("sp_sold_duration_cost_excl_tax").notNull().default("0"),
    spGiftedDurationCostExclTax: money("sp_gifted_duration_cost_excl_tax").notNull().default("0"),
    spGrossProfit: money("sp_gross_profit").notNull().default("0"),
    pcSupplierUnitCostId: text("pc_supplier_unit_cost_id"),
    spPlatformCardListPriceId: text("sp_platform_card_list_price_id"),
    spSellPricePerHour: money("sp_sell_price_per_hour"),
    remark: text("remark"),
    metadata: jsonb("metadata").notNull().default({}),
    ...financeTimestamps,
  },
  (table) => [
    index("monthly_cost_base_line_run_idx").on(table.runId),
    index("monthly_cost_base_line_project_month_idx").on(table.projectId, table.usageMonth),
    index("monthly_cost_base_line_am_month_idx").on(table.accountManagerStaffId, table.usageMonth),
  ],
)

export const monthlyCostCommissionProjectLine = pgTable(
  "monthly_cost_commission_project_line",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => monthlyCostRun.id, { onDelete: "cascade" }),
    usageMonth: varchar("usage_month", { length: 7 }).notNull(),
    costBranch: varchar("cost_branch", { length: 32 }).notNull(),
    projectId: text("project_id")
      .notNull()
      .references(() => crmProject.id, { onDelete: "restrict" }),
    projectName: varchar("project_name", { length: 255 }),
    recipientRole: varchar("recipient_role", { length: 32 }).notNull(),
    recipientDept: varchar("recipient_dept", { length: 16 }),
    accountManagerStaffId: text("account_manager_staff_id"),
    accountManagerName: varchar("account_manager_name", { length: 128 }),
    opportunitySource: varchar("opportunity_source", { length: 32 }),
    customerIncentiveLabel: varchar("customer_incentive_label", { length: 16 }).notNull(),
    grossProfitBase: money("gross_profit_base").notNull().default("0"),
    commissionRate: numeric("commission_rate", { precision: 7, scale: 4 }).notNull(),
    commissionAmount: money("commission_amount").notNull().default("0"),
    ...financeTimestamps,
  },
  (table) => [
    uniqueIndex("monthly_cost_commission_project_line_uk").on(
      table.runId,
      table.projectId,
      table.costBranch,
      table.recipientRole,
      table.customerIncentiveLabel,
    ),
    index("monthly_cost_commission_project_line_run_idx").on(table.runId),
  ],
)

export const monthlyCostCommissionLine = pgTable(
  "monthly_cost_commission_line",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => monthlyCostRun.id, { onDelete: "cascade" }),
    usageMonth: varchar("usage_month", { length: 7 }).notNull(),
    costBranch: varchar("cost_branch", { length: 32 }).notNull(),
    accountManagerStaffId: text("account_manager_staff_id"),
    accountManagerName: varchar("account_manager_name", { length: 128 }).notNull(),
    opportunitySource: varchar("opportunity_source", { length: 32 }).notNull(),
    opportunitySourceLabel: varchar("opportunity_source_label", { length: 32 }),
    customerIncentiveLabel: varchar("customer_incentive_label", { length: 16 }).notNull(),
    grossProfitSum: money("gross_profit_sum").notNull().default("0"),
    commissionRate: numeric("commission_rate", { precision: 7, scale: 4 }).notNull(),
    commissionAmount: money("commission_amount").notNull().default("0"),
    ...financeTimestamps,
  },
  (table) => [
    uniqueIndex("monthly_cost_commission_line_uk").on(
      table.runId,
      table.costBranch,
      table.accountManagerStaffId,
      table.accountManagerName,
      table.opportunitySource,
      table.customerIncentiveLabel,
    ),
    index("monthly_cost_commission_line_run_idx").on(table.runId),
  ],
)

export const monthlyCostDeptPoolLine = pgTable(
  "monthly_cost_dept_pool_line",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => monthlyCostRun.id, { onDelete: "cascade" }),
    usageMonth: varchar("usage_month", { length: 7 }).notNull(),
    costBranch: varchar("cost_branch", { length: 32 }).notNull(),
    recipientDept: varchar("recipient_dept", { length: 16 }).notNull(),
    customerIncentiveLabel: varchar("customer_incentive_label", { length: 16 }).notNull(),
    grossProfitBaseSum: money("gross_profit_base_sum").notNull().default("0"),
    commissionPoolSum: money("commission_pool_sum").notNull().default("0"),
    projectCount: integer("project_count").notNull().default(0),
    poolScopeNote: varchar("pool_scope_note", { length: 255 }),
    ...financeTimestamps,
  },
  (table) => [
    uniqueIndex("monthly_cost_dept_pool_line_uk").on(
      table.runId,
      table.costBranch,
      table.recipientDept,
      table.customerIncentiveLabel,
    ),
    index("monthly_cost_dept_pool_line_run_idx").on(table.runId),
  ],
)

export const monthlyCostDeptPoolProjectLine = pgTable(
  "monthly_cost_dept_pool_project_line",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => monthlyCostRun.id, { onDelete: "cascade" }),
    deptPoolLineId: text("dept_pool_line_id")
      .notNull()
      .references(() => monthlyCostDeptPoolLine.id, { onDelete: "cascade" }),
    usageMonth: varchar("usage_month", { length: 7 }).notNull(),
    costBranch: varchar("cost_branch", { length: 32 }).notNull(),
    recipientDept: varchar("recipient_dept", { length: 16 }).notNull(),
    customerIncentiveLabel: varchar("customer_incentive_label", { length: 16 }).notNull(),
    projectId: text("project_id")
      .notNull()
      .references(() => crmProject.id, { onDelete: "restrict" }),
    projectName: varchar("project_name", { length: 255 }),
    opportunitySource: varchar("opportunity_source", { length: 32 }),
    opportunitySourceLabel: varchar("opportunity_source_label", { length: 32 }),
    accountManagerName: varchar("account_manager_name", { length: 128 }),
    grossProfitBase: money("gross_profit_base").notNull().default("0"),
    commissionPoolAmount: money("commission_pool_amount").notNull().default("0"),
    ...financeTimestamps,
  },
  (table) => [
    uniqueIndex("monthly_cost_dept_pool_project_line_uk").on(
      table.runId,
      table.costBranch,
      table.recipientDept,
      table.customerIncentiveLabel,
      table.projectId,
    ),
    index("monthly_cost_dept_pool_project_line_pool_idx").on(table.deptPoolLineId),
  ],
)

export const monthlyCostDeptContributionWeight = pgTable(
  "monthly_cost_dept_contribution_weight",
  {
    id: text("id").primaryKey(),
    usageMonth: varchar("usage_month", { length: 7 }).notNull(),
    costBranch: varchar("cost_branch", { length: 32 }),
    recipientDept: varchar("recipient_dept", { length: 16 }).notNull(),
    customerIncentiveLabel: varchar("customer_incentive_label", { length: 16 }).notNull(),
    staffId: text("staff_id")
      .notNull()
      .references(() => userStaff.id, { onDelete: "restrict" }),
    weightPercent: numeric("weight_percent", { precision: 7, scale: 4 }).notNull(),
    effectiveFrom: date("effective_from"),
    note: text("note"),
    updatedBy: text("updated_by").references(() => userStaff.id, { onDelete: "set null" }),
    ...financeTimestamps,
  },
  (table) => [
    index("monthly_cost_dept_contribution_weight_month_dept_idx").on(
      table.usageMonth,
      table.recipientDept,
      table.customerIncentiveLabel,
    ),
  ],
)

export const monthlyCostDeptDistributionLine = pgTable(
  "monthly_cost_dept_distribution_line",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => monthlyCostRun.id, { onDelete: "cascade" }),
    deptPoolLineId: text("dept_pool_line_id")
      .notNull()
      .references(() => monthlyCostDeptPoolLine.id, { onDelete: "cascade" }),
    usageMonth: varchar("usage_month", { length: 7 }).notNull(),
    costBranch: varchar("cost_branch", { length: 32 }).notNull(),
    recipientDept: varchar("recipient_dept", { length: 16 }).notNull(),
    customerIncentiveLabel: varchar("customer_incentive_label", { length: 16 }).notNull(),
    staffId: text("staff_id")
      .notNull()
      .references(() => userStaff.id, { onDelete: "restrict" }),
    staffName: varchar("staff_name", { length: 128 }).notNull(),
    weightPercent: numeric("weight_percent", { precision: 7, scale: 4 }).notNull(),
    commissionAmount: money("commission_amount").notNull().default("0"),
    sourcePoolAmount: money("source_pool_amount").notNull().default("0"),
    ...financeTimestamps,
  },
  (table) => [
    uniqueIndex("monthly_cost_dept_distribution_line_uk").on(
      table.runId,
      table.deptPoolLineId,
      table.staffId,
    ),
    index("monthly_cost_dept_distribution_line_run_idx").on(table.runId),
  ],
)

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const billingPeriodRelations = relations(billingPeriod, ({ one, many }) => ({
  importBatches: many(billingPeriodImportBatch),
  tenantBillWindows: many(billingPeriodTenantBillWindow),
  aggCustomerConsumptions: many(billingPeriodAggCustomerConsumption),
  tenantProjectEnrichments: many(billingPeriodTenantProjectEnrichment),
  tenantCostAllocations: many(billingTenantCostAllocation),
  incomeRows: many(platformIncomeMonthly),
  reconciliationReport: one(billingPeriodReconciliationReport),
  operationLogs: many(billingPeriodOperationLog),
  personalIncomeSummaries: many(billingPeriodPersonalIncomeSummary),
  personalIncomeTenantLines: many(billingPeriodPersonalIncomeTenantLine),
  projectMonthlyCostSnapshots: many(projectMonthlyCostSnapshot),
  monthlyCostRuns: many(monthlyCostRun),
}))

export const billingPeriodPersonalIncomeSummaryRelations = relations(
  billingPeriodPersonalIncomeSummary,
  ({ one }) => ({
    billingPeriod: one(billingPeriod, {
      fields: [billingPeriodPersonalIncomeSummary.billingPeriodId],
      references: [billingPeriod.id],
    }),
    tenantBillBatch: one(billingPeriodImportBatch, {
      fields: [billingPeriodPersonalIncomeSummary.tenantBillBatchId],
      references: [billingPeriodImportBatch.id],
      relationName: "personalSummaryTenantBillBatch",
    }),
    baremetalBatch: one(billingPeriodImportBatch, {
      fields: [billingPeriodPersonalIncomeSummary.baremetalBatchId],
      references: [billingPeriodImportBatch.id],
      relationName: "personalSummaryBaremetalBatch",
    }),
  }),
)

export const billingPeriodPersonalIncomeTenantLineRelations = relations(
  billingPeriodPersonalIncomeTenantLine,
  ({ one }) => ({
    billingPeriod: one(billingPeriod, {
      fields: [billingPeriodPersonalIncomeTenantLine.billingPeriodId],
      references: [billingPeriod.id],
    }),
  }),
)

export const billingPeriodTenantBillWindowRelations = relations(
  billingPeriodTenantBillWindow,
  ({ one, many }) => ({
    billingPeriod: one(billingPeriod, {
      fields: [billingPeriodTenantBillWindow.billingPeriodId],
      references: [billingPeriod.id],
    }),
    importBatches: many(billingPeriodImportBatch),
  }),
)

export const billingPeriodImportBatchRelations = relations(
  billingPeriodImportBatch,
  ({ one, many }) => ({
    billingPeriod: one(billingPeriod, {
      fields: [billingPeriodImportBatch.billingPeriodId],
      references: [billingPeriod.id],
    }),
    tenantBillWindow: one(billingPeriodTenantBillWindow, {
      fields: [billingPeriodImportBatch.windowId],
      references: [billingPeriodTenantBillWindow.id],
    }),
    customerConsumptionRows: many(billingPeriodRawCustomerConsumption),
    baremetalOrderRows: many(billingPeriodRawBaremetalOrder),
    tenantBillRows: many(billingPeriodRawTenantBill),
  }),
)

export const platformIncomeMonthlyRelations = relations(
  platformIncomeMonthly,
  ({ one, many }) => ({
    billingPeriod: one(billingPeriod, {
      fields: [platformIncomeMonthly.billingPeriodId],
      references: [billingPeriod.id],
    }),
    tenant: one(billingTenant, {
      fields: [platformIncomeMonthly.tenantId],
      references: [billingTenant.id],
    }),
    supplementaryHistories: many(supplementaryConsumptionHistory),
  }),
)

export const billingTenantCostAllocationRelations = relations(
  billingTenantCostAllocation,
  ({ one }) => ({
    billingPeriod: one(billingPeriod, {
      fields: [billingTenantCostAllocation.billingPeriodId],
      references: [billingPeriod.id],
    }),
    tenant: one(billingTenant, {
      fields: [billingTenantCostAllocation.tenantId],
      references: [billingTenant.id],
    }),
    project: one(crmProject, {
      fields: [billingTenantCostAllocation.projectId],
      references: [crmProject.id],
    }),
    preset: one(tenantProjectCost, {
      fields: [billingTenantCostAllocation.presetId],
      references: [tenantProjectCost.id],
    }),
  }),
)

export const billingPeriodReconciliationReportRelations = relations(
  billingPeriodReconciliationReport,
  ({ one }) => ({
    billingPeriod: one(billingPeriod, {
      fields: [billingPeriodReconciliationReport.billingPeriodId],
      references: [billingPeriod.id],
    }),
  }),
)

export const billingPeriodOperationLogRelations = relations(
  billingPeriodOperationLog,
  ({ one }) => ({
    billingPeriod: one(billingPeriod, {
      fields: [billingPeriodOperationLog.billingPeriodId],
      references: [billingPeriod.id],
    }),
    actor: one(userStaff, {
      fields: [billingPeriodOperationLog.actorId],
      references: [userStaff.id],
    }),
  }),
)

export const projectMonthlyCostSnapshotRelations = relations(
  projectMonthlyCostSnapshot,
  ({ one }) => ({
    billingPeriod: one(billingPeriod, {
      fields: [projectMonthlyCostSnapshot.billingPeriodId],
      references: [billingPeriod.id],
    }),
    tenant: one(billingTenant, {
      fields: [projectMonthlyCostSnapshot.tenantId],
      references: [billingTenant.id],
    }),
    project: one(crmProject, {
      fields: [projectMonthlyCostSnapshot.projectId],
      references: [crmProject.id],
    }),
    customer: one(customer, {
      fields: [projectMonthlyCostSnapshot.customerId],
      references: [customer.id],
    }),
    savedByStaff: one(userStaff, {
      fields: [projectMonthlyCostSnapshot.savedBy],
      references: [userStaff.id],
    }),
  }),
)

export const tenantProjectCostRelations = relations(tenantProjectCost, ({ one }) => ({
  tenant: one(billingTenant, {
    fields: [tenantProjectCost.tenantId],
    references: [billingTenant.id],
  }),
  project: one(crmProject, {
    fields: [tenantProjectCost.projectId],
    references: [crmProject.id],
  }),
}))

// ---------------------------------------------------------------------------
// §4.x 供应商发票管理
// ---------------------------------------------------------------------------

/** 发票抬头（企业或个人信息） */
export const invoiceTitle = pgTable(
  'invoice_title',
  {
    id: text('id').primaryKey(),
    supplierId: text('supplier_id')
      .notNull()
      .references(() => supplier.id, { onDelete: 'cascade' }),
    
    type: varchar('type', { length: 32 }).notNull(),
    invoiceType: varchar('invoice_type', { length: 32 }).notNull(),
    
    companyName: varchar('company_name', { length: 255 }),
    taxNo: varchar('tax_no', { length: 64 }),
    registeredAddress: text('registered_address'),
    registeredPhone: varchar('registered_phone', { length: 32 }),
    bankName: varchar('bank_name', { length: 255 }),
    bankAccount: varchar('bank_account', { length: 64 }),
    
    individualName: varchar('individual_name', { length: 128 }),
    individualIdNo: varchar('individual_id_no', { length: 32 }),
    
    isDefault: boolean('is_default').notNull().default(false),
    status: varchar('status', { length: 32 }).notNull().default('active'),
    
    ...financeTimestamps,
  },
  (table) => [
    index('invoice_title_supplier_id_idx').on(table.supplierId),
    index('invoice_title_tax_no_idx').on(table.taxNo),
  ],
)

/** 发票申请 */
export const invoiceRequest = pgTable(
  'invoice_request',
  {
    id: text('id').primaryKey(),
    supplierId: text('supplier_id')
      .notNull()
      .references(() => supplier.id, { onDelete: 'cascade' }),
    
    billMonthlyId: text('bill_monthly_id')
      .notNull()
      .references(() => supplierBill.id, { onDelete: 'restrict' }),
    
    invoiceTitleId: text('invoice_title_id')
      .notNull()
      .references(() => invoiceTitle.id, { onDelete: 'restrict' }),
    
    invoiceType: varchar('invoice_type', { length: 32 }).notNull(),
    
    requestAmount: money('request_amount').notNull(),
    
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    
    reviewedBy: text('reviewed_by').references(() => userStaff.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewRemark: text('review_remark'),
    rejectionReason: text('rejection_reason'),
    
    supplierRemark: text('supplier_remark'),
    
    ...financeTimestamps,
  },
  (table) => [
    index('invoice_request_supplier_id_idx').on(table.supplierId),
    index('invoice_request_bill_monthly_id_idx').on(table.billMonthlyId),
    index('invoice_request_status_idx').on(table.status),
    // W-21：一笔账单同时只能有一张有效发票申请。
    // 此前「已申请发票」只靠应用层先查后插，存在 TOCTOU 窗口 —— 两个并发请求
    // 都能通过检查，生成两张金额相同的发票申请，财务侧重复开票。
    // 用部分唯一索引把约束下沉到数据库：cancelled / rejected 视为终态，
    // 允许对同一账单重新申请（补开票）。
    uniqueIndex('invoice_request_active_bill_uk')
      .on(table.billMonthlyId)
      .where(
        sql`${table.status} NOT IN ('cancelled', 'rejected')`,
      ),
  ],
)

/** 开具的发票 */
export const invoice = pgTable(
  'invoice',
  {
    id: text('id').primaryKey(),
    invoiceRequestId: text('invoice_request_id')
      .notNull()
      .references(() => invoiceRequest.id, { onDelete: 'restrict' }),
    supplierId: text('supplier_id')
      .notNull()
      .references(() => supplier.id, { onDelete: 'cascade' }),
    
    invoiceNo: varchar('invoice_no', { length: 64 }).notNull().unique(),
    invoiceCode: varchar('invoice_code', { length: 64 }),
    invoiceType: varchar('invoice_type', { length: 32 }).notNull(),
    
    totalAmount: money('total_amount').notNull(),
    taxAmount: money('tax_amount').notNull(),
    amountWithoutTax: money('amount_without_tax').notNull(),
    taxRate: numeric('tax_rate', { precision: 5, scale: 4 }).notNull(),
    
    issuerName: varchar('issuer_name', { length: 128 }),
    issuerTaxNo: varchar('issuer_tax_no', { length: 64 }),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull(),
    
    pdfUrl: varchar('pdf_url', { length: 1024 }),
    pdfStorageKey: varchar('pdf_storage_key', { length: 512 }),

    // 发票附件元数据。W-22 起附件同时支持图片与 PDF，`pdf_url` / `pdf_storage_key`
    // 两列沿用旧名以兼容既有数据，新增元数据统一用 `file_*` 前缀。
    fileMimeType: varchar('file_mime_type', { length: 128 }),
    fileSize: integer('file_size'),
    fileOriginalName: varchar('file_original_name', { length: 255 }),

    voidStatus: varchar('void_status', { length: 32 }).notNull().default('normal'),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidReason: text('void_reason'),
    redFlushInvoiceId: text('red_flush_invoice_id').references((): AnyPgColumn => invoice.id),
    
    externalInvoiceId: varchar('external_invoice_id', { length: 128 }),
    
    ...financeTimestamps,
  },
  (table) => [
    uniqueIndex('invoice_invoice_no_uk').on(table.invoiceNo),
    index('invoice_supplier_id_idx').on(table.supplierId),
    index('invoice_issued_at_idx').on(table.issuedAt),
    // 「一笔申请同时只能有一张有效发票」必须在数据库层强制，并发重复开票不能只靠
    // 应用层检查。原先用的是**全量** UNIQUE（0017 迁移的 invoice_invoice_request_id_key），
    // 它会把已作废的发票也算进去，导致作废后无法补开 —— 补开时 23505 冲突，
    // 运营只能看到「发票已开具」这种误导性报错。
    //
    // 因此改为**部分唯一索引**：仅 void_status = 'normal' 的行参与唯一性约束。
    // 这样未作废时依然严格「一申请一票」，作废后同一申请可以重新开票。
    uniqueIndex('invoice_active_request_uk')
      .on(table.invoiceRequestId)
      .where(sql`${table.voidStatus} = 'normal'`),
  ],
)

/** 发票明细（P1） */
export const invoiceLineItem = pgTable(
  'invoice_line_item',
  {
    id: text('id').primaryKey(),
    invoiceId: text('invoice_id')
      .notNull()
      .references(() => invoice.id, { onDelete: 'cascade' }),
    
    lineOrder: integer('line_order').notNull(),
    itemName: varchar('item_name', { length: 255 }).notNull(),
    spec: varchar('spec', { length: 128 }),
    unit: varchar('unit', { length: 32 }),
    quantity: numeric('quantity', { precision: 15, scale: 4 }),
    unitPrice: money('unit_price'),
    amount: money('amount').notNull(),
    taxRate: numeric('tax_rate', { precision: 5, scale: 4 }),
    taxAmount: money('tax_amount'),
  },
  (table) => [
    index('invoice_line_item_invoice_id_idx').on(table.invoiceId),
  ],
)

export const invoiceTitleRelations = relations(invoiceTitle, ({ many }) => ({
  invoiceRequests: many(invoiceRequest),
}))

export const invoiceRequestRelations = relations(invoiceRequest, ({ one }) => ({
  invoiceTitle: one(invoiceTitle, {
    fields: [invoiceRequest.invoiceTitleId],
    references: [invoiceTitle.id],
  }),
  reviewer: one(userStaff, {
    fields: [invoiceRequest.reviewedBy],
    references: [userStaff.id],
  }),
  invoice: one(invoice, {
    fields: [invoiceRequest.id],
    references: [invoice.invoiceRequestId],
  }),
}))

export const invoiceRelations = relations(invoice, ({ one, many }) => ({
  invoiceRequest: one(invoiceRequest, {
    fields: [invoice.invoiceRequestId],
    references: [invoiceRequest.id],
  }),
  lineItems: many(invoiceLineItem),
  redFlushInvoice: one(invoice, {
    fields: [invoice.redFlushInvoiceId],
    references: [invoice.id],
  }),
}))

export const invoiceLineItemRelations = relations(invoiceLineItem, ({ one }) => ({
  invoice: one(invoice, {
    fields: [invoiceLineItem.invoiceId],
    references: [invoice.id],
  }),
}))

// ---------------------------------------------------------------------------
// 类型导出
// ---------------------------------------------------------------------------

export type BillingPeriodRow = typeof billingPeriod.$inferSelect
export type NewBillingPeriodRow = typeof billingPeriod.$inferInsert
export type PlatformIncomeMonthlyRow = typeof platformIncomeMonthly.$inferSelect
export type BillingPeriodImportBatchRow = typeof billingPeriodImportBatch.$inferSelect
export type BillingPeriodTenantBillWindowRow = typeof billingPeriodTenantBillWindow.$inferSelect
export type BillingPeriodRawCustomerConsumptionRow =
  typeof billingPeriodRawCustomerConsumption.$inferSelect
export type BillingPeriodAggCustomerConsumptionRow =
  typeof billingPeriodAggCustomerConsumption.$inferSelect
export type BillingPeriodRawBaremetalOrderRow =
  typeof billingPeriodRawBaremetalOrder.$inferSelect
export type BillingPeriodRawTenantBillRow = typeof billingPeriodRawTenantBill.$inferSelect
export type BillingPeriodTenantProjectEnrichmentRow =
  typeof billingPeriodTenantProjectEnrichment.$inferSelect
export type BillingTenantCostAllocationRow = typeof billingTenantCostAllocation.$inferSelect
export type TenantProjectCostRow = typeof tenantProjectCost.$inferSelect
export type ProjectMonthlyCostSnapshotRow = typeof projectMonthlyCostSnapshot.$inferSelect
export type BillingPeriodReconciliationReportRow =
  typeof billingPeriodReconciliationReport.$inferSelect
export type BillingPeriodOperationLogRow = typeof billingPeriodOperationLog.$inferSelect
export type BillingPeriodPersonalIncomeSummaryRow =
  typeof billingPeriodPersonalIncomeSummary.$inferSelect
export type BillingPeriodPersonalIncomeTenantLineRow =
  typeof billingPeriodPersonalIncomeTenantLine.$inferSelect
export type PersonalIncomeSummaryKind =
  | "enterprise_project"
  | "non_project"
  | "blacklist"
  | "internal"
export type PersonalIncomeSegment = PersonalIncomeSummaryKind
export type MonthlyCostRunRow = typeof monthlyCostRun.$inferSelect
export type MonthlyCostBaseLineRow = typeof monthlyCostBaseLine.$inferSelect
export type MonthlyCostCommissionProjectLineRow =
  typeof monthlyCostCommissionProjectLine.$inferSelect
export type MonthlyCostCommissionLineRow = typeof monthlyCostCommissionLine.$inferSelect
export type MonthlyCostDeptPoolLineRow = typeof monthlyCostDeptPoolLine.$inferSelect
export type MonthlyCostDeptPoolProjectLineRow =
  typeof monthlyCostDeptPoolProjectLine.$inferSelect
export type InvoiceTitleRow = typeof invoiceTitle.$inferSelect
export type NewInvoiceTitleRow = typeof invoiceTitle.$inferInsert
export type InvoiceRequestRow = typeof invoiceRequest.$inferSelect
export type NewInvoiceRequestRow = typeof invoiceRequest.$inferInsert
export type InvoiceRow = typeof invoice.$inferSelect
export type NewInvoiceRow = typeof invoice.$inferInsert
export type InvoiceLineItemRow = typeof invoiceLineItem.$inferSelect
export type NewInvoiceLineItemRow = typeof invoiceLineItem.$inferInsert
