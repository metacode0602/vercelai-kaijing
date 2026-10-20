import type { PlatformBillingUnit, PlatformProductLine } from '@/lib/types/platform-pricing'

export type MerchantType = 'platform_direct' | 'partner'
/**
 * 资金模式 —— merchant.funding_mode 的取值，与 @workspace/billing 的
 * FundingMode 同源；这里单独导出仅为让 web 端 UI 不必依赖 billing 包。
 * 权威定义在 db 层 CHECK 约束 merchant_funding_mode_check。
 */
export type FundingMode = 'prepay' | 'commission'

export type MerchantStatus = 'active' | 'inactive' | 'suspended'
/**
 * 部署形态（D3-1）—— 4 常量，权威定义在 `@workspace/db/schema` 的
 * `MERCHANT_ACCESS_MODES`；此处重复列出仅为让 UI 不必依赖 db 包。
 */
export type MerchantAccessMode = 'direct' | 'promo' | 'oem' | 'iframe'
export type MerchantRechargeStatus = 'pending' | 'completed' | 'cancelled'
export type MerchantRechargeSource = 'manual' | 'platform_sync'
export type MerchantRechargeAuditAction = 'create' | 'update'
export type MerchantPaymentNodeStatus = 'active' | 'cancelled'
export type MerchantPaymentNodeProgress = 'pending' | 'partial' | 'completed' | 'overdue'
export type MerchantPaymentNodeAuditAction = 'create' | 'update' | 'delete'
export type MerchantActivityType =
  | 'info_updated'
  | 'recharge_created'
  | 'recharge_updated'
  | 'payment_node_created'
  | 'payment_node_updated'
  | 'payment_node_deleted'
  | 'region_added'
  | 'region_removed'
  | 'platform_sync'
  | 'status_changed'
  | 'account_manager_changed'
  | 'comment'
  | 'file'
export type MerchantRegionStatus = 'open' | 'closed' | 'maintenance'
export type TenantMerchantBindingRole = 'platform_primary' | 'commercial' | 'historical'

export type Merchant = {
  id: string
  platformMerchantId: number
  code: string
  name: string
  companyFullName: string
  unifiedSocialCreditCode: string
  merchantMark?: string
  accessMode: MerchantAccessMode
  type: MerchantType
  isDefault: boolean
  status: MerchantStatus
  contactUser?: string
  contactPhone?: string
  remark?: string
  adminUrl?: string
  consoleUrl?: string
  website?: string
  /** 资金模式：prepay=商户预付 / commission=平台付现佣金（权威字段，DEC-F9） */
  fundingMode?: FundingMode
  /** 能力开关（D3-3=C）：与 funding_mode 解耦，`access_mode` 由三者派生 */
  oemEnabled: boolean
  promoEnabled: boolean
  iframeEnabled: boolean
  /** 佣金档位 id（merchantCommissionTier） */
  commissionTierId?: string
  /** 商户级费率覆盖（0~1，优先于档位费率） */
  commissionRateOverride?: number
  platformSyncedAt?: string
  createdAt: string
  updatedAt: string
}

export type MerchantListRow = Merchant & {
  tenantCount: number
  openRegionCount: number
  monthConsumption: number
  accountManagerStaffId?: string | null
  accountManagerName?: string | null
}

export type TenantMerchantBinding = {
  id: string
  tenantId: string
  merchantId: string
  isPrimary: boolean
  bindingRole: TenantMerchantBindingRole
  effectiveFrom: string
  effectiveTo?: string | null
  remark?: string
}

export type MerchantTenantRow = TenantMerchantBinding & {
  tenantName: string
  platformTenantId: string
  customerId: string
  customerName: string
  tenantStatus: 'active' | 'inactive' | 'suspended'
}

export type MerchantDatacenterRegion = {
  id: string
  merchantId: string
  dataCenterId: string
  dataCenterName: string
  displayName?: string
  regionCode: string
  location: string
  status: MerchantRegionStatus
  availableGpuQuota: number | null
  usedGpuCount: number
  enabledCardTypeIds: string[]
  /** 由 tRPC 填充的卡型详情；Mock 层可能为空 */
  enabledCardTypes?: MerchantCardTypeRef[]
  /** 机房全部可售卡型及启用状态 */
  availableCardTypes?: MerchantRegionCardType[]
  effectiveFrom: string
  effectiveTo?: string | null
}

export type MerchantPurchasePrice = {
  id: string
  merchantId: string
  dataCenterId: string
  dataCenterName: string
  gpuCardTypeId: string
  cardTypeName: string
  productLine: PlatformProductLine
  billingUnit: PlatformBillingUnit
  purchasePrice: number
  platformListPrice?: number
  source: 'manual' | 'inherit_l1' | 'platform_sync'
  status: 'draft' | 'active' | 'archived'
  effectiveFrom: string
}

export type MerchantRegionPricingCell = {
  gpuCardTypeId: string
  cardTypeName: string
  productLine: PlatformProductLine
  billingUnit: PlatformBillingUnit
  purchasePrice: number | null
  platformListPrice: number | null
  source: MerchantPurchasePrice['source'] | null
}

export type MerchantRegionPricingForm = {
  effectiveFrom: string
  cells: MerchantRegionPricingCell[]
}

export type MerchantConsumptionDaily = {
  merchantId: string
  usageDate: string
  usageMonth: string
  productLine: PlatformProductLine | 'all'
  tenantCount: number
  amount: number
  voucherAmount: number
  balanceAmount: number
  totalCardHours: number
}

export type MerchantConsumptionSummary = {
  monthAmount: number
  monthVoucherAmount: number
  monthBalanceAmount: number
  activeTenantCount: number
  compareGongjiAmount?: number
}

export type MerchantCardTypeRef = {
  id: string
  name: string
  manufacturer: string
  memoryGB: number
}

/** 机房区域可售卡型及启用状态 */
export type MerchantRegionCardType = MerchantCardTypeRef & {
  enabled: boolean
}

export type MerchantRechargeAttachment = {
  id: string
  name: string
  mimeType: string
  size: number
  /** Mock 层以 data URL 存储；接入后端后改为 fileUrl */
  dataUrl: string
}

export type MerchantRechargeRecord = {
  id: string
  merchantId: string
  paymentNodeId?: string
  amount: number
  paymentMethod: string
  status: MerchantRechargeStatus
  transactionId?: string
  rechargeDate: string
  remark?: string
  /** 关联商户月度账单账期 YYYY-MM */
  billMonth?: string
  attachments: MerchantRechargeAttachment[]
  source: MerchantRechargeSource
  createdBy?: string
  updatedBy?: string
  createdAt: string
  updatedAt: string
  completedAt?: string
}

export type MerchantRechargeAuditLog = {
  id: string
  rechargeId: string
  merchantId: string
  action: MerchantRechargeAuditAction
  operatorName: string
  occurredAt: string
  changes?: Record<string, { from: unknown; to: unknown }>
  remark?: string
}

export type MerchantPaymentNode = {
  id: string
  merchantId: string
  name: string
  expectedAmount: number
  dueDate: string
  sortOrder: number
  remark?: string
  /** 关联商户月度账单账期 YYYY-MM */
  billMonth?: string
  status: MerchantPaymentNodeStatus
  progress: MerchantPaymentNodeProgress
  collectedAmount: number
  recordCount: number
  createdBy?: string
  updatedBy?: string
  createdAt: string
  updatedAt: string
}

export type MerchantPaymentNodeAuditLog = {
  id: string
  paymentNodeId: string
  merchantId: string
  action: MerchantPaymentNodeAuditAction
  operatorName: string
  occurredAt: string
  changes?: Record<string, { from: unknown; to: unknown }>
  remark?: string
}

export type MerchantActivityAttachment = {
  id: string
  name: string
  size: number
  url: string
  mimeType?: string
}

export type MerchantActivity = {
  id: string
  merchantId: string
  type: MerchantActivityType
  title: string
  description?: string
  authorStaffId?: string | null
  authorName: string
  authorRole: 'staff' | 'system'
  occurredAt: string
  editedAt?: string
  attachments?: MerchantActivityAttachment[]
}

/** 平台已有机房（商户区域配置时仅可从中选择） */
export type MerchantPlatformDatacenter = {
  id: string
  name: string
  code: string
  location: string
  regionCode: string
  status: 'online' | 'offline' | 'maintenance'
}

/** 商户月账单行 */
export type MerchantMonthlyBillListItem = {
  id: string
  merchantId: string
  billMonth: string
  totalAmount: number
  couponAmount: number
  balanceAmount: number
  tenantCount: number
  source: string
  syncedAt?: string
}

/** 商户月账单产品线明细 */
export type MerchantMonthlyBillDetailItem = {
  id: string
  productLine: string
  resourceName: string
  amount: number
  couponAmount: number
  balanceAmount: number
  type: string
}

/** 商户日账单产品线明细 */
export type MerchantDailyBillDetailItem = {
  id: string
  productLine: string
  resourceName: string
  amount: number
  couponAmount: number
  balanceAmount: number
  type: string
}

/** 商户日账单行（含产品线明细，供行内展开） */
export type MerchantDailyBillListItem = {
  id: string
  merchantId: string
  usageDate: string
  usageMonth: string
  totalAmount: number
  couponAmount: number
  balanceAmount: number
  tenantCount: number
  source: string
  details: MerchantDailyBillDetailItem[]
}
