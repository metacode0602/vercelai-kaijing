import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import { organization, user } from "./auth-schema"
import { billingTenant, customer, userStaff } from "./crm-schema"
import { merchant } from "./merchant-schema"

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const money = (n: string) => numeric(n, { precision: 15, scale: 4 })
const ts = (n: string) => timestamp(n, { withTimezone: true }).defaultNow().notNull()
const tsNotNull = (n: string) => timestamp(n, { withTimezone: true }).notNull()

// ---------------------------------------------------------------------------
// §1 租户与用户业务扩展
// ---------------------------------------------------------------------------

/** 租户业务扩展表（配额、IDC 标签等） */
export const tenantProfiles = pgTable(
  "tenant_profiles",
  {
    /** 与 Better Auth organization.id 一致 */
    organizationId: varchar("organization_id", { length: 64 }).primaryKey(),
    status: varchar("status", { length: 16 }).notNull(),
    /** {"max_gpu":16, "max_cpu":128, ...} */
    quota: text("quota").notNull(),
    defaultIdcTag: varchar("default_idc_tag", { length: 128 }),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (table) => [index("tenant_profiles_status_idx").on(table.status)],
)

/** 用户业务扩展表 */
export const userProfiles = pgTable(
  "user_profiles",
  {
    /** Better Auth user.id */
    userId: varchar("user_id", { length: 64 }).primaryKey(),
    /** 默认组织 ID */
    defaultOrgId: varchar("default_org_id", { length: 64 }),
  },
  (table) => [index("user_profiles_org_idx").on(table.defaultOrgId)],
)

// ---------------------------------------------------------------------------
// §2 工作空间与任务
// ---------------------------------------------------------------------------

/** 工作空间（GPU 消费者域轻量级任务容器） */
export const gpuWorkspace = pgTable(
  "gpu_workspace",
  {
    id: text("id").primaryKey(),
    organizationId: varchar("organization_id", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
  },
  (table) => [
    uniqueIndex("gpu_workspace_org_name_uk").on(table.organizationId, table.name),
  ],
)

/** 任务定义（模板） */
export const taskDefinitions = pgTable(
  "task_definitions",
  {
    id: text("id").primaryKey(),
    organizationId: varchar("organization_id", { length: 64 }),
    workspaceId: text("workspace_id").references(() => gpuWorkspace.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 255 }),
    /** job | serve */
    taskType: varchar("task_type", { length: 16 }).notNull(),
    /** serverless | deployment */
    serveMode: varchar("serve_mode", { length: 16 }),
    /** 资源规格 JSON */
    resourceSpec: text("resource_spec"),
    image: varchar("image", { length: 512 }),
    command: text("command"),
    /** 环境变量 JSON */
    envVars: text("env_vars"),
    minReplicas: integer("min_replicas"),
    maxReplicas: integer("max_replicas"),
    targetPort: integer("target_port"),
    /** draft | active | archived */
    status: varchar("status", { length: 16 }).notNull(),
  },
  (table) => [
    index("task_definitions_org_idx").on(table.organizationId),
    index("task_definitions_workspace_idx").on(table.workspaceId),
  ],
)

/** 任务实例（运行时） */
export const taskInstances = pgTable(
  "task_instances",
  {
    id: text("id").primaryKey(),
    definitionId: text("definition_id").references(() => taskDefinitions.id, {
      onDelete: "set null",
    }),
    organizationId: varchar("organization_id", { length: 64 }),
    /** SkyPilot job ID */
    skyJobId: varchar("sky_job_id", { length: 256 }),
    /** SkyPilot serve ID */
    skyServeId: varchar("sky_serve_id", { length: 256 }),
    /** job | serve */
    instanceType: varchar("instance_type", { length: 16 }).notNull(),
    /** image_pulling | pending | running | succeeded | failed | stopped */
    status: varchar("status", { length: 32 }).notNull(),
    idcName: varchar("idc_name", { length: 128 }),
    nodeName: varchar("node_name", { length: 128 }),
    clusterName: varchar("cluster_name", { length: 128 }),
    /** 实际资源规格 JSON */
    resourceSpec: text("resource_spec"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    billingStartedAt: timestamp("billing_started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    internalEndpoint: varchar("internal_endpoint", { length: 512 }),
    publicUrl: varchar("public_url", { length: 512 }),
    createdAt: ts("created_at"),
  },
  (table) => [
    index("task_instances_def_idx").on(table.definitionId),
    index("task_instances_org_idx").on(table.organizationId),
    index("task_instances_status_idx").on(table.status),
    index("task_instances_sky_job_idx").on(table.skyJobId),
  ],
)

// ---------------------------------------------------------------------------
// §3 余额体系
// ---------------------------------------------------------------------------

/** 租户余额表（权威余额来源） */
export const tenantBalance = pgTable(
  "tenant_balance",
  {
    tenantId: text("tenant_id")
      .primaryKey()
      .references(() => billingTenant.id, { onDelete: "cascade" }),
    organizationId: varchar("organization_id", { length: 64 }).notNull(),
    availableBalance: money("available_balance").notNull().default("0"),
    reservedBalance: money("reserved_balance").notNull().default("0"),
    /**
     * 券池实时值：商户发放的算力券额度（设计 §3.2②）
     * 与现金实时值同行、同事务维护；扣减优先级 券 → 现金
     */
    voucherAvailableBalance: money("voucher_available_balance").notNull().default("0"),
    /** 券池实时值：冻结中（提交任务预占） */
    voucherReservedBalance: money("voucher_reserved_balance").notNull().default("0"),
    currency: varchar("currency", { length: 8 }).notNull().default("CNY"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: ts("created_at"),
  },
  (table) => [
    index("tenant_balance_org_idx").on(table.organizationId),
  ],
)

/** 余额变动流水（不可变审计日志） */
export const balanceTransaction = pgTable(
  "balance_transaction",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => billingTenant.id, { onDelete: "cascade" }),
    organizationId: varchar("organization_id", { length: 64 }).notNull(),
    /** recharge | deduction | auto_deduction | refund | freeze | unfreeze | adjustment | bonus | coupon_refund | voucher_grant | voucher_consume | voucher_expire | voucher_refund */
    type: varchar("type", { length: 16 }).notNull(),
    amount: money("amount").notNull(),
    availableBefore: money("available_before").notNull(),
    availableAfter: money("available_after").notNull(),
    reservedBefore: money("reserved_before").notNull(),
    reservedAfter: money("reserved_after").notNull(),
    balanceBefore: money("balance_before").notNull(),
    balanceAfter: money("balance_after").notNull(),
    /** 券池实时值快照（设计 §3.2②）：每笔流水自带券池前后值，供对账逐笔重算 */
    voucherAvailableBefore: money("voucher_available_before").notNull().default("0"),
    voucherAvailableAfter: money("voucher_available_after").notNull().default("0"),
    voucherReservedBefore: money("voucher_reserved_before").notNull().default("0"),
    voucherReservedAfter: money("voucher_reserved_after").notNull().default("0"),
    /** bare_metal_order | compute_base | serve_endpoint | recharge | preload_task | manual */
    refType: varchar("ref_type", { length: 32 }),
    refId: text("ref_id"),
    /**
     * 幂等键（P0-7）。可选，但 B/C 跨网络调用时**必须**由调用方传入
     * （通常取上游 request_id），否则超时重试会重复扣商户额度 —— 资金事故级。
     *
     * NULL 表示「不参与幂等」，Postgres 唯一索引不约束 NULL，
     * 因此存量调用方无需立即补齐即可共存。
     */
    idempotencyKey: varchar("idempotency_key", { length: 128 }),
    description: text("description"),
    createdBy: text("created_by"),
    createdAt: ts("created_at"),
  },
  (table) => [
    index("bt_tenant_idx").on(table.tenantId),
    index("bt_org_idx").on(table.organizationId),
    index("bt_ref_idx").on(table.refType, table.refId),
    // 幂等键唯一。注意 NULL 不受唯一索引约束，故可与存量 NULL 行共存
    uniqueIndex("bt_idempotency_uk").on(table.idempotencyKey),
  ],
)

// ---------------------------------------------------------------------------
// §4 支付网关
// ---------------------------------------------------------------------------

/** 支付订单 */
export const paymentOrder = pgTable(
  "payment_order",
  {
    id: text("id").primaryKey(),
    /** 对外订单号（PAY + yyyyMMddHHmmss + 6位随机） */
    orderNo: varchar("order_no", { length: 64 }).notNull().unique(),
    /**
     * 付款方：租户充值填 tenantId，商户预付填 merchantId。
     *
     * 二者恰好一个非空（见 merchant_payer_uk 下的 CHECK）。这里不能沿用
     * 「商户预付也塞一个 tenant_id」的做法：merchant 账户与 tenant 账户是两套
     * 独立的钱包，预付到账必须落 merchant_account_ledger 而非 balance_transaction，
     * 用伪 tenant 记账会让对账口径永远对不上。
     */
    tenantId: text("tenant_id").references(() => billingTenant.id, {
      onDelete: "cascade",
    }),
    /** 商户预付（scene=merchant_prepay）时的付款方 */
    merchantId: text("merchant_id").references(() => merchant.id, {
      onDelete: "restrict",
    }),
    /** recharge | bare_metal_order | serverless | merchant_prepay | voucher_purchase */
    scene: varchar("scene", { length: 16 }).notNull(),
    /** 场景订单 ID */
    sceneOrderId: text("scene_order_id"),
    amount: money("amount").notNull(),
    currency: varchar("currency", { length: 8 }).notNull().default("CNY"),
    /** wechat | alipay | bank_transfer */
    paymentMethod: varchar("payment_method", { length: 16 }).notNull(),
    channelOrderNo: varchar("channel_order_no", { length: 128 }),
    channelStatus: varchar("channel_status", { length: 32 }),
    channelResponse: text("channel_response"),
    /** pending | paid | failed | expired | refunded | partial_refunded */
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    expiredAt: tsNotNull("expired_at"),
    createdAt: ts("created_at"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by"),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
  },
  (table) => [
    index("idx_payment_order_tenant").on(table.tenantId),
    index("idx_payment_order_merchant").on(table.merchantId),
    index("idx_payment_order_scene").on(table.scene, table.sceneOrderId),
    index("idx_payment_order_status").on(table.status),
    index("idx_payment_order_created").on(table.createdAt),
    index("idx_payment_order_method_status").on(table.paymentMethod, table.status),
    // 付款方必须是且只能是一个：租户或商户。防止出现「两边都空」的无主订单，
    // 或「两边都有」的重复入账入口。
    check(
      "payment_order_single_payer",
      sql`num_nonnulls(${table.tenantId}, ${table.merchantId}) = 1`,
    ),
  ],
)

/** 支付渠道配置（运营后台维护，每渠道一行） */
export const paymentChannelConfig = pgTable(
  "payment_channel_config",
  {
    id: text("id").primaryKey(),
    channel: varchar("channel", { length: 16 }).notNull().unique(),
    channelName: varchar("channel_name", { length: 64 }).notNull(),
    appId: varchar("app_id", { length: 64 }).notNull(),
    merchantId: varchar("merchant_id", { length: 64 }).notNull(),
    /** 加密存储 */
    api_key_enc: text("api_key_enc").notNull(),
    api_v3_key_enc: text("api_v3_key_enc"),
    public_key_enc: text("public_key_enc"),
    private_key_enc: text("private_key_enc"),
    certificate_enc: text("certificate_enc"),
    notifyUrl: varchar("notify_url", { length: 512 }).notNull(),
    returnUrl: varchar("return_url", { length: 512 }),
    isActive: boolean("is_active").notNull().default(true),
    configJson: text("config_json"),
    createdAt: ts("created_at"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
)

// ---------------------------------------------------------------------------
// §5 银行转账（对公汇款）
// ---------------------------------------------------------------------------

/**
 * 对公收款账户（平台侧收款，用于商户预付 / 用户充值）
 *
 * `merchantId` 为空 = 平台通用账户；非空 = 平台为该商户开设的**专用**账户。
 * 商户端只返回 `merchantId = 自己的` 的账户（严格专用，见
 * `apps/merchant/src/lib/server/dataaccess/account/prepay.ts: listBankAccounts`），
 * 保证同一平台账户不会串到别的商户账上。
 */
export const bankAccount = pgTable(
  "bank_account",
  {
    id: text("id").primaryKey(),
    accountName: varchar("account_name", { length: 255 }).notNull(),
    accountNo: varchar("account_no", { length: 64 }).notNull(),
    bankName: varchar("bank_name", { length: 255 }).notNull(),
    bankBranch: varchar("bank_branch", { length: 255 }),
    bankCode: varchar("bank_code", { length: 32 }),
    /** 专用账户归属商户；null = 平台通用账户（商户端不可见） */
    merchantId: text("merchant_id").references(() => merchant.id, {
      onDelete: "cascade",
    }),
    /** enterprise | personal */
    accountType: varchar("account_type", { length: 16 })
      .notNull()
      .default("enterprise"),
    remark: text("remark"),
    /** 最低汇款金额 */
    minAmount: money("min_amount").default("0"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: ts("created_at"),
  },
  (table) => [
    // 同一商户同一排序位不重复，避免商户端展示顺序歧义
    uniqueIndex("bank_account_merchant_sort_order_uq")
      .on(table.merchantId, table.sortOrder)
      .where(sql`${table.merchantId} is not null`),
    // 商户端查询路径：(merchant_id, is_active)
    index("bank_account_merchant_active_idx").on(
      table.merchantId,
      table.isActive,
    ),
  ],
)

/** 对公转账核验 */
export const bankTransferVerification = pgTable(
  "bank_transfer_verification",
  {
    id: text("id").primaryKey(),
    paymentOrderId: text("payment_order_id")
      .notNull()
      .references(() => paymentOrder.id, { onDelete: "cascade" }),
    remitterName: varchar("remitter_name", { length: 255 }).notNull(),
    remitterAccount: varchar("remitter_account", { length: 64 }),
    transferAmount: money("transfer_amount").notNull(),
    transferTime: timestamp("transfer_time", { withTimezone: true }),
    voucherImageUrl: varchar("voucher_image_url", { length: 1024 }),
    voucherImageKey: varchar("voucher_image_key", { length: 255 }),
    /** 银行流水号（原文为 bank流水号） */
    bankSerialNo: varchar("bank_serial_no", { length: 128 }),
    remark: text("remark"),
    reviewerId: text("reviewer_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    /** pending | approved | rejected | cancelled */
    reviewStatus: varchar("review_status", { length: 16 })
      .notNull()
      .default("pending"),
    reviewComment: text("review_comment"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by"),
    createdAt: ts("created_at"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_btv_order").on(table.paymentOrderId),
    index("idx_btv_status").on(table.reviewStatus),
    index("idx_btv_created").on(table.createdAt),
  ],
)

// ---------------------------------------------------------------------------
// §6 退款
// ---------------------------------------------------------------------------

/** 退款记录 */
export const paymentRefund = pgTable(
  "payment_refund",
  {
    id: text("id").primaryKey(),
    paymentOrderId: text("payment_order_id")
      .notNull()
      .references(() => paymentOrder.id, { onDelete: "cascade" }),
    refundOrderNo: varchar("refund_order_no", { length: 64 }).notNull().unique(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => billingTenant.id, { onDelete: "cascade" }),
    amount: money("amount").notNull(),
    reason: text("reason").notNull(),
    /** pending | processing | success | failed */
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    channelRefundNo: varchar("channel_refund_no", { length: 128 }),
    channelResponse: text("channel_response"),
    reviewerId: text("reviewer_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    refundAt: timestamp("refund_at", { withTimezone: true }),
    createdAt: ts("created_at"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_refund_order").on(table.paymentOrderId),
    index("idx_refund_tenant").on(table.tenantId),
    index("idx_refund_status").on(table.status),
  ],
)

// ---------------------------------------------------------------------------
// §7 对账
// ---------------------------------------------------------------------------

/** 支付对账记录（每日每渠道一行） */
export const paymentReconciliation = pgTable(
  "payment_reconciliation",
  {
    id: text("id").primaryKey(),
    reconciliationDate: date("reconciliation_date").notNull(),
    channel: varchar("channel", { length: 16 }).notNull(),
    totalCount: integer("total_count").notNull().default(0),
    totalAmount: money("total_amount").notNull().default("0"),
    platformCount: integer("platform_count").notNull().default(0),
    platformAmount: money("platform_amount").notNull().default("0"),
    diffCount: integer("diff_count").notNull().default(0),
    diffAmount: money("diff_amount").notNull().default("0"),
    /** pending | matched | diff_found | resolved */
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    detailJson: text("detail_json"),
    reconciledBy: text("reconciled_by").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    createdAt: ts("created_at"),
  },
  (table) => [
    uniqueIndex("idx_recon_date_channel").on(
      table.reconciliationDate,
      table.channel,
    ),
  ],
)

// ---------------------------------------------------------------------------
// §8 券体系（GPU 消费者域）
// ---------------------------------------------------------------------------

/** 券模板（GPU 消费者域，与 crm-schema.discountTemplate 独立） */
export const gpuCouponTemplate = pgTable(
  "gpu_coupon_template",
  {
    id: text("id").primaryKey(),
    name: varchar("name", { length: 255 }),
    /** fixed | discount | resource_pack */
    type: varchar("type", { length: 16 }).notNull(),
    /** 面值 */
    faceValue: money("face_value"),
    /** 折扣百分比 */
    discountPercent: numeric("discount_percent", { precision: 7, scale: 4 }),
    /** 适用资源 JSON */
    applicableResources: text("applicable_resources"),
    /** platform | idc */
    costBearer: varchar("cost_bearer", { length: 16 }).notNull(),
    /** 预算上限 */
    budgetLimit: money("budget_limit"),
    /** active | inactive */
    status: varchar("status", { length: 16 }).notNull(),
    createdAt: ts("created_at"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("gpu_coupon_template_status_idx").on(table.status)],
)

/** 券实例 */
export const gpuCoupon = pgTable(
  "gpu_coupon",
  {
    id: text("id").primaryKey(),
    templateId: text("template_id").references(() => gpuCouponTemplate.id, {
      onDelete: "set null",
    }),
    organizationId: varchar("organization_id", { length: 64 }),
    userId: varchar("user_id", { length: 64 }),
    /** available | used | expired | revoked */
    status: varchar("status", { length: 16 }).notNull(),
    originalValue: money("original_value"),
    remainingValue: money("remaining_value"),
    grantedAt: timestamp("granted_at", { withTimezone: true }),
    expiredAt: timestamp("expired_at", { withTimezone: true }),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: ts("created_at"),
  },
  (table) => [
    index("gpu_coupon_template_idx").on(table.templateId),
    index("gpu_coupon_org_idx").on(table.organizationId),
    index("gpu_coupon_user_idx").on(table.userId),
    index("gpu_coupon_status_idx").on(table.status),
  ],
)

/** 券使用明细 */
export const gpuCouponUsage = pgTable(
  "gpu_coupon_usage",
  {
    id: text("id").primaryKey(),
    couponId: text("coupon_id")
      .notNull()
      .references(() => gpuCoupon.id, { onDelete: "cascade" }),
    taskInstanceId: text("task_instance_id")
      .notNull()
      .references(() => taskInstances.id, { onDelete: "cascade" }),
    /** 原始费用 */
    originalCost: money("original_cost").notNull(),
    /** 券抵扣额 */
    couponDeduction: money("coupon_deduction").notNull(),
    /** 实付金额 */
    actualPayment: money("actual_payment").notNull(),
    createdAt: ts("created_at"),
  },
  (table) => [
    index("gpu_coupon_usage_coupon_idx").on(table.couponId),
    index("gpu_coupon_usage_task_idx").on(table.taskInstanceId),
  ],
)

// ---------------------------------------------------------------------------
// §9 营销成本分摊
// ---------------------------------------------------------------------------

/** 营销成本分配（逐笔记录） */
export const marketingCostAllocation = pgTable(
  "marketing_cost_allocation",
  {
    id: text("id").primaryKey(),
    couponUsageId: text("coupon_usage_id")
      .notNull()
      .references(() => gpuCouponUsage.id, { onDelete: "cascade" }),
    /** platform | idc */
    bearer: varchar("bearer", { length: 16 }).notNull(),
    /** IDC 供应商 ID */
    idcProviderId: varchar("idc_provider_id", { length: 64 }),
    amount: money("amount").notNull(),
    settled: boolean("settled").notNull().default(false),
    createdAt: ts("created_at"),
  },
  (table) => [
    index("mca_coupon_usage_idx").on(table.couponUsageId),
    index("mca_bearer_idx").on(table.bearer),
  ],
)

// ---------------------------------------------------------------------------
// § 实名认证申请（延迟绑定 customer）
// ---------------------------------------------------------------------------

/** 实名 / 升级企业 / 改名申请 */
export const identityVerificationApplication = pgTable(
  "identity_verification_application",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => billingTenant.id, { onDelete: "cascade" }),
    /** individual | enterprise | enterprise_upgrade | rename */
    type: varchar("type", { length: 32 }).notNull(),
    /** pending | approved | rejected | cancelled */
    status: varchar("status", { length: 16 }).notNull().default("pending"),

    realName: varchar("real_name", { length: 128 }),
    idNumberCipher: text("id_number_cipher"),
    idNumberMask: varchar("id_number_mask", { length: 32 }),
    mobile: varchar("mobile", { length: 32 }),
    mobileVerified: boolean("mobile_verified").notNull().default(false),

    companyName: varchar("company_name", { length: 255 }),
    uscc: varchar("uscc", { length: 32 }),
    legalPersonName: varchar("legal_person_name", { length: 128 }),
    /** legal_person | authorized */
    applicantRole: varchar("applicant_role", { length: 16 }),
    authorizedPersonName: varchar("authorized_person_name", { length: 128 }),
    newCompanyName: varchar("new_company_name", { length: 255 }),
    renameReason: text("rename_reason"),

    reviewComment: text("review_comment"),
    reviewedBy: text("reviewed_by").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    boundCustomerId: text("bound_customer_id").references(() => customer.id, {
      onDelete: "set null",
    }),

    submittedBy: text("submitted_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: ts("created_at"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("iva_org_idx").on(table.organizationId),
    index("iva_status_idx").on(table.status),
    index("iva_type_status_idx").on(table.type, table.status),
    uniqueIndex("iva_org_pending_uk")
      .on(table.organizationId)
      .where(sql`${table.status} = 'pending'`),
  ],
)

/** 实名申请附件（OSS） */
export const identityVerificationAttachment = pgTable(
  "identity_verification_attachment",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => identityVerificationApplication.id, { onDelete: "cascade" }),
    /** business_license | id_front | id_back | auth_letter | rename_proof | other */
    kind: varchar("kind", { length: 32 }).notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    contentType: varchar("content_type", { length: 128 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key").notNull(),
    createdAt: ts("created_at"),
  },
  (table) => [index("iva_att_app_idx").on(table.applicationId)],
)

