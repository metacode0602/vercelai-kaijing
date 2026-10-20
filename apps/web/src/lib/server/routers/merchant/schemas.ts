import { z } from 'zod'
import { MERCHANT_ACCESS_MODES } from '@workspace/db/schema'

export const merchantListSchema = z.object({
  search: z.string().max(200).optional(),
  accountManagerStaffId: z.string().min(1).optional(),
})

export const merchantIdSchema = z.object({
  id: z.string().min(1),
})

export const merchantTenantListSchema = z.object({
  id: z.string().min(1),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  platformTenantId: z.string().max(128).optional(),
})

export const merchantUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(255),
  companyFullName: z.string().min(1).max(512),
  unifiedSocialCreditCode: z.string().regex(/^[0-9A-Z]{18}$/),
  merchantMark: z.string().max(128).optional(),
  accessMode: z.enum(MERCHANT_ACCESS_MODES),
  /**
   * 能力开关（D3-4=B）：运营编辑的是这 3 个勾选，`access_mode` 由它们派生
   * （oem > iframe > promo > direct）。省略表示不修改。
   */
  oemEnabled: z.boolean().optional(),
  promoEnabled: z.boolean().optional(),
  iframeEnabled: z.boolean().optional(),
  type: z.enum(['platform_direct', 'partner']),
  status: z.enum(['active', 'inactive', 'suspended']),
  remark: z.string().max(5000).optional(),
  adminUrl: z.string().max(1024).optional(),
  consoleUrl: z.string().max(1024).optional(),
  website: z.string().max(1024).optional(),
  /**
   * 资金模式（DEC-F1/F9）—— 运营在此切换商户是「预付」还是「佣金」，
   * 是 promo_enabled / oem_enabled 两个遗留布尔的替代品。
   * 切到 commission 时应要求该商户有 active+default 收款账户（见 payout-account router）。
   */
  fundingMode: z.enum(['prepay', 'commission']).optional(),
  /**
   * 商户级充值准入阈值覆盖（DEC-F4/F7）—— 三态，null 有业务含义：
   *   null = 继承全局阈值
   *   > 0  = 该商户专属阈值
   *   = 0  = 该商户显式永不阻断（信用极好的商户的逃生舱）
   *
   * 必须能显式传 `null`（改回继承），所以不能用 `.optional()`——
   * 缺省表示「不修改」，与「设为继承」是两种不同意图。
   */
  rechargeBlockThreshold: z.number().min(0).nullable().optional(),
})

export const merchantActivityListSchema = z.object({
  merchantId: z.string().min(1),
  limit: z.number().int().positive().max(200).optional(),
})

export const merchantActivityCreateSchema = z.object({
  merchantId: z.string().min(1),
  comment: z.string().max(5000).default(''),
  files: z
    .array(
      z.object({
        fileName: z.string().min(1).max(255),
        mimeType: z.string().max(128).default('application/octet-stream'),
        fileBase64: z.string().min(1),
      }),
    )
    .max(5)
    .default([]),
})

export const merchantActivityUpdateSchema = z.object({
  merchantId: z.string().min(1),
  activityId: z.string().min(1),
  comment: z.string().min(1).max(5000),
})

const rechargeFileSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().max(128),
  fileBase64: z.string().min(1),
})

export const merchantRechargeListSchema = z.object({
  merchantId: z.string().min(1),
  paymentNodeId: z.string().min(1).optional(),
})

export const merchantRechargeCreateSchema = z.object({
  merchantId: z.string().min(1),
  paymentNodeId: z.string().min(1).optional(),
  amount: z.number().positive(),
  paymentMethod: z.string().min(1).max(32),
  status: z.enum(['pending', 'completed', 'cancelled']),
  transactionId: z.string().max(128).optional(),
  rechargeDate: z.string().min(1),
  remark: z.string().max(5000).optional(),
  billMonth: z.string().regex(/^\d{4}-\d{2}$/).optional().nullable(),
  files: z.array(rechargeFileSchema).min(1).max(5),
})

export const merchantRechargeUpdateSchema = z.object({
  rechargeId: z.string().min(1),
  paymentNodeId: z.string().min(1).optional(),
  amount: z.number().positive(),
  paymentMethod: z.string().min(1).max(32),
  status: z.enum(['pending', 'completed', 'cancelled']),
  transactionId: z.string().max(128).optional(),
  rechargeDate: z.string().min(1),
  remark: z.string().max(5000).optional(),
  billMonth: z.string().regex(/^\d{4}-\d{2}$/).optional().nullable(),
  keepAttachmentIds: z.array(z.string()).default([]),
  files: z.array(rechargeFileSchema).max(5).default([]),
})

export const merchantRechargeAuditSchema = z.object({
  merchantId: z.string().min(1).optional(),
  rechargeId: z.string().min(1).optional(),
  limit: z.number().int().positive().max(200).optional(),
})

export const merchantPaymentNodeListSchema = z.object({
  merchantId: z.string().min(1),
})

export const merchantPaymentNodeCreateSchema = z.object({
  merchantId: z.string().min(1),
  name: z.string().min(1).max(128),
  expectedAmount: z.number().positive(),
  dueDate: z.string().min(1),
  sortOrder: z.number().int().min(0).optional(),
  remark: z.string().max(5000).optional(),
  billMonth: z.string().regex(/^\d{4}-\d{2}$/).optional().nullable(),
})

export const merchantPaymentNodeUpdateSchema = z.object({
  paymentNodeId: z.string().min(1),
  name: z.string().min(1).max(128),
  expectedAmount: z.number().positive(),
  dueDate: z.string().min(1),
  sortOrder: z.number().int().min(0).optional(),
  remark: z.string().max(5000).optional(),
  billMonth: z.string().regex(/^\d{4}-\d{2}$/).optional().nullable(),
})

export const merchantPaymentNodeCancelSchema = z.object({
  paymentNodeId: z.string().min(1),
})

export const merchantPaymentNodeAuditSchema = z.object({
  merchantId: z.string().min(1).optional(),
  paymentNodeId: z.string().min(1).optional(),
  limit: z.number().int().positive().max(200).optional(),
})

export const merchantSyncPreviewSchema = z.object({}).optional()

export const merchantSyncCommitSchema = z.object({
  previewId: z.string().min(1),
})

const merchantTenantSyncCustomerSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('existing'),
    customerId: z.string().min(1),
  }),
  z.object({
    mode: z.literal('create'),
    name: z.string().min(1),
    type: z.enum(['B', 'C']),
    contactPerson: z.string().optional(),
    contactPhone: z.string().optional(),
  }),
])

export const merchantTenantSyncPreviewSchema = z.object({
  merchantId: z.string().min(1),
})

export const merchantTenantSyncCommitSchema = z.object({
  previewId: z.string().min(1),
  items: z
    .array(
      z.object({
        platformTenantId: z.string().regex(/^\d+$/),
        customer: merchantTenantSyncCustomerSchema.optional(),
      }),
    )
    .default([]),
})

export const merchantRegionListSchema = z.object({
  merchantId: z.string().min(1),
})

export const merchantRegionCreateSchema = z.object({
  merchantId: z.string().min(1),
  dataCenterId: z.string().min(1),
  effectiveFrom: z.string().min(1),
  displayName: z.string().max(255).optional(),
  status: z.enum(['open', 'closed', 'maintenance']),
  /** null = 不限配额（写入 -1） */
  availableGpuQuota: z.number().int().nullable(),
})

export const merchantRegionBatchCreateRowSchema = z.object({
  dataCenterId: z.string().min(1),
  effectiveFrom: z.string().min(1),
  displayName: z.string().max(255).optional(),
  status: z.enum(['open', 'closed', 'maintenance']),
  /** null = 不限配额（写入 -1） */
  availableGpuQuota: z.number().int().nullable(),
})

export const merchantRegionBatchCreateSchema = z.object({
  merchantId: z.string().min(1),
  rows: z.array(merchantRegionBatchCreateRowSchema).min(1).max(200),
})

export const merchantRegionUpdateSchema = z.object({
  merchantId: z.string().min(1),
  regionId: z.string().min(1),
  effectiveFrom: z.string().min(1),
  displayName: z.string().max(255).optional(),
  status: z.enum(['open', 'closed', 'maintenance']),
  /** null = 不限配额（写入 -1） */
  availableGpuQuota: z.number().int().nullable(),
})

export const merchantRegionUpdateCardTypesSchema = z.object({
  merchantId: z.string().min(1),
  regionId: z.string().min(1),
  enabledCardTypeIds: z.array(z.string().min(1)).min(1),
})

export const merchantRegionDeleteSchema = z.object({
  merchantId: z.string().min(1),
  regionId: z.string().min(1),
})

export const merchantConsumptionQuerySchema = z.object({
  merchantId: z.string().min(1),
  usageMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
})

export const merchantConsumptionDailySchema = merchantConsumptionQuerySchema.extend({
  recentDays: z.number().int().positive().max(366).optional(),
})

export const merchantBillMonthlySchema = z.object({
  merchantId: z.string().min(1),
})

export const merchantBillMonthlyDetailsSchema = z.object({
  merchantId: z.string().min(1),
  billMonth: z.string().regex(/^\d{4}-\d{2}$/),
  billId: z.string().min(1).optional(),
})

export const merchantBillDailySchema = z.object({
  merchantId: z.string().min(1),
  billMonth: z.string().regex(/^\d{4}-\d{2}$/),
})

export const merchantBillRollupSchema = z.object({
  merchantId: z.string().min(1),
  billMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
})

const merchantPricingProductLineSchema = z.enum([
  'elastic_service',
  'cloud_vm',
  'job',
  'spot',
])

export const merchantRegionPricingFormSchema = z.object({
  merchantId: z.string().min(1),
  dataCenterId: z.string().min(1),
  gpuCardTypeIds: z.array(z.string().min(1)),
  effectiveFrom: z.string().min(1),
})

export const merchantRegionPricingBatchUpsertSchema = z.object({
  merchantId: z.string().min(1),
  dataCenterId: z.string().min(1),
  effectiveFrom: z.string().min(1),
  items: z
    .array(
      z.object({
        gpuCardTypeId: z.string().min(1),
        productLine: merchantPricingProductLineSchema,
        billingUnit: z.enum(['hour']).default('hour'),
        purchasePrice: z.number().min(0),
      }),
    )
    .min(1),
})

export const merchantPricingListSchema = z.object({
  merchantId: z.string().min(1),
})

export const merchantProductPriceListSchema = z.object({
  merchantId: z.string().min(1),
})

export const merchantProductPriceUpsertSchema = z.object({
  merchantId: z.string().min(1),
  productLine: z.string().min(1).max(64),
  pricingModel: z.enum(['revenue_share', 'fixed_price']),
  commissionRate: z.number().gt(0).max(1).nullable().optional(),
  fixedUnitPrice: z.number().gt(0).nullable().optional(),
  billingUnit: z.string().min(1).max(16),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  remark: z.string().max(500).nullable().optional(),
})

export const merchantProductPriceArchiveSchema = z.object({
  merchantId: z.string().min(1),
  productLine: z.string().min(1).max(64),
})

export const merchantChangeAccountManagerSchema = z.object({
  merchantId: z.string().min(1),
  staffId: z.string().min(1),
  effectiveFrom: z.string().min(1),
  remark: z.string().max(500).optional(),
})

export const merchantReviewListSchema = z.object({
  search: z.string().max(200).optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'all']).default('pending'),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
})

export const merchantReviewIdSchema = z.object({
  id: z.string().min(1),
})

export const merchantReviewApproveSchema = z.object({
  id: z.string().min(1),
  merchantType: z.enum(['partner', 'platform_direct']).default('partner'),
})

export const merchantReviewRejectSchema = z.object({
  id: z.string().min(1),
  reason: z.string().max(500).optional(),
})
