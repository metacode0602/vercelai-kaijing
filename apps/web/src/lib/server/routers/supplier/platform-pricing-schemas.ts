import { z } from 'zod'

export const platformProductLineSchema = z.enum([
  'elastic_service',
  'cloud_vm',
  'bare_metal',
  'job',
  'spot',
])

export const platformBillingUnitSchema = z.enum(['hour', 'day', 'week', 'month'])

export const platformPriceStatusSchema = z.enum(['draft', 'active', 'archived'])

import { PLATFORM_DATETIME_REGEX } from '@/lib/platform-pricing/datetime'

export const platformPriceUpsertSchema = z.object({
  gpuCardTypeId: z.string().min(1),
  productLine: platformProductLineSchema,
  billingUnit: platformBillingUnitSchema.default('hour'),
  sellPrice: z.number().positive('销售单价须大于 0'),
  effectiveFrom: z
    .string()
    .regex(PLATFORM_DATETIME_REGEX, '生效时间格式须为 yyyy-MM-dd HH:mm:ss'),
  effectiveTo: z
    .string()
    .regex(PLATFORM_DATETIME_REGEX, '结束时间格式须为 yyyy-MM-dd HH:mm:ss')
    .nullable()
    .optional(),
  status: platformPriceStatusSchema.default('active'),
  remark: z.string().trim().max(2000).optional(),
})

export const platformPriceUpdateSchema = platformPriceUpsertSchema.extend({
  recordId: z.string().min(1),
})

export const platformPricePeriodManualPriceSchema = z.object({
  productLine: platformProductLineSchema,
  billingUnit: platformBillingUnitSchema.default('hour'),
  sellPrice: z.number().positive('销售单价须大于 0'),
})

export const platformPricePeriodCreateSchema = z.object({
  gpuCardTypeId: z.string().min(1),
  effectiveFrom: z
    .string()
    .regex(PLATFORM_DATETIME_REGEX, '生效时间格式须为 yyyy-MM-dd HH:mm:ss'),
  effectiveTo: z
    .string()
    .regex(PLATFORM_DATETIME_REGEX, '结束时间格式须为 yyyy-MM-dd HH:mm:ss')
    .nullable()
    .optional(),
  copyFromPeriodId: z.string().min(1).optional(),
  autoClosePreviousCurrent: z.boolean().default(false),
  manualPrices: z.array(platformPricePeriodManualPriceSchema).optional(),
})

export const platformPricePeriodUpdateSchema = z.object({
  gpuCardTypeId: z.string().min(1),
  periodId: z.string().min(1),
  effectiveFrom: z
    .string()
    .regex(PLATFORM_DATETIME_REGEX, '生效时间格式须为 yyyy-MM-dd HH:mm:ss'),
  effectiveTo: z
    .string()
    .regex(PLATFORM_DATETIME_REGEX, '结束时间格式须为 yyyy-MM-dd HH:mm:ss')
    .nullable()
    .optional(),
})

const platformDateOrDateTimeSchema = z
  .string()
  .min(1)
  .refine(
    (v) => PLATFORM_DATETIME_REGEX.test(v.trim()) || /^\d{4}-\d{2}-\d{2}$/.test(v.trim()),
    '生效时间格式须为 yyyy-MM-dd 或 yyyy-MM-dd HH:mm:ss',
  )

export const datacenterSellPriceUpsertSchema = z.object({
  supplierId: z.string().min(1),
  dataCenterId: z.string().min(1),
  gpuCardTypeId: z.string().min(1),
  productLine: platformProductLineSchema,
  billingUnit: platformBillingUnitSchema.default('hour'),
  sellPrice: z.number().positive('销售单价须大于 0'),
  inheritPlatformPrice: z.boolean().default(false),
  effectiveFrom: platformDateOrDateTimeSchema,
  remark: z.string().trim().max(2000).optional(),
})

export const datacenterSellPriceUpdateSchema = datacenterSellPriceUpsertSchema.extend({
  recordId: z.string().min(1),
})

export const datacenterSellPriceHistorySchema = z.object({
  cardTypeId: z.string().min(1),
  dataCenterId: z.string().min(1).optional(),
})
