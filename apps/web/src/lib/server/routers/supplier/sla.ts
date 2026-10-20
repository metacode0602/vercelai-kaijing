import { z } from 'zod'
import { slaDataAccess } from '@/lib/server/dataaccess/supplier/sla'
import { supplierError } from '@/lib/server/dataaccess/supplier/logger'
import { staffDataAccess } from '@/lib/server/dataaccess/crm/staff'
import {
  runSlaDailyPipeline,
  runSlaMonthlyRollupJob,
} from '@/lib/server/jobs/sla/run-sla-rollup'
import { slaBitableImportRouter } from '@/lib/server/routers/supplier/sla-bitable-import'
import { adminProcedure, createTRPCRouter, supplyProcedure } from '../trpc'

const slaMonthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'slaMonth 须为 YYYY-MM')

const statDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'statDate 须为 YYYY-MM-DD')

function mapSlaError(e: unknown): never {
  supplierError('router.sla', 'failed', e)
  throw e
}

export const slaRouter = createTRPCRouter({
  bitableImport: slaBitableImportRouter,

  listMonths: supplyProcedure.query(async () => {
    try {
      return await slaDataAccess.listAvailableMonths()
    } catch (e) {
      mapSlaError(e)
    }
  }),

  hasMonthlyData: supplyProcedure
    .input(z.object({ slaMonth: slaMonthSchema }))
    .query(async ({ input }) => {
      try {
        return await slaDataAccess.hasMonthlyData(input.slaMonth)
      } catch (e) {
        mapSlaError(e)
      }
    }),

  getOverview: supplyProcedure
    .input(z.object({ slaMonth: slaMonthSchema }))
    .query(async ({ input }) => {
      try {
        const rows = await slaDataAccess.getOverviewRows(input.slaMonth)
        return { rows }
      } catch (e) {
        mapSlaError(e)
      }
    }),

  getDatacenterDetail: supplyProcedure
    .input(
      z.object({
        dataCenterId: z.string().min(1),
        slaMonth: slaMonthSchema,
      }),
    )
    .query(async ({ input }) => {
      try {
        const detail = await slaDataAccess.getDatacenterDetail(
          input.dataCenterId,
          input.slaMonth,
        )
        return { detail }
      } catch (e) {
        mapSlaError(e)
      }
    }),

  getMonthlyReport: supplyProcedure
    .input(
      z.object({
        dataCenterId: z.string().min(1),
        slaMonth: slaMonthSchema,
      }),
    )
    .query(async ({ input }) => {
      try {
        const report = await slaDataAccess.getMonthlyReport(
          input.dataCenterId,
          input.slaMonth,
        )
        return { report }
      } catch (e) {
        mapSlaError(e)
      }
    }),

  listCompensation: supplyProcedure
    .input(
      z.object({
        dataCenterId: z.string().min(1),
        slaMonth: slaMonthSchema,
      }),
    )
    .query(async ({ input }) => {
      try {
        return await slaDataAccess.listCompensation(input)
      } catch (e) {
        mapSlaError(e)
      }
    }),

  upsertCompensation: adminProcedure
    .input(
      z.object({
        slaMonth: slaMonthSchema,
        dataCenterId: z.string().min(1),
        groupKey: z.string().min(1),
        serviceFee: z.number().nullable().optional(),
        compensationTier: z.number().nullable().optional(),
        compensationAmount: z.number().nullable().optional(),
        compensationNote: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const staffId = await staffDataAccess.resolveStaffIdForAuthUser(ctx.user)
        return await slaDataAccess.upsertCompensation({
          ...input,
          updatedByStaffId: staffId,
        })
      } catch (e) {
        mapSlaError(e)
      }
    }),

  deleteCompensation: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input }) => {
      try {
        return await slaDataAccess.deleteCompensation(input.id)
      } catch (e) {
        mapSlaError(e)
      }
    }),

  rollupDaily: adminProcedure
    .input(z.object({ statDate: statDateSchema }))
    .mutation(async ({ input }) => {
      try {
        await runSlaDailyPipeline(input.statDate)
        return { ok: true as const }
      } catch (e) {
        mapSlaError(e)
      }
    }),

  rollupMonthly: adminProcedure
    .input(z.object({ slaMonth: slaMonthSchema }))
    .mutation(async ({ input }) => {
      try {
        return await runSlaMonthlyRollupJob(input.slaMonth)
      } catch (e) {
        mapSlaError(e)
      }
    }),
})
