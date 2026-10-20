import { router, adminProcedure, supplyProcedure } from '../trpc'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { slaBitableSyncConfigDataAccess } from '@/lib/server/dataaccess/integrations/feishu/sla-bitable-sync-config'
import { slaBitableImportDataAccess } from '@/lib/server/dataaccess/supplier/sla-bitable-import'
import { staffDataAccess } from '@/lib/server/dataaccess/crm/staff'
import {
  previewSlaBitableSync,
  runSlaBitableSync,
} from '@/lib/server/jobs/feishu-bitable-sync/run-sla-bitable-sync'
import { feishuIntegrationJobRun } from '@workspace/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import type { SlaBitableJobRunDto } from '@/lib/types/sla-bitable-import'
import { SLA_BITABLE_SYNC_KINDS } from '@/lib/types/sla-bitable-import'

const fieldMappingSchema = z.record(z.string(), z.string())

const upsertSlaBitableConfigSchema = z.object({
  id: z.string().optional(),
  syncKind: z.enum(SLA_BITABLE_SYNC_KINDS),
  name: z.string().min(1),
  appToken: z.string().min(1),
  tableId: z.string().min(1),
  viewId: z.string().optional().nullable(),
  fieldMappingJson: fieldMappingSchema,
  filterFormula: z.string().optional().nullable(),
  cronExpr: z.string().optional(),
  autoCommit: z.boolean().optional(),
  enabled: z.boolean().optional(),
})

const slaBitablePreviewRowSchema = z.object({
  rowNo: z.number().int(),
  bitableRecordId: z.string(),
  parseStatus: z.enum(['ok', 'warning', 'error']),
  messages: z.array(z.string()),
  action: z.enum(['create', 'update', 'skip']),
  selectable: z.boolean(),
  dataCenterId: z.string().nullable(),
  dataCenterLabel: z.string().nullable(),
  gpuCardTypeId: z.string().nullable(),
  gpuCardTypeLabel: z.string().nullable(),
  supplierId: z.string().nullable(),
  supplierLabel: z.string().nullable(),
  reportReceivedAt: z.string().nullable(),
  customerFullName: z.string().nullable(),
  contractNo: z.string().nullable(),
  offlineOrderNo: z.string().nullable(),
  faultStartedAt: z.string().nullable(),
  faultEndedAt: z.string().nullable(),
  impactMinutes: z.number().nullable(),
  responsibility: z.string().nullable(),
  faultDescription: z.string().nullable(),
  remediation: z.string().nullable(),
  isForceMajeureExempt: z.boolean(),
  isCompensated: z.boolean(),
  compensationAmount: z.string().nullable(),
  compensationWorkOrderId: z.string().nullable(),
  tenantPlatformId: z.string().nullable(),
  productLine: z.string().nullable(),
  orderId: z.string().nullable(),
  affectedNodes: z.array(z.string()),
  compensationVoucherAmount: z.string().nullable(),
  expectedAt: z.string().nullable(),
  actualStartedAt: z.string().nullable(),
  actualReturnedAt: z.string().nullable(),
  actualShelvedAt: z.string().nullable(),
  department: z.string().nullable(),
  userName: z.string().nullable(),
  deviceCount: z.number().nullable(),
  gpuCount: z.number().nullable(),
  unitPrice: z.string().nullable(),
  totalAmount: z.string().nullable(),
  usageCardHours: z.string().nullable(),
  supplierCode: z.string().nullable(),
  cooperationType: z.string().nullable(),
  deviceQuantity: z.number().nullable(),
  gpuQuantity: z.number().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  lineStatus: z.string().nullable(),
  remark: z.string().nullable(),
  rawCanonical: z.record(z.string(), z.string()),
})

export const slaBitableImportCommitSchema = z.object({
  batchId: z.string().min(1),
  syncKind: z.enum(SLA_BITABLE_SYNC_KINDS),
  rows: z.array(slaBitablePreviewRowSchema).min(1),
})

function mapImportError(e: unknown): never {
  if (e instanceof TRPCError) throw e
  const message = e instanceof Error ? e.message : '操作失败'
  throw new TRPCError({ code: 'BAD_REQUEST', message })
}

async function resolveStaffId(user: {
  id: string
  email?: string | null
  phoneNumber?: string | null
}) {
  return staffDataAccess.resolveStaffIdForAuthUser(user)
}

export const slaBitableImportRouter = router({
  listConfigs: supplyProcedure.query(async () => {
    try {
      return await slaBitableSyncConfigDataAccess.listConfigs()
    } catch (e) {
      mapImportError(e)
    }
  }),

  getConfig: supplyProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input }) => {
      try {
        const config = await slaBitableSyncConfigDataAccess.getConfig(input.id)
        if (!config) {
          throw new TRPCError({ code: 'NOT_FOUND', message: '同步配置不存在' })
        }
        return config
      } catch (e) {
        mapImportError(e)
      }
    }),

  upsertConfig: adminProcedure
    .input(upsertSlaBitableConfigSchema)
    .mutation(async ({ input }) => {
      try {
        return await slaBitableSyncConfigDataAccess.upsertConfig(input)
      } catch (e) {
        mapImportError(e)
      }
    }),

  deleteConfig: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input }) => {
      try {
        await slaBitableSyncConfigDataAccess.deleteConfig(input.id)
        return { ok: true as const }
      } catch (e) {
        mapImportError(e)
      }
    }),

  listTableFields: supplyProcedure
    .input(
      z.object({
        syncKind: z.enum(SLA_BITABLE_SYNC_KINDS),
        appToken: z.string().min(1),
        tableId: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        return await slaBitableSyncConfigDataAccess.listBitableTableFields(input)
      } catch (e) {
        mapImportError(e)
      }
    }),

  preview: supplyProcedure
    .input(
      z.object({
        configId: z.string().min(1),
        forceFullSync: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const staffId = await resolveStaffId(ctx.user)
        const result = await previewSlaBitableSync({
          configId: input.configId,
          forceFullSync: input.forceFullSync,
          operatorStaffId: staffId,
        })
        if (!result.preview) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: result.message ?? '试跑失败' })
        }
        return result.preview
      } catch (e) {
        mapImportError(e)
      }
    }),

  runNow: supplyProcedure
    .input(
      z.object({
        configId: z.string().min(1),
        forceFullSync: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const staffId = await resolveStaffId(ctx.user)
        return await runSlaBitableSync({
          configId: input.configId,
          trigger: 'manual',
          forceFullSync: input.forceFullSync,
          operatorStaffId: staffId,
        })
      } catch (e) {
        mapImportError(e)
      }
    }),

  commitPreview: supplyProcedure
    .input(slaBitableImportCommitSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const staffId = await resolveStaffId(ctx.user)
        return await slaBitableImportDataAccess.commitPreview({
          ...input,
          operatorStaffId: staffId,
        })
      } catch (e) {
        mapImportError(e)
      }
    }),

  listJobRuns: supplyProcedure
    .input(
      z
        .object({
          configId: z.string().optional(),
          limit: z.number().int().min(1).max(50).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const limit = input?.limit ?? 20
      const conditions = [eq(feishuIntegrationJobRun.jobKind, 'sla_bitable_sync')]
      if (input?.configId) {
        conditions.push(eq(feishuIntegrationJobRun.refId, input.configId))
      }

      const rows = await db
        .select()
        .from(feishuIntegrationJobRun)
        .where(and(...conditions))
        .orderBy(desc(feishuIntegrationJobRun.startedAt))
        .limit(limit)

      const items: SlaBitableJobRunDto[] = rows.map((row) => ({
        id: row.id,
        status: row.status,
        refId: row.refId,
        requestSummary: (row.requestSummary as Record<string, unknown> | null) ?? null,
        responseSummary: (row.responseSummary as Record<string, unknown> | null) ?? null,
        errorMessage: row.errorMessage,
        startedAt: row.startedAt.toISOString(),
        finishedAt: row.finishedAt?.toISOString() ?? null,
      }))

      return { items }
    }),
})
