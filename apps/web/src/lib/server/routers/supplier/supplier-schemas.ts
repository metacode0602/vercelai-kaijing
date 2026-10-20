import { z } from 'zod'

const supplierStatusSchema = z.enum(['negotiating', 'cooperating', 'suspended', 'terminated'])
/**
 * 表单里的「计价模式」是 pricingMode（卡时/分成），不是合作模式；
 * 落库到 supplier.default_cooperation_mode。
 */
const supplierPricingModeSchema = z.enum([
  'card_time',
  'revenue_share',
  'tiered_card_time',
  'tiered_revenue_share',
])

const supplierFormSchema = z.object({
  name: z.string().trim().min(1, '请填写供应商全称'),
  shortName: z.string().trim().min(1, '请填写简称'),
  status: supplierStatusSchema,
  pricingMode: supplierPricingModeSchema,
  revenueShareRatio: z.number().positive().max(100).optional(),
  businessManagerStaffId: z.string().min(1, '请选择商务经理'),
  contactPerson: z.string().trim().min(1, '请填写联系人'),
  contactPhone: z.string().trim().min(1, '请填写联系电话'),
  contactEmail: z.string().trim().min(1, '请填写联系邮箱'),
  address: z.string().trim().min(1, '请填写地址'),
  bankAccount: z.string().trim().optional(),
  bankName: z.string().trim().optional(),
})

export const supplierCreateSchema = supplierFormSchema

export const supplierUpdateSchema = supplierFormSchema.extend({
  id: z.string().min(1),
})

export const supplierListSchema = z
  .object({
    externalTenantId: z.string().trim().min(1).optional(),
    search: z.string().optional(),
    status: z.string().optional(),
    /** 按计价方式过滤 supplier.default_cooperation_mode */
    pricingMode: z.string().optional(),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(20),
  })
  .optional()

export const supplierReviewListSchema = z.object({
  search: z.string().max(200).optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'all']).default('pending'),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
})

export const supplierReviewIdSchema = z.object({
  id: z.string().min(1),
})

export const supplierReviewApproveSchema = z.object({
  id: z.string().min(1),
})

export const supplierReviewRejectSchema = z.object({
  id: z.string().min(1),
  reason: z.string().max(500).optional(),
})

export const dataCenterListSchema = z.object({
  supplierId: z.string().optional(),
  search: z.string().optional(),
  status: z.string().optional(),
  cooperationStatus: z.string().optional(),
  containerInstanceRegion: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
})

export const gpuInventoryListSchema = z.object({
  supplierId: z.string().optional(),
  dataCenterId: z.string().optional(),
  search: z.string().optional(),
  status: z.string().optional(),
  isInternalTest: z.enum(['all', 'yes', 'no']).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
})

export const physicalDeviceListSchema = z.object({
  supplierId: z.string().optional(),
  dataCenterId: z.string().optional(),
  search: z.string().optional(),
  cardTypeName: z.string().optional(),
  opsStatus: z.string().optional(),
  cooperationType: z.string().optional(),
  lifecycleStatus: z.string().optional(),
  inMaintenance: z.enum(['all', 'yes', 'no']).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
})
