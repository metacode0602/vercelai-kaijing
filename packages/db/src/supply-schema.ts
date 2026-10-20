/**
 * 供应商与算力资源域表结构（Drizzle ORM / PostgreSQL）
 *
 * 设计依据：apps/web/content/design/supplier-database.md（v1.2）、
 *   supplier-onboarding-plan-changelog-tracking-design.md（v2.2）、
 *   supplier-device-import-schema.md（v1.1）、
 *   bare-metal-order-schema-design.md（v1.3）
 * 领域模型：Supplier → DataCenter → Device / GPU Inventory；合同与刊例价/成交价；接入批次
 *
 * 约定：
 * - 主键 text；金额 numeric(15,4)；比例 numeric(9,6)；扩展 jsonb
 * - 聚合字段（机房数、设备总数、月结算额等）不入库
 * - 员工 FK 复用 CRM `user_staff`
 */

import { createId } from '@paralleldrive/cuid2'
import { relations, sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core"

import { billingTenant, crmProject, customer, userStaff } from "./crm-schema"
import { organization, user } from "./auth-schema"

/** 金额 decimal(15,4) */
const money = (name: string) => numeric(name, { precision: 15, scale: 4 })

/** 成交/刊例比例 decimal(9,6) */
const priceRatio = (name: string) => numeric(name, { precision: 9, scale: 6 })

const ts = (n: string) => timestamp(n, { withTimezone: true }).defaultNow().notNull()

const supplyTimestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}

// ---------------------------------------------------------------------------
// §3.1 主数据
// ---------------------------------------------------------------------------

export const supplier = pgTable(
  "supplier",
  {
    id: text("id").primaryKey(),
    /** 门户自助入驻关联的 organization（可空；导入/手工创建的供应商可无） */
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "set null",
    }),
    externalTenantId: text("external_tenant_id").notNull(), // 租户ID，对应外部平台的租户ID
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    shortName: varchar("short_name", { length: 64 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    defaultCooperationMode: varchar("default_cooperation_mode", { length: 32 }),
    defaultRevenueSharePercent: numeric("default_revenue_share_percent", {
      precision: 7,
      scale: 4,
    }),
    businessManagerStaffId: text("business_manager_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    contactPerson: varchar("contact_person", { length: 128 }),
    contactPhone: varchar("contact_phone", { length: 32 }),
    contactEmail: varchar("contact_email", { length: 255 }),
    address: text("address"),
    /**
     * @deprecated 收款账户权威来源已迁至 `merchant_payout_account`
     * (owner_type='supplier')。本列仅保留读路径一个版本，勿再新增写入；
     * 新增/变更收款账户一律走 supplier 的 payout account 流程。
     */
    bankName: varchar("bank_name", { length: 255 }),
    source: varchar("source", { length: 64 }).notNull().default("import"), // import api导入 / manual 手动 / portal 门户入驻
    /**
     * @deprecated 同 {@link bankName}，收款账户以 merchant_payout_account 为准。
     */
    bankAccount: varchar("bank_account", { length: 64 }),
    externalOnboardingId: varchar("external_onboarding_id", { length: 64 }),
    platformTenantId: varchar("platform_tenant_id", { length: 32 }),
    onboardingType: varchar("onboarding_type", { length: 16 }),
    identityNo: varchar("identity_no", { length: 32 }),
    businessScope: text("business_scope"),
    businessLicenseUri: varchar("business_license_uri", { length: 1024 }),
    idCardFrontUri: varchar("id_card_front_uri", { length: 1024 }),
    idCardBackUri: varchar("id_card_back_uri", { length: 1024 }),
    /**
     * @deprecated 同 {@link bankName}：开户行支行信息已迁至
     * `merchant_payout_account.bank_branch`，本列保留读路径一个版本后 DROP。
     */
    bankBranchName: varchar("bank_branch_name", { length: 255 }),
    /**
     * @deprecated 同 {@link bankName}。支行地址在 merchant_payout_account 无对应列，
     * 如确需保留请并入 `remark`。
     */
    bankBranchAddress: text("bank_branch_address"),
    adminPhone: varchar("admin_phone", { length: 32 }),
    adminEmail: varchar("admin_email", { length: 255 }),
    deviceInfoRaw: text("device_info_raw"),
    auditStatus: varchar("audit_status", { length: 32 }),
    auditConfirmed: boolean("audit_confirmed").notNull().default(false),
    auditRemark: text("audit_remark"),
    ...supplyTimestamps,
  },
  (table) => [
    uniqueIndex("supplier_code_uk").on(table.code),
    uniqueIndex("supplier_org_id_uk").on(table.organizationId).where(sql`organization_id IS NOT NULL`),
    uniqueIndex("supplier_external_tenant_id_uk").on(table.externalTenantId),
    uniqueIndex("supplier_external_onboarding_id_uk").on(table.externalOnboardingId),
    uniqueIndex("supplier_platform_tenant_id_uk").on(table.platformTenantId),
    index("supplier_status_idx").on(table.status),
    index("supplier_business_manager_staff_id_idx").on(table.businessManagerStaffId),
    index("supplier_identity_no_idx").on(table.identityNo),
  ],
)

/** 供应商运维工程师通讯录 */
export const supplierOpsEngineer = pgTable(
  "supplier_ops_engineer",
  {
    id: text("id").primaryKey(),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => supplier.id, { onDelete: "cascade" }), // 供应商ID
    dataCenterId: text("data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "cascade" }), // 数据中心ID
    name: varchar("name", { length: 128 }).notNull(),
    phone: varchar("phone", { length: 32 }),
    email: varchar("email", { length: 255 }),
    wechatId: varchar("wechat_id", { length: 128 }),
    sortOrder: integer("sort_order").notNull().default(0),
    ...supplyTimestamps,
  },
  (table) => [
    index("supplier_ops_engineer_supplier_id_idx").on(table.supplierId),
    index("supplier_ops_engineer_data_center_id_idx").on(table.dataCenterId),
    index("supplier_ops_engineer_data_center_sort_idx").on(table.dataCenterId, table.sortOrder),
  ],
)

export const gpuCardType = pgTable(
  "gpu_card_type",
  {
    id: text("id").primaryKey(),
    name: varchar("name", { length: 128 }).notNull(), // 卡型名称
    code: varchar("code", { length: 64 }).notNull().unique(), // 卡型编码
    manufacturer: varchar("manufacturer", { length: 32 }).notNull(), // 制造商
    memoryGb: integer("memory_gb"), // 内存容量（GB）
    tdpWatts: integer("tdp_watts"), // 功耗（瓦）
    computeCapability: varchar("compute_capability", { length: 64 }), // 计算能力
    /** compute=算力卡型；infra=管控/存储等无 GPU 卡型 */
    deviceRole: varchar("device_role", { length: 16 }).notNull().default("compute"),
    status: varchar("status", { length: 32 }).notNull(), // 状态
    ...supplyTimestamps,
  },
  (table) => [uniqueIndex("gpu_card_type_name_uk").on(table.name)],
)

export const dataCenter = pgTable(
  "data_center",
  {
    id: text("id").primaryKey(),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => supplier.id, { onDelete: "restrict" }),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    location: varchar("location", { length: 128 }), // 容器区域名称，展示给最终用户的名称
    regionTags: text("region_tags").array().notNull().default([]),
    address: text("address"),
    status: varchar("status", { length: 32 }).notNull(),
    /** active=合作中；pause=合作暂停；inactive=合作终止 */
    cooperationStatus: varchar("cooperation_status", { length: 32 }).notNull().default("active"),
    networkFeeMonthly: money("network_fee_monthly").notNull().default("0"),
    mgmtNodeFeeMonthly: money("mgmt_node_fee_monthly").notNull().default("0"),
    externalOnboardingId: varchar("external_onboarding_id", { length: 64 }),
    platformTenantId: varchar("platform_tenant_id", { length: 32 }),
    containerInstanceRegion: varchar("container_instance_region", { length: 128 }), // 容器实例区域，用于Karmada集群标签值（label value）使用
    bareMetalRegion: varchar("bare_metal_region", { length: 128 }), // 裸金属区域，用于裸金属订单的区域匹配
    description: text("description"),
    scale: varchar("scale", { length: 64 }),
    publicIpCount: integer("public_ip_count"),
    internalNetworkCidr: varchar("internal_network_cidr", { length: 64 }),
    auditStatus: varchar("audit_status", { length: 32 }),
    auditRemark: text("audit_remark"),
    sourceDeleted: boolean("source_deleted").notNull().default(false),
    ...supplyTimestamps,
  },
  (table) => [
    uniqueIndex("data_center_supplier_code_uk").on(table.supplierId, table.code),
    index("data_center_supplier_id_idx").on(table.supplierId),
    index("data_center_status_idx").on(table.status),
    index("data_center_cooperation_status_idx").on(table.cooperationStatus),
    index("data_center_supplier_external_onboarding_id_idx").on(
      table.supplierId,
      table.externalOnboardingId,
    ),
  ],
)

// ---------------------------------------------------------------------------
// §3.2 商务合同与条款
// ---------------------------------------------------------------------------

export const supplierCardListPrice = pgTable(
  "supplier_card_list_price",
  {
    id: text("id").primaryKey(),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => supplier.id, { onDelete: "restrict" }),
    dataCenterId: text("data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "restrict" }),
    gpuCardTypeId: text("gpu_card_type_id")
      .notNull()
      .references(() => gpuCardType.id, { onDelete: "restrict" }),
    listPricePerHour: money("list_price_per_hour").notNull(),
    currency: varchar("currency", { length: 8 }).notNull().default("CNY"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    source: varchar("source", { length: 64 }),
    remark: text("remark"),
    ...supplyTimestamps,
  },
  (table) => [
    uniqueIndex("supplier_card_list_price_current_uk")
      .on(table.supplierId, table.dataCenterId, table.gpuCardTypeId)
      .where(sql`${table.effectiveTo} IS NULL`),
    index("supplier_card_list_price_supplier_id_idx").on(table.supplierId),
    index("supplier_card_list_price_dc_card_idx").on(table.dataCenterId, table.gpuCardTypeId),
  ],
)

export const supplierContract = pgTable(
  "supplier_contract",
  {
    id: text("id").primaryKey(),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => supplier.id, { onDelete: "restrict" }),
    contractNo: varchar("contract_no", { length: 64 }).notNull(),
    type: varchar("type", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    pricingMode: varchar("pricing_mode", { length: 32 }).notNull(),
    tierBasis: varchar("tier_basis", { length: 32 }),
    cooperationMode: varchar("cooperation_mode", { length: 32 }).notNull(),
    unitPricePerHour: money("unit_price_per_hour"),
    revenueSharePercent: numeric("revenue_share_percent", { precision: 7, scale: 4 }),
    listPricePerHour: money("list_price_per_hour"),
    dealToListRatio: priceRatio("deal_to_list_ratio"),
    minCommitHours: money("min_commit_hours"),
    settlementCycle: varchar("settlement_cycle", { length: 32 }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    terms: text("terms"),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    signerName: varchar("signer_name", { length: 128 }),
    contractFileUri: varchar("contract_file_uri", { length: 1024 }),
    supplierConfirmationStatus: varchar("supplier_confirmation_status", { length: 32 })
      .notNull()
      .default("none"),
    confirmedBySupplierOrgId: text("confirmed_by_supplier_org_id").references(
      () => organization.id,
      { onDelete: "set null" },
    ),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    modificationNote: text("modification_note"),
    expectedListingTime: date("expected_listing_time"),
    penaltyTerms: text("penalty_terms"),
    monthlyRentPrice: money("monthly_rent_price"),
    infraPricing: jsonb("infra_pricing").$type<{
      bandwidth?: {
        pricePerMbpsPerMonth?: number
        includedMbps?: number
      }
      publicIp?: {
        pricePerIpPerMonth?: number
        includedIps?: number
      }
      cpuDevice?: {
        pricePerCorePerMonth?: number
      }
      storage?: {
        nas?: {
          pricePerGbPerMonth?: number
          includedGb?: number
        }
        ceph?: {
          pricePerGbPerMonth?: number
          includedGb?: number
        }
        gfs?: {
          pricePerGbPerMonth?: number
          includedGb?: number
        }
      }
    }>(),
    /** 站点 BOM：纳管设备台数（精确值，可选；与 siteNodeTier 二选一或并存） */
    siteNodeCount: integer("site_node_count"),
    /**
     * 站点 BOM：规模分档（GW-P0）
     * lte_5 / lte_30 / lte_100 / gt_100 对应 ≤5 / ≤30 / ≤100 / 100+
     */
    siteNodeTier: varchar("site_node_tier", { length: 16 }),
    /** 站点 BOM：产品线 multi-select JSON，如 bare_metal/sandbox/k8s/serverless/heavy_file */
    productLines: jsonb("product_lines").$type<string[]>().notNull().default([]),
    /** 站点 BOM：公网 IP 数量（最低 3、推荐 5） */
    publicIpCount: integer("public_ip_count"),
    /** 站点 BOM：供应商是否提供 CPU 主机（默认 true） */
    supplierProvidesCpuHosts: boolean("supplier_provides_cpu_hosts").notNull().default(true),
    ...supplyTimestamps,
  },
  (table) => [
    uniqueIndex("supplier_contract_no_uk").on(table.contractNo),
    index("supplier_contract_supplier_id_idx").on(table.supplierId),
    index("supplier_contract_status_idx").on(table.status),
    index("supplier_contract_pricing_mode_idx").on(table.pricingMode),
  ],
)

/**
 * 供应商合同 × 机房 × 卡型 产能明细（SLA 合同卡时真源）
 * 与 `supplier_contract` 同属一张商务合同；Bitable 同步按行 upsert。
 */
export const supplierContractCapacityLine = pgTable(
  "supplier_contract_capacity_line",
  {
    id: text("id").primaryKey(),
    contractId: text("contract_id")
      .notNull()
      .references(() => supplierContract.id, { onDelete: "cascade" }),
    dataCenterId: text("data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "restrict" }),
    gpuCardTypeId: text("gpu_card_type_id")
      .notNull()
      .references(() => gpuCardType.id, { onDelete: "restrict" }),
    /** 资源合作：闲时 idle_time / 整租 whole_rent（对齐 supplier_device.cooperation_type） */
    cooperationType: varchar("cooperation_type", { length: 32 }).notNull().default("idle_time"),
    deviceQuantity: integer("device_quantity").notNull(),
    gpuQuantity: integer("gpu_quantity").notNull(),
    gpuCountPerDevice: integer("gpu_count_per_device"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    /** active / paused / terminated；SLA 仅统计 active */
    lineStatus: varchar("line_status", { length: 32 }).notNull().default("active"),
    bitableRecordId: varchar("bitable_record_id", { length: 128 }),
    remark: text("remark"),
    rawJson: jsonb("raw_json"),
    ...supplyTimestamps,
  },
  (table) => [
    uniqueIndex("supplier_contract_capacity_line_bitable_record_uk")
      .on(table.bitableRecordId)
      .where(sql`${table.bitableRecordId} IS NOT NULL`),
    uniqueIndex("supplier_contract_capacity_line_scope_uk").on(
      table.contractId,
      table.dataCenterId,
      table.gpuCardTypeId,
      table.startDate,
    ),
    index("supplier_contract_capacity_line_contract_id_idx").on(table.contractId),
    index("supplier_contract_capacity_line_dc_card_dates_idx").on(
      table.dataCenterId,
      table.gpuCardTypeId,
      table.startDate,
      table.endDate,
    ),
    index("supplier_contract_capacity_line_line_status_idx").on(table.lineStatus),
  ],
)

export const supplierPricingTier = pgTable(
  "supplier_pricing_tier",
  {
    id: text("id").primaryKey(),
    contractId: text("contract_id")
      .notNull()
      .references(() => supplierContract.id, { onDelete: "cascade" }),
    supplierCardListPriceId: text("supplier_card_list_price_id").references(
      () => supplierCardListPrice.id,
      { onDelete: "set null" },
    ),
    tierOrder: integer("tier_order").notNull(),
    listPriceMultiplier: priceRatio("list_price_multiplier"),
    dealToListRatioMin: priceRatio("deal_to_list_ratio_min"),
    dealToListRatioMax: priceRatio("deal_to_list_ratio_max"),
    dealUnitPricePerHour: money("deal_unit_price_per_hour"),
    revenueSharePercent: numeric("revenue_share_percent", { precision: 7, scale: 4 }),
    remark: varchar("remark", { length: 255 }),
  },
  (table) => [
    uniqueIndex("supplier_pricing_tier_uk").on(
      table.contractId,
      table.tierOrder,
      table.supplierCardListPriceId,
    ),
  ],
)

export const supplierTermsVersion = pgTable(
  "supplier_terms_version",
  {
    id: text("id").primaryKey(),
    supplierId: text("supplier_id").references(() => supplier.id, { onDelete: "cascade" }),
    contractId: text("contract_id").references(() => supplierContract.id, { onDelete: "cascade" }),
    dealMode: varchar("deal_mode", { length: 64 }).notNull(),
    termsJson: jsonb("terms_json").notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("supplier_terms_version_supplier_id_idx").on(table.supplierId),
    index("supplier_terms_version_contract_id_idx").on(table.contractId),
  ],
)
// 供应商机房×卡型成本
export const supplierUnitCost = pgTable(
  "supplier_unit_cost",
  {
    id: text("id").primaryKey(),
    supplierTermsVersionId: text("supplier_terms_version_id")
      .notNull()
      .references(() => supplierTermsVersion.id, { onDelete: "restrict" }),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => supplier.id, { onDelete: "restrict" }),
    dataCenterId: text("data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "restrict" }),
    gpuCardTypeId: text("gpu_card_type_id")
      .notNull()
      .references(() => gpuCardType.id, { onDelete: "restrict" }),
    supplierCardListPriceId: text("supplier_card_list_price_id")
      .notNull()
      .references(() => supplierCardListPrice.id, { onDelete: "restrict" }),
    listPricePerHour: money("list_price_per_hour").notNull(),
    dealUnitPricePerHour: money("deal_unit_price_per_hour"),
    dealToListRatio: priceRatio("deal_to_list_ratio"),
    unitCost: money("unit_cost"),
    revenueSharePercent: numeric("revenue_share_percent", { precision: 7, scale: 4 }),
    tierJson: jsonb("tier_json"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    ...supplyTimestamps,
  },
  (table) => [
    uniqueIndex("supplier_unit_cost_current_uk")
      .on(table.supplierTermsVersionId, table.dataCenterId, table.gpuCardTypeId)
      .where(sql`${table.effectiveTo} IS NULL`),
  ],
)

// 供应商机房×卡型定价记录
export const supplierPricingRecord = pgTable(
  "supplier_pricing_record",
  {
    id: text("id").primaryKey(),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => supplier.id, { onDelete: "restrict" }),
    dataCenterId: text("data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "restrict" }),
    gpuCardTypeId: text("gpu_card_type_id")
      .notNull()
      .references(() => gpuCardType.id, { onDelete: "restrict" }),
    supplierUnitCostId: text("supplier_unit_cost_id").references(() => supplierUnitCost.id, {
      onDelete: "set null",
    }),
    supplierCardListPriceId: text("supplier_card_list_price_id").references(
      () => supplierCardListPrice.id,
      { onDelete: "set null" },
    ),
    pricingMode: varchar("pricing_mode", { length: 32 }).notNull(),
    /** active 可用 / unavailable 不可用（导入占位，单价为 0） */
    configStatus: varchar("config_status", { length: 32 }).notNull().default("active"),
    listPricePerHour: money("list_price_per_hour"),
    unitPricePerHour: money("unit_price_per_hour"),
    /** hour=卡时价 / month=整租月租（元/台/月） */
    billingUnit: varchar("billing_unit", { length: 16 }).notNull().default("hour"),
    unitPrice: money("unit_price"),
    cardsPerMachine: integer("cards_per_machine").default(8),
    dealToListRatio: priceRatio("deal_to_list_ratio"),
    revenueSharePercent: numeric("revenue_share_percent", { precision: 7, scale: 4 }),
    pricingTiers: jsonb("pricing_tiers"),
    effectiveFrom: timestamp("effective_from", { mode: "string", precision: 0 }).notNull(),
    effectiveTo: timestamp("effective_to", { mode: "string", precision: 0 }),
    updatedByStaffId: text("updated_by_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("supplier_pricing_record_uk").on(
      table.supplierId,
      table.dataCenterId,
      table.gpuCardTypeId,
    ),
  ],
)

export const supplierPricingHistory = pgTable(
  "supplier_pricing_history",
  {
    id: text("id").primaryKey(),
    pricingRecordId: text("pricing_record_id")
      .notNull()
      .references(() => supplierPricingRecord.id, { onDelete: "cascade" }),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => supplier.id, { onDelete: "restrict" }),
    dataCenterId: text("data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "restrict" }),
    gpuCardTypeId: text("gpu_card_type_id")
      .notNull()
      .references(() => gpuCardType.id, { onDelete: "restrict" }),
    pricingMode: varchar("pricing_mode", { length: 32 }).notNull(),
    previousListPricePerHour: money("previous_list_price_per_hour"),
    newListPricePerHour: money("new_list_price_per_hour"),
    previousUnitPricePerHour: money("previous_unit_price_per_hour"),
    newUnitPricePerHour: money("new_unit_price_per_hour"),
    previousBillingUnit: varchar("previous_billing_unit", { length: 16 }),
    newBillingUnit: varchar("new_billing_unit", { length: 16 }),
    previousUnitPrice: money("previous_unit_price"),
    newUnitPrice: money("new_unit_price"),
    previousCardsPerMachine: integer("previous_cards_per_machine"),
    newCardsPerMachine: integer("new_cards_per_machine"),
    previousDealToListRatio: priceRatio("previous_deal_to_list_ratio"),
    newDealToListRatio: priceRatio("new_deal_to_list_ratio"),
    previousRevenueSharePercent: numeric("previous_revenue_share_percent", {
      precision: 7,
      scale: 4,
    }),
    newRevenueSharePercent: numeric("new_revenue_share_percent", { precision: 7, scale: 4 }),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull(),
    changedByStaffId: text("changed_by_staff_id")
      .notNull()
      .references(() => userStaff.id, { onDelete: "restrict" }),
    reason: text("reason"),
  },
  (table) => [
    index("supplier_pricing_history_record_changed_idx").on(
      table.pricingRecordId,
      table.changedAt,
    ),
  ],
)

// ---------------------------------------------------------------------------
// §3.3 接入条件与批次
// ---------------------------------------------------------------------------

export const accessConditionSheet = pgTable(
  "access_condition_sheet",
  {
    id: text("id").primaryKey(),
    contractId: text("contract_id")
      .notNull()
      .references(() => supplierContract.id, { onDelete: "cascade" }),
    versionNo: integer("version_no").notNull(),
    isCurrent: boolean("is_current").notNull().default(false),
    gpuNetworkCpuTerms: jsonb("gpu_network_cpu_terms").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("access_condition_sheet_contract_version_uk").on(
      table.contractId,
      table.versionNo,
    ),
    uniqueIndex("access_condition_sheet_current_uk")
      .on(table.contractId)
      .where(sql`${table.isCurrent} = true`),
  ],
)

export const onboardingBatch = pgTable(
  "onboarding_batch",
  {
    id: text("id").primaryKey(),
    batchKind: varchar("batch_kind", { length: 32 }).notNull(),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => supplier.id, { onDelete: "restrict" }),
    supplierCode: varchar("supplier_code", { length: 64 }).notNull(),
    supplierName: varchar("supplier_name", { length: 255 }).notNull(),
    supplierShortName: varchar("supplier_short_name", { length: 64 }),
    dataCenterId: text("data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "restrict" }),
    idcCode: varchar("idc_code", { length: 64 }).notNull(),
    dataCenterName: varchar("data_center_name", { length: 255 }).notNull(),
    idcRegion: varchar("idc_region", { length: 64 }),
    contractId: text("contract_id").references(() => supplierContract.id, {
      onDelete: "restrict",
    }),
    accessConditionSheetId: text("access_condition_sheet_id").references(
      () => accessConditionSheet.id,
      { onDelete: "restrict" },
    ),
    batchCode: varchar("batch_code", { length: 64 }).notNull(),
    batchStatus: varchar("batch_status", { length: 32 }).notNull(),
    plannedReadyAt: timestamp("planned_ready_at", { withTimezone: true }),
    /** 上架计划明细（卡型 + 合作类型 + 数量） */
    plannedLinesJson: jsonb("planned_lines_json").notNull().default([]),
    plannedDeviceCount: integer("planned_device_count").notNull().default(0),
    /** 计划 GPU 卡数（创建/修订批次时按 plan_lines × 默认卡/台 持久化） */
    plannedGpuCount: integer("planned_gpu_count").notNull().default(0),
    listUploadMode: varchar("list_upload_mode", { length: 32 }).notNull().default("none"),
    /** 飞书审批工单号（商务手动录入）；业务批次必填，supplier 内唯一 */
    workOrderNo: varchar("work_order_no", { length: 64 }),
    /** 变更/关联触达去重台数（refreshBatchProgress 刷新） */
    touchedDeviceCount: integer("touched_device_count").notNull().default(0),
    /** 触达且 lifecycle=在线 台数 */
    onlineDeviceCount: integer("online_device_count").notNull().default(0),
    progressSyncedAt: timestamp("progress_synced_at", { withTimezone: true }),
    onlineReason: varchar("online_reason", { length: 64 }), /** 上架原因（`batch_kind=online` 时填写） */
    orderNo: varchar("order_no", { length: 128 }), /** 关联订单编号（`batch_kind=order_access` 时填写） */
    remark: text("remark"),
    /** 导入批次指向业务批次；仅 device_inventory / device_changelog */
    parentBatchId: text("parent_batch_id").references((): AnyPgColumn => onboardingBatch.id, {
      onDelete: "set null",
    }),
    accessMethod: varchar("access_method", { length: 32 }).notNull(), /** 接入方式 */
    importFileName: varchar("import_file_name", { length: 255 }),
    importFileUri: varchar("import_file_uri", { length: 1024 }),
    importFileMimeType: varchar("import_file_mime_type", { length: 128 }),
    importFileSizeBytes: bigint("import_file_size_bytes", { mode: "number" }),
    importStatus: varchar("import_status", { length: 32 }).notNull().default("draft"),
    parseError: text("parse_error"),
    parsedRowCount: integer("parsed_row_count").notNull().default(0),
    parsedSuccessCount: integer("parsed_success_count").notNull().default(0),
    parsedRowsJson: jsonb("parsed_rows_json"),
    parsedAt: timestamp("parsed_at", { withTimezone: true }),
    committedDeviceCount: integer("committed_device_count").notNull().default(0),
    committedAt: timestamp("committed_at", { withTimezone: true }),
    retireReason: varchar("retire_reason", { length: 64 }),
    /** device_unsubscribe | bare_metal_offboard */
    retireActionType: varchar("retire_action_type", { length: 32 }),
    /** line_plan | datacenter_closure */
    retirePlanMode: varchar("retire_plan_mode", { length: 32 }),
    expectedCompletionDate: date("expected_completion_date"),
    retireRemark: text("retire_remark"),
    retiredDeviceCount: integer("retired_device_count").notNull().default(0),
    /** 自动结案 / 动作不一致 / 超额挂接等排查标记 */
    progressFlagsJson: jsonb("progress_flags_json"),
    /** 扩展元数据（飞书集成 feishu.* 等） */
    metadata: jsonb("metadata").notNull().default({}),
    createdByStaffId: text("created_by_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    ...supplyTimestamps,
  },
  (table) => [
    uniqueIndex("onboarding_batch_code_uk").on(table.batchCode),
    index("onboarding_batch_supplier_id_idx").on(table.supplierId),
    index("onboarding_batch_data_center_id_idx").on(table.dataCenterId),
    index("onboarding_batch_idc_code_idx").on(table.idcCode),
    index("onboarding_batch_contract_id_idx").on(table.contractId),
    index("onboarding_batch_status_idx").on(table.batchStatus),
    index("onboarding_batch_import_status_idx").on(table.importStatus),
    index("onboarding_batch_supplier_dc_created_idx").on(
      table.supplierId,
      table.dataCenterId,
      table.createdAt,
    ),
    index("onboarding_batch_work_order_no_idx").on(table.workOrderNo),
    uniqueIndex("onboarding_batch_supplier_work_order_uk")
      .on(table.supplierId, table.workOrderNo)
      .where(sql`${table.workOrderNo} IS NOT NULL`),
    index("onboarding_batch_parent_batch_id_idx").on(table.parentBatchId),
  ],
)

/** 上架计划明细行（卡型 × 合作类型 × 数量）；与 planned_lines_json 二选一或双写 */
export const onboardingBatchPlanLine = pgTable(
  "onboarding_batch_plan_line",
  {
    id: text("id").primaryKey(),
    onboardingBatchId: text("onboarding_batch_id")
      .notNull()
      .references(() => onboardingBatch.id, { onDelete: "cascade" }),
    gpuCardTypeId: text("gpu_card_type_id")
      .notNull()
      .references(() => gpuCardType.id, { onDelete: "restrict" }),
    cooperationType: varchar("cooperation_type", { length: 32 }).notNull(),
    plannedQuantity: integer("planned_quantity").notNull(),
    touchedQuantity: integer("touched_quantity").notNull().default(0),
    onlineQuantity: integer("online_quantity").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("onboarding_batch_plan_line_uk").on(
      table.onboardingBatchId,
      table.gpuCardTypeId,
      table.cooperationType,
    ),
    index("onboarding_batch_plan_line_batch_id_idx").on(table.onboardingBatchId),
  ],
)

/** 批次计划/触达/终态不可变事件日志（Period 计划卡时阶梯积分权威时序） */
export const onboardingBatchProgressEvent = pgTable(
  "onboarding_batch_progress_event",
  {
    id: text("id").primaryKey(),
    onboardingBatchId: text("onboarding_batch_id")
      .notNull()
      .references(() => onboardingBatch.id, { onDelete: "cascade" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    eventType: varchar("event_type", { length: 32 }).notNull(),
    batchKind: varchar("batch_kind", { length: 32 }).notNull(),
    batchStatus: varchar("batch_status", { length: 32 }).notNull(),
    plannedDeviceCount: integer("planned_device_count").notNull(),
    plannedGpuCount: integer("planned_gpu_count").notNull(),
    touchedDeviceCount: integer("touched_device_count").notNull(),
    touchedPipelineGpu: integer("touched_pipeline_gpu").notNull(),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => supplier.id, { onDelete: "restrict" }),
    dataCenterId: text("data_center_id").references(() => dataCenter.id, {
      onDelete: "set null",
    }),
    idcRegion: varchar("idc_region", { length: 64 }),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("onboarding_batch_progress_event_batch_occurred_idx").on(
      table.onboardingBatchId,
      table.occurredAt,
    ),
    index("onboarding_batch_progress_event_occurred_idx").on(table.occurredAt),
    index("onboarding_batch_progress_event_kind_occurred_idx").on(
      table.batchKind,
      table.occurredAt,
    ),
    index("onboarding_batch_progress_event_supplier_dc_occurred_idx").on(
      table.supplierId,
      table.dataCenterId,
      table.occurredAt,
    ),
  ],
)

// ---------------------------------------------------------------------------
// §3.4 物理设备与节点（device 需在 import_row / task 之前声明）
// ---------------------------------------------------------------------------

export const supplierDevice = pgTable(
  "supplier_device",
  {
    id: text("id").primaryKey(),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => supplier.id, { onDelete: "restrict" }),
    contractId: text("contract_id").references(() => supplierContract.id, {
      onDelete: "set null",
    }),
    /** 最近一次 device_inventory 导入批次；禁止指向 online/order_access 业务批次 */
    onboardingBatchId: text("onboarding_batch_id").references(() => onboardingBatch.id, {
      onDelete: "set null",
    }),
    dataCenterId: text("data_center_id").references(() => dataCenter.id, {
      onDelete: "set null",
    }),
    gpuCardTypeId: text("gpu_card_type_id")
      .notNull()
      .references(() => gpuCardType.id, { onDelete: "restrict" }),
    externalDeviceId: varchar("external_device_id", { length: 128 }),
    assetNo: varchar("asset_no", { length: 64 }),
    sn: varchar("sn", { length: 64 }).notNull(),
    idcCode: varchar("idc_code", { length: 64 }).notNull(),
    idcRegion: varchar("idc_region", { length: 64 }),
    gpuCount: integer("gpu_count").notNull(),
    externalIp: varchar("external_ip", { length: 45 }),
    internalIp: varchar("internal_ip", { length: 45 }),
    opsStatus: varchar("ops_status", { length: 64 }).notNull().default("预留闲置中"),
    lifecycleStatus: varchar("lifecycle_status", { length: 32 }).notNull(),
    inMaintenance: boolean("in_maintenance").notNull().default(false),
    listingDisabled: boolean("listing_disabled").notNull().default(false),
    onboardingSubstage: varchar("onboarding_substage", { length: 64 }),
    bandwidthGroup: varchar("bandwidth_group", { length: 64 }),
    rateLimit: varchar("rate_limit", { length: 64 }),
    /** 闲时合作 idle_time / 整租合作 whole_rent */
    cooperationType: varchar("cooperation_type", { length: 32 }).notNull().default("idle_time"),
    deviceSpec: text("device_spec"),
    /** Excel「设备用途」 */
    devicePurpose: varchar("device_purpose", { length: 255 }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    remark: text("remark"),
    loginUsername: varchar("login_username", { length: 128 }),
    loginPassword: text("login_password"),
    platformResourceId: varchar("platform_resource_id", { length: 128 }),
    reviewStatus: varchar("review_status", { length: 16 }).notNull().default("pending"),
    reviewRemark: text("review_remark"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    deviceRole: varchar("device_role", { length: 16 }).notNull().default("compute"),
    ...supplyTimestamps,
  },
  (table) => [
    uniqueIndex("supplier_device_sn_uk").on(table.sn),
    uniqueIndex("supplier_device_asset_no_uk").on(table.assetNo),
    index("supplier_device_supplier_id_idx").on(table.supplierId),
    index("supplier_device_onboarding_batch_id_idx").on(table.onboardingBatchId),
    index("supplier_device_data_center_id_idx").on(table.dataCenterId),
    index("supplier_device_lifecycle_status_idx").on(table.lifecycleStatus),
    index("supplier_device_idc_code_idx").on(table.idcCode),
    index("supplier_device_ops_status_idx").on(table.opsStatus),
    index("supplier_device_in_maintenance_idx").on(table.inMaintenance),
    index("supplier_device_listing_disabled_idx").on(table.listingDisabled),
    index("supplier_device_external_device_id_idx").on(table.externalDeviceId),
    index("supplier_device_cooperation_type_idx").on(table.cooperationType),
  ],
)

/** 设备 ↔ 业务接入批次（多对多）；进度统计与批次详情设备列表 */
export const onboardingBatchDeviceLink = pgTable(
  "onboarding_batch_device_link",
  {
    id: text("id").primaryKey(),
    businessOnboardingBatchId: text("business_onboarding_batch_id")
      .notNull()
      .references(() => onboardingBatch.id, { onDelete: "cascade" }),
    supplierDeviceId: text("supplier_device_id")
      .notNull()
      .references(() => supplierDevice.id, { onDelete: "cascade" }),
    linkKind: varchar("link_kind", { length: 32 }).notNull().default("touched"),
    sourceChangeLogId: text("source_change_log_id"),
    sourceChangelogBatchId: text("source_changelog_batch_id").references(() => onboardingBatch.id, {
      onDelete: "set null",
    }),
    gpuCardTypeId: text("gpu_card_type_id")
      .notNull()
      .references(() => gpuCardType.id, { onDelete: "restrict" }),
    cooperationType: varchar("cooperation_type", { length: 32 }).notNull(),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("onboarding_batch_device_link_uk").on(
      table.businessOnboardingBatchId,
      table.supplierDeviceId,
    ),
    index("onboarding_batch_device_link_batch_id_idx").on(table.businessOnboardingBatchId),
    index("onboarding_batch_device_link_device_linked_idx").on(
      table.supplierDeviceId,
      table.linkedAt,
    ),
    index("onboarding_batch_device_link_batch_card_coop_idx").on(
      table.businessOnboardingBatchId,
      table.gpuCardTypeId,
      table.cooperationType,
    ),
  ],
)

export const onboardingBatchImportRow = pgTable(
  "onboarding_batch_import_row",
  {
    id: text("id").primaryKey(),
    onboardingBatchId: text("onboarding_batch_id")
      .notNull()
      .references(() => onboardingBatch.id, { onDelete: "cascade" }),
    rowNo: integer("row_no").notNull(),
    publicIp: varchar("public_ip", { length: 45 }).notNull(),
    privateIp: varchar("private_ip", { length: 45 }).notNull(),
    rootAccount: varchar("root_account", { length: 128 }).notNull(),
    rootPasswordEnc: text("root_password_enc").notNull(),
    sn: varchar("sn", { length: 64 }),
    assetNo: varchar("asset_no", { length: 64 }),
    gpuCount: integer("gpu_count"),
    gpuCardTypeId: text("gpu_card_type_id").references(() => gpuCardType.id, {
      onDelete: "set null",
    }),
    parseStatus: varchar("parse_status", { length: 32 }).notNull(),
    parseMessage: text("parse_message"),
    supplierDeviceId: text("supplier_device_id").references(() => supplierDevice.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    uniqueIndex("onboarding_batch_import_row_uk").on(table.onboardingBatchId, table.rowNo),
    index("onboarding_batch_import_row_batch_id_idx").on(table.onboardingBatchId),
    index("onboarding_batch_import_row_parse_status_idx").on(table.parseStatus),
  ],
)

export const onboardingTask = pgTable(
  "onboarding_task",
  {
    id: text("id").primaryKey(),
    onboardingBatchId: text("onboarding_batch_id")
      .notNull()
      .references(() => onboardingBatch.id, { onDelete: "cascade" }),
    supplierDeviceId: text("supplier_device_id").references(() => supplierDevice.id, {
      onDelete: "set null",
    }),
    taskType: varchar("task_type", { length: 64 }).notNull(),
    assigneeStaffId: text("assignee_staff_id")
      .notNull()
      .references(() => userStaff.id, { onDelete: "restrict" }),
    taskStatus: varchar("task_status", { length: 32 }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("onboarding_task_batch_id_idx").on(table.onboardingBatchId)],
)

export const computeNode = pgTable(
  "compute_node",
  {
    id: text("id").primaryKey(),
    supplierDeviceId: text("supplier_device_id")
      .notNull()
      .references(() => supplierDevice.id, { onDelete: "cascade" }),
    nodeRole: varchar("node_role", { length: 32 }).notNull(),
    mgmtIp: varchar("mgmt_ip", { length: 45 }),
    clusterName: varchar("cluster_name", { length: 128 }),
    nodeName: varchar("node_name", { length: 128 }),
    expectedService: varchar("expected_service", { length: 255 }),
    clusterId: varchar("cluster_id", { length: 64 }),
    lifecycleStatus: varchar("lifecycle_status", { length: 32 }).notNull(),
    ...supplyTimestamps,
  },
  (table) => [
    index("compute_node_supplier_device_id_idx").on(table.supplierDeviceId),
    index("compute_node_cluster_id_idx").on(table.clusterId),
  ],
)

export const supplierDeviceChangeLog = pgTable(
  "supplier_device_change_log",
  {
    id: text("id").primaryKey(),
    supplierDeviceId: text("supplier_device_id")
      .notNull()
      .references(() => supplierDevice.id, { onDelete: "cascade" }),
    /** device_changelog 导入批次 */
    onboardingBatchId: text("onboarding_batch_id")
      .notNull()
      .references(() => onboardingBatch.id, { onDelete: "restrict" }),
    /** 由 ticket_no 解析的业务批次（online/order_access） */
    businessOnboardingBatchId: text("business_onboarding_batch_id").references(
      () => onboardingBatch.id,
      { onDelete: "set null" },
    ),
    internalIp: varchar("internal_ip", { length: 45 }),
    /** Excel「设备ID」原文（常为 IP 或外部 ID） */
    externalDeviceId: varchar("external_device_id", { length: 64 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    changeAction: varchar("change_action", { length: 64 }).notNull(),
    changeContent: text("change_content"),
    description: text("description"),
    ticketNo: varchar("ticket_no", { length: 64 }),
    /** Excel「附件」列：逗号分隔文件名，只读展示 */
    attachmentNames: text("attachment_names"),
    importRowNo: integer("import_row_no"),
    previousOpsStatus: varchar("previous_ops_status", { length: 64 }),
    newOpsStatus: varchar("new_ops_status", { length: 64 }),
    previousLifecycleStatus: varchar("previous_lifecycle_status", { length: 32 }),
    newLifecycleStatus: varchar("new_lifecycle_status", { length: 32 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("supplier_device_change_log_batch_row_uk").on(
      table.onboardingBatchId,
      table.importRowNo,
    ),
    index("supplier_device_change_log_device_occurred_idx").on(
      table.supplierDeviceId,
      table.occurredAt,
    ),
    index("supplier_device_change_log_batch_id_idx").on(table.onboardingBatchId),
    index("supplier_device_change_log_ticket_no_idx").on(table.ticketNo),
    index("supplier_device_change_log_business_batch_id_idx").on(table.businessOnboardingBatchId),
    index("supplier_device_change_log_business_device_idx").on(
      table.businessOnboardingBatchId,
      table.supplierDeviceId,
    ),
  ],
)

export const supplierGpuInventory = pgTable(
  "supplier_gpu_inventory",
  {
    id: text("id").primaryKey(),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => supplier.id, { onDelete: "restrict" }),
    dataCenterId: text("data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "restrict" }),
    gpuCardTypeId: text("gpu_card_type_id")
      .notNull()
      .references(() => gpuCardType.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull().default(0),
    onlineQuantity: integer("online_quantity").notNull().default(0),
    status: varchar("status", { length: 32 }).notNull(),
    isInternalTest: boolean("is_internal_test").notNull().default(false),
    internalTestScope: varchar("internal_test_scope", { length: 255 }),
    internalTestUntil: timestamp("internal_test_until", { withTimezone: true }),
    cardTimeCostPerHour: money("card_time_cost_per_hour"),
    revenueShareCostPerHour: money("revenue_share_cost_per_hour"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("supplier_gpu_inventory_uk").on(
      table.supplierId,
      table.dataCenterId,
      table.gpuCardTypeId,
    ),
  ],
)

/**
 * 机房 × 卡型设备配置（独立主数据，不读 supplier_device）
 * 仅维护 device_spec；带宽/网络/存储见 supplier_datacenter_infrastructure
 */
export const supplierDatacenterCardTypeSpec = pgTable(
  "supplier_datacenter_card_type_spec",
  {
    id: text("id").primaryKey(),
    dataCenterId: text("data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "cascade" }),
    gpuCardTypeId: text("gpu_card_type_id")
      .notNull()
      .references(() => gpuCardType.id, { onDelete: "restrict" }),
    deviceSpec: text("device_spec"),
    remark: text("remark"),
    updatedByStaffId: text("updated_by_staff_id"),
    ...supplyTimestamps,
  },
  (table) => [
    uniqueIndex("supplier_datacenter_card_type_spec_uk").on(
      table.dataCenterId,
      table.gpuCardTypeId,
    ),
    index("supplier_datacenter_card_type_spec_card_idx").on(table.gpuCardTypeId),
  ],
)

/**
 * 机房级带宽 / 网络 / 存储配置（结构化 JSON，按机房唯一）
 */
export const supplierDatacenterInfrastructure = pgTable(
  "supplier_datacenter_infrastructure",
  {
    id: text("id").primaryKey(),
    dataCenterId: text("data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "cascade" }),
    bandwidthConfig: jsonb("bandwidth_config").$type<Record<string, unknown>>(),
    networkConfig: jsonb("network_config").$type<Record<string, unknown>>(),
    storageConfig: jsonb("storage_config").$type<Record<string, unknown>>(),
    updatedByStaffId: text("updated_by_staff_id"),
    ...supplyTimestamps,
  },
  (table) => [uniqueIndex("supplier_datacenter_infrastructure_uk").on(table.dataCenterId)],
)

// ---------------------------------------------------------------------------
// §3.5 运维：故障、测试、资源池
// ---------------------------------------------------------------------------

export const faultIncident = pgTable(
  "fault_incident",
  {
    id: text("id").primaryKey(),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => supplier.id, { onDelete: "restrict" }),
    supplierOpsUploadBatchId: text("supplier_ops_upload_batch_id").references(
      () => supplierOpsUploadBatch.id,
      { onDelete: "set null" },
    ),
    supplierDeviceId: text("supplier_device_id").references(() => supplierDevice.id, {
      onDelete: "set null",
    }),
    computeNodeId: text("compute_node_id").references(() => computeNode.id, {
      onDelete: "set null",
    }),
    faultType: varchar("fault_type", { length: 64 }).notNull(),
    severity: varchar("severity", { length: 8 }).notNull().default("P3"),
    incidentStatus: varchar("incident_status", { length: 32 }).notNull(),
    impactMinutes: integer("impact_minutes"),
    impactScope: varchar("impact_scope", { length: 255 }),
    affectedDeviceCount: integer("affected_device_count"),
    postmortem: text("postmortem"),
    resolutionOutcome: text("resolution_outcome"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("fault_incident_supplier_id_opened_idx").on(table.supplierId, table.openedAt),
    index("fault_incident_supplier_device_id_idx").on(table.supplierDeviceId),
    index("fault_incident_compute_node_id_idx").on(table.computeNodeId),
    index("fault_incident_ops_upload_batch_id_idx").on(table.supplierOpsUploadBatchId),
    index("fault_incident_fault_type_idx").on(table.faultType),
  ],
)

export const internalTestHold = pgTable(
  "internal_test_hold",
  {
    id: text("id").primaryKey(),
    /** 台账登记：供应商 / 机房 */
    supplierId: text("supplier_id").references(() => supplier.id, { onDelete: "restrict" }),
    dataCenterId: text("data_center_id").references(() => dataCenter.id, { onDelete: "restrict" }),
    workOrderNo: varchar("work_order_no", { length: 64 }),
    userName: varchar("user_name", { length: 128 }),
    department: varchar("department", { length: 32 }),
    settlementMode: varchar("settlement_mode", { length: 32 }),
    gpuCardTypeId: text("gpu_card_type_id").references(() => gpuCardType.id, {
      onDelete: "restrict",
    }),
    unitCount: integer("unit_count"),
    remark: text("remark"),
    supplierDeviceId: text("supplier_device_id").references(() => supplierDevice.id, {
      onDelete: "cascade",
    }),
    supplierGpuInventoryId: text("supplier_gpu_inventory_id").references(
      () => supplierGpuInventory.id,
      { onDelete: "cascade" },
    ),
    scope: varchar("scope", { length: 255 }).notNull().default("planned"),
    holdFrom: timestamp("hold_from", { withTimezone: true }).notNull(),
    holdUntil: timestamp("hold_until", { withTimezone: true }),
    /** 关联 internal_occupancy 计划批次；独立登记时为 NULL */
    onboardingBatchId: text("onboarding_batch_id").references(() => onboardingBatch.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("internal_test_hold_supplier_device_id_idx").on(table.supplierDeviceId),
    index("internal_test_hold_inventory_id_idx").on(table.supplierGpuInventoryId),
    index("internal_test_hold_supplier_id_idx").on(table.supplierId),
    index("internal_test_hold_data_center_id_idx").on(table.dataCenterId),
    index("internal_test_hold_work_order_no_idx").on(table.workOrderNo),
    index("internal_test_hold_onboarding_batch_id_idx").on(table.onboardingBatchId),
  ],
)

/** 内部占用台账 ↔ 已录入物理机 */
export const internalTestHoldDeviceLink = pgTable(
  "internal_test_hold_device_link",
  {
    id: text("id").primaryKey(),
    holdId: text("hold_id")
      .notNull()
      .references(() => internalTestHold.id, { onDelete: "cascade" }),
    supplierDeviceId: text("supplier_device_id")
      .notNull()
      .references(() => supplierDevice.id, { onDelete: "cascade" }),
    port: varchar("port", { length: 16 }).notNull().default("22"),
    loginUsername: varchar("login_username", { length: 128 }).notNull(),
    loginPassword: text("login_password").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("internal_test_hold_device_link_uk").on(table.holdId, table.supplierDeviceId),
    index("internal_test_hold_device_link_hold_id_idx").on(table.holdId),
  ],
)

export const resourcePoolBinding = pgTable(
  "resource_pool_binding",
  {
    id: text("id").primaryKey(),
    supplierDeviceId: text("supplier_device_id")
      .notNull()
      .references(() => supplierDevice.id, { onDelete: "cascade" }),
    resourcePoolId: varchar("resource_pool_id", { length: 128 }),
    poolCode: varchar("pool_code", { length: 64 }),
    workloadProfile: varchar("workload_profile", { length: 32 }).notNull(),
    isExclusivePool: boolean("is_exclusive_pool").notNull().default(false),
    boundAt: timestamp("bound_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("resource_pool_binding_supplier_device_id_idx").on(table.supplierDeviceId)],
)

export const supplierOpsUploadBatch = pgTable(
  "supplier_ops_upload_batch",
  {
    id: text("id").primaryKey(),
    kind: varchar("kind", { length: 32 }).notNull(),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => supplier.id, { onDelete: "restrict" }),
    idcCode: varchar("idc_code", { length: 64 }).notNull(),
    accessMethod: varchar("access_method", { length: 32 }),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    rowsJson: jsonb("rows_json").notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    importStatus: varchar("import_status", { length: 32 }).notNull().default("uploaded"),
    parseError: text("parse_error"),
    parsedRowCount: integer("parsed_row_count").notNull().default(0),
    parsedSuccessCount: integer("parsed_success_count").notNull().default(0),
    committedIncidentCount: integer("committed_incident_count").notNull().default(0),
    committedAt: timestamp("committed_at", { withTimezone: true }),
    onboardingBatchId: text("onboarding_batch_id").references(() => onboardingBatch.id, {
      onDelete: "set null",
    }),
    createdByStaffId: text("created_by_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("supplier_ops_upload_batch_supplier_id_idx").on(table.supplierId),
    index("supplier_ops_upload_batch_onboarding_batch_id_idx").on(table.onboardingBatchId),
    index("supplier_ops_upload_batch_import_status_idx").on(table.importStatus),
  ],
)

// ---------------------------------------------------------------------------
// §3.6 生命周期字典与审计
// ---------------------------------------------------------------------------

export const lifecycleStateDefinition = pgTable(
  "lifecycle_state_definition",
  {
    id: text("id").primaryKey(),
    /** device_ops_status | device_change_action | … */
    domain: varchar("domain", { length: 32 }).notNull(),
    /** Excel 原文：设备状态或变更动作 */
    stateCode: varchar("state_code", { length: 64 }).notNull(),
    displayName: varchar("display_name", { length: 128 }).notNull(),
    sortOrder: integer("sort_order").notNull(),
    /**
     * device_ops_status: { lifecycle_status, overview_bucket, tags? }
     * device_change_action: { default_ops_status?, updates_compute_node? }
     */
    payload: jsonb("payload"),
  },
  (table) => [
    uniqueIndex("lifecycle_state_definition_uk").on(table.domain, table.stateCode),
    index("lifecycle_state_definition_domain_idx").on(table.domain),
  ],
)

export const entityStateTransitionLog = pgTable(
  "entity_state_transition_log",
  {
    id: text("id").primaryKey(),
    entityType: varchar("entity_type", { length: 32 }).notNull(),
    entityId: text("entity_id").notNull(),
    fromState: varchar("from_state", { length: 64 }).notNull(),
    toState: varchar("to_state", { length: 64 }).notNull(),
    operatorStaffId: text("operator_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    reasonCode: varchar("reason_code", { length: 64 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    payload: jsonb("payload"),
  },
  (table) => [
    index("entity_state_transition_log_entity_idx").on(
      table.entityType,
      table.entityId,
      table.occurredAt,
    ),
  ],
)

// ---------------------------------------------------------------------------
// §3.7 供应商结算账单
// ---------------------------------------------------------------------------

export const supplierBill = pgTable(
  "supplier_bill",
  {
    id: text("id").primaryKey(),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => supplier.id, { onDelete: "restrict" }),
    billMonth: varchar("bill_month", { length: 7 }).notNull(),
    cooperationMode: varchar("cooperation_mode", { length: 32 }).notNull(),
    // 回填说明：出账前的历史账单由旧生成器统一按 usage_hours * unit_cost（卡时）计算，
    // 从未走过 billingUnit 分成，因此历史行的 pricing_mode 一律为 card_time。
    // 保留 default 是为了让 0023 的 ADD COLUMN 在有数据的库上也能直接落地。
    pricingMode: varchar("pricing_mode", { length: 32 }).notNull().default("card_time"),
    status: varchar("status", { length: 32 }).notNull(),
    totalUsageHours: money("total_usage_hours").notNull(),
    totalAmount: money("total_amount").notNull(),
    networkFee: money("network_fee").notNull(),
    managementFee: money("management_fee").notNull(),
    storageFee: money("storage_fee").notNull().default("0"),
    finalAmount: money("final_amount").notNull(),
    dueDate: date("due_date").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),

    // ---- 结算审计（S-6）----
    /** 供应商确认时间；pending 阶段为 null */
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    /** 确认操作人（user_staff.id 或 organization.id，由 source 决定） */
    confirmedBy: text("confirmed_by"),
    confirmedBySource: varchar("confirmed_by_source", { length: 16 }),

    // ---- 付款信息（W-7）----
    /** 银行回单号 / 支付流水号 */
    paymentReference: varchar("payment_reference", { length: 128 }),
    /** 实际付款操作人 */
    paidBy: text("paid_by"),
    /** 人工调整额（正数加收、负数扣减），默认 0 */
    adjustmentAmount: money("adjustment_amount").notNull().default("0"),
    adjustmentReason: varchar("adjustment_reason", { length: 255 }),

    // 说明（业务确认）：账单金额只由「设备用量 × 定价记录」与「客户消费 × 分成比例」
    // 决定，不绑定具体合同。因此这里刻意不设 contract_id —— 定价本身挂在
    // supplier_pricing_record（供应商 × 机房 × 卡型）上，与合同生命周期解耦。

    // ---- 毛利拆分（W-14，openmeter-billing-design 5.4）----
    // 历史账单由旧生成器统一按卡时计费，故 revenue_share / whole_rent 恒为 0；
    // gross_profit 仅在平台侧成本可用时才有意义，缺数据时同样为 0。
    /** 分成收入 = 客户消费 × 分成比例 */
    supplierRevenueShareAmount: money("supplier_revenue_share_amount").notNull().default("0"),
    /** 卡时收入 = 卡时 × 单价 */
    supplierCardTimeAmount: money("supplier_card_time_amount").notNull().default("0"),
    /** 整租收入 = 月租 × 天数折算 */
    supplierWholeRentAmount: money("supplier_whole_rent_amount").notNull().default("0"),
    /** 券抵扣成本（平台承担部分） */
    voucherCostAmount: money("voucher_cost_amount").notNull().default("0"),
    /** 毛利 = 平台收入 − 供应商应付 − 券成本 */
    grossProfit: money("gross_profit").notNull().default("0"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("supplier_bill_supplier_month_uk").on(table.supplierId, table.billMonth),
    index("supplier_bill_supplier_id_idx").on(table.supplierId),
    index("supplier_bill_status_due_date_idx").on(table.status, table.dueDate),
  ],
)

export const supplierBillDetail = pgTable(
  "supplier_bill_detail",
  {
    id: text("id").primaryKey(),
    billId: text("bill_id")
      .notNull()
      .references(() => supplierBill.id, { onDelete: "cascade" }),
    dataCenterId: text("data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "restrict" }),
    gpuCardTypeId: text("gpu_card_type_id")
      .notNull()
      .references(() => gpuCardType.id, { onDelete: "restrict" }),
    // 回填说明：出账前的历史账单由旧生成器统一按 usage_hours * unit_cost（卡时）计算，
    // 从未走过 billingUnit 分成，因此历史行的 pricing_mode 一律为 card_time。
    // 保留 default 是为了让 0023 的 ADD COLUMN 在有数据的库上也能直接落地。
    pricingMode: varchar("pricing_mode", { length: 32 }).notNull().default("card_time"),
    usageHours: money("usage_hours").notNull(),
    unitCost: money("unit_cost").notNull(),
    amount: money("amount").notNull(),
    /** 客户消费金额（分成计价的计算基数）；卡时计价为 null。取自
     *  tenant_region_gpu_consumption_{daily,monthly}.total_consumption */
    tenantConsumption: money("tenant_consumption"),
  },
  (table) => [index("supplier_bill_detail_bill_id_idx").on(table.billId)],
)

export const supplierBillDaily = pgTable(
  "supplier_bill_daily",
  {
    id: text("id").primaryKey(),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => supplier.id, { onDelete: "restrict" }),
    dataCenterId: text("data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "restrict" }),
    usageDate: date("usage_date").notNull(),
    usageMonth: varchar("usage_month", { length: 7 }).notNull(),
    cooperationMode: varchar("cooperation_mode", { length: 32 }).notNull(),
    totalUsageHours: money("total_usage_hours").notNull(),
    totalAmount: money("total_amount").notNull(),
    networkFeeDaily: money("network_fee_daily").notNull().default("0"),
    mgmtFeeDaily: money("mgmt_fee_daily").notNull().default("0"),
    storageFeeDaily: money("storage_fee_daily").notNull().default("0"),
    onlineDeviceCount: integer("online_device_count").notNull().default(0),
    rentedGpuCount: integer("rented_gpu_count").notNull().default(0),
    idleGpuCount: integer("idle_gpu_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // 账单身份 = 供应商 × 机房 × 用量日。cooperationMode 是「由当前设备状态
    // 动态解析出的派生值」，不属于账单身份：此前把它放进唯一索引，导致
    // 设备合作模式在当天变化后该日账单永远无法重算（幂等预检查与索引不一致）。
    uniqueIndex("supplier_bill_daily_uk").on(
      table.supplierId,
      table.dataCenterId,
      table.usageDate,
    ),
    index("supplier_bill_daily_supplier_month_idx").on(table.supplierId, table.usageMonth),
    index("supplier_bill_daily_date_idx").on(table.usageDate),
  ],
)

export const supplierBillDailyDetail = pgTable(
  "supplier_bill_daily_detail",
  {
    id: text("id").primaryKey(),
    dailyBillId: text("daily_bill_id")
      .notNull()
      .references(() => supplierBillDaily.id, { onDelete: "cascade" }),
    gpuCardTypeId: text("gpu_card_type_id")
      .notNull()
      .references(() => gpuCardType.id, { onDelete: "restrict" }),
    // Device-level attribution. NULL = usage not attributable to a single device
    // (residual bucket); rows with a deviceId are the authoritative per-device split.
    deviceId: text("device_id").references(() => supplierDevice.id, {
      onDelete: "restrict",
    }),
    /**
     * W-12：出账时从 `supplier_device.contract_id` 快照下来的合同。
     *
     * 合同追溯只能落在设备粒度：日/月账单按 (机房, 卡型) 聚合，同一 (机房, 卡型)
     * 可被多份合同覆盖，因此账单头与明细头挂单个 `contract_id` 语义不成立，
     * 设备粒度才有唯一合同。
     *
     * 残差桶行（卡型总量 − 已归因设备量）不对应任何设备，`contract_id` 置 null：
     * 宁可承认归因不到合同，也不把差额挂到某份合同上让对账看起来是完整的。
     */
    contractId: text("contract_id").references(() => supplierContract.id, {
      onDelete: "set null",
    }),
    usageHours: money("usage_hours").notNull(),
    unitCost: money("unit_cost").notNull(),
    amount: money("amount").notNull(),
    /** 客户消费金额（分成计价的计算基数）；卡时计价为 null */
    tenantConsumption: money("tenant_consumption"),
  },
  (table) => [
    uniqueIndex("supplier_bill_daily_detail_uk").on(
      table.dailyBillId,
      table.gpuCardTypeId,
      sql`coalesce(${table.deviceId}, '')`,
    ),
    index("supplier_bill_daily_detail_bill_idx").on(table.dailyBillId),
    index("supplier_bill_daily_detail_device_idx").on(table.deviceId),
  ],
)

// ---------------------------------------------------------------------------
// §3.8 租户裸金属订单（bare-metal-order-schema-design.md v1.3）
// ---------------------------------------------------------------------------

export const bareMetalOrderImportBatch = pgTable(
  "bare_metal_order_import_batch",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => crmProject.id, { onDelete: "restrict" }),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => billingTenant.id, { onDelete: "restrict" }),
    bareMetalOrderId: text("bare_metal_order_id").references((): AnyPgColumn => bareMetalOrder.id, {
      onDelete: "set null",
    }),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    fileUri: varchar("file_uri", { length: 1024 }),
    fileHash: varchar("file_hash", { length: 64 }),
    rowCount: integer("row_count").notNull().default(0),
    committedAt: timestamp("committed_at", { withTimezone: true }),
    createdByStaffId: text("created_by_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("bare_metal_order_import_batch_project_id_idx").on(table.projectId),
    index("bare_metal_order_import_batch_tenant_id_idx").on(table.tenantId),
  ],
)

export const bareMetalOrder = pgTable(
  "bare_metal_order",
  {
    id: text("id").primaryKey(),
    platformOrderId: varchar("platform_order_id", { length: 64 }),
    orderNo: varchar("order_no", { length: 128 }),
    orderMark: varchar("order_mark", { length: 16 }).notNull(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => billingTenant.id, { onDelete: "restrict" }),
    platformTenantId: varchar("platform_tenant_id", { length: 128 }).notNull(),
    /** 冗余：= tenant.merchant_id（设计 v1.7） */
    merchantId: text("merchant_id").notNull(),
    customerId: text("customer_id").references(() => customer.id, { onDelete: "set null" }),
    projectId: text("project_id").references(() => crmProject.id, { onDelete: "set null" }),
    dataCenterId: text("data_center_id").references(() => dataCenter.id, { onDelete: "set null" }),
    supplierId: text("supplier_id").references(() => supplier.id, { onDelete: "set null" }),
    idcCode: varchar("idc_code", { length: 64 }),
    idcName: varchar("idc_name", { length: 128 }),
    status: varchar("status", { length: 32 }).notNull(),
    payStatus: varchar("pay_status", { length: 32 }).notNull(),
    billingUnit: varchar("billing_unit", { length: 16 }).notNull(),
    purchaseQty: integer("purchase_qty"),
    purchaseQtyText: varchar("purchase_qty_text", { length: 128 }),
    deviceCount: integer("device_count").notNull().default(0),
    gpuCount: integer("gpu_count").notNull().default(0),
    orderAmount: money("order_amount"),
    refundAmount: money("refund_amount").notNull().default("0"),
    finalAmount: money("final_amount").notNull(),
    balanceAmount: money("balance_amount").notNull().default("0"),
    couponAmount: money("coupon_amount").notNull().default("0"),
    orderedAt: timestamp("ordered_at", { withTimezone: true }).notNull(),
    /** 首次写入 CRM（平台同步 / 线下导入）时间；UPDATE 不修改，供财务按入库时间筛选账期 */
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    rentStartsAt: timestamp("rent_starts_at", { withTimezone: true }),
    rentEndsAt: timestamp("rent_ends_at", { withTimezone: true }),
    importBatchId: text("import_batch_id").references(() => bareMetalOrderImportBatch.id, {
      onDelete: "set null",
    }),
    source: varchar("source", { length: 32 }).notNull().default("platform_sync"),
    platformPayload: jsonb("platform_payload").notNull().default({}),
    matchFlags: jsonb("match_flags").notNull().default({}),
    remark: text("remark"),
    // ---- consumer-facing fields (gpus app) ----
    /** 关联 GPU 工作空间 */
    workspaceId: text("workspace_id"),
    /** 用户自定义订单名称 */
    description: varchar("description", { length: 255 }),
    /** 关联支付订单 */
    paymentOrderId: text("payment_order_id"),
    /** 部署配置（环境模板、SSH、自动续租等） */
    deployConfig: jsonb("deploy_config").notNull().default({}),
    /** 组织 ID（与 gpus 消费者域对齐） */
    organizationId: varchar("organization_id", { length: 64 }),
    // ---- consumer-facing fields (gpus app, bare metal commercialization) ----
    /** 是否启用 SSH */
    sshEnabled: boolean("ssh_enabled").notNull().default(false),
    /** SSH 公钥 */
    sshPublicKey: text("ssh_public_key"),
    /** 是否自动续租 */
    autoRenew: boolean("auto_renew").notNull().default(false),
    /** 下次计费时间 */
    nextBillingAt: timestamp("next_billing_at", { withTimezone: true }),
    /** 续租次数 */
    renewCount: integer("renew_count").notNull().default(0),
    /** 逾期重试计数（续费失败时递增，达到 3 次转 overdue） */
    overdueRetries: integer("overdue_retries").notNull().default(0),
    /** 逾期时间 */
    overdueAt: timestamp("overdue_at", { withTimezone: true }),
    ...supplyTimestamps,
  },
  (table) => [
    uniqueIndex("bare_metal_order_platform_order_id_uk")
      .on(table.platformOrderId)
      .where(sql`${table.platformOrderId} IS NOT NULL`),
    uniqueIndex("bare_metal_order_order_no_uk")
      .on(table.orderNo)
      .where(sql`${table.orderNo} IS NOT NULL`),
    index("bare_metal_order_tenant_ordered_idx").on(table.tenantId, table.orderedAt),
    index("bare_metal_order_project_ordered_idx").on(table.projectId, table.orderedAt),
    index("bare_metal_order_data_center_idx").on(table.dataCenterId),
    index("bare_metal_order_status_idx").on(table.status),
    index("bare_metal_order_order_mark_idx").on(table.orderMark),
    index("bare_metal_order_ordered_at_idx").on(table.orderedAt),
    index("bare_metal_order_imported_at_idx").on(table.importedAt),
    index("bare_metal_order_merchant_ordered_idx").on(table.merchantId, table.orderedAt),
  ],
)

export const bareMetalOrderDevice = pgTable(
  "bare_metal_order_device",
  {
    id: text("id").primaryKey(),
    bareMetalOrderId: text("bare_metal_order_id")
      .notNull()
      .references(() => bareMetalOrder.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    allocationStatus: varchar("allocation_status", { length: 32 }).notNull().default("planned"),
    gpuCardTypeId: text("gpu_card_type_id").references(() => gpuCardType.id, {
      onDelete: "set null",
    }),
    deviceModelText: varchar("device_model_text", { length: 128 }),
    gpuCount: integer("gpu_count").notNull().default(0),
    platformDeviceId: varchar("platform_device_id", { length: 128 }),
    supplierDeviceId: text("supplier_device_id").references(() => supplierDevice.id, {
      onDelete: "set null",
    }),
    deviceStatus: varchar("device_status", { length: 32 }),
    sn: varchar("sn", { length: 64 }),
    assetNo: varchar("asset_no", { length: 64 }),
    externalIp: varchar("external_ip", { length: 45 }),
    internalIp: varchar("internal_ip", { length: 45 }),
    lineAmount: money("line_amount"),
    durationHours: money("duration_hours"),
    unitPricePerCardHour: money("unit_price_per_card_hour"),
    rentStartsAt: timestamp("rent_starts_at", { withTimezone: true }),
    rentEndsAt: timestamp("rent_ends_at", { withTimezone: true }),
    linkedAt: timestamp("linked_at", { withTimezone: true }),
    platformPayload: jsonb("platform_payload").notNull().default({}),
    matchFlags: jsonb("match_flags").notNull().default({}),
    ...supplyTimestamps,
  },
  (table) => [
    uniqueIndex("bare_metal_order_device_order_line_uk").on(
      table.bareMetalOrderId,
      table.lineNo,
    ),
    index("bare_metal_order_device_order_id_idx").on(table.bareMetalOrderId),
    index("bare_metal_order_device_supplier_device_idx").on(table.supplierDeviceId),
    uniqueIndex("bare_metal_order_device_supplier_device_active_uk")
      .on(table.supplierDeviceId)
      .where(
        sql`${table.supplierDeviceId} IS NOT NULL AND ${table.allocationStatus} <> 'released'`,
      ),
    uniqueIndex("bare_metal_order_device_platform_device_uk")
      .on(table.platformDeviceId)
      .where(sql`${table.platformDeviceId} IS NOT NULL`),
    index("bare_metal_order_device_gpu_card_type_idx").on(table.gpuCardTypeId),
  ],
)

export const bareMetalSyncJobRun = pgTable(
  "bare_metal_sync_job_run",
  {
    id: text("id").primaryKey(),
    trigger: varchar("trigger", { length: 16 }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: varchar("status", { length: 16 }).notNull(),
    ordersFetchedCount: integer("orders_fetched_count").notNull().default(0),
    unknownTenantCount: integer("unknown_tenant_count").notNull().default(0),
    tenantsAutoImportedCount: integer("tenants_auto_imported_count").notNull().default(0),
    billingSyncTenantCount: integer("billing_sync_tenant_count").notNull().default(0),
    orderUpsertedCount: integer("order_upserted_count").notNull().default(0),
    successCount: integer("success_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    errorSummary: text("error_summary"),
  },
  (table) => [
    index("bare_metal_sync_job_run_started_at_idx").on(table.startedAt),
    index("bare_metal_sync_job_run_status_idx").on(table.status),
  ],
)

export const bareMetalSyncJobItem = pgTable(
  "bare_metal_sync_job_item",
  {
    id: text("id").primaryKey(),
    jobRunId: text("job_run_id")
      .notNull()
      .references(() => bareMetalSyncJobRun.id, { onDelete: "cascade" }),
    platformTenantId: varchar("platform_tenant_id", { length: 128 }).notNull(),
    tenantId: text("tenant_id").references(() => billingTenant.id, { onDelete: "set null" }),
    phase: varchar("phase", { length: 32 }).notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    orderCount: integer("order_count").notNull().default(0),
    errorMessage: text("error_message"),
    platformOrderId: varchar("platform_order_id", { length: 64 }),
    orderNo: varchar("order_no", { length: 128 }),
    errorCode: varchar("error_code", { length: 32 }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByStaffId: text("resolved_by_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    platformPayload: jsonb("platform_payload").notNull().default({}),
  },
  (table) => [
    index("bare_metal_sync_job_item_job_run_id_idx").on(table.jobRunId),
    index("bare_metal_sync_job_item_platform_tenant_id_idx").on(table.platformTenantId),
    index("bare_metal_sync_job_item_job_phase_status_idx").on(
      table.jobRunId,
      table.phase,
      table.status,
    ),
    index("bare_metal_sync_job_item_phase_status_resolved_idx").on(
      table.phase,
      table.status,
      table.resolvedAt,
    ),
    index("bare_metal_sync_job_item_platform_order_id_idx")
      .on(table.platformOrderId)
      .where(sql`${table.platformOrderId} IS NOT NULL`),
  ],
)

export const bareMetalSyncState = pgTable("bare_metal_sync_state", {
  id: text("id").primaryKey(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  /** 裸金属订单增量同步游标（东八区自然日，含 endDate 当日） */
  orderSyncCursorEndDate: date("order_sync_cursor_end_date"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

// ---------------------------------------------------------------------------
// §3.7 裸金属订单商业化扩展
// ---------------------------------------------------------------------------

/** 裸金属订单价格快照（创建订单时锁定价格） */
export const bareMetalOrderPriceSnapshot = pgTable(
  "bare_metal_order_price_snapshot",
  {
    id: text("id").primaryKey(),
    bareMetalOrderId: text("bare_metal_order_id")
      .notNull()
      .references(() => bareMetalOrder.id, { onDelete: "cascade" }),
    /** 锁定时的单价 */
    unitPricePerCardHour: money("unit_price_per_card_hour").notNull(),
    /** 锁定时的卡数 */
    gpuCount: integer("gpu_count").notNull(),
    /** 锁定时的订单总额 */
    orderAmount: money("order_amount").notNull(),
    /** 货币 */
    currency: varchar("currency", { length: 8 }).notNull().default("CNY"),
    /** 价格来源描述 */
    priceSource: varchar("price_source", { length: 64 }),
    createdAt: ts("created_at"),
  },
  (table) => [
    index("bare_metal_order_price_snapshot_order_idx").on(table.bareMetalOrderId),
  ],
)

/** 裸金属订单审计日志（不可变） */
export const bareMetalOrderLog = pgTable(
  "bare_metal_order_log",
  {
    id: text("id").primaryKey(),
    bareMetalOrderId: text("bare_metal_order_id")
      .notNull()
      .references(() => bareMetalOrder.id, { onDelete: "cascade" }),
    /** created | device_allocated | device_released | renewed | auto_renewed | cancelled | status_changed */
    eventType: varchar("event_type", { length: 32 }).notNull(),
    /** 事件前状态 */
    previousStatus: varchar("previous_status", { length: 32 }),
    /** 事件后状态 */
    newStatus: varchar("new_status", { length: 32 }),
    /** 事件描述 */
    description: text("description"),
    /** 事件详情 JSON */
    detail: jsonb("detail"),
    /** 操作人 */
    operatorId: varchar("operator_id", { length: 64 }),
    /** 操作来源: user | system | cron */
    operatorSource: varchar("operator_source", { length: 16 }).notNull().default("user"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: ts("created_at"),
  },
  (table) => [
    index("bare_metal_order_log_order_idx").on(table.bareMetalOrderId),
    index("bare_metal_order_log_order_occurred_idx").on(table.bareMetalOrderId, table.occurredAt),
    index("bare_metal_order_log_event_type_idx").on(table.eventType),
  ],
)

// ---------------------------------------------------------------------------
// §3.8.1 设备平台探测（supplier-device-platform-probe-design.md）
// ---------------------------------------------------------------------------

export const devicePlatformProbeState = pgTable("device_platform_probe_state", {
  id: text("id").primaryKey(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastSnapshotHour: timestamp("last_snapshot_hour", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

export const devicePlatformProbeJobRun = pgTable(
  "device_platform_probe_job_run",
  {
    id: text("id").primaryKey(),
    trigger: varchar("trigger", { length: 16 }).notNull(),
    snapshotHour: timestamp("snapshot_hour", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: varchar("status", { length: 16 }).notNull(),
    inventoryDeviceCount: integer("inventory_device_count").notNull().default(0),
    proxyFetchedCount: integer("proxy_fetched_count").notNull().default(0),
    k8sFetchedCount: integer("k8s_fetched_count").notNull().default(0),
    bareMetalHitCount: integer("bare_metal_hit_count").notNull().default(0),
    matchedProxyCount: integer("matched_proxy_count").notNull().default(0),
    matchedK8sCount: integer("matched_k8s_count").notNull().default(0),
    matchedBareMetalCount: integer("matched_bare_metal_count").notNull().default(0),
    ambiguousCount: integer("ambiguous_count").notNull().default(0),
    missingPlatformCount: integer("missing_platform_count").notNull().default(0),
    orphanCount: integer("orphan_count").notNull().default(0),
    missingCrmCount: integer("missing_crm_count").notNull().default(0),
    errorSummary: text("error_summary"),
  },
  (table) => [
    index("device_platform_probe_job_run_started_at_idx").on(table.startedAt),
    index("device_platform_probe_job_run_status_idx").on(table.status),
  ],
)

export const devicePlatformProbeSnapshot = pgTable(
  "device_platform_probe_snapshot",
  {
    id: text("id").primaryKey(),
    jobRunId: text("job_run_id")
      .notNull()
      .references(() => devicePlatformProbeJobRun.id, { onDelete: "cascade" }),
    /** crm_inventory=库存锚点；platform_orphan=平台/订单孤儿（CM-7） */
    recordKind: varchar("record_kind", { length: 16 }).notNull().default("crm_inventory"),
    supplierDeviceId: text("supplier_device_id").references(() => supplierDevice.id, {
      onDelete: "cascade",
    }),
    supplierId: text("supplier_id").references(() => supplier.id, { onDelete: "cascade" }),
    dataCenterId: text("data_center_id").references(() => dataCenter.id, {
      onDelete: "set null",
    }),
    sn: varchar("sn", { length: 64 }).notNull(),
    internalIp: varchar("internal_ip", { length: 45 }),
    dataCenterName: varchar("data_center_name", { length: 255 }),
    opsStatus: varchar("ops_status", { length: 64 }),
    lifecycleStatus: varchar("lifecycle_status", { length: 32 }),
    snapshotHour: timestamp("snapshot_hour", { withTimezone: true }).notNull(),
    probeStatus: varchar("probe_status", { length: 32 }).notNull(),
    consistencyFlag: varchar("consistency_flag", { length: 32 }).notNull(),
    presenceCrm: boolean("presence_crm").notNull().default(false),
    presenceProxy: boolean("presence_proxy").notNull().default(false),
    presenceK8s: boolean("presence_k8s").notNull().default(false),
    presenceBareMetal: boolean("presence_bare_metal").notNull().default(false),
    orphanMergeKey: varchar("orphan_merge_key", { length: 128 }),
    proxyMatched: boolean("proxy_matched").notNull().default(false),
    proxyRentStatus: varchar("proxy_rent_status", { length: 64 }),
    proxyIsContainerInstance: boolean("proxy_is_container_instance"),
    proxyPlatformDeviceId: varchar("proxy_platform_device_id", { length: 64 }),
    k8sMatched: boolean("k8s_matched").notNull().default(false),
    k8sDeviceName: varchar("k8s_device_name", { length: 255 }),
    k8sRegion: varchar("k8s_region", { length: 128 }),
    bareMetalMatched: boolean("bare_metal_matched").notNull().default(false),
    bareMetalOrderNo: varchar("bare_metal_order_no", { length: 64 }),
    bareMetalOrderStatus: varchar("bare_metal_order_status", { length: 32 }),
    suggestedAction: text("suggested_action"),
    /** CM-1 一致性判定原因（与 suggested_action 配套落库） */
    consistencyReason: text("consistency_reason"),
    matchFlags: jsonb("match_flags").$type<Record<string, unknown>>().notNull().default({}),
    proxyPayload: jsonb("proxy_payload").$type<Record<string, unknown>>(),
    k8sPayload: jsonb("k8s_payload").$type<Record<string, unknown>>(),
    bareMetalPayload: jsonb("bare_metal_payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("device_platform_probe_snapshot_crm_uk")
      .on(table.supplierDeviceId, table.snapshotHour)
      .where(sql`record_kind = 'crm_inventory' AND supplier_device_id IS NOT NULL`),
    uniqueIndex("device_platform_probe_snapshot_orphan_uk")
      .on(table.snapshotHour, table.orphanMergeKey)
      .where(sql`record_kind = 'platform_orphan' AND orphan_merge_key IS NOT NULL`),
    index("device_platform_probe_snapshot_hour_record_kind_idx").on(
      table.snapshotHour,
      table.recordKind,
    ),
    index("device_platform_probe_snapshot_hour_supplier_idx").on(
      table.snapshotHour,
      table.supplierId,
    ),
    index("device_platform_probe_snapshot_hour_dc_idx").on(
      table.snapshotHour,
      table.dataCenterId,
    ),
    index("device_platform_probe_snapshot_hour_probe_status_idx").on(
      table.snapshotHour,
      table.probeStatus,
    ),
    index("device_platform_probe_snapshot_hour_consistency_idx").on(
      table.snapshotHour,
      table.consistencyFlag,
    ),
    index("device_platform_probe_snapshot_device_hour_desc_idx").on(
      table.supplierDeviceId,
      table.snapshotHour,
    ),
  ],
)

export type OrphanImportDefaultFields = {
  gpu_card_type_id?: string
  ops_status?: string
  lifecycle_status?: string
  onboarding_substage?: string
  cooperation_type?: string
  device_purpose?: string
  in_maintenance?: boolean
}

export const devicePlatformOrphanImportRule = pgTable(
  "device_platform_orphan_import_rule",
  {
    id: text("id").primaryKey(),
    name: varchar("name", { length: 128 }).notNull(),
    supplierId: text("supplier_id").references(() => supplier.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
    priority: integer("priority").notNull().default(100),
    matchField: varchar("match_field", { length: 32 }).notNull(),
    matchOperator: varchar("match_operator", { length: 32 }).notNull(),
    matchValue: varchar("match_value", { length: 255 }).notNull(),
    presenceChannel: varchar("presence_channel", { length: 16 }).notNull().default("any"),
    targetDataCenterId: text("target_data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "restrict" }),
    defaultFieldsJson: jsonb("default_fields_json")
      .$type<OrphanImportDefaultFields>()
      .notNull()
      .default({}),
    autoGpuMatchFromK8s: boolean("auto_gpu_match_from_k8s").notNull().default(false),
    remark: text("remark"),
    createdByStaffId: text("created_by_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    updatedByStaffId: text("updated_by_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    ...supplyTimestamps,
  },
  (table) => [
    index("device_platform_orphan_import_rule_enabled_priority_idx").on(
      table.enabled,
      table.priority,
    ),
    index("device_platform_orphan_import_rule_target_dc_idx").on(table.targetDataCenterId),
    uniqueIndex("device_platform_orphan_import_rule_match_uk")
      .on(
        sql`coalesce(${table.supplierId}, '')`,
        table.matchField,
        table.matchOperator,
        table.matchValue,
      )
      .where(sql`${table.enabled} = true`),
  ],
)

export const devicePlatformOrphanImportBatch = pgTable(
  "device_platform_orphan_import_batch",
  {
    id: text("id").primaryKey(),
    batchCode: varchar("batch_code", { length: 64 }).notNull(),
    snapshotHour: timestamp("snapshot_hour", { withTimezone: true }).notNull(),
    sourceJobRunId: text("source_job_run_id").references(() => devicePlatformProbeJobRun.id, {
      onDelete: "set null",
    }),
    status: varchar("status", { length: 16 }).notNull(),
    ruleIdsJson: jsonb("rule_ids_json").$type<string[]>().notNull().default([]),
    previewRowsJson: jsonb("preview_rows_json").$type<Record<string, unknown>[]>().notNull().default([]),
    committedDeviceCount: integer("committed_device_count").notNull().default(0),
    operatorStaffId: text("operator_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    committedAt: timestamp("committed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("device_platform_orphan_import_batch_code_uk").on(table.batchCode),
    index("device_platform_orphan_import_batch_snapshot_hour_idx").on(table.snapshotHour),
    index("device_platform_orphan_import_batch_status_idx").on(table.status),
  ],
)

export const devicePlatformOrphanImportLink = pgTable(
  "device_platform_orphan_import_link",
  {
    id: text("id").primaryKey(),
    batchId: text("batch_id")
      .notNull()
      .references(() => devicePlatformOrphanImportBatch.id, { onDelete: "cascade" }),
    probeSnapshotId: text("probe_snapshot_id")
      .notNull()
      .references(() => devicePlatformProbeSnapshot.id, { onDelete: "restrict" }),
    supplierDeviceId: text("supplier_device_id")
      .notNull()
      .references(() => supplierDevice.id, { onDelete: "restrict" }),
    matchedRuleId: text("matched_rule_id").references(() => devicePlatformOrphanImportRule.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("device_platform_orphan_import_link_batch_idx").on(table.batchId),
    index("device_platform_orphan_import_link_probe_idx").on(table.probeSnapshotId),
    index("device_platform_orphan_import_link_device_idx").on(table.supplierDeviceId),
  ],
)

// ---------------------------------------------------------------------------
// §3.9 供应商活动时间线
// ---------------------------------------------------------------------------

export const supplierActivityTypeDefinition = pgTable(
  "supplier_activity_type_definition",
  {
    id: text("id").primaryKey(),
    typeCode: varchar("type_code", { length: 64 }).notNull(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    category: varchar("category", { length: 32 }),
    sortOrder: integer("sort_order"),
  },
  (table) => [uniqueIndex("supplier_activity_type_definition_code_uk").on(table.typeCode)],
)

export const supplierActivity = pgTable(
  "supplier_activity",
  {
    id: text("id").primaryKey(),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => supplier.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 64 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    authorStaffId: text("author_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    authorName: varchar("author_name", { length: 128 }),
    authorRole: varchar("author_role", { length: 32 }),
    refDomain: varchar("ref_domain", { length: 64 }),
    refId: text("ref_id"),
    metadata: jsonb("metadata"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("supplier_activity_supplier_occurred_idx").on(table.supplierId, table.occurredAt),
    index("supplier_activity_ref_idx").on(table.refDomain, table.refId),
  ],
)

export const supplierActivityAttachment = pgTable(
  "supplier_activity_attachment",
  {
    id: text("id").primaryKey(),
    activityId: text("activity_id")
      .notNull()
      .references(() => supplierActivity.id, { onDelete: "cascade" }),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    fileSize: bigint("file_size", { mode: "number" }),
    mimeType: varchar("mime_type", { length: 128 }),
    storageUri: varchar("storage_uri", { length: 1024 }).notNull(),
  },
  (table) => [index("supplier_activity_attachment_activity_id_idx").on(table.activityId)],
)

// ---------------------------------------------------------------------------
// §3.9 供应链线索
// ---------------------------------------------------------------------------

export const supplyChainLead = pgTable(
  "supply_chain_lead",
  {
    id: text("id").primaryKey(),
    type: varchar("type", { length: 16 }).notNull(),
    code: varchar("code", { length: 64 }),
    name: varchar("name", { length: 255 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    priority: varchar("priority", { length: 16 }).notNull().default("medium"),
    description: text("description"),
    source: varchar("source", { length: 128 }),
    province: varchar("province", { length: 64 }),
    city: varchar("city", { length: 64 }),
    address: text("address"),
    supplierNameText: varchar("supplier_name_text", { length: 255 }),
    linkedSupplierId: text("linked_supplier_id").references(() => supplier.id, {
      onDelete: "set null",
    }),
    parentSupplierLeadId: text("parent_supplier_lead_id").references(
      (): AnyPgColumn => supplyChainLead.id,
      { onDelete: "set null" },
    ),
    dockingScope: varchar("docking_scope", { length: 32 }),
    estimatedOnlineDate: date("estimated_online_date"),
    ownerStaffId: text("owner_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    convertedSupplierId: text("converted_supplier_id").references(() => supplier.id, {
      onDelete: "set null",
    }),
    convertedDataCenterId: text("converted_data_center_id").references(() => dataCenter.id, {
      onDelete: "set null",
    }),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    convertedBy: text("converted_by").references(() => userStaff.id, { onDelete: "set null" }),
    lostReason: text("lost_reason"),
    lostAt: timestamp("lost_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull(),
    createdBy: text("created_by").references(() => userStaff.id, { onDelete: "set null" }),
    ...supplyTimestamps,
  },
  (table) => [
    index("supply_chain_lead_type_status_idx").on(table.type, table.status),
    index("supply_chain_lead_owner_staff_id_idx").on(table.ownerStaffId),
    index("supply_chain_lead_last_activity_at_idx").on(table.lastActivityAt),
    index("supply_chain_lead_linked_supplier_id_idx").on(table.linkedSupplierId),
    index("supply_chain_lead_converted_supplier_id_idx").on(table.convertedSupplierId),
    index("supply_chain_lead_converted_data_center_id_idx").on(table.convertedDataCenterId),
  ],
)

export const supplyChainLeadContact = pgTable(
  "supply_chain_lead_contact",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id")
      .notNull()
      .references(() => supplyChainLead.id, { onDelete: "cascade" }),
    contactRole: varchar("contact_role", { length: 32 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    title: varchar("title", { length: 64 }),
    phone: varchar("phone", { length: 32 }),
    email: varchar("email", { length: 255 }),
    wechatId: varchar("wechat_id", { length: 128 }),
    isPrimary: boolean("is_primary").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("supply_chain_lead_contact_lead_id_idx").on(table.leadId),
    uniqueIndex("supply_chain_lead_contact_primary_uk")
      .on(table.leadId, table.contactRole)
      .where(sql`${table.isPrimary} = true`),
  ],
)

export const supplyChainLeadGpuSnapshot = pgTable(
  "supply_chain_lead_gpu_snapshot",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id")
      .notNull()
      .references(() => supplyChainLead.id, { onDelete: "cascade" }),
    gpuCardTypeId: text("gpu_card_type_id").references(() => gpuCardType.id, {
      onDelete: "set null",
    }),
    cardTypeName: varchar("card_type_name", { length: 128 }).notNull(),
    totalQuantity: integer("total_quantity").notNull().default(0),
    idleQuantity: integer("idle_quantity").notNull().default(0),
    reservedQuantity: integer("reserved_quantity").notNull().default(0),
    inUseQuantity: integer("in_use_quantity").notNull().default(0),
    unitPricePerHour: money("unit_price_per_hour"),
    availableTime: varchar("available_time", { length: 255 }),
    notes: text("notes"),
    source: varchar("source", { length: 32 }).notNull().default("manual"),
    snapshotAt: timestamp("snapshot_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by").references(() => userStaff.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("supply_chain_lead_gpu_snapshot_lead_card_uk").on(table.leadId, table.cardTypeName),
    index("supply_chain_lead_gpu_snapshot_lead_id_idx").on(table.leadId),
    index("supply_chain_lead_gpu_snapshot_card_type_id_idx").on(table.gpuCardTypeId),
  ],
)

export const supplyChainLeadTag = pgTable(
  "supply_chain_lead_tag",
  {
    id: text("id").primaryKey(),
    name: varchar("name", { length: 128 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("supply_chain_lead_tag_name_uk").on(table.name)],
)

export const supplyChainLeadTagAssignment = pgTable(
  "supply_chain_lead_tag_assignment",
  {
    leadId: text("lead_id")
      .notNull()
      .references(() => supplyChainLead.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => supplyChainLeadTag.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.leadId, table.tagId] }),
    index("supply_chain_lead_tag_assignment_tag_id_idx").on(table.tagId),
  ],
)

export const supplyChainLeadActivity = pgTable(
  "supply_chain_lead_activity",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id")
      .notNull()
      .references(() => supplyChainLead.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 32 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    authorStaffId: text("author_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    authorName: varchar("author_name", { length: 128 }),
    authorRole: varchar("author_role", { length: 32 }),
    metadata: jsonb("metadata"),
    refDomain: varchar("ref_domain", { length: 64 }),
    refId: text("ref_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("supply_chain_lead_activity_lead_occurred_idx").on(table.leadId, table.occurredAt),
  ],
)

export const supplyChainLeadActivityAttachment = pgTable(
  "supply_chain_lead_activity_attachment",
  {
    id: text("id").primaryKey(),
    activityId: text("activity_id")
      .notNull()
      .references(() => supplyChainLeadActivity.id, { onDelete: "cascade" }),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    fileSize: bigint("file_size", { mode: "number" }),
    mimeType: varchar("mime_type", { length: 128 }),
    storageUri: varchar("storage_uri", { length: 1024 }).notNull(),
  },
  (table) => [
    index("supply_chain_lead_activity_attachment_activity_id_idx").on(table.activityId),
  ],
)

export const supplyChainLeadImportBatch = pgTable(
  "supply_chain_lead_import_batch",
  {
    id: text("id").primaryKey(),
    source: varchar("source", { length: 32 }).notNull(),
    fileName: varchar("file_name", { length: 512 }),
    bitableConfigId: text("bitable_config_id"),
    status: varchar("status", { length: 32 }).notNull(),
    rowCount: integer("row_count").notNull().default(0),
    leadCount: integer("lead_count").notNull().default(0),
    okCount: integer("ok_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    previewJson: jsonb("preview_json"),
    operatorStaffId: text("operator_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    committedAt: timestamp("committed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("supply_chain_lead_import_batch_config_idx").on(table.bitableConfigId),
    index("supply_chain_lead_import_batch_created_idx").on(table.createdAt),
  ],
)

export const supplyChainLeadImportBatchItem = pgTable(
  "supply_chain_lead_import_batch_item",
  {
    id: text("id").primaryKey(),
    batchId: text("batch_id")
      .notNull()
      .references(() => supplyChainLeadImportBatch.id, { onDelete: "cascade" }),
    leadId: text("lead_id").references(() => supplyChainLead.id, { onDelete: "set null" }),
    groupKey: varchar("group_key", { length: 255 }),
    rowNos: integer("row_nos").array(),
    action: varchar("action", { length: 32 }).notNull(),
    message: text("message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("supply_chain_lead_import_batch_item_batch_idx").on(table.batchId)],
)

// ---------------------------------------------------------------------------
// Relations（查询用）
// ---------------------------------------------------------------------------

export const supplierRelations = relations(supplier, ({ many, one }) => ({
  organization: one(organization, {
    fields: [supplier.organizationId],
    references: [organization.id],
  }),
  dataCenters: many(dataCenter),
  contracts: many(supplierContract),
  bills: many(supplierBill),
  activities: many(supplierActivity),
  cardListPrices: many(supplierCardListPrice),
  pricingRecords: many(supplierPricingRecord),
  gpuInventories: many(supplierGpuInventory),
  devices: many(supplierDevice),
  onboardingBatches: many(onboardingBatch),
  businessManager: one(userStaff, {
    fields: [supplier.businessManagerStaffId],
    references: [userStaff.id],
  }),
}))

export const dataCenterRelations = relations(dataCenter, ({ one, many }) => ({
  supplier: one(supplier, {
    fields: [dataCenter.supplierId],
    references: [supplier.id],
  }),
  gpuInventories: many(supplierGpuInventory),
  cardListPrices: many(supplierCardListPrice),
  onboardingBatches: many(onboardingBatch),
}))

export const supplierContractRelations = relations(supplierContract, ({ one, many }) => ({
  supplier: one(supplier, {
    fields: [supplierContract.supplierId],
    references: [supplier.id],
  }),
  capacityLines: many(supplierContractCapacityLine),
  pricingTiers: many(supplierPricingTier),
  accessConditionSheets: many(accessConditionSheet),
  termsVersions: many(supplierTermsVersion),
  onboardingBatches: many(onboardingBatch),
}))

export const supplierContractCapacityLineRelations = relations(
  supplierContractCapacityLine,
  ({ one }) => ({
    contract: one(supplierContract, {
      fields: [supplierContractCapacityLine.contractId],
      references: [supplierContract.id],
    }),
    dataCenter: one(dataCenter, {
      fields: [supplierContractCapacityLine.dataCenterId],
      references: [dataCenter.id],
    }),
    gpuCardType: one(gpuCardType, {
      fields: [supplierContractCapacityLine.gpuCardTypeId],
      references: [gpuCardType.id],
    }),
  }),
)

export const onboardingBatchRelations = relations(onboardingBatch, ({ one, many }) => ({
  supplier: one(supplier, {
    fields: [onboardingBatch.supplierId],
    references: [supplier.id],
  }),
  dataCenter: one(dataCenter, {
    fields: [onboardingBatch.dataCenterId],
    references: [dataCenter.id],
  }),
  contract: one(supplierContract, {
    fields: [onboardingBatch.contractId],
    references: [supplierContract.id],
  }),
  accessConditionSheet: one(accessConditionSheet, {
    fields: [onboardingBatch.accessConditionSheetId],
    references: [accessConditionSheet.id],
  }),
  importRows: many(onboardingBatchImportRow),
  planLines: many(onboardingBatchPlanLine),
  progressEvents: many(onboardingBatchProgressEvent),
  tasks: many(onboardingTask),
  /** supplier_device.onboarding_batch_id（仅 inventory 批次） */
  inventoryDevices: many(supplierDevice, {
    relationName: "inventoryOnboardingBatch",
  }),
  deviceLinks: many(onboardingBatchDeviceLink, {
    relationName: "businessBatchDeviceLinks",
  }),
  parentBatch: one(onboardingBatch, {
    fields: [onboardingBatch.parentBatchId],
    references: [onboardingBatch.id],
    relationName: "parentBatch",
  }),
  childImportBatches: many(onboardingBatch, {
    relationName: "parentBatch",
  }),
  changelogChangeLogs: many(supplierDeviceChangeLog, {
    relationName: "changelogImportBatch",
  }),
  businessChangeLogs: many(supplierDeviceChangeLog, {
    relationName: "businessOnboardingBatch",
  }),
  createdBy: one(userStaff, {
    fields: [onboardingBatch.createdByStaffId],
    references: [userStaff.id],
  }),
}))

export const supplierDeviceRelations = relations(supplierDevice, ({ one, many }) => ({
  supplier: one(supplier, {
    fields: [supplierDevice.supplierId],
    references: [supplier.id],
  }),
  dataCenter: one(dataCenter, {
    fields: [supplierDevice.dataCenterId],
    references: [dataCenter.id],
  }),
  gpuCardType: one(gpuCardType, {
    fields: [supplierDevice.gpuCardTypeId],
    references: [gpuCardType.id],
  }),
  inventoryOnboardingBatch: one(onboardingBatch, {
    fields: [supplierDevice.onboardingBatchId],
    references: [onboardingBatch.id],
    relationName: "inventoryOnboardingBatch",
  }),
  businessBatchLinks: many(onboardingBatchDeviceLink),
  computeNodes: many(computeNode),
  changeLogs: many(supplierDeviceChangeLog),
  poolBindings: many(resourcePoolBinding),
}))

export const onboardingBatchPlanLineRelations = relations(onboardingBatchPlanLine, ({ one }) => ({
  batch: one(onboardingBatch, {
    fields: [onboardingBatchPlanLine.onboardingBatchId],
    references: [onboardingBatch.id],
  }),
  gpuCardType: one(gpuCardType, {
    fields: [onboardingBatchPlanLine.gpuCardTypeId],
    references: [gpuCardType.id],
  }),
}))

export const onboardingBatchProgressEventRelations = relations(
  onboardingBatchProgressEvent,
  ({ one }) => ({
    batch: one(onboardingBatch, {
      fields: [onboardingBatchProgressEvent.onboardingBatchId],
      references: [onboardingBatch.id],
    }),
    supplier: one(supplier, {
      fields: [onboardingBatchProgressEvent.supplierId],
      references: [supplier.id],
    }),
    dataCenter: one(dataCenter, {
      fields: [onboardingBatchProgressEvent.dataCenterId],
      references: [dataCenter.id],
    }),
  }),
)

export const onboardingBatchDeviceLinkRelations = relations(
  onboardingBatchDeviceLink,
  ({ one }) => ({
    businessBatch: one(onboardingBatch, {
      fields: [onboardingBatchDeviceLink.businessOnboardingBatchId],
      references: [onboardingBatch.id],
      relationName: "businessBatchDeviceLinks",
    }),
    supplierDevice: one(supplierDevice, {
      fields: [onboardingBatchDeviceLink.supplierDeviceId],
      references: [supplierDevice.id],
    }),
    gpuCardType: one(gpuCardType, {
      fields: [onboardingBatchDeviceLink.gpuCardTypeId],
      references: [gpuCardType.id],
    }),
    sourceChangelogBatch: one(onboardingBatch, {
      fields: [onboardingBatchDeviceLink.sourceChangelogBatchId],
      references: [onboardingBatch.id],
    }),
  }),
)

export const supplierDeviceChangeLogRelations = relations(supplierDeviceChangeLog, ({ one }) => ({
  supplierDevice: one(supplierDevice, {
    fields: [supplierDeviceChangeLog.supplierDeviceId],
    references: [supplierDevice.id],
  }),
  changelogImportBatch: one(onboardingBatch, {
    fields: [supplierDeviceChangeLog.onboardingBatchId],
    references: [onboardingBatch.id],
    relationName: "changelogImportBatch",
  }),
  businessOnboardingBatch: one(onboardingBatch, {
    fields: [supplierDeviceChangeLog.businessOnboardingBatchId],
    references: [onboardingBatch.id],
    relationName: "businessOnboardingBatch",
  }),
}))

export const supplierBillRelations = relations(supplierBill, ({ one, many }) => ({
  supplier: one(supplier, {
    fields: [supplierBill.supplierId],
    references: [supplier.id],
  }),
  details: many(supplierBillDetail),
}))

export const supplierBillDailyRelations = relations(supplierBillDaily, ({ one, many }) => ({
  supplier: one(supplier, {
    fields: [supplierBillDaily.supplierId],
    references: [supplier.id],
  }),
  dataCenter: one(dataCenter, {
    fields: [supplierBillDaily.dataCenterId],
    references: [dataCenter.id],
  }),
  details: many(supplierBillDailyDetail),
}))

export const supplierBillDailyDetailRelations = relations(supplierBillDailyDetail, ({ one }) => ({
  dailyBill: one(supplierBillDaily, {
    fields: [supplierBillDailyDetail.dailyBillId],
    references: [supplierBillDaily.id],
  }),
  gpuCardType: one(gpuCardType, {
    fields: [supplierBillDailyDetail.gpuCardTypeId],
    references: [gpuCardType.id],
  }),
}))

export const supplierActivityRelations = relations(supplierActivity, ({ one, many }) => ({
  supplier: one(supplier, {
    fields: [supplierActivity.supplierId],
    references: [supplier.id],
  }),
  author: one(userStaff, {
    fields: [supplierActivity.authorStaffId],
    references: [userStaff.id],
  }),
  attachments: many(supplierActivityAttachment),
}))

export const bareMetalOrderImportBatchRelations = relations(
  bareMetalOrderImportBatch,
  ({ one }) => ({
    project: one(crmProject, {
      fields: [bareMetalOrderImportBatch.projectId],
      references: [crmProject.id],
    }),
    tenant: one(billingTenant, {
      fields: [bareMetalOrderImportBatch.tenantId],
      references: [billingTenant.id],
    }),
    bareMetalOrder: one(bareMetalOrder, {
      fields: [bareMetalOrderImportBatch.bareMetalOrderId],
      references: [bareMetalOrder.id],
    }),
    createdBy: one(userStaff, {
      fields: [bareMetalOrderImportBatch.createdByStaffId],
      references: [userStaff.id],
    }),
  }),
)

export const bareMetalOrderRelations = relations(bareMetalOrder, ({ one, many }) => ({
  tenant: one(billingTenant, {
    fields: [bareMetalOrder.tenantId],
    references: [billingTenant.id],
  }),
  project: one(crmProject, {
    fields: [bareMetalOrder.projectId],
    references: [crmProject.id],
  }),
  customer: one(customer, {
    fields: [bareMetalOrder.customerId],
    references: [customer.id],
  }),
  dataCenter: one(dataCenter, {
    fields: [bareMetalOrder.dataCenterId],
    references: [dataCenter.id],
  }),
  importBatch: one(bareMetalOrderImportBatch, {
    fields: [bareMetalOrder.importBatchId],
    references: [bareMetalOrderImportBatch.id],
  }),
  devices: many(bareMetalOrderDevice),
}))

export const bareMetalOrderDeviceRelations = relations(bareMetalOrderDevice, ({ one }) => ({
  bareMetalOrder: one(bareMetalOrder, {
    fields: [bareMetalOrderDevice.bareMetalOrderId],
    references: [bareMetalOrder.id],
  }),
  gpuCardType: one(gpuCardType, {
    fields: [bareMetalOrderDevice.gpuCardTypeId],
    references: [gpuCardType.id],
  }),
  supplierDevice: one(supplierDevice, {
    fields: [bareMetalOrderDevice.supplierDeviceId],
    references: [supplierDevice.id],
  }),
}))

export const bareMetalSyncJobRunRelations = relations(bareMetalSyncJobRun, ({ many }) => ({
  items: many(bareMetalSyncJobItem),
}))

export const bareMetalSyncJobItemRelations = relations(bareMetalSyncJobItem, ({ one }) => ({
  jobRun: one(bareMetalSyncJobRun, {
    fields: [bareMetalSyncJobItem.jobRunId],
    references: [bareMetalSyncJobRun.id],
  }),
  tenant: one(billingTenant, {
    fields: [bareMetalSyncJobItem.tenantId],
    references: [billingTenant.id],
  }),
}))

// ---------------------------------------------------------------------------
// §3.x 网关管控节点
// ---------------------------------------------------------------------------

/** 网关管控节点（每机房部署的自动化接入控制节点） */
export const gatewayNode = pgTable(
  'gateway_node',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    dataCenterId: text('data_center_id')
      .notNull()
      .references(() => dataCenter.id, { onDelete: 'cascade' }),
    supplierId: text('supplier_id')
      .notNull()
      .references(() => supplier.id, { onDelete: 'cascade' }),
    
    name: varchar('name', { length: 255 }).notNull(),
    hostname: varchar('hostname', { length: 255 }).notNull(),
    internalIp: varchar('internal_ip', { length: 64 }).notNull(),
    externalIp: varchar('external_ip', { length: 64 }),
    
    sshPort: integer('ssh_port').notNull().default(22),
    sshUsername: varchar('ssh_username', { length: 64 }).notNull(),
    sshPasswordEncrypted: text('ssh_password_encrypted'),
    
    osType: varchar('os_type', { length: 128 }),
    cpuCores: integer('cpu_cores'),
    memoryGb: integer('memory_gb'),
    diskGb: integer('disk_gb'),
    
    vlanId: varchar('vlan_id', { length: 16 }),
    gateway: varchar('gateway', { length: 64 }).notNull(),
    subnetMask: varchar('subnet_mask', { length: 64 }).notNull(),
    dnsServers: text('dns_servers').array(),
    publicGateway: varchar('public_gateway', { length: 64 }),
    firewallRules: text('firewall_rules'),
    
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    healthStatus: varchar('health_status', { length: 32 }).notNull().default('unknown'),
    lastHealthCheckAt: timestamp('last_health_check_at', { withTimezone: true }),
    lastHealthCheckResult: jsonb('last_health_check_result').$type<{
      ssh_reachable: boolean
      disk_usage_percent?: number
      memory_usage_percent?: number
      error?: string
    }>(),
    
    auditStatus: varchar('audit_status', { length: 32 }).notNull().default('pending'),
    auditedBy: text('audited_by').references(() => userStaff.id),
    auditedAt: timestamp('audited_at', { withTimezone: true }),
    auditRemark: text('audit_remark'),
    
    capabilities: jsonb('capabilities').$type<{
      k8s_version?: string
      docker_version?: string
      karmada_installed?: boolean
      ansible_installed?: boolean
    }>(),
    
    ...supplyTimestamps,
  },
  (table) => [
    uniqueIndex('gateway_node_dc_name_uk').on(table.dataCenterId, table.name),
    index('gateway_node_supplier_id_idx').on(table.supplierId),
    index('gateway_node_status_idx').on(table.status),
    index('gateway_node_health_status_idx').on(table.healthStatus),
  ],
)

export const gatewayNodeRelations = relations(gatewayNode, ({ one }) => ({
  dataCenter: one(dataCenter, {
    fields: [gatewayNode.dataCenterId],
    references: [dataCenter.id],
  }),
  supplier: one(supplier, {
    fields: [gatewayNode.supplierId],
    references: [supplier.id],
  }),
  auditor: one(userStaff, {
    fields: [gatewayNode.auditedBy],
    references: [userStaff.id],
  }),
}))

// ---------------------------------------------------------------------------
// §3.x 设备自动纳管策略与任务（Phase 5）
// ---------------------------------------------------------------------------

/** 设备上架策略模板 */
export const deviceOnboardingPolicy = pgTable(
  'device_onboarding_policy',
  {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    name: varchar('name', { length: 128 }).notNull(),
    description: text('description'),
    /** 完整策略 JSON（包含集群、组件版本、存储、网络、标签污点、池归属等） */
    policyJson: jsonb('policy_json').notNull().default({}),
    createdBy: text('created_by').references(() => userStaff.id, { onDelete: 'set null' }),
    ...supplyTimestamps,
  },
  (table) => [
    index('device_onboarding_policy_name_idx').on(table.name),
    index('device_onboarding_policy_created_by_idx').on(table.createdBy),
  ],
)

/** 策略-批次关联表（支持设备级覆盖） */
export const deviceOnboardingPolicyBatch = pgTable(
  'device_onboarding_policy_batch',
  {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    policyId: text('policy_id')
      .notNull()
      .references(() => deviceOnboardingPolicy.id, { onDelete: 'restrict' }),
    batchId: text('batch_id')
      .notNull()
      .references(() => onboardingBatch.id, { onDelete: 'cascade' }),
    /** 设备级策略覆盖（可选），格式: [{ deviceId, overrides }] */
    deviceOverrides: jsonb('device_overrides').notNull().default([]),
    appliedBy: text('applied_by').references(() => userStaff.id, { onDelete: 'set null' }),
    appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('device_onboarding_policy_batch_uk').on(table.batchId),
    index('device_onboarding_policy_batch_policy_id_idx').on(table.policyId),
  ],
)

/** 设备上架任务表（Agent 拉取） */
export const deviceOnboardingTask = pgTable(
  'device_onboarding_task',
  {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    supplierDeviceId: text('supplier_device_id')
      .notNull()
      .references(() => supplierDevice.id, { onDelete: 'cascade' }),
    batchId: text('batch_id')
      .notNull()
      .references(() => onboardingBatch.id, { onDelete: 'cascade' }),
    /** 执行该任务的 Edge Agent ID */
    agentId: text('agent_id'),
    /** 快照上架策略 */
    policyJson: jsonb('policy_json').notNull(),
    /** 流水线阶段: pending → ssh_verify → gpu_detect → env_init → k8s_join → gpu_label → completed / failed */
    stage: varchar('stage', { length: 32 }).notNull().default('pending'),
    stageStatus: varchar('stage_status', { length: 16 }).notNull().default('waiting'),
    stageStartedAt: timestamp('stage_started_at', { withTimezone: true }),
    stageCompletedAt: timestamp('stage_completed_at', { withTimezone: true }),
    stageError: text('stage_error'),
    retryCount: integer('retry_count').notNull().default(0),
    maxRetries: integer('max_retries').notNull().default(3),
    /** 编排信息（IP、用户名、密码、GPU 信息、K8s 配置等） */
    payload: jsonb('payload').notNull().default({}),
    /** K8s Node 名称（加入成功后） */
    nodeName: varchar('node_name', { length: 255 }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...supplyTimestamps,
  },
  (table) => [
    index('device_onboarding_task_device_id_idx').on(table.supplierDeviceId),
    index('device_onboarding_task_batch_id_idx').on(table.batchId),
    index('device_onboarding_task_stage_idx').on(table.stage),
    index('device_onboarding_task_agent_id_idx').on(table.agentId),
  ],
)

// ---------------------------------------------------------------------------
// Edge Agent 注册表（采购上架闭环 / Agent API）
// ---------------------------------------------------------------------------

/** Agent 实例注册与心跳；register / heartbeat 写入 */
export const agentRegistry = pgTable(
  'agent_registry',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    agentId: varchar('agent_id', { length: 128 }).notNull(),
    agentVersion: varchar('agent_version', { length: 64 }).notNull(),
    dataCenterId: text('data_center_id').references(() => dataCenter.id, {
      onDelete: 'set null',
    }),
    hostname: varchar('hostname', { length: 255 }),
    osInfo: text('os_info'),
    status: varchar('status', { length: 32 }).notNull().default('online'),
    lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }),
    runningTaskIds: jsonb('running_task_ids').$type<string[]>().notNull().default([]),
    metrics: jsonb('metrics').$type<{
      cpuPercent?: number
      memoryPercent?: number
    }>(),
    ...supplyTimestamps,
  },
  (table) => [
    uniqueIndex('agent_registry_agent_id_uk').on(table.agentId),
    index('agent_registry_data_center_id_idx').on(table.dataCenterId),
    index('agent_registry_status_idx').on(table.status),
  ],
)

// ---------------------------------------------------------------------------
// 供应商门户设置：API 密钥 + 通知偏好
// ---------------------------------------------------------------------------

/**
 * 供应商 API-Key 可授予的 scope。
 *
 * 密钥主体是 organization.id（门户会话的 activeOrganizationId），签名校验时
 * 由密钥派生主体，**绝不作为入参**，否则供应商 A 可操作供应商 B 的数据。
 */
export const SUPPLIER_API_KEY_SCOPES = [
  /** 读取设备 / 库存 / 定价 */
  'resource:read',
  /** 设备上下架与合作状态变更 */
  'resource:write',
  /** 读取合同、账单、发票 */
  'settlement:read',
  /** 确认合同、确认账单、发起开票 */
  'settlement:write',
] as const
export type SupplierApiKeyScope = (typeof SUPPLIER_API_KEY_SCOPES)[number]

/**
 * 供应商 API-Key 凭证。
 *
 * 安全约定（与 merchant_api_key 一致）：
 *   1. 只存 sha256(明文)，明文仅在签发时返回一次
 *   2. keyPrefix 存前 8 位供列表页定位，不足以还原明文
 *   3. revokedAt / expiresAt 任一命中即失效
 *   4. 每次校验成功顺手 touch lastUsedAt
 */
export const supplierApiKey = pgTable(
  'supplier_api_key',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    /** 供应商组织（organization.id，orgType = 'supplier'） */
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    /** 凭证名，如「生产环境」 */
    name: varchar('name', { length: 64 }).notNull(),
    /** sha256(明文) 十六进制，64 字符 */
    keyHash: varchar('key_hash', { length: 64 }).notNull(),
    /** 明文前 8 位，仅用于展示定位 */
    keyPrefix: varchar('key_prefix', { length: 8 }).notNull(),
    /** 逗号分隔的 scope 集合，取值见 SUPPLIER_API_KEY_SCOPES */
    scopes: varchar('scopes', { length: 256 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdBy: text('created_by'),
    ...supplyTimestamps,
  },
  (table) => [
    uniqueIndex('supplier_api_key_key_hash_uk').on(table.keyHash),
    index('supplier_api_key_org_idx').on(table.organizationId),
    index('supplier_api_key_org_active_idx').on(table.organizationId, table.revokedAt),
  ],
)

/** 供应商通知的投递渠道 */
export const SUPPLIER_NOTIFICATION_CHANNELS = ['email', 'site'] as const
export type SupplierNotificationChannel =
  (typeof SUPPLIER_NOTIFICATION_CHANNELS)[number]

/** 供应商门户可订阅的业务事件 */
export const SUPPLIER_NOTIFICATION_EVENTS = [
  'contract',
  'settlement',
  'device',
  'system',
] as const
export type SupplierNotificationEvent =
  (typeof SUPPLIER_NOTIFICATION_EVENTS)[number]

/**
 * 通知偏好（按 userId + channel + event 一行）。
 *
 * 采用「一行一组合」而不是把开关摊成列：新增事件/渠道只需扩常量，不必改表结构
 * 也不用迁移历史数据。缺行视为默认开启，首次保存时才落库。
 */
export const supplierNotificationPreference = pgTable(
  'supplier_notification_preference',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** 见 SUPPLIER_NOTIFICATION_CHANNELS */
    channel: varchar('channel', { length: 16 }).notNull(),
    /** 见 SUPPLIER_NOTIFICATION_EVENTS */
    event: varchar('event', { length: 32 }).notNull(),
    enabled: boolean('enabled').notNull().default(true),
    ...supplyTimestamps,
  },
  (table) => [
    uniqueIndex('supplier_notification_pref_uk').on(
      table.userId,
      table.channel,
      table.event,
    ),
    index('supplier_notification_pref_user_idx').on(table.userId),
  ],
)

// ---------------------------------------------------------------------------
// §3.x 供应商站内信
// ---------------------------------------------------------------------------

/** 供应商站内信收件箱 */
export const supplierSiteMessage = pgTable(
  'supplier_site_message',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    supplierOrgId: text('supplier_org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    summary: text('summary').notNull(),
    content: text('content').notNull(),
    category: varchar('category', { length: 32 }),
    links: jsonb('links').$type<{ label: string; href: string; external?: boolean }[]>().notNull().default([]),
    read: boolean('read').notNull().default(false),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('supplier_site_message_org_created_idx').on(table.supplierOrgId, table.createdAt),
    index('supplier_site_message_org_read_idx').on(table.supplierOrgId, table.read),
  ],
)

export const deviceOnboardingPolicyRelations = relations(deviceOnboardingPolicy, ({ one, many }) => ({
  creator: one(userStaff, {
    fields: [deviceOnboardingPolicy.createdBy],
    references: [userStaff.id],
  }),
  policyBatches: many(deviceOnboardingPolicyBatch),
}))

export const deviceOnboardingPolicyBatchRelations = relations(deviceOnboardingPolicyBatch, ({ one }) => ({
  policy: one(deviceOnboardingPolicy, {
    fields: [deviceOnboardingPolicyBatch.policyId],
    references: [deviceOnboardingPolicy.id],
  }),
  batch: one(onboardingBatch, {
    fields: [deviceOnboardingPolicyBatch.batchId],
    references: [onboardingBatch.id],
  }),
  applier: one(userStaff, {
    fields: [deviceOnboardingPolicyBatch.appliedBy],
    references: [userStaff.id],
  }),
}))

export const deviceOnboardingTaskRelations = relations(deviceOnboardingTask, ({ one }) => ({
  supplierDevice: one(supplierDevice, {
    fields: [deviceOnboardingTask.supplierDeviceId],
    references: [supplierDevice.id],
  }),
  batch: one(onboardingBatch, {
    fields: [deviceOnboardingTask.batchId],
    references: [onboardingBatch.id],
  }),
}))

export const supplierSiteMessageRelations = relations(supplierSiteMessage, ({ one }) => ({
  organization: one(organization, {
    fields: [supplierSiteMessage.supplierOrgId],
    references: [organization.id],
  }),
}))

export const supplierApiKeyRelations = relations(supplierApiKey, ({ one }) => ({
  organization: one(organization, {
    fields: [supplierApiKey.organizationId],
    references: [organization.id],
  }),
}))

export const supplierNotificationPreferenceRelations = relations(
  supplierNotificationPreference,
  ({ one }) => ({
    user: one(user, {
      fields: [supplierNotificationPreference.userId],
      references: [user.id],
    }),
  }),
)

export type DeviceOnboardingPolicy = typeof deviceOnboardingPolicy.$inferSelect
export type NewDeviceOnboardingPolicy = typeof deviceOnboardingPolicy.$inferInsert
export type DeviceOnboardingPolicyBatch = typeof deviceOnboardingPolicyBatch.$inferSelect
export type NewDeviceOnboardingPolicyBatch = typeof deviceOnboardingPolicyBatch.$inferInsert
export type DeviceOnboardingTask = typeof deviceOnboardingTask.$inferSelect
export type NewDeviceOnboardingTask = typeof deviceOnboardingTask.$inferInsert
export type SupplierSiteMessage = typeof supplierSiteMessage.$inferSelect
export type NewSupplierSiteMessage = typeof supplierSiteMessage.$inferInsert


// ---------------------------------------------------------------------------
// 类型导出
// ---------------------------------------------------------------------------

export type SupplierRow = typeof supplier.$inferSelect
export type NewSupplierRow = typeof supplier.$inferInsert
export type DataCenterRow = typeof dataCenter.$inferSelect
export type SupplierContractRow = typeof supplierContract.$inferSelect
export type SupplierContractCapacityLineRow = typeof supplierContractCapacityLine.$inferSelect
export type OnboardingBatchRow = typeof onboardingBatch.$inferSelect
export type OnboardingBatchPlanLineRow = typeof onboardingBatchPlanLine.$inferSelect
export type OnboardingBatchProgressEventRow = typeof onboardingBatchProgressEvent.$inferSelect
export type OnboardingBatchDeviceLinkRow = typeof onboardingBatchDeviceLink.$inferSelect
export type SupplierDeviceRow = typeof supplierDevice.$inferSelect
export type SupplierDeviceChangeLogRow = typeof supplierDeviceChangeLog.$inferSelect
export type LifecycleStateDefinitionRow = typeof lifecycleStateDefinition.$inferSelect
export type SupplierOpsUploadBatchRow = typeof supplierOpsUploadBatch.$inferSelect
export type SupplierUnitCostRow = typeof supplierUnitCost.$inferSelect
export type BareMetalOrderRow = typeof bareMetalOrder.$inferSelect
export type NewBareMetalOrderRow = typeof bareMetalOrder.$inferInsert
export type BareMetalOrderDeviceRow = typeof bareMetalOrderDevice.$inferSelect
export type NewBareMetalOrderDeviceRow = typeof bareMetalOrderDevice.$inferInsert
export type BareMetalOrderImportBatchRow = typeof bareMetalOrderImportBatch.$inferSelect
export type BareMetalSyncJobRunRow = typeof bareMetalSyncJobRun.$inferSelect
export type SupplierGpuInventoryRow = typeof supplierGpuInventory.$inferSelect
export type SupplierDatacenterCardTypeSpecRow =
  typeof supplierDatacenterCardTypeSpec.$inferSelect
export type NewSupplierDatacenterCardTypeSpecRow =
  typeof supplierDatacenterCardTypeSpec.$inferInsert
export type SupplierDatacenterInfrastructureRow =
  typeof supplierDatacenterInfrastructure.$inferSelect
export type NewSupplierDatacenterInfrastructureRow =
  typeof supplierDatacenterInfrastructure.$inferInsert
export type InternalTestHoldRow = typeof internalTestHold.$inferSelect
export type InternalTestHoldDeviceLinkRow = typeof internalTestHoldDeviceLink.$inferSelect
export type GatewayNodeRow = typeof gatewayNode.$inferSelect
export type NewGatewayNodeRow = typeof gatewayNode.$inferInsert
export type SupplierSiteMessageRow = typeof supplierSiteMessage.$inferSelect
export type AgentRegistryRow = typeof agentRegistry.$inferSelect
export type NewAgentRegistryRow = typeof agentRegistry.$inferInsert
export type NewSupplierSiteMessageRow = typeof supplierSiteMessage.$inferInsert
export type SupplierApiKeyRow = typeof supplierApiKey.$inferSelect
export type NewSupplierApiKeyRow = typeof supplierApiKey.$inferInsert
export type SupplierNotificationPreferenceRow =
  typeof supplierNotificationPreference.$inferSelect
export type NewSupplierNotificationPreferenceRow =
  typeof supplierNotificationPreference.$inferInsert
