import { z } from 'zod'

const capacityLineSchema = z.object({
  id: z.string().optional(),
  dataCenterId: z.string().min(1),
  gpuCardTypeId: z.string().min(1),
  cooperationType: z.enum(['idle_time', 'whole_rent']),
  deviceQuantity: z.number().int().min(1),
  gpuQuantity: z.number().int().min(1),
  gpuCountPerDevice: z.number().int().min(1).optional(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  lineStatus: z.enum(['active', 'paused', 'terminated']).optional(),
})

export const contractCreateSchema = z.object({
  supplierId: z.string().min(1),
  type: z.enum(['cooperation', 'supplement', 'renewal']),
  pricingMode: z.enum(['card_time', 'revenue_share', 'tiered_card_time', 'tiered_revenue_share']),
  cooperationMode: z.enum(['idle_time', 'whole_rent']),
  startDate: z.string().min(1),
  endDate: z.string().optional(),
  terms: z.string().optional(),
  unitPricePerHour: z.string().optional(),
  revenueSharePercent: z.string().optional(),
  minCommitHours: z.string().optional(),
  settlementCycle: z.enum(['monthly', 'quarterly']).optional(),
  contractFileUri: z.string().url().optional(),
  signerName: z.string().optional(),
  expectedListingTime: z.string().optional(),
  penaltyTerms: z.string().optional(),
  monthlyRentPrice: z.string().optional(),
  siteNodeCount: z.number().int().min(0).optional(),
  siteNodeTier: z.enum(['lte_5', 'lte_30', 'lte_100', 'gt_100']).optional(),
  productLines: z
    .array(z.enum(['bare_metal', 'sandbox', 'k8s', 'serverless', 'heavy_file']))
    .optional(),
  publicIpCount: z.number().int().min(0).max(64).optional(),
  supplierProvidesCpuHosts: z.boolean().optional(),
  infraPricing: z
    .object({
      bandwidth: z
        .object({
          pricePerMbpsPerMonth: z.number(),
          includedMbps: z.number().optional(),
        })
        .optional(),
      publicIp: z
        .object({
          pricePerIpPerMonth: z.number(),
          includedIps: z.number().optional(),
        })
        .optional(),
      cpuDevice: z
        .object({
          pricePerCorePerMonth: z.number(),
        })
        .optional(),
      storage: z
        .object({
          nas: z
            .object({
              pricePerGbPerMonth: z.number(),
              includedGb: z.number().optional(),
            })
            .optional(),
          ceph: z
            .object({
              pricePerGbPerMonth: z.number(),
              includedGb: z.number().optional(),
            })
            .optional(),
          gfs: z
            .object({
              pricePerGbPerMonth: z.number(),
              includedGb: z.number().optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
  capacityLines: z.array(capacityLineSchema).min(1, '合同必须包含至少一行产能明细'),
  pricingTiers: z
    .array(
      z.object({
        tierOrder: z.number().int().min(1),
        dealUnitPricePerHour: z.string().optional(),
        revenueSharePercent: z.string().optional(),
        dealToListRatioMin: z.string().optional(),
        dealToListRatioMax: z.string().optional(),
        remark: z.string().optional(),
      }),
    )
    .optional(),
})

export const contractUpdateSchema = contractCreateSchema
  .partial()
  .extend({
    contractId: z.string().min(1),
    capacityLines: z.array(capacityLineSchema).min(1).optional(),
  })

export const contractSendToSupplierSchema = z.object({
  contractId: z.string().min(1),
})

export const contractTerminateSchema = z.object({
  contractId: z.string().min(1),
  reason: z.string().min(1),
})

export const contractLinkDevicesSchema = z.object({
  contractId: z.string().min(1),
  deviceIds: z.array(z.string().min(1)).min(1),
})

export const contractListSchema = z.object({
  supplierId: z.string().optional(),
  status: z.string().optional(),
  type: z.string().optional(),
  search: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
})

export const capacityLineUpsertSchema = z.object({
  contractId: z.string().min(1),
  lines: z.array(capacityLineSchema).min(1, '至少保留一行产能明细'),
})
