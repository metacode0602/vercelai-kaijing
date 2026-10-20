/**
 * 商户域表结构 — 设计依据 merchant-management-design.md v1.7
 *
 * v1.7：事实表冗余 merchant_id（= tenant.merchant_id，缺省共绩）
 * v1.6：废弃 tenant_merchant（2026-10-06 已删 schema 定义并 DROP 空表）；归属改到 tenant.merchant_id
 * 新增 merchant_bill / merchant_bill_daily*
 */

import { relations, sql } from "drizzle-orm"
import { organization, user } from "./auth-schema"
import {
  bigint,
  boolean,
  check,
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
} from "drizzle-orm/pg-core"
import { billingTenant, userStaff } from "./crm-schema"
import { platformCardListPrice } from "./platform-pricing-schema"
import { dataCenter, gpuCardType } from "./supply-schema"

const money = (name: string) => numeric(name, { precision: 15, scale: 4 })

const merchantTimestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}

/**
 * 部署形态（D3-1）：4 常量，由 3 个能力 flag 派生，优先级 `oem > iframe > promo > direct`。
 * `access_mode` 列保留作为快照，读取一律走派生值（D3-2=A）。
 */
export const MERCHANT_ACCESS_MODES = ["direct", "promo", "oem", "iframe"] as const
export type MerchantAccessMode = (typeof MERCHANT_ACCESS_MODES)[number]

export const merchant = pgTable(
  "merchant",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .references(() => organization.id, { onDelete: "set null" }),
    platformMerchantId: integer("platform_merchant_id"),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    companyFullName: varchar("company_full_name", { length: 512 }).notNull(),
    unifiedSocialCreditCode: varchar("unified_social_credit_code", { length: 18 }),
    merchantMark: varchar("merchant_mark", { length: 128 }),
    accessMode: varchar("access_mode", { length: 16 }).notNull().default("oem"),
    type: varchar("type", { length: 32 }).notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    status: varchar("status", { length: 32 }).notNull(),
    contactUser: varchar("contact_user", { length: 128 }),
    contactPhone: varchar("contact_phone", { length: 32 }),
    remark: text("remark"),
    platformSyncedAt: timestamp("platform_synced_at", { withTimezone: true }),
    adminUrl: varchar("admin_url", { length: 1024 }),
    consoleUrl: varchar("console_url", { length: 1024 }),
    website: varchar("website", { length: 1024 }),
    promoEnabled: boolean("promo_enabled").notNull().default(false),
    oemEnabled: boolean("oem_enabled").notNull().default(false),
    /** iFrame 接入能力开关（D3-1 新增，参与 access_mode 派生） */
    iframeEnabled: boolean("iframe_enabled").notNull().default(false),
    /**
     * 资金模式（权威源）—— 承载「钱往哪流」，与部署形态 access_mode 解耦。
     *   prepay     = 形态 B/C（oem / iframe）：商户预付，平台永不向其付现
     *   commission = 形态 A（promo）：商户不预付，平台向其付现佣金
     * 资金性质由此派生（deriveFundNature），不再单独存字段。
     * 依据：apps/merchant/content/design/merchant-funding-addendum.md §2（DEC-F1/F2/F9）
     */
    fundingMode: varchar("funding_mode", { length: 16 }).notNull().default("prepay"),
    /** 绑定的佣金阶梯档位（commission 模式生效），空 = 用 T1 */
    commissionTierId: text("commission_tier_id").references(() => merchantCommissionTier.id, {
      onDelete: "set null",
    }),
    /** 商户级费率覆盖（空 = 用档位费率），DEC-F8 允许按商户单独配置 */
    commissionRateOverride: numeric("commission_rate_override", { precision: 7, scale: 4 }),
    ...merchantTimestamps,
  },
  (table) => [
    uniqueIndex("merchant_org_id_uk").on(table.organizationId).where(sql`organization_id IS NOT NULL`),
    uniqueIndex("merchant_platform_merchant_id_uk").on(table.platformMerchantId).where(sql`platform_merchant_id IS NOT NULL`),
    uniqueIndex("merchant_code_uk").on(table.code),
    uniqueIndex("merchant_uscc_uk").on(table.unifiedSocialCreditCode).where(sql`unified_social_credit_code IS NOT NULL`),
    uniqueIndex("merchant_is_default_uk").on(table.isDefault).where(sql`is_default = true`),
    index("merchant_status_idx").on(table.status),
    index("merchant_name_idx").on(table.name),
    index("merchant_funding_mode_idx").on(table.fundingMode),
    index("merchant_commission_tier_idx").on(table.commissionTierId),
    // 资金模式只允许两个取值。缺该约束会让拼错的模式静默落入 prepay 分支，
    // 按「永不向商户付现」的口径记账，是不可逆的资金事故。
    check(
      "merchant_funding_mode_check",
      sql`${table.fundingMode} IN ('prepay', 'commission')`,
    ),
    // 费率覆盖必须是 0~1 的比例，禁止传入百分数（20 而非 0.2）
    check(
      "merchant_commission_rate_override_check",
      sql`${table.commissionRateOverride} IS NULL OR (${table.commissionRateOverride} >= 0 AND ${table.commissionRateOverride} <= 1)`,
    ),
  ],
)

/** 商户联系人（多值）；主联系人镜像至 merchant.contact_* */
export const merchantContact = pgTable(
  "merchant_contact",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 128 }).notNull(),
    phone: varchar("phone", { length: 32 }),
    email: varchar("email", { length: 255 }),
    wechatId: varchar("wechat_id", { length: 128 }),
    title: varchar("title", { length: 64 }),
    isPrimary: boolean("is_primary").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    remark: text("remark"),
    ...merchantTimestamps,
  },
  (table) => [
    index("merchant_contact_merchant_id_idx").on(table.merchantId),
    index("merchant_contact_merchant_sort_idx").on(table.merchantId, table.sortOrder),
    uniqueIndex("merchant_contact_primary_uk")
      .on(table.merchantId)
      .where(sql`${table.isPrimary} = true`),
  ],
)

export const merchantPaymentNode = pgTable(
  "merchant_payment_node",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 128 }).notNull(),
    expectedAmount: money("expected_amount").notNull(),
    dueDate: date("due_date").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    remark: text("remark"),
    /** 关联商户月度账单账期 YYYY-MM，可选 */
    billMonth: varchar("bill_month", { length: 7 }),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    createdByStaffId: text("created_by_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    updatedByStaffId: text("updated_by_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    ...merchantTimestamps,
  },
  (table) => [
    index("merchant_payment_node_merchant_sort_idx").on(table.merchantId, table.sortOrder),
    index("merchant_payment_node_merchant_status_idx").on(table.merchantId, table.status),
    index("merchant_payment_node_bill_month_idx").on(table.merchantId, table.billMonth),
  ],
)

export const merchantPaymentNodeAuditLog = pgTable(
  "merchant_payment_node_audit_log",
  {
    id: text("id").primaryKey(),
    paymentNodeId: text("payment_node_id")
      .notNull()
      .references(() => merchantPaymentNode.id, { onDelete: "cascade" }),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "restrict" }),
    action: varchar("action", { length: 16 }).notNull(),
    operatorStaffId: text("operator_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    operatorName: varchar("operator_name", { length: 128 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    changes: jsonb("changes"),
    remark: text("remark"),
  },
  (table) => [
    index("merchant_payment_node_audit_node_idx").on(table.paymentNodeId, table.occurredAt),
    index("merchant_payment_node_audit_merchant_idx").on(table.merchantId, table.occurredAt),
  ],
)

export const merchantRechargeRecord = pgTable(
  "merchant_recharge_record",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "restrict" }),
    paymentNodeId: text("payment_node_id").references(() => merchantPaymentNode.id, {
      onDelete: "set null",
    }),
    amount: money("amount").notNull(),
    paymentMethod: varchar("payment_method", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    transactionId: varchar("transaction_id", { length: 128 }),
    rechargeDate: date("recharge_date").notNull(),
    remark: text("remark"),
    /** 关联商户月度账单账期 YYYY-MM，可选 */
    billMonth: varchar("bill_month", { length: 7 }),
    source: varchar("source", { length: 32 }).notNull().default("manual"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdByStaffId: text("created_by_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    updatedByStaffId: text("updated_by_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    ...merchantTimestamps,
  },
  (table) => [
    index("merchant_recharge_merchant_date_idx").on(table.merchantId, table.rechargeDate),
    index("merchant_recharge_merchant_status_idx").on(table.merchantId, table.status),
    index("merchant_recharge_payment_node_idx").on(table.paymentNodeId),
    index("merchant_recharge_bill_month_idx").on(table.merchantId, table.billMonth),
  ],
)

export const merchantRechargeAttachment = pgTable(
  "merchant_recharge_attachment",
  {
    id: text("id").primaryKey(),
    rechargeId: text("recharge_id")
      .notNull()
      .references(() => merchantRechargeRecord.id, { onDelete: "cascade" }),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 128 }).notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull(),
    storageUri: varchar("storage_uri", { length: 1024 }).notNull(),
    uploadedByStaffId: text("uploaded_by_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("merchant_recharge_attachment_recharge_id_idx").on(table.rechargeId)],
)

export const merchantRechargeAuditLog = pgTable(
  "merchant_recharge_audit_log",
  {
    id: text("id").primaryKey(),
    rechargeId: text("recharge_id")
      .notNull()
      .references(() => merchantRechargeRecord.id, { onDelete: "cascade" }),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "restrict" }),
    action: varchar("action", { length: 16 }).notNull(),
    operatorStaffId: text("operator_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    operatorName: varchar("operator_name", { length: 128 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    changes: jsonb("changes"),
    remark: text("remark"),
  },
  (table) => [
    index("merchant_recharge_audit_recharge_idx").on(table.rechargeId, table.occurredAt),
    index("merchant_recharge_audit_merchant_idx").on(table.merchantId, table.occurredAt),
  ],
)

// ---------------------------------------------------------------------------
// 资金域：收款账户 / 佣金阶梯 / 财务配置
// 依据：apps/merchant/content/design/merchant-funding-addendum.md §3、§4.4、§2.4
// ---------------------------------------------------------------------------

/** 收款账户主体类型：merchant = 商户，supplier = 供应商 */
export const PAYOUT_ACCOUNT_OWNER_TYPES = ["merchant", "supplier"] as const
export type PayoutAccountOwnerType = (typeof PAYOUT_ACCOUNT_OWNER_TYPES)[number]

/** 收款账户状态：pending_review 提交待审 / active 生效 / rejected 驳回 / disabled 停用 */
export const PAYOUT_ACCOUNT_STATUSES = [
  "pending_review",
  "active",
  "rejected",
  "disabled",
] as const
export type PayoutAccountStatus = (typeof PAYOUT_ACCOUNT_STATUSES)[number]

/** 账户性质：enterprise 企业户 / personal 个人户 */
export const PAYOUT_ACCOUNT_TYPES = ["enterprise", "personal"] as const
export type PayoutAccountType = (typeof PAYOUT_ACCOUNT_TYPES)[number]

/**
 * 商户 / 供应商收款账户（DEC-F3）
 *
 * 与 `bank_account`（平台自有固定收款账户，仅平台员工可见、DBA 维护）严格区分：
 * 平台**永不**在此表写商户/供应商账户，商户**永不**往 bank_account 写自己的户。
 *
 * 多态 owner_id 刻意不加外键 —— 加 FK 需两个可空列 + 两个触发器，收益不抵复杂度。
 * 约束改由 dataaccess 层强制：按 owner_type 分派，且 owner_type 不接受用户输入。
 *
 * 状态机（§3.4，商户改户是资金诈骗入口，禁止自助即时生效）：
 *   pending_review → active | rejected；active → disabled；任何变更 active → pending_review
 */
export const merchantPayoutAccount = pgTable(
  "merchant_payout_account",
  {
    id: text("id").primaryKey(),
    ownerType: varchar("owner_type", { length: 16 }).notNull(),
    ownerId: text("owner_id").notNull(),
    /** 户名，须与营业执照主体一致；打款打错户名会被退回且无法预先校验 */
    accountName: varchar("account_name", { length: 255 }).notNull(),
    accountNo: varchar("account_no", { length: 64 }).notNull(),
    bankName: varchar("bank_name", { length: 255 }).notNull(),
    bankBranch: varchar("bank_branch", { length: 255 }),
    /** 联行号，打款路由 */
    bankCode: varchar("bank_code", { length: 32 }),
    accountType: varchar("account_type", { length: 16 }).notNull(),
    currency: varchar("currency", { length: 8 }).notNull().default("CNY"),
    status: varchar("status", { length: 16 }).notNull().default("pending_review"),
    isDefault: boolean("is_default").notNull().default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedByStaffId: text("verified_by_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    rejectReason: text("reject_reason"),
    createdByStaffId: text("created_by_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    remark: text("remark"),
    ...merchantTimestamps,
  },
  (table) => [
    // 每户至多一个默认有效账户（打款只认 is_default AND status='active'）
    uniqueIndex("merchant_payout_account_default_uk")
      .on(table.ownerType, table.ownerId)
      .where(sql`${table.isDefault} = true AND ${table.status} = 'active'`),
    index("merchant_payout_account_owner_idx").on(table.ownerType, table.ownerId, table.status),
    // 运营审核队列：按状态 + 时间排队
    index("merchant_payout_account_review_idx").on(table.status, table.createdAt),
    check(
      "merchant_payout_account_owner_type_check",
      sql`${table.ownerType} IN ('merchant', 'supplier')`,
    ),
    check(
      "merchant_payout_account_type_check",
      sql`${table.accountType} IN ('enterprise', 'personal')`,
    ),
    check(
      "merchant_payout_account_status_check",
      sql`${table.status} IN ('pending_review', 'active', 'rejected', 'disabled')`,
    ),
  ],
)

/**
 * 收款账户变更审计（DEC-F12）
 * 字段结构对齐 merchantRechargeAuditLog：operatorName 反规范化（人员删除后留痕仍在），
 * occurredAt notNull 且**无** defaultNow()，由调用方显式赋值。
 */
export const merchantPayoutAccountAuditLog = pgTable(
  "merchant_payout_account_audit_log",
  {
    id: text("id").primaryKey(),
    payoutAccountId: text("payout_account_id")
      .notNull()
      .references(() => merchantPayoutAccount.id, { onDelete: "cascade" }),
    ownerType: varchar("owner_type", { length: 16 }).notNull(),
    ownerId: text("owner_id").notNull(),
    action: varchar("action", { length: 24 }).notNull(),
    operatorStaffId: text("operator_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    operatorName: varchar("operator_name", { length: 128 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    changes: jsonb("changes"),
    remark: text("remark"),
  },
  (table) => [
    index("merchant_payout_account_audit_account_idx").on(
      table.payoutAccountId,
      table.occurredAt,
    ),
    index("merchant_payout_account_audit_owner_idx").on(table.ownerType, table.ownerId, table.occurredAt),
  ],
)

/**
 * 佣金阶梯档位（DEC-F8/F13）
 * 平台定义档位，商户绑定某一档；commission_rate_override 可按商户单独覆盖。
 * 种子：T1 5% / T2 10% / T3 20%，月消费额分界 ¥10,000 与 ¥100,000。
 * 区间只允许向前扩档（新增 T4…），不得就地改写既有边界，
 * 否则已计提的 commission_rate 快照会与档位定义对不上。
 */
export const merchantCommissionTier = pgTable(
  "merchant_commission_tier",
  {
    id: text("id").primaryKey(),
    tierCode: varchar("tier_code", { length: 32 }).notNull(),
    tierName: varchar("tier_name", { length: 64 }).notNull(),
    /** 月消费额下界（含） */
    monthlyBasisMin: money("monthly_basis_min").notNull(),
    /** 月消费额上界（不含），NULL = 无上限 */
    monthlyBasisMax: money("monthly_basis_max"),
    /** 费率，比例口径（0.05 = 5%），禁止百分数 */
    commissionRate: numeric("commission_rate", { precision: 7, scale: 4 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    status: varchar("status", { length: 16 }).notNull().default("active"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    ...merchantTimestamps,
  },
  (table) => [
    uniqueIndex("merchant_commission_tier_code_uk").on(table.tierCode),
    index("merchant_commission_tier_status_sort_idx").on(table.status, table.sortOrder),
    check(
      "merchant_commission_tier_rate_check",
      sql`${table.commissionRate} >= 0 AND ${table.commissionRate} <= 1`,
    ),
    // 上界存在时必须严格大于下界；无上界时为最高档
    check(
      "merchant_commission_tier_range_check",
      sql`${table.monthlyBasisMax} IS NULL OR ${table.monthlyBasisMax} > ${table.monthlyBasisMin}`,
    ),
  ],
)

/**
 * 财务配置（DEC-F14）—— 运营可在 apps/web 改，不需发版。
 * 刻意不用通用 KV：无类型、无审计、且当前只有一个配置项。
 * 新增配置项按行扩展。
 */
export const merchantFinanceConfig = pgTable(
  "merchant_finance_config",
  {
    configKey: varchar("config_key", { length: 64 }).primaryKey(),
    numericValue: money("numeric_value").notNull(),
    remark: text("remark"),
    updatedByStaffId: text("updated_by_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [check("merchant_finance_config_value_check", sql`${table.numericValue} >= 0`)],
)

/** 财务配置变更审计；字段结构同样对齐 merchantRechargeAuditLog */
export const merchantFinanceConfigAuditLog = pgTable(
  "merchant_finance_config_audit_log",
  {
    id: text("id").primaryKey(),
    configKey: varchar("config_key", { length: 64 }).notNull(),
    oldValue: money("old_value"),
    newValue: money("new_value").notNull(),
    operatorStaffId: text("operator_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    operatorName: varchar("operator_name", { length: 128 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    remark: text("remark"),
  },
  (table) => [
    index("merchant_finance_config_audit_key_idx").on(table.configKey, table.occurredAt),
  ],
)

export const merchantActivity = pgTable(
  "merchant_activity",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 64 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    authorStaffId: text("author_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    authorName: varchar("author_name", { length: 128 }).notNull(),
    authorRole: varchar("author_role", { length: 32 }).notNull(),
    refDomain: varchar("ref_domain", { length: 64 }),
    refId: text("ref_id"),
    metadata: jsonb("metadata"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("merchant_activity_merchant_occurred_idx").on(table.merchantId, table.occurredAt),
    index("merchant_activity_ref_idx").on(table.refDomain, table.refId),
  ],
)

export const merchantDatacenterRegion = pgTable(
  "merchant_datacenter_region",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "restrict" }),
    dataCenterId: text("data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "restrict" }),
    displayName: varchar("display_name", { length: 255 }),
    regionCode: varchar("region_code", { length: 128 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    availableGpuQuota: integer("available_gpu_quota").notNull().default(-1),
    sortOrder: integer("sort_order").notNull().default(0),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    updatedByStaffId: text("updated_by_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    ...merchantTimestamps,
  },
  (table) => [
    uniqueIndex("merchant_datacenter_region_merchant_dc_active_uk")
      .on(table.merchantId, table.dataCenterId)
      .where(sql`effective_to IS NULL`),
    index("merchant_datacenter_region_merchant_status_idx").on(table.merchantId, table.status),
    index("merchant_datacenter_region_data_center_id_idx").on(table.dataCenterId),
  ],
)

export const merchantDatacenterCardType = pgTable(
  "merchant_datacenter_card_type",
  {
    id: text("id").primaryKey(),
    merchantDatacenterRegionId: text("merchant_datacenter_region_id")
      .notNull()
      .references(() => merchantDatacenterRegion.id, { onDelete: "cascade" }),
    gpuCardTypeId: text("gpu_card_type_id")
      .notNull()
      .references(() => gpuCardType.id, { onDelete: "restrict" }),
    status: varchar("status", { length: 32 }).notNull().default("enabled"),
    ...merchantTimestamps,
  },
  (table) => [
    uniqueIndex("merchant_datacenter_card_type_region_card_uk").on(
      table.merchantDatacenterRegionId,
      table.gpuCardTypeId,
    ),
    index("merchant_datacenter_card_type_region_id_idx").on(table.merchantDatacenterRegionId),
  ],
)

export const merchantPurchasePrice = pgTable(
  "merchant_purchase_price",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "restrict" }),
    dataCenterId: text("data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "restrict" }),
    gpuCardTypeId: text("gpu_card_type_id")
      .notNull()
      .references(() => gpuCardType.id, { onDelete: "restrict" }),
    productLine: varchar("product_line", { length: 32 }).notNull(),
    billingUnit: varchar("billing_unit", { length: 16 }).notNull().default("hour"),
    purchasePrice: money("purchase_price").notNull(),
    currency: varchar("currency", { length: 8 }).notNull().default("CNY"),
    source: varchar("source", { length: 32 }).notNull(),
    platformListPriceId: text("platform_list_price_id").references(() => platformCardListPrice.id, {
      onDelete: "set null",
    }),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    status: varchar("status", { length: 32 }).notNull(),
    remark: text("remark"),
    updatedByStaffId: text("updated_by_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    ...merchantTimestamps,
  },
  (table) => [
    uniqueIndex("merchant_purchase_price_active_uk")
      .on(
        table.merchantId,
        table.dataCenterId,
        table.gpuCardTypeId,
        table.productLine,
        table.billingUnit,
      )
      .where(sql`${table.effectiveTo} IS NULL AND ${table.status} = 'active'`),
    index("merchant_purchase_price_merchant_dc_idx").on(table.merchantId, table.dataCenterId),
    index("merchant_purchase_price_gpu_card_type_id_idx").on(table.gpuCardTypeId),
  ],
)

export const merchantPurchasePriceRecord = pgTable(
  "merchant_purchase_price_record",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "restrict" }),
    dataCenterId: text("data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "restrict" }),
    gpuCardTypeId: text("gpu_card_type_id")
      .notNull()
      .references(() => gpuCardType.id, { onDelete: "restrict" }),
    productLine: varchar("product_line", { length: 32 }).notNull(),
    billingUnit: varchar("billing_unit", { length: 16 }).notNull().default("hour"),
    purchasePrice: money("purchase_price").notNull(),
    platformListPriceId: text("platform_list_price_id").references(() => platformCardListPrice.id, {
      onDelete: "set null",
    }),
    source: varchar("source", { length: 32 }).notNull(),
    effectiveFrom: date("effective_from").notNull(),
    updatedByStaffId: text("updated_by_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("merchant_purchase_price_record_uk").on(
      table.merchantId,
      table.dataCenterId,
      table.gpuCardTypeId,
      table.productLine,
      table.billingUnit,
    ),
    index("merchant_purchase_price_record_merchant_id_idx").on(table.merchantId),
    index("merchant_purchase_price_record_data_center_id_idx").on(table.dataCenterId),
  ],
)

/**
 * 非卡时产品线进货价（merchant-billing-system-design.md §3.2）
 *
 * 与 merchant_purchase_price 分工：
 *   merchant_purchase_price        —— GPU 卡时类，粒度 商户×机房×卡型×产品线×计量单位
 *   merchant_product_purchase_price —— 非卡时类（maas_token/juicefs/share_storage/harbor…），
 *                                       粒度 商户×产品线，支持分成与固定价两种模型
 */
export const merchantProductPurchasePrice = pgTable(
  "merchant_product_purchase_price",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "restrict" }),
    productLine: varchar("product_line", { length: 32 }).notNull(),
    /** revenue_share（分成）/ fixed_price（固定价格） */
    pricingModel: varchar("pricing_model", { length: 16 }).notNull(),
    /** 分成比例 0<x<=1；merchant_billing_design 用百分数示例，落库统一存小数 */
    commissionRate: numeric("commission_rate", { precision: 7, scale: 4 }),
    /** 固定单价；pricing_model='fixed_price' 时必填 */
    fixedUnitPrice: money("fixed_unit_price"),
    billingUnit: varchar("billing_unit", { length: 16 }).notNull(),
    currency: varchar("currency", { length: 8 }).notNull().default("CNY"),
    /** manual（CRM 手工）/ platform_sync（平台同步） */
    source: varchar("source", { length: 32 }).notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    /** active / archived */
    status: varchar("status", { length: 32 }).notNull(),
    remark: text("remark"),
    updatedByStaffId: text("updated_by_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    ...merchantTimestamps,
  },
  (table) => [
    uniqueIndex("merchant_product_purchase_price_active_uk")
      .on(table.merchantId, table.productLine)
      .where(sql`${table.effectiveTo} IS NULL AND ${table.status} = 'active'`),
    index("merchant_product_purchase_price_merchant_idx").on(table.merchantId),
    check(
      "merchant_product_purchase_price_pricing_model_ck",
      sql`${table.pricingModel} in ('revenue_share', 'fixed_price')`,
    ),
  ],
)

/** 商户级客户经理分配（主责 AM，含历史段） */
export const merchantAccountManagerAssignment = pgTable(
  "merchant_account_manager_assignment",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "cascade" }),
    userStaffId: text("user_staff_id")
      .notNull()
      .references(() => userStaff.id, { onDelete: "restrict" }),
    roleType: varchar("role_type", { length: 32 }).notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    remark: text("remark"),
    createdByStaffId: text("created_by_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("merchant_account_manager_assignment_merchant_id_idx").on(table.merchantId),
    index("merchant_account_manager_assignment_user_staff_id_idx").on(table.userStaffId),
  ],
)

export const merchantActivityAttachment = pgTable(
  "merchant_activity_attachment",
  {
    id: text("id").primaryKey(),
    activityId: text("activity_id")
      .notNull()
      .references(() => merchantActivity.id, { onDelete: "cascade" }),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    fileSize: bigint("file_size", { mode: "number" }),
    mimeType: varchar("mime_type", { length: 128 }),
    storageUri: varchar("storage_uri", { length: 1024 }).notNull(),
  },
  (table) => [index("merchant_activity_attachment_activity_id_idx").on(table.activityId)],
)

/**
 * 商户月账单状态机（D4-4=A）：
 *   open → reconciled → confirmed → closed
 *   open/reconciled → disputed（商户申诉）
 *
 * 「确认」= 月度账目确认，不构成付款依据（设计 §5.6 / M-2）。
 */
export const MERCHANT_BILL_STATUSES = [
  /** 账单已生成，对账未完成 */
  "open",
  /** 该月对账单已生成且比对完成 */
  "reconciled",
  /** 商户确认账目无误（只读） */
  "confirmed",
  /** 商户申诉，冻结待运营复核 */
  "disputed",
  /** 运营关闭（终态） */
  "closed",
] as const
export type MerchantBillStatus = (typeof MERCHANT_BILL_STATUSES)[number]

/** 商户月账单（rollup from tenant_bill*；设计 §5.13） */
export const merchantBill = pgTable(
  "merchant_bill",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "restrict" }),
    billMonth: varchar("bill_month", { length: 7 }).notNull(),
    totalAmount: money("total_amount").notNull(),
    platformCost: money("platform_cost").notNull().default("0"),
    grossProfit: money("gross_profit").notNull().default("0"),
    /** 租户消费中的券抵扣（平台券+商户券合计） */
    couponAmount: money("coupon_amount").notNull(),
    /** 商户券核销面值 —— 毛利扣减项之一（Q9 面值口径） */
    couponCost: money("coupon_cost").notNull().default("0"),
    /** 商户让利额，仅报表展示，不进 grossProfit（Q8=A） */
    discountAmount: money("discount_amount").notNull().default("0"),
    balanceAmount: money("balance_amount").notNull(),
    tenantCount: integer("tenant_count").notNull().default(0),
    status: varchar("status", { length: 32 }).notNull().default("open"),
    source: varchar("source", { length: 32 }).notNull().default("rollup_from_tenant"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    /** status=disputed 时的商户申诉理由（D4-4=A） */
    disputeReason: text("dispute_reason"),
    ...merchantTimestamps,
  },
  (table) => [
    uniqueIndex("merchant_bill_merchant_month_uk").on(table.merchantId, table.billMonth),
    index("merchant_bill_bill_month_idx").on(table.billMonth),
    index("merchant_bill_status_idx").on(table.merchantId, table.status),
  ],
)

/** 商户月账单别名（兼容已有代码引用） */
export const merchantBillMonthly = merchantBill

export const merchantBillDetail = pgTable(
  "merchant_bill_detail",
  {
    id: text("id").primaryKey(),
    merchantBillId: text("merchant_bill_id")
      .notNull()
      .references(() => merchantBill.id, { onDelete: "cascade" }),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "restrict" }),
    billMonth: varchar("bill_month", { length: 7 }).notNull(),
    productLine: varchar("product_line", { length: 64 }).notNull(),
    resourceName: varchar("resource_name", { length: 255 }).notNull(),
    amount: money("amount").notNull(),
    couponAmount: money("coupon_amount").notNull(),
    balanceAmount: money("balance_amount").notNull(),
    type: varchar("type", { length: 32 }).notNull(),
  },
  (table) => [
    uniqueIndex("merchant_bill_detail_bill_pl_uk").on(table.merchantBillId, table.productLine),
    index("merchant_bill_detail_merchant_month_idx").on(table.merchantId, table.billMonth),
  ],
)

/** 商户日账单（rollup from tenant_bill_daily*；设计 §5.13） */
export const merchantBillDaily = pgTable(
  "merchant_bill_daily",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "restrict" }),
    billDate: date("bill_date").notNull(),
    usageDate: date("usage_date").notNull(),
    usageMonth: varchar("usage_month", { length: 7 }).notNull(),
    totalAmount: money("total_amount").notNull(),
    platformCost: money("platform_cost").notNull().default("0"),
    grossProfit: money("gross_profit").notNull().default("0"),
    /** 租户消费中的券抵扣（平台券+商户券合计，平台出账口径） */
    couponAmount: money("coupon_amount").notNull(),
    /** 商户券核销面值 —— 毛利扣减项之一（Q9 面值口径），与 couponAmount 不是同一个东西 */
    couponCost: money("coupon_cost").notNull().default("0"),
    /** 商户让利额 Σ max(0, 刊例价 − 销售价) × 数量，仅报表展示，不进 grossProfit（Q8=A） */
    discountAmount: money("discount_amount").notNull().default("0"),
    balanceAmount: money("balance_amount").notNull(),
    tenantCount: integer("tenant_count").notNull().default(0),
    source: varchar("source", { length: 32 }).notNull().default("rollup_from_tenant"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
    ...merchantTimestamps,
  },
  (table) => [
    uniqueIndex("merchant_bill_daily_merchant_date_uk").on(table.merchantId, table.billDate),
    index("merchant_bill_daily_bill_date_idx").on(table.billDate),
    index("merchant_bill_daily_merchant_month_idx").on(table.merchantId, table.usageMonth),
  ],
)

export const merchantBillDailyDetail = pgTable(
  "merchant_bill_daily_detail",
  {
    id: text("id").primaryKey(),
    dailyBillId: text("daily_bill_id")
      .notNull()
      .references(() => merchantBillDaily.id, { onDelete: "cascade" }),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "restrict" }),
    usageDate: date("usage_date").notNull(),
    usageMonth: varchar("usage_month", { length: 7 }).notNull(),
    productLine: varchar("product_line", { length: 64 }).notNull(),
    resourceName: varchar("resource_name", { length: 255 }).notNull(),
    amount: money("amount").notNull(),
    couponAmount: money("coupon_amount").notNull(),
    balanceAmount: money("balance_amount").notNull(),
    type: varchar("type", { length: 32 }).notNull(),
  },
  (table) => [
    uniqueIndex("merchant_bill_daily_detail_bill_pl_uk").on(table.dailyBillId, table.productLine),
    index("merchant_bill_daily_detail_merchant_date_idx").on(table.merchantId, table.usageDate),
  ],
)

export const merchantRelations = relations(merchant, ({ one, many }) => ({
  contacts: many(merchantContact),
  paymentNodes: many(merchantPaymentNode),
  rechargeRecords: many(merchantRechargeRecord),
  activities: many(merchantActivity),
  datacenterRegions: many(merchantDatacenterRegion),
  purchasePrices: many(merchantPurchasePrice),
  purchasePriceRecords: many(merchantPurchasePriceRecord),
  accountManagerAssignments: many(merchantAccountManagerAssignment),
  bills: many(merchantBill),
  billDailies: many(merchantBillDaily),
  salesPrices: many(merchantSalesPrice),
  branding: one(merchantBranding),
  promoLinks: many(merchantPromoLink),
  promoAttributions: many(merchantPromoAttribution),
  tenantContributions: many(merchantTenantContribution),
}))

export const merchantBillRelations = relations(merchantBill, ({ one, many }) => ({
  merchant: one(merchant, {
    fields: [merchantBill.merchantId],
    references: [merchant.id],
  }),
  details: many(merchantBillDetail),
}))

export const merchantBillDailyRelations = relations(merchantBillDaily, ({ one, many }) => ({
  merchant: one(merchant, {
    fields: [merchantBillDaily.merchantId],
    references: [merchant.id],
  }),
  details: many(merchantBillDailyDetail),
}))

export const merchantAccountManagerAssignmentRelations = relations(
  merchantAccountManagerAssignment,
  ({ one }) => ({
    merchant: one(merchant, {
      fields: [merchantAccountManagerAssignment.merchantId],
      references: [merchant.id],
    }),
    userStaff: one(userStaff, {
      fields: [merchantAccountManagerAssignment.userStaffId],
      references: [userStaff.id],
    }),
  }),
)

export const merchantContactRelations = relations(merchantContact, ({ one }) => ({
  merchant: one(merchant, {
    fields: [merchantContact.merchantId],
    references: [merchant.id],
  }),
}))

export const merchantDatacenterRegionRelations = relations(
  merchantDatacenterRegion,
  ({ one, many }) => ({
    merchant: one(merchant, {
      fields: [merchantDatacenterRegion.merchantId],
      references: [merchant.id],
    }),
    dataCenter: one(dataCenter, {
      fields: [merchantDatacenterRegion.dataCenterId],
      references: [dataCenter.id],
    }),
    cardTypes: many(merchantDatacenterCardType),
  }),
)

export const merchantDatacenterCardTypeRelations = relations(
  merchantDatacenterCardType,
  ({ one }) => ({
    region: one(merchantDatacenterRegion, {
      fields: [merchantDatacenterCardType.merchantDatacenterRegionId],
      references: [merchantDatacenterRegion.id],
    }),
    gpuCardType: one(gpuCardType, {
      fields: [merchantDatacenterCardType.gpuCardTypeId],
      references: [gpuCardType.id],
    }),
  }),
)

export const merchantPurchasePriceRelations = relations(merchantPurchasePrice, ({ one }) => ({
  merchant: one(merchant, {
    fields: [merchantPurchasePrice.merchantId],
    references: [merchant.id],
  }),
  dataCenter: one(dataCenter, {
    fields: [merchantPurchasePrice.dataCenterId],
    references: [dataCenter.id],
  }),
  gpuCardType: one(gpuCardType, {
    fields: [merchantPurchasePrice.gpuCardTypeId],
    references: [gpuCardType.id],
  }),
  platformListPrice: one(platformCardListPrice, {
    fields: [merchantPurchasePrice.platformListPriceId],
    references: [platformCardListPrice.id],
  }),
}))

export const merchantPurchasePriceRecordRelations = relations(
  merchantPurchasePriceRecord,
  ({ one }) => ({
    merchant: one(merchant, {
      fields: [merchantPurchasePriceRecord.merchantId],
      references: [merchant.id],
    }),
    dataCenter: one(dataCenter, {
      fields: [merchantPurchasePriceRecord.dataCenterId],
      references: [dataCenter.id],
    }),
    gpuCardType: one(gpuCardType, {
      fields: [merchantPurchasePriceRecord.gpuCardTypeId],
      references: [gpuCardType.id],
    }),
    platformListPrice: one(platformCardListPrice, {
      fields: [merchantPurchasePriceRecord.platformListPriceId],
      references: [platformCardListPrice.id],
    }),
  }),
)

export const merchantPaymentNodeRelations = relations(merchantPaymentNode, ({ one, many }) => ({
  merchant: one(merchant, {
    fields: [merchantPaymentNode.merchantId],
    references: [merchant.id],
  }),
  rechargeRecords: many(merchantRechargeRecord),
  auditLogs: many(merchantPaymentNodeAuditLog),
}))

export const merchantPaymentNodeAuditLogRelations = relations(
  merchantPaymentNodeAuditLog,
  ({ one }) => ({
    paymentNode: one(merchantPaymentNode, {
      fields: [merchantPaymentNodeAuditLog.paymentNodeId],
      references: [merchantPaymentNode.id],
    }),
    merchant: one(merchant, {
      fields: [merchantPaymentNodeAuditLog.merchantId],
      references: [merchant.id],
    }),
  }),
)

export const merchantRechargeRecordRelations = relations(merchantRechargeRecord, ({ one, many }) => ({
  merchant: one(merchant, {
    fields: [merchantRechargeRecord.merchantId],
    references: [merchant.id],
  }),
  paymentNode: one(merchantPaymentNode, {
    fields: [merchantRechargeRecord.paymentNodeId],
    references: [merchantPaymentNode.id],
  }),
  attachments: many(merchantRechargeAttachment),
  auditLogs: many(merchantRechargeAuditLog),
}))

export const merchantActivityRelations = relations(merchantActivity, ({ one, many }) => ({
  merchant: one(merchant, {
    fields: [merchantActivity.merchantId],
    references: [merchant.id],
  }),
  attachments: many(merchantActivityAttachment),
}))

/** 商户销售价表（Q15=B：销售价写品牌站库；平台保留此表作为设计规范与可选 CRM 视图） */
export const merchantSalesPrice = pgTable(
  "merchant_sales_price",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "restrict" }),
    dataCenterId: text("data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "restrict" }),
    gpuCardTypeId: text("gpu_card_type_id")
      .notNull()
      .references(() => gpuCardType.id, { onDelete: "restrict" }),
    productLine: varchar("product_line", { length: 32 }).notNull(),
    billingUnit: varchar("billing_unit", { length: 16 }).notNull().default("hour"),
    salesPrice: money("sales_price").notNull(),
    purchasePrice: money("purchase_price").notNull(),
    currency: varchar("currency", { length: 8 }).notNull().default("CNY"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    status: varchar("status", { length: 32 }).notNull(),
    remark: text("remark"),
    updatedByStaffId: text("updated_by_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    ...merchantTimestamps,
  },
  (table) => [
    uniqueIndex("merchant_sales_price_active_uk")
      .on(
        table.merchantId,
        table.dataCenterId,
        table.gpuCardTypeId,
        table.productLine,
        table.billingUnit,
      )
      .where(sql`${table.effectiveTo} IS NULL AND ${table.status} = 'active'`),
    index("merchant_sales_price_merchant_dc_idx").on(table.merchantId, table.dataCenterId),
    index("merchant_sales_price_gpu_card_type_id_idx").on(table.gpuCardTypeId),
  ],
)

export const merchantSalesPriceRelations = relations(merchantSalesPrice, ({ one }) => ({
  merchant: one(merchant, {
    fields: [merchantSalesPrice.merchantId],
    references: [merchant.id],
  }),
  dataCenter: one(dataCenter, {
    fields: [merchantSalesPrice.dataCenterId],
    references: [dataCenter.id],
  }),
  gpuCardType: one(gpuCardType, {
    fields: [merchantSalesPrice.gpuCardTypeId],
    references: [gpuCardType.id],
  }),
}))

/** 商户品牌配置表（Q10/Q17：主题、Logo、域名、通道配置） */
export const merchantBranding = pgTable(
  "merchant_branding",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "cascade" }),
    brandName: varchar("brand_name", { length: 255 }).notNull(),
    logoUrl: varchar("logo_url", { length: 1024 }),
    faviconUrl: varchar("favicon_url", { length: 1024 }),
    primaryColor: varchar("primary_color", { length: 16 }),
    customDomain: varchar("custom_domain", { length: 255 }),
    paymentChannelConfig: jsonb("payment_channel_config"),
    smsChannelConfig: jsonb("sms_channel_config"),
    emailChannelConfig: jsonb("email_channel_config"),
    themeConfig: jsonb("theme_config"),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    ...merchantTimestamps,
  },
  (table) => [
    uniqueIndex("merchant_branding_merchant_uk").on(table.merchantId),
    uniqueIndex("merchant_branding_custom_domain_uk")
      .on(table.customDomain)
      .where(sql`${table.customDomain} IS NOT NULL`),
  ],
)

export const merchantBrandingRelations = relations(merchantBranding, ({ one }) => ({
  merchant: one(merchant, {
    fields: [merchantBranding.merchantId],
    references: [merchant.id],
  }),
}))

/** 商户推广链接表（模式 A：推广链接，Q2=A 落地仅官方 gpus） */
export const merchantPromoLink = pgTable(
  "merchant_promo_link",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 255 }).notNull(),
    promoCode: varchar("promo_code", { length: 64 }).notNull(),
    landingProduct: varchar("landing_product", { length: 64 }),
    shortUrl: varchar("short_url", { length: 512 }),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
    validTo: timestamp("valid_to", { withTimezone: true }),
    clickCount: integer("click_count").notNull().default(0),
    signupCount: integer("signup_count").notNull().default(0),
    rechargeCount: integer("recharge_count").notNull().default(0),
    totalRechargeAmount: money("total_recharge_amount").notNull().default("0"),
    totalConsumeAmount: money("total_consume_amount").notNull().default("0"),
    remark: text("remark"),
    createdByStaffId: text("created_by_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    ...merchantTimestamps,
  },
  (table) => [
    uniqueIndex("merchant_promo_link_code_uk").on(table.promoCode),
    index("merchant_promo_link_merchant_status_idx").on(table.merchantId, table.status),
  ],
)

export const merchantPromoLinkRelations = relations(merchantPromoLink, ({ one, many }) => ({
  merchant: one(merchant, {
    fields: [merchantPromoLink.merchantId],
    references: [merchant.id],
  }),
  attributions: many(merchantPromoAttribution),
}))

/** 商户推广归因表（Q3=A：tenant.merchant_id 直接等于推广商户） */
export const merchantPromoAttribution = pgTable(
  "merchant_promo_attribution",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "restrict" }),
    promoLinkId: text("promo_link_id")
      .notNull()
      .references(() => merchantPromoLink.id, { onDelete: "restrict" }),
    promoCode: varchar("promo_code", { length: 64 }).notNull(),
    tenantId: text("tenant_id").references(() => billingTenant.id, { onDelete: "set null" }),
    userId: text("user_id"),
    eventType: varchar("event_type", { length: 32 }).notNull(),
    eventData: jsonb("event_data"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("merchant_promo_attribution_merchant_occurred_idx").on(table.merchantId, table.occurredAt),
    index("merchant_promo_attribution_promo_link_idx").on(table.promoLinkId),
    index("merchant_promo_attribution_tenant_idx").on(table.tenantId),
    index("merchant_promo_attribution_event_type_idx").on(table.eventType),
  ],
)

export const merchantPromoAttributionRelations = relations(merchantPromoAttribution, ({ one }) => ({
  merchant: one(merchant, {
    fields: [merchantPromoAttribution.merchantId],
    references: [merchant.id],
  }),
  promoLink: one(merchantPromoLink, {
    fields: [merchantPromoAttribution.promoLinkId],
    references: [merchantPromoLink.id],
  }),
  tenant: one(billingTenant, {
    fields: [merchantPromoAttribution.tenantId],
    references: [billingTenant.id],
  }),
}))

/**
 * 商户维度租户贡献汇总表（rollup维护，避免UI层复杂聚合）
 * 
 * 由 merchant rollup cron 维护，存储每个租户对商户的累计贡献
 * tenants list 页面直接 JOIN 此表读取 totalRevenue，不再做 live 聚合
 */
export const merchantTenantContribution = pgTable(
  "merchant_tenant_contribution",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "restrict" }),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => billingTenant.id, { onDelete: "restrict" }),
    totalRevenue: money("total_revenue").notNull().default("0"),
    totalCost: money("total_cost").notNull().default("0"),
    totalProfit: money("total_profit").notNull().default("0"),
    firstBillDate: date("first_bill_date"),
    lastBillDate: date("last_bill_date"),
    billDaysCount: integer("bill_days_count").notNull().default(0),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
    ...merchantTimestamps,
  },
  (table) => [
    uniqueIndex("merchant_tenant_contribution_uk").on(table.merchantId, table.tenantId),
    index("merchant_tenant_contribution_merchant_idx").on(table.merchantId),
    index("merchant_tenant_contribution_tenant_idx").on(table.tenantId),
  ],
)

export const merchantTenantContributionRelations = relations(merchantTenantContribution, ({ one }) => ({
  merchant: one(merchant, {
    fields: [merchantTenantContribution.merchantId],
    references: [merchant.id],
  }),
  tenant: one(billingTenant, {
    fields: [merchantTenantContribution.tenantId],
    references: [billingTenant.id],
  }),
}))

// ---------------------------------------------------------------------------
// §3 商户账户体系
//
// 设计依据：apps/merchant/content/design/merchant-module-review-and-design.md §3
//
// 复用 @workspace/billing 的账户原语（同一套账本语义），但商户侧额外要求：
//   1. 逐池实时值（merchant_account_pool_balance）—— 对账第 0 环的基准
//   2. 幂等流水（merchant_account_ledger.idempotency_key UNIQUE）—— 跨系统重放安全
//   3. 对账基线快照（merchant_account_snapshot）—— 漂移可定位到具体时点
//
// 恒等式（对账第 0 环校验，按 merchant_id + pool）：
//   available_now == available_after(最后一行) + Σ 后续 signed(available 影响)
//   reserved_now  == reserved_after(最后一行)  + Σ 后续 signed(reserved 影响)
//   total_now     == Σ signed(amount) over rows where effect = 'available'
//                  （effect='reserved' 的冻结/解冻只在两个桶之间搬运，total 不变）
// ---------------------------------------------------------------------------

/** 商户账户池类型：cash=预付现金 / voucher=券额度 / credit=授信垫付 */
export const MERCHANT_ACCOUNT_POOLS = ["cash", "voucher", "credit"] as const
export type MerchantAccountPool = (typeof MERCHANT_ACCOUNT_POOLS)[number]

/** 账户流水业务类型 */
export const MERCHANT_ACCOUNT_LEDGER_REF_TYPES = [
  "prepay",
  "voucher_purchase",
  "voucher_grant",
  "voucher_redeem",
  "voucher_recover",
  "consume",
  "freeze",
  "unfreeze",
  "prepay_refund",
  "adjust",
] as const
export type MerchantAccountLedgerRefType =
  (typeof MERCHANT_ACCOUNT_LEDGER_REF_TYPES)[number]

/** 流水方向：credit=入账 / debit=出账（amount 恒为正） */
export const MERCHANT_ACCOUNT_LEDGER_DIRECTIONS = ["credit", "debit"] as const
export type MerchantAccountLedgerDirection =
  (typeof MERCHANT_ACCOUNT_LEDGER_DIRECTIONS)[number]

/**
 * 流水作用面：
 * - available：真实流入/流出，available 与 total 同步变动
 * - reserved ：冻结/解冻，只在 available 与 reserved 之间搬运，total 不变
 */
export const MERCHANT_ACCOUNT_LEDGER_EFFECTS = ["available", "reserved"] as const
export type MerchantAccountLedgerEffect =
  (typeof MERCHANT_ACCOUNT_LEDGER_EFFECTS)[number]

/** 快照触发方式 */
export const MERCHANT_ACCOUNT_SNAPSHOT_TRIGGERS = [
  "hourly",
  "daily",
  "manual",
  "pre_recon",
] as const
export type MerchantAccountSnapshotTrigger =
  (typeof MERCHANT_ACCOUNT_SNAPSHOT_TRIGGERS)[number]

/** 商户账户池：cash=预付现金 / voucher=券额度 / credit=授信垫付 */
export const merchantAccountPool = pgTable(
  "merchant_account_pool",
  {
    id: text("id").primaryKey(),
    /** 全平台默认商户（= 共绩科技），所有非商户归属的记录归此商户 */
    platformMerchantId: integer("platform_merchant_id").notNull().default(0),
    /** cash | voucher | credit */
    pool: varchar("pool", { length: 16 }).notNull(),
    name: varchar("name", { length: 32 }).notNull(),
    /** 扣减优先级，数值越小越先用；credit 恒为最后（兜底） */
    priority: integer("priority").notNull().default(100),
    description: text("description"),
    ...merchantTimestamps,
  },
  (table) => [
    uniqueIndex("merchant_account_pool_uk").on(table.platformMerchantId, table.pool),
  ],
)

/** 商户账户汇总（每商户单行；逐池实时值见 merchant_account_pool_balance） */
export const merchantAccount = pgTable(
  "merchant_account",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "restrict" }),
    /** 预付现金余额（永不过期），= Σ pool_balance[cash].available */
    cashBalance: money("cash_balance").notNull().default("0"),
    /** 券额度池余额（可再发放），= Σ pool_balance[voucher].available */
    voucherBalance: money("voucher_balance").notNull().default("0"),
    /** 授信额度上限 */
    creditLimit: money("credit_limit").notNull().default("0"),
    /** 已用授信 */
    creditUsed: money("credit_used").notNull().default("0"),
    /** 冻结中总额（发券预占等） */
    frozen: money("frozen").notNull().default("0"),
    /** 低余额预警线（可用总额低于此值触发告警） */
    lowBalanceThreshold: money("low_balance_threshold").notNull().default("0"),
    /**
     * 充值准入线（DEC-F4/F14）—— 低于此值时其终端用户充值失败。
     * 三态语义，**不可**用 notNull().default('0')：
     *   NULL = 继承全局默认（merchant_finance_config['recharge_block_threshold']）
     *   > 0  = 该商户覆盖全局
     *   = 0  = 该商户显式永不阻断（信用极好的商户的逃生舱）
     * 注意与 lowBalanceThreshold 的空值语义相反（后者 0 = 不生效），勿互相套用。
     */
    rechargeBlockThreshold: money("recharge_block_threshold"),
    autoRechargeEnabled: boolean("auto_recharge_enabled").notNull().default(false),
    autoRechargeAmount: money("auto_recharge_amount").notNull().default("0"),
    currency: varchar("currency", { length: 8 }).notNull().default("CNY"),
    /** 乐观锁 */
    version: integer("version").notNull().default(0),
    ...merchantTimestamps,
  },
  (table) => [
    uniqueIndex("merchant_account_merchant_uk").on(table.merchantId),
  ],
)

/**
 * 商户账户逐池实时值（账户 × 池，一行一池）
 *
 * 对账第 0 环的基准数据源：期初快照 + Σ区间流水 == 期末实时值。
 * 每次账户变动必须在同一事务内与 merchant_account / merchant_account_ledger 一起写入。
 */
export const merchantAccountPoolBalance = pgTable(
  "merchant_account_pool_balance",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "restrict" }),
    /** cash | voucher | credit */
    pool: varchar("pool", { length: 16 }).notNull(),
    /** 实时值：可用额度 */
    available: money("available").notNull().default("0"),
    /** 实时值：冻结中 */
    reserved: money("reserved").notNull().default("0"),
    /** 实时值：该池累计发生额（入账为正，出账为负），应等于 Σ ledger.amount */
    total: money("total").notNull().default("0"),
    /** 乐观锁，每次变动 +1 */
    version: integer("version").notNull().default(0),
    /** 最近一笔流水 id（对账可从此处增量续算） */
    lastLedgerId: text("last_ledger_id"),
    /** 最近一笔流水发生时间 */
    lastLedgerAt: timestamp("last_ledger_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("merchant_account_pool_balance_uk").on(table.merchantId, table.pool),
    index("merchant_account_pool_balance_ledger_idx").on(table.lastLedgerAt),
  ],
)

/** 商户账户流水（不可变审计日志） */
export const merchantAccountLedger = pgTable(
  "merchant_account_ledger",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "restrict" }),
    /** credit=入账 / debit=出账；amount 恒为正，方向由本列表达 */
    direction: varchar("direction", { length: 8 }).notNull(),
    /** cash | voucher | credit */
    pool: varchar("pool", { length: 16 }).notNull(),
    amount: money("amount").notNull(),
    /** available | reserved：决定 total 是否随之变动（冻结/解冻时 total 不变） */
    effect: varchar("effect", { length: 16 }).notNull().default("available"),
    /**
     * 变动前后快照：单行即可重算两个桶，冻结/解冻也能被对账第 0 环还原。
     * 恒等式（按 merchant_id, pool）：
     *   available_now  == available_after  + Σ(后续流水对 available 的带符号影响)
     *   reserved_now   == reserved_after   + Σ(后续流水对 reserved 的带符号影响)
     *   total_now      == total_now_of_pool_balance
     */
    availableBefore: money("available_before").notNull(),
    availableAfter: money("available_after").notNull(),
    reservedBefore: money("reserved_before").notNull(),
    reservedAfter: money("reserved_after").notNull(),
    /** 本笔作用面上的前后实时值（effect=available 时等价于 available_*，否则为 reserved_*） */
    balanceBefore: money("balance_before").notNull(),
    balanceAfter: money("balance_after").notNull(),
    /** prepay | voucher_purchase | voucher_grant | voucher_redeem | voucher_recover | consume | freeze | unfreeze | prepay_refund | adjust */
    refType: varchar("ref_type", { length: 32 }).notNull(),
    refId: text("ref_id"),
    /** 幂等键：调用方提供的业务唯一键（跨系统重放安全） */
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    /** 跨系统对账链路追踪（B/C 消费扣减时为商户侧 request_id） */
    traceId: text("trace_id"),
    /** B/C：商户系统内的用户标识 */
    externalUserRef: text("external_user_ref"),
    description: text("description"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("merchant_account_ledger_idempotency_uk").on(table.idempotencyKey),
    index("merchant_account_ledger_merchant_time_idx").on(table.merchantId, table.occurredAt),
    index("merchant_account_ledger_ref_idx").on(table.merchantId, table.refType, table.refId),
    index("merchant_account_ledger_trace_idx").on(table.traceId),
    index("merchant_account_ledger_external_user_idx").on(
      table.externalUserRef,
      table.occurredAt,
    ),
  ],
)

/** 商户账户快照（对账基线；hourly 用于把账实漂移定位到小时） */
export const merchantAccountSnapshot = pgTable(
  "merchant_account_snapshot",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "restrict" }),
    /** hourly | daily | manual | pre_recon */
    trigger: varchar("trigger", { length: 16 }).notNull(),
    snapshotAt: timestamp("snapshot_at", { withTimezone: true }).notNull(),
    cashAvailable: money("cash_available").notNull().default("0"),
    cashReserved: money("cash_reserved").notNull().default("0"),
    cashTotal: money("cash_total").notNull().default("0"),
    voucherAvailable: money("voucher_available").notNull().default("0"),
    voucherReserved: money("voucher_reserved").notNull().default("0"),
    voucherTotal: money("voucher_total").notNull().default("0"),
    creditAvailable: money("credit_available").notNull().default("0"),
    creditReserved: money("credit_reserved").notNull().default("0"),
    creditTotal: money("credit_total").notNull().default("0"),
    creditLimit: money("credit_limit").notNull().default("0"),
    /** 截至快照的累计流水笔数（对账断点） */
    ledgerCount: bigint("ledger_count", { mode: "number" }).notNull().default(0),
    /** 截至快照的累计消耗（对账基数） */
    consumeAmount: money("consume_amount").notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("merchant_account_snapshot_merchant_at_uk").on(table.merchantId, table.snapshotAt),
    index("merchant_account_snapshot_merchant_at_idx").on(table.merchantId, table.snapshotAt),
    index("merchant_account_snapshot_trigger_idx").on(table.merchantId, table.trigger),
  ],
)

export const merchantAccountRelations = relations(merchantAccount, ({ one, many }) => ({
  merchant: one(merchant, {
    fields: [merchantAccount.merchantId],
    references: [merchant.id],
  }),
  poolBalances: many(merchantAccountPoolBalance),
  ledgers: many(merchantAccountLedger),
  snapshots: many(merchantAccountSnapshot),
}))

export const merchantAccountPoolBalanceRelations = relations(
  merchantAccountPoolBalance,
  ({ one }) => ({
    merchant: one(merchant, {
      fields: [merchantAccountPoolBalance.merchantId],
      references: [merchant.id],
    }),
  }),
)

export const merchantAccountLedgerRelations = relations(merchantAccountLedger, ({ one }) => ({
  merchant: one(merchant, {
    fields: [merchantAccountLedger.merchantId],
    references: [merchant.id],
  }),
}))

export const merchantAccountSnapshotRelations = relations(
  merchantAccountSnapshot,
  ({ one }) => ({
    merchant: one(merchant, {
      fields: [merchantAccountSnapshot.merchantId],
      references: [merchant.id],
    }),
  }),
)

// ---------------------------------------------------------------------------
// 商户 API 凭证（设计 §7.1 / P0-6）
//
// 形态 B/C（商户系统直连平台 OpenAPI）依赖本表：API-Key 是**唯一**的服务端鉴权来源，
// merchantId 必须由凭证派生，**绝不能作为入参**（否则商户 A 可操作商户 B 的数据）。
//
// 安全约束：
//   1. 只存 keyHash（sha256），不存明文；secret 仅在创建时返回一次
//   2. revokedAt 非空即失效；lastUsedAt 用于「谁在用哪把钥匙」审计
//   3. keyPrefix 仅存前 8 位，用于列表页展示与定位，不足以还原明文
// ---------------------------------------------------------------------------

/** API-Key 权限 scope（设计 §7.1） */
export const MERCHANT_API_KEY_SCOPES = [
  /** 余额/账户只读 */
  "balance:read",
  /** 实时扣减 + 任务提交（最敏感） */
  "consumption:write",
  /** 采购算力券 */
  "voucher:purchase",
  /** 发放算力券 */
  "voucher:grant",
  /** 主体（外部用户/租户）同步 */
  "subject:sync",
  /** 对账单只读（仅日聚合比对结果，不含调账） */
  "recon:read",
  /** 对账单上传（设计保留，本期不实现） */
  "recon:write",
] as const
export type MerchantApiKeyScope = (typeof MERCHANT_API_KEY_SCOPES)[number]

export const merchantApiKey = pgTable(
  "merchant_api_key",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "cascade" }),
    /** 凭证名，如「生产环境」 */
    name: varchar("name", { length: 64 }).notNull(),
    /** sha256(明文) 十六进制，64 字符 */
    keyHash: varchar("key_hash", { length: 64 }).notNull(),
    /** 明文前 8 位，仅用于展示定位 */
    keyPrefix: varchar("key_prefix", { length: 8 }).notNull(),
    /** 逗号分隔的 scope 集合，取值见 MERCHANT_API_KEY_SCOPES */
    scopes: varchar("scopes", { length: 256 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("merchant_api_key_key_hash_uk").on(table.keyHash),
    index("merchant_api_key_merchant_idx").on(table.merchantId),
    index("merchant_api_key_active_idx").on(table.merchantId, table.revokedAt),
  ],
)

export const merchantApiKeyRelations = relations(merchantApiKey, ({ one }) => ({
  merchant: one(merchant, {
    fields: [merchantApiKey.merchantId],
    references: [merchant.id],
  }),
}))

// ---------------------------------------------------------------------------
// 商户站内信
// ---------------------------------------------------------------------------

/**
 * 商户站内信收件箱
 *
 * 与 `supplier_site_message` 同构，但按 **merchant.id** 收件（而非 org id）：
 * 商户端所有 procedure 都由 `resolveMerchantId()` 派生 merchantId，
 * 运营侧（apps/web）审核凭证时手上也是 merchantId，两端无需再做一次 org 解析。
 */
export const merchantSiteMessage = pgTable(
  "merchant_site_message",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    summary: text("summary").notNull(),
    content: text("content").notNull(),
    category: varchar("category", { length: 32 }),
    links: jsonb("links")
      .$type<{ label: string; href: string; external?: boolean }[]>()
      .notNull()
      .default([]),
    read: boolean("read").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("merchant_site_message_merchant_created_idx").on(table.merchantId, table.createdAt),
    index("merchant_site_message_merchant_read_idx").on(table.merchantId, table.read),
  ],
);

export const merchantSiteMessageRelations = relations(merchantSiteMessage, ({ one }) => ({
  merchant: one(merchant, {
    fields: [merchantSiteMessage.merchantId],
    references: [merchant.id],
  }),
}));

/**
 * 商户外部用户 ↔ 平台影子租户（设计 v3 §4.5，形态 B/C 的阻塞项）。
 *
 * 形态 B/C 下，终端用户只存在于商户自己的系统里，平台**不为他们提供登录 /
 * 注册 / 充值 / 退款**，只做消费计量、账本与对账。要让 API 能把这些消费
 * 记到商户账上，就必须先把「商户侧的用户」映射到平台侧的一个影子租户。
 *
 * 两条唯一约束是这条链路的地基：
 * - `UNIQUE(merchant_id, external_user_ref)` —— 同一个外部用户重复绑定必须
 *   幂等地返回同一个影子租户，否则每调一次就多建一个租户，账目直接发散；
 * - `UNIQUE(merchant_id, platform_tenant_id)` —— 一个影子租户只能代表一个外部
 *   用户，否则两个用户的钱会混进同一个余额里。
 *
 * `metadata` 里的外部用户名/手机号仅供展示与对账，**平台侧绝不作为登录凭据**。
 */
export const merchantExternalSubject = pgTable(
  "merchant_external_subject",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "cascade" }),
    /** 🔴 商户系统内的用户唯一标识（幂等键的一半） */
    externalUserRef: varchar("external_user_ref", { length: 128 }).notNull(),
    /** 商户系统内的组织标识，可空 */
    externalTenantRef: varchar("external_tenant_ref", { length: 128 }),
    /** 平台影子租户（tenant.id） */
    platformTenantId: text("platform_tenant_id")
      .notNull()
      .references(() => billingTenant.id, { onDelete: "restrict" }),
    /** active | unbound | conflict */
    bindStatus: varchar("bind_status", { length: 32 }).notNull().default("active"),
    firstBoundAt: timestamp("first_bound_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb("metadata")
      .$type<{ name?: string; phone?: string; email?: string; [k: string]: unknown }>()
      .notNull()
      .default({}),
    ...merchantTimestamps,
  },
  (table) => [
    uniqueIndex("merchant_external_subject_user_uk").on(
      table.merchantId,
      table.externalUserRef,
    ),
    uniqueIndex("merchant_external_subject_tenant_uk").on(
      table.merchantId,
      table.platformTenantId,
    ),
    index("merchant_external_subject_merchant_idx").on(table.merchantId),
    index("merchant_external_subject_platform_tenant_idx").on(table.platformTenantId),
  ],
);

export const merchantExternalSubjectRelations = relations(merchantExternalSubject, ({ one }) => ({
  merchant: one(merchant, {
    fields: [merchantExternalSubject.merchantId],
    references: [merchant.id],
  }),
  platformTenant: one(billingTenant, {
    fields: [merchantExternalSubject.platformTenantId],
    references: [billingTenant.id],
  }),
}));

// ---------------------------------------------------------------------------
// 对账中心（设计 merchant-module-review-and-design.md §5.6）
// ---------------------------------------------------------------------------

export const MERCHANT_RECON_PERIOD_TYPES = ["day", "month"] as const
export type MerchantReconPeriodType = (typeof MERCHANT_RECON_PERIOD_TYPES)[number]

/**
 * 对账单状态机：
 *   open（生成，有差异待处理） → confirmed（商户确认，只读） → closed（运营关闭）
 *   matched（生成，全部匹配，等同待确认）
 *   disputed（商户申诉，冻结只读，等运营复核）
 */
export const MERCHANT_RECON_STATEMENT_STATUSES = [
  "open",
  "matched",
  "confirmed",
  "disputed",
  "closed",
] as const
export type MerchantReconStatementStatus =
  (typeof MERCHANT_RECON_STATEMENT_STATUSES)[number]

export const MERCHANT_RECON_DIFF_TYPES = [
  /** 平台账本有扣款、资源计量无对应记录 */
  "platform_only",
  /** 资源计量有用量、平台账本无扣款 */
  "resource_only",
  /** 两侧都有但金额超出容差 */
  "amount_mismatch",
  /** 数量维度不一致（逐笔比对接入后启用） */
  "qty_mismatch",
  /** 计量侧缺进货价，无法折算 → 该日不参与判定 */
  "uncomparable",
] as const
export type MerchantReconDiffType = (typeof MERCHANT_RECON_DIFF_TYPES)[number]

export const MERCHANT_RECON_DIFF_STATUSES = ["open", "accepted", "resolved", "dismissed"] as const
export type MerchantReconDiffStatus = (typeof MERCHANT_RECON_DIFF_STATUSES)[number]

/**
 * 对账单（商户 × 周期）。
 *
 * 本期比对两方（Q1）：平台账本 `merchant_account_ledger(ref_type='consume')`
 * ↔ 资源计量 `tenant_consumption_daily_detail` 按平台进货价折算。
 * `merchantAmount` 为三方对账预留，本期恒 0。
 */
export const merchantReconStatement = pgTable(
  "merchant_recon_statement",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "restrict" }),
    periodType: varchar("period_type", { length: 8 }).notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    /** 平台账本侧金额（Σ ledger ref_type=consume 的 debit） */
    platformAmount: money("platform_amount").notNull().default("0"),
    /** 商户账本侧金额（三方对账预留，本期恒 0） */
    merchantAmount: money("merchant_amount").notNull().default("0"),
    /** 资源计量按平台进货价折算后的金额 */
    resourceAmount: money("resource_amount").notNull().default("0"),
    diffAmount: money("diff_amount").notNull().default("0"),
    /** matched / total，0~1，保留 4 位小数 */
    matchRate: numeric("match_rate", { precision: 6, scale: 4 }).notNull().default("0"),
    matchedCount: integer("matched_count").notNull().default(0),
    totalCount: integer("total_count").notNull().default(0),
    /** 缺进货价无法折算的天数（不计入 matched/total 判定） */
    uncomparableCount: integer("uncomparable_count").notNull().default(0),
    status: varchar("status", { length: 16 }).notNull().default("open"),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    confirmedByUserId: text("confirmed_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    disputeReason: text("dispute_reason"),
    ...merchantTimestamps,
  },
  (table) => [
    uniqueIndex("merchant_recon_statement_period_uk").on(
      table.merchantId,
      table.periodType,
      table.periodStart,
    ),
    index("merchant_recon_statement_status_idx").on(table.status, table.periodEnd),
    index("merchant_recon_statement_merchant_idx").on(table.merchantId, table.periodStart),
  ],
);

/**
 * 对账差异（日粒度）。
 *
 * 本期是日聚合两方比对（2026-10-05 拍板），没有逐笔 `request_id`，
 * `requestId` 留 NULL；等计量侧补上共享 request_id 的写入后再启用逐笔比对。
 */
export const merchantReconDiff = pgTable(
  "merchant_recon_diff",
  {
    id: text("id").primaryKey(),
    statementId: text("statement_id")
      .notNull()
      .references(() => merchantReconStatement.id, { onDelete: "cascade" }),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "restrict" }),
    reconDate: date("recon_date").notNull(),
    requestId: varchar("request_id", { length: 128 }),
    diffType: varchar("diff_type", { length: 32 }).notNull(),
    platformAmount: money("platform_amount").notNull().default("0"),
    resourceAmount: money("resource_amount").notNull().default("0"),
    merchantAmount: money("merchant_amount").notNull().default("0"),
    /** 计量侧原始量（卡时等），仅用于展示 */
    resourceQty: numeric("resource_qty", { precision: 18, scale: 4 }).notNull().default("0"),
    status: varchar("status", { length: 16 }).notNull().default("open"),
    /** accept_platform（写 adjust 流水） / dismiss（人工忽略） */
    resolution: varchar("resolution", { length: 32 }),
    adjustedLedgerId: text("adjusted_ledger_id"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByUserId: text("resolved_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    ...merchantTimestamps,
  },
  (table) => [
    uniqueIndex("merchant_recon_diff_date_uk").on(table.statementId, table.reconDate),
    index("merchant_recon_diff_status_idx").on(table.status, table.reconDate),
    index("merchant_recon_diff_merchant_date_idx").on(table.merchantId, table.reconDate),
  ],
);

export const merchantReconStatementRelations = relations(
  merchantReconStatement,
  ({ one, many }) => ({
    merchant: one(merchant, {
      fields: [merchantReconStatement.merchantId],
      references: [merchant.id],
    }),
    diffs: many(merchantReconDiff),
  }),
);

export const merchantReconDiffRelations = relations(merchantReconDiff, ({ one }) => ({
  statement: one(merchantReconStatement, {
    fields: [merchantReconDiff.statementId],
    references: [merchantReconStatement.id],
  }),
  merchant: one(merchant, {
    fields: [merchantReconDiff.merchantId],
    references: [merchant.id],
  }),
}));
