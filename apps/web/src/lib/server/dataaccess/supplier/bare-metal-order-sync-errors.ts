import 'server-only'

import { db } from '@/lib/db'
import type { PlatformMetalOrderRecord } from '@/lib/server/integrations/suanli-billing-api'
import type {
  BareMetalOrderSyncFailedItemDto,
  BareMetalOrderSyncFailedItemsListDto,
} from '@/lib/types/bare-metal-order-sync-api'
import {
  bareMetalSyncJobItem,
  bareMetalSyncJobRun,
  billingTenant,
  userStaff,
} from '@workspace/db/schema'
import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from 'drizzle-orm'
import {
  BareMetalOrderSyncError,
  isBareMetalOrderSyncError,
} from './bare-metal-order-sync-errors-codes'
import { upsertPlatformBareMetalOrder } from './bare-metal-order-sync'

function mapFailedItem(row: {
  id: string
  jobRunId: string
  platformTenantId: string
  tenantId: string | null
  tenantName: string | null
  platformOrderId: string | null
  orderNo: string | null
  errorCode: string | null
  errorMessage: string | null
  resolvedAt: Date | null
  resolvedByStaffId: string | null
  resolvedByStaffName: string | null
  platformPayload: unknown
  jobStartedAt: Date
  jobTrigger: string
  jobStatus: string
}): BareMetalOrderSyncFailedItemDto {
  return {
    id: row.id,
    jobRunId: row.jobRunId,
    platformTenantId: row.platformTenantId,
    tenantId: row.tenantId,
    tenantName: row.tenantName,
    platformOrderId: row.platformOrderId,
    orderNo: row.orderNo,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolvedByStaffId: row.resolvedByStaffId,
    resolvedByStaffName: row.resolvedByStaffName,
    platformPayload: (row.platformPayload ?? {}) as Record<string, unknown>,
    jobStartedAt: row.jobStartedAt.toISOString(),
    jobTrigger: row.jobTrigger,
    jobStatus: row.jobStatus,
  }
}

function extractListRecord(payload: unknown): PlatformMetalOrderRecord | null {
  if (!payload || typeof payload !== 'object') return null
  const obj = payload as Record<string, unknown>
  const list = obj.list ?? obj
  if (!list || typeof list !== 'object') return null
  const record = list as Record<string, unknown>
  if (record.order_id == null) return null
  return list as PlatformMetalOrderRecord
}

export const bareMetalOrderSyncErrorsDataAccess = {
  async getJobRun(jobRunId: string) {
    const run = await db.query.bareMetalSyncJobRun.findFirst({
      where: eq(bareMetalSyncJobRun.id, jobRunId),
    })
    if (!run) return null
    return {
      id: run.id,
      trigger: run.trigger,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      status: run.status,
      ordersFetchedCount: run.ordersFetchedCount,
      orderUpsertedCount: run.orderUpsertedCount,
      failedCount: run.failedCount,
      errorSummary: run.errorSummary,
    }
  },

  async listFailedItems(input: {
    jobRunId?: string
    resolved?: 'open' | 'all'
    errorCodes?: string[]
    search?: string
    page?: number
    pageSize?: number
  }): Promise<BareMetalOrderSyncFailedItemsListDto> {
    const page = Math.max(input.page ?? 1, 1)
    const pageSize = Math.min(Math.max(input.pageSize ?? 20, 1), 100)
    const offset = (page - 1) * pageSize

    const conditions = [
      eq(bareMetalSyncJobItem.phase, 'order_upsert'),
      eq(bareMetalSyncJobItem.status, 'failed'),
    ]

    if (input.jobRunId) {
      conditions.push(eq(bareMetalSyncJobItem.jobRunId, input.jobRunId))
    }

    if (input.resolved === 'open') {
      conditions.push(isNull(bareMetalSyncJobItem.resolvedAt))
    } else if (input.resolved === 'all') {
      // no filter
    } else {
      conditions.push(isNull(bareMetalSyncJobItem.resolvedAt))
    }

    if (input.errorCodes && input.errorCodes.length > 0) {
      conditions.push(inArray(bareMetalSyncJobItem.errorCode, input.errorCodes))
    }

    const search = input.search?.trim()
    if (search) {
      const pattern = `%${search}%`
      conditions.push(
        or(
          ilike(bareMetalSyncJobItem.orderNo, pattern),
          ilike(bareMetalSyncJobItem.platformOrderId, pattern),
          ilike(billingTenant.name, pattern),
          ilike(bareMetalSyncJobItem.platformTenantId, pattern),
        )!,
      )
    }

    const whereClause = and(...conditions)

    const rows = await db
      .select({
        id: bareMetalSyncJobItem.id,
        jobRunId: bareMetalSyncJobItem.jobRunId,
        platformTenantId: bareMetalSyncJobItem.platformTenantId,
        tenantId: bareMetalSyncJobItem.tenantId,
        tenantName: billingTenant.name,
        platformOrderId: bareMetalSyncJobItem.platformOrderId,
        orderNo: bareMetalSyncJobItem.orderNo,
        errorCode: bareMetalSyncJobItem.errorCode,
        errorMessage: bareMetalSyncJobItem.errorMessage,
        resolvedAt: bareMetalSyncJobItem.resolvedAt,
        resolvedByStaffId: bareMetalSyncJobItem.resolvedByStaffId,
        resolvedByStaffName: userStaff.displayName,
        platformPayload: bareMetalSyncJobItem.platformPayload,
        jobStartedAt: bareMetalSyncJobRun.startedAt,
        jobTrigger: bareMetalSyncJobRun.trigger,
        jobStatus: bareMetalSyncJobRun.status,
      })
      .from(bareMetalSyncJobItem)
      .innerJoin(bareMetalSyncJobRun, eq(bareMetalSyncJobItem.jobRunId, bareMetalSyncJobRun.id))
      .leftJoin(billingTenant, eq(bareMetalSyncJobItem.tenantId, billingTenant.id))
      .leftJoin(userStaff, eq(bareMetalSyncJobItem.resolvedByStaffId, userStaff.id))
      .where(whereClause)
      .orderBy(desc(bareMetalSyncJobRun.startedAt), desc(bareMetalSyncJobItem.orderNo))
      .limit(pageSize)
      .offset(offset)

    const countRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(bareMetalSyncJobItem)
      .leftJoin(billingTenant, eq(bareMetalSyncJobItem.tenantId, billingTenant.id))
      .where(whereClause)

    const openCountRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(bareMetalSyncJobItem)
      .where(
        and(
          eq(bareMetalSyncJobItem.phase, 'order_upsert'),
          eq(bareMetalSyncJobItem.status, 'failed'),
          isNull(bareMetalSyncJobItem.resolvedAt),
          ...(input.jobRunId ? [eq(bareMetalSyncJobItem.jobRunId, input.jobRunId)] : []),
        ),
      )

    return {
      items: rows.map(mapFailedItem),
      total: countRows[0]?.count ?? 0,
      openCount: openCountRows[0]?.count ?? 0,
      page,
      pageSize,
    }
  },

  async resolveFailedItem(input: { itemId: string; staffId: string }) {
    const [row] = await db
      .update(bareMetalSyncJobItem)
      .set({
        resolvedAt: new Date(),
        resolvedByStaffId: input.staffId,
      })
      .where(
        and(
          eq(bareMetalSyncJobItem.id, input.itemId),
          eq(bareMetalSyncJobItem.phase, 'order_upsert'),
          isNull(bareMetalSyncJobItem.resolvedAt),
        ),
      )
      .returning({ id: bareMetalSyncJobItem.id })

    if (!row) {
      throw new Error('失败记录不存在或已处理')
    }
    return { success: true as const }
  },

  async retryOrder(input: { itemId: string; traceId?: string }) {
    const item = await db.query.bareMetalSyncJobItem.findFirst({
      where: eq(bareMetalSyncJobItem.id, input.itemId),
    })
    if (!item || item.phase !== 'order_upsert') {
      throw new Error('失败记录不存在')
    }

    const record = extractListRecord(item.platformPayload)
    if (!record) {
      throw new Error('缺少平台订单快照，无法重试')
    }

    const tenantRow = await db.query.billingTenant.findFirst({
      where: (t, { eq: eqOp }) => eqOp(t.platformTenantId, String(record.tenant_id)),
      columns: { id: true, platformTenantId: true, customerId: true },
    })
    if (!tenantRow?.platformTenantId) {
      throw new BareMetalOrderSyncError(`平台租户 ${record.tenant_id} 未导入`, 'UNKNOWN_TENANT')
    }

    try {
      const result = await upsertPlatformBareMetalOrder({
        record,
        tenant: {
          tenantId: tenantRow.id,
          platformTenantId: tenantRow.platformTenantId,
          customerId: tenantRow.customerId,
        },
        traceId: input.traceId,
      })

      await db
        .update(bareMetalSyncJobItem)
        .set({ resolvedAt: new Date() })
        .where(eq(bareMetalSyncJobItem.id, item.id))

      return {
        success: true as const,
        orderId: result.orderId,
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : '重试失败'
      const code = isBareMetalOrderSyncError(e) ? e.code : 'UPSERT_FAILED'
      await db
        .update(bareMetalSyncJobItem)
        .set({
          errorMessage: message,
          errorCode: code,
        })
        .where(eq(bareMetalSyncJobItem.id, item.id))
      return {
        success: false as const,
        error: message,
      }
    }
  },

  async listJobRunOptions(limit = 30) {
    const failedRunRows = await db
      .selectDistinct({ jobRunId: bareMetalSyncJobItem.jobRunId })
      .from(bareMetalSyncJobItem)
      .where(
        and(
          eq(bareMetalSyncJobItem.phase, 'order_upsert'),
          eq(bareMetalSyncJobItem.status, 'failed'),
        ),
      )
      .orderBy(desc(bareMetalSyncJobItem.jobRunId))
      .limit(limit)

    const ids = failedRunRows.map((r) => r.jobRunId)
    if (ids.length === 0) return []

    const rows = await db
      .select({
        id: bareMetalSyncJobRun.id,
        startedAt: bareMetalSyncJobRun.startedAt,
        status: bareMetalSyncJobRun.status,
        trigger: bareMetalSyncJobRun.trigger,
      })
      .from(bareMetalSyncJobRun)
      .where(inArray(bareMetalSyncJobRun.id, ids))
      .orderBy(desc(bareMetalSyncJobRun.startedAt))

    return rows.map((r) => ({
      id: r.id,
      label: `${r.startedAt.toISOString().slice(0, 16).replace('T', ' ')} · ${r.trigger} · ${r.status}`,
    }))
  },
}
