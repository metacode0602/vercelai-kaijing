import { staffDataAccess } from '@/lib/server/dataaccess/crm/staff'
import {
  financeBillingPeriodsDataAccess,
  financePersonalIncomeDataAccess,
  monthlyCostDataAccess,
  monthlyReportDataAccess,
  tenantRegionGpuConsumptionDataAccess,
  FinanceError,
} from '@/lib/server/dataaccess/finance'
import { MONTHLY_COST_BRANCHES } from '@/lib/monthly-cost/constants'
import { SLOT_TO_FILE_TYPE } from '@/lib/server/dataaccess/finance/constants'
import { TENANT_REGION_GPU_PRODUCT_LINES } from '@/lib/finance/tenant-region-gpu-product-line'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { adminProcedure, createTRPCRouter } from '../trpc'

async function resolveFinanceActorId(user: { id: string; email?: string | null }) {
  return staffDataAccess.resolveStaffIdForAuthUser(user)
}

function mapFinanceError(error: unknown): never {
  if (error instanceof FinanceError) {
    const codeMap = {
      NOT_FOUND: 'NOT_FOUND',
      CONFLICT: 'CONFLICT',
      BAD_REQUEST: 'BAD_REQUEST',
      PRECONDITION_FAILED: 'PRECONDITION_FAILED',
      UNPROCESSABLE: 'UNPROCESSABLE_CONTENT',
    } as const
    throw new TRPCError({
      code: codeMap[error.code] ?? 'INTERNAL_SERVER_ERROR',
      message: error.message,
    })
  }
  throw error
}

const periodCreateSchema = z.object({
  periodCode: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, '账期编码格式应为 YYYY-MM'),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ignoreListPriceWindows: z.boolean().optional().default(false),
})

const importSchema = z.object({
  billingPeriodId: z.string(),
  slot: z.enum(['tenantBill', 'personalTenantBill']),
  fileName: z.string(),
  /** base64 encoded file content */
  fileBase64: z.string().min(1),
  windowId: z.string().optional(),
  preserveIncomeDerived: z.boolean().optional(),
})

export const financeRouter = createTRPCRouter({
  periods: createTRPCRouter({
    list: adminProcedure.query(async () => {
      try {
        return await financeBillingPeriodsDataAccess.list()
      } catch (e) {
        mapFinanceError(e)
      }
    }),

    getById: adminProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        try {
          return await financeBillingPeriodsDataAccess.getById(input.id)
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    getBundle: adminProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        try {
          return await financeBillingPeriodsDataAccess.getBundle(input.id)
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    listImportTenantBindings: adminProcedure
      .input(
        z.object({
          billingPeriodId: z.string(),
          tenantType: z.enum(['all', 'internal', 'external']).optional(),
          customerType: z.enum(['all', 'B', 'C']).optional(),
          staffId: z.string().optional(),
          department: z.string().optional(),
          projectLinked: z.enum(['all', 'with_project', 'without_project']).optional(),
        }),
      )
      .query(async ({ input }) => {
        try {
          const { billingPeriodId, ...filters } = input
          return await financeBillingPeriodsDataAccess.listImportTenantBindings(
            billingPeriodId,
            filters,
          )
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    create: adminProcedure.input(periodCreateSchema).mutation(async ({ input }) => {
      try {
        return await financeBillingPeriodsDataAccess.create(input)
      } catch (e) {
        mapFinanceError(e)
      }
    }),

    importFile: adminProcedure.input(importSchema).mutation(async ({ input, ctx }) => {
      try {
        const buffer = Buffer.from(input.fileBase64, 'base64')
        const fileType = SLOT_TO_FILE_TYPE[input.slot]
        const actorId = await resolveFinanceActorId(ctx.user)
        return await financeBillingPeriodsDataAccess.importExcelFile({
          billingPeriodId: input.billingPeriodId,
          fileType,
          fileName: input.fileName,
          buffer,
          actorId,
          windowId: input.windowId,
          preserveIncomeDerived: input.preserveIncomeDerived,
        })
      } catch (e) {
        mapFinanceError(e)
      }
    }),

    validateSingleIncome: adminProcedure
      .input(z.object({ billingPeriodId: z.string() }))
      .query(async ({ input }) => {
        try {
          return await financeBillingPeriodsDataAccess.validateSingleIncome(
            input.billingPeriodId,
          )
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    previewSingleIncome: adminProcedure
      .input(z.object({ billingPeriodId: z.string() }))
      .query(async ({ input }) => {
        try {
          return await financeBillingPeriodsDataAccess.previewSinglePeriodIncome(
            input.billingPeriodId,
          )
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    computeSingleIncome: adminProcedure
      .input(z.object({ billingPeriodId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        try {
          const actorId = await resolveFinanceActorId(ctx.user)
          return await financeBillingPeriodsDataAccess.computeSinglePeriodIncome({
            billingPeriodId: input.billingPeriodId,
            actorId,
          })
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    previewBaremetalFromDb: adminProcedure
      .input(
        z.object({
          billingPeriodId: z.string(),
          periodField: z.enum(['ordered_at', 'imported_at', 'created_at']).optional().transform(
            (value) => (value === 'created_at' ? 'imported_at' : value),
          ),
        }),
      )
      .query(async ({ input }) => {
        try {
          return await financeBillingPeriodsDataAccess.previewBaremetalFromDb(
            input.billingPeriodId,
            { periodField: input.periodField },
          )
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    importBaremetalFromDb: adminProcedure
      .input(
        z.object({
          billingPeriodId: z.string(),
          preserveIncomeDerived: z.boolean().optional(),
          periodField: z.enum(['ordered_at', 'imported_at', 'created_at']).optional().transform(
            (value) => (value === 'created_at' ? 'imported_at' : value),
          ),
          allowEmptyImport: z.boolean().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        try {
          const actorId = await resolveFinanceActorId(ctx.user)
          return await financeBillingPeriodsDataAccess.importBaremetalFromDb({
            billingPeriodId: input.billingPeriodId,
            actorId,
            preserveIncomeDerived: input.preserveIncomeDerived,
            periodField: input.periodField,
            allowEmptyImport: input.allowEmptyImport,
          })
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    previewPersonalBaremetalFromDb: adminProcedure
      .input(z.object({ billingPeriodId: z.string() }))
      .query(async ({ input }) => {
        try {
          return await financeBillingPeriodsDataAccess.previewPersonalBaremetalFromDb(
            input.billingPeriodId,
          )
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    importPersonalBaremetalFromDb: adminProcedure
      .input(z.object({ billingPeriodId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        try {
          const actorId = await resolveFinanceActorId(ctx.user)
          return await financeBillingPeriodsDataAccess.importPersonalBaremetalFromDb({
            billingPeriodId: input.billingPeriodId,
            actorId,
          })
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    publish: adminProcedure
      .input(z.object({ billingPeriodId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        try {
          const actorId = await resolveFinanceActorId(ctx.user)
          await financeBillingPeriodsDataAccess.publish(input.billingPeriodId, actorId)
          return { ok: true }
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    unpublish: adminProcedure
      .input(z.object({ billingPeriodId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        try {
          const actorId = await resolveFinanceActorId(ctx.user)
          await financeBillingPeriodsDataAccess.unpublish(input.billingPeriodId, actorId)
          return { ok: true }
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    regenerate: adminProcedure
      .input(z.object({ billingPeriodId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        try {
          const actorId = await resolveFinanceActorId(ctx.user)
          return await financeBillingPeriodsDataAccess.regenerate(
            input.billingPeriodId,
            actorId,
          )
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    void: adminProcedure
      .input(z.object({ billingPeriodId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        try {
          const actorId = await resolveFinanceActorId(ctx.user)
          return await financeBillingPeriodsDataAccess.voidPeriod(
            input.billingPeriodId,
            actorId,
          )
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    detectPriceWindows: adminProcedure
      .input(
        z.object({
          periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        }),
      )
      .query(async ({ input }) => {
        try {
          return await financeBillingPeriodsDataAccess.detectPriceWindows(input)
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    validate: adminProcedure
      .input(z.object({ billingPeriodId: z.string() }))
      .query(async ({ input }) => {
        try {
          return await financeBillingPeriodsDataAccess.validatePeriod(
            input.billingPeriodId,
          )
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    downloadImportErrorReport: adminProcedure
      .input(
        z.object({
          billingPeriodId: z.string(),
          slot: z.enum(['tenantBill', 'personalTenantBill']),
          windowId: z.string().optional(),
        }),
      )
      .query(async ({ input }) => {
        try {
          return await financeBillingPeriodsDataAccess.downloadImportErrorReport(input)
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    saveSupplementary: adminProcedure
      .input(
        z.object({
          billingPeriodId: z.string(),
          items: z.array(
            z.object({
              incomeRowId: z.string(),
              supplementaryConsumption: z.string(),
            }),
          ),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        try {
          const actorId = await resolveFinanceActorId(ctx.user)
          await financeBillingPeriodsDataAccess.saveSupplementary({
            ...input,
            actorId,
          })
          return { ok: true }
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    getPersonalBundle: adminProcedure
      .input(z.object({ billingPeriodId: z.string() }))
      .query(async ({ input }) => {
        try {
          return await financePersonalIncomeDataAccess.getPersonalBundle(
            input.billingPeriodId,
          )
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    computePersonalIncome: adminProcedure
      .input(z.object({ billingPeriodId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        try {
          const actorId = await resolveFinanceActorId(ctx.user)
          return await financePersonalIncomeDataAccess.computePersonalIncome({
            billingPeriodId: input.billingPeriodId,
            actorId,
          })
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    purgePersonalIncome: adminProcedure
      .input(z.object({ billingPeriodId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        try {
          const actorId = await resolveFinanceActorId(ctx.user)
          return await financePersonalIncomeDataAccess.purgePersonalIncome(
            input.billingPeriodId,
            actorId,
          )
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    purgePersonalBaremetal: adminProcedure
      .input(z.object({ billingPeriodId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        try {
          const actorId = await resolveFinanceActorId(ctx.user)
          return await financePersonalIncomeDataAccess.purgePersonalBaremetal(
            input.billingPeriodId,
            actorId,
          )
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    listPersonalIncomeTenantLines: adminProcedure
      .input(
        z.object({
          billingPeriodId: z.string(),
          segment: z.enum([
            'enterprise_project',
            'non_project',
            'blacklist',
            'internal',
          ]),
        }),
      )
      .query(async ({ input }) => {
        try {
          return await financePersonalIncomeDataAccess.listPersonalIncomeTenantLines(
            input,
          )
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    listPersonalIncomeEnterpriseCrossCheck: adminProcedure
      .input(z.object({ billingPeriodId: z.string() }))
      .query(async ({ input }) => {
        try {
          return await financePersonalIncomeDataAccess.listPersonalIncomeEnterpriseCrossCheck(
            input.billingPeriodId,
          )
        } catch (e) {
          mapFinanceError(e)
        }
      }),
  }),

  tenantRegionGpuConsumption: createTRPCRouter({
    listFilterOptions: adminProcedure
      .input(z.object({ usageMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }))
      .query(async ({ input }) => {
        return tenantRegionGpuConsumptionDataAccess.listFilterOptions(input)
      }),

    listMonthly: adminProcedure
      .input(
        z.object({
          usageMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
          tenantPlatformId: z.string().optional(),
          dataCenterId: z.string().optional(),
          productLine: z.enum(TENANT_REGION_GPU_PRODUCT_LINES).optional(),
          hasAnomaly: z.enum(['all', 'yes', 'no']).optional(),
          limit: z.number().int().min(1).max(500).optional(),
          offset: z.number().int().min(0).optional(),
        }),
      )
      .query(async ({ input }) => {
        return tenantRegionGpuConsumptionDataAccess.listMonthly(input)
      }),

    listDaily: adminProcedure
      .input(
        z.object({
          usageMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
          tenantPlatformId: z.string().optional(),
          dataCenterId: z.string().optional(),
          productLine: z.enum(TENANT_REGION_GPU_PRODUCT_LINES).optional(),
          hasAnomaly: z.enum(['all', 'yes', 'no']).optional(),
          limit: z.number().int().min(1).max(1000).optional(),
          offset: z.number().int().min(0).optional(),
        }),
      )
      .query(async ({ input }) => {
        return tenantRegionGpuConsumptionDataAccess.listDaily(input)
      }),

    summarizeMonthly: adminProcedure
      .input(
        z.object({
          usageMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
          tenantPlatformId: z.string().optional(),
          dataCenterId: z.string().optional(),
          productLine: z.enum(TENANT_REGION_GPU_PRODUCT_LINES).optional(),
          hasAnomaly: z.enum(['all', 'yes', 'no']).optional(),
        }),
      )
      .query(async ({ input }) => {
        return tenantRegionGpuConsumptionDataAccess.summarizeMonthly(input)
      }),

    getMonthlyRowDetail: adminProcedure
      .input(
        z.object({
          monthlyRowId: z.string().min(1),
          dailyProductLineFilter: z.union([z.enum(TENANT_REGION_GPU_PRODUCT_LINES), z.literal('all')]).optional(),
          dailyLimit: z.number().int().min(1).max(500).optional(),
          dailyOffset: z.number().int().min(0).optional(),
        }),
      )
      .query(async ({ input }) => {
        try {
          return await tenantRegionGpuConsumptionDataAccess.getMonthlyRowDetail(input)
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    getPricingContext: adminProcedure
      .input(
        z.object({
          dataCenterId: z.string().min(1),
          gpuCardTypeId: z.string().min(1),
        }),
      )
      .query(async ({ input }) => {
        try {
          return await tenantRegionGpuConsumptionDataAccess.getPricingContext(input)
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    refreshPricing: adminProcedure
      .input(
        z.object({
          dataCenterId: z.string().min(1),
          gpuCardTypeId: z.string().min(1),
          usageMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
        }),
      )
      .mutation(async ({ input }) => {
        try {
          return await tenantRegionGpuConsumptionDataAccess.refreshPricing(input)
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    refreshPricingByRegion: adminProcedure
      .input(
        z.object({
          regionCode: z.string().min(1),
          usageMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
        }),
      )
      .mutation(async ({ input }) => {
        try {
          return await tenantRegionGpuConsumptionDataAccess.refreshPricingByRegion(input)
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    previewMonthlyImport: adminProcedure
      .input(
        z.object({
          fileName: z.string(),
          fileBase64: z.string().min(1),
          usageMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
        }),
      )
      .mutation(async ({ input }) => {
        const buffer = Buffer.from(input.fileBase64, 'base64')
        return await tenantRegionGpuConsumptionDataAccess.previewMonthlyImport({
          fileName: input.fileName,
          buffer,
          usageMonth: input.usageMonth,
        })
      }),

    commitMonthlyImport: adminProcedure
      .input(
        z.object({
          fileName: z.string(),
          fileBase64: z.string().min(1),
          usageMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
        }),
      )
      .mutation(async ({ input }) => {
        try {
          const buffer = Buffer.from(input.fileBase64, 'base64')
          return await tenantRegionGpuConsumptionDataAccess.commitMonthlyImport({
            fileName: input.fileName,
            buffer,
            usageMonth: input.usageMonth,
          })
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    importExcel: adminProcedure
      .input(
        z.object({
          fileName: z.string(),
          fileBase64: z.string().min(1),
        }),
      )
      .mutation(async ({ input }) => {
        const buffer = Buffer.from(input.fileBase64, 'base64')
        return tenantRegionGpuConsumptionDataAccess.importExcel({
          fileName: input.fileName,
          buffer,
        })
      }),

    previewImport: adminProcedure
      .input(
        z.object({
          fileName: z.string(),
          fileBase64: z.string().min(1),
        }),
      )
      .mutation(async ({ input }) => {
        const buffer = Buffer.from(input.fileBase64, 'base64')
        return tenantRegionGpuConsumptionDataAccess.previewImport({
          fileName: input.fileName,
          buffer,
        })
      }),

    commitImport: adminProcedure
      .input(
        z.object({
          fileName: z.string(),
          fileBase64: z.string().min(1),
        }),
      )
      .mutation(async ({ input }) => {
        try {
          const buffer = Buffer.from(input.fileBase64, 'base64')
          return await tenantRegionGpuConsumptionDataAccess.commitImport({
            fileName: input.fileName,
            buffer,
          })
        } catch (e) {
          mapFinanceError(e)
        }
      }),
  }),

  monthlyReport: createTRPCRouter({
    periodOptions: adminProcedure.query(async () => {
      try {
        return await monthlyReportDataAccess.getPeriodOptions()
      } catch (e) {
        mapFinanceError(e)
      }
    }),

    get: adminProcedure
      .input(
        z.object({
          periodCode: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, '账期编码格式应为 YYYY-MM'),
        }),
      )
      .query(async ({ input }) => {
        try {
          return await monthlyReportDataAccess.getReport(input)
        } catch (e) {
          mapFinanceError(e)
        }
      }),
  }),

  monthlyCost: createTRPCRouter({
    run: adminProcedure
      .input(
        z.object({
          billingPeriodId: z.string(),
          usageMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        try {
          const actorId = await resolveFinanceActorId(ctx.user)
          return await monthlyCostDataAccess.run({
            billingPeriodId: input.billingPeriodId,
            usageMonth: input.usageMonth,
            actorId,
          })
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    confirm: adminProcedure
      .input(
        z.object({
          billingPeriodId: z.string(),
          usageMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
          costBranch: z.enum(MONTHLY_COST_BRANCHES).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        try {
          const actorId = await resolveFinanceActorId(ctx.user)
          return await monthlyCostDataAccess.confirm({
            billingPeriodId: input.billingPeriodId,
            usageMonth: input.usageMonth,
            costBranch: input.costBranch,
            actorId,
          })
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    getBundle: adminProcedure
      .input(
        z.object({
          billingPeriodId: z.string(),
          usageMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
          costBranch: z.enum(MONTHLY_COST_BRANCHES).optional(),
        }),
      )
      .query(async ({ input }) => {
        try {
          return await monthlyCostDataAccess.getBundle(input)
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    listBaseLines: adminProcedure
      .input(
        z.object({
          billingPeriodId: z.string(),
          usageMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
          page: z.number().int().min(1).optional().default(1),
          pageSize: z.number().int().min(1).max(200).optional().default(20),
          onlyWithProject: z.boolean().optional().default(true),
          search: z.string().optional(),
          opportunitySource: z.string().optional(),
          dataCenterId: z.string().optional(),
          accountManagerStaffId: z.string().optional(),
        }),
      )
      .query(async ({ input }) => {
        try {
          return await monthlyCostDataAccess.listBaseLines(input)
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    listAllBaseLines: adminProcedure
      .input(
        z.object({
          billingPeriodId: z.string(),
          usageMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
          onlyWithProject: z.boolean().optional().default(true),
          search: z.string().optional(),
          opportunitySource: z.string().optional(),
          dataCenterId: z.string().optional(),
          accountManagerStaffId: z.string().optional(),
        }),
      )
      .query(async ({ input }) => {
        try {
          return await monthlyCostDataAccess.listAllBaseLines(input)
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    listBaseLineFilterOptions: adminProcedure
      .input(
        z.object({
          billingPeriodId: z.string(),
          usageMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
        }),
      )
      .query(async ({ input }) => {
        try {
          return await monthlyCostDataAccess.listBaseLineFilterOptions(input)
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    listExportBaseLines: adminProcedure
      .input(
        z.object({
          billingPeriodId: z.string(),
          usageMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
          onlyWithProject: z.boolean().optional().default(true),
          search: z.string().optional(),
          opportunitySource: z.string().optional(),
          dataCenterId: z.string().optional(),
          accountManagerStaffId: z.string().optional(),
        }),
      )
      .query(async ({ input }) => {
        try {
          return await monthlyCostDataAccess.listExportBaseLines(input)
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    listRunIssues: adminProcedure
      .input(
        z.object({
          billingPeriodId: z.string(),
          usageMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
        }),
      )
      .query(async ({ input }) => {
        try {
          return await monthlyCostDataAccess.listRunIssues(input)
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    listProjectBaseLines: adminProcedure
      .input(
        z.object({
          billingPeriodId: z.string(),
          usageMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
          projectId: z.string(),
        }),
      )
      .query(async ({ input }) => {
        try {
          return await monthlyCostDataAccess.listProjectBaseLines(input)
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    listDeptWeights: adminProcedure
      .input(
        z.object({
          usageMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
          recipientDept: z.string().optional(),
        }),
      )
      .query(async ({ input }) => {
        try {
          return await monthlyCostDataAccess.listDeptWeights(input)
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    saveDeptWeights: adminProcedure
      .input(
        z.object({
          usageMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
          recipientDept: z.string(),
          customerIncentiveLabel: z.enum(['新客', '老客']),
          costBranch: z.enum(MONTHLY_COST_BRANCHES).optional().nullable(),
          rows: z
            .array(
              z.object({
                staffId: z.string(),
                weightPercent: z.string(),
                note: z.string().optional().nullable(),
              }),
            )
            .min(1),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        try {
          const actorId = await resolveFinanceActorId(ctx.user)
          return await monthlyCostDataAccess.saveDeptWeights({
            ...input,
            updatedBy: actorId,
          })
        } catch (e) {
          mapFinanceError(e)
        }
      }),

    deleteDeptWeight: adminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        try {
          await monthlyCostDataAccess.deleteDeptWeight(input)
          return { ok: true }
        } catch (e) {
          mapFinanceError(e)
        }
      }),
  }),
})
