import {
  computeSlidingSyncWindow,
  cstDateRangeToInstantWindow,
  formatCstDate,
  validateBillingDateRange,
} from '@/lib/crm/tenant-billing-import-utils'
import { db } from '@/lib/db'
import { platformTenantImportDataAccess } from '@/lib/server/dataaccess/crm/platform-tenant-import'
import { tenantBillingImportDataAccess } from '@/lib/server/dataaccess/crm/tenant-billing-import'
import { crmError, crmLog, crmWarn } from '@/lib/server/dataaccess/crm/logger'
import { fetchPlatformMetalOrdersGlobal } from '@/lib/server/integrations/suanli-billing-api'
import {
  bareMetalSyncJobItem,
  bareMetalSyncJobRun,
  bareMetalSyncState,
  billingTenant,
} from '@workspace/db/schema'
import { sql } from 'drizzle-orm'
import {
  BARE_METAL_ORDER_SYNC_LOCK_KEY,
  getBareMetalOrderSyncBillingLookbackMonths,
  getBareMetalOrderSyncWindowDays,
} from './bare-metal-order-sync-config'
import { upsertBareMetalOrdersForTenantWindow } from './bare-metal-order-tenant-window-sync'
import { upsertPlatformBareMetalOrder } from './bare-metal-order-sync'
import {
  insertOrderSyncFailureItem,
  insertUnknownTenantOrderFailureItem,
} from './bare-metal-order-sync-failures'
import { isBareMetalOrderSyncError } from './bare-metal-order-sync-errors-codes'
import { notifyBareMetalSyncFailureToAdmins } from './bare-metal-order-sync-notify'

export type BareMetalOrderSyncMode = 'incremental' | 'backfill'

function newId() {
  return crypto.randomUUID()
}

function billingLookbackStartDate(months: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(1)
  d.setMonth(d.getMonth() - months)
  return formatCstDate(d)
}

function assertBackfillDateRange(startDate: string, endDate: string): void {
  validateBillingDateRange(startDate, endDate)
  const todayCst = formatCstDate(new Date())
  if (endDate > todayCst) {
    throw new Error('结束日期不能晚于东八区今天')
  }
}

async function tryAcquireLock(): Promise<boolean> {
  const result = await db.execute<{ acquired: boolean }>(
    sql`SELECT pg_try_advisory_lock(${BARE_METAL_ORDER_SYNC_LOCK_KEY}) AS acquired`,
  )
  return Boolean(result.rows[0]?.acquired)
}

async function releaseLock(): Promise<void> {
  await db.execute(sql`SELECT pg_advisory_unlock(${BARE_METAL_ORDER_SYNC_LOCK_KEY})`)
}

async function touchSyncState(partial: {
  lastRunAt?: Date
  lastSuccessAt?: Date
}) {
  const existing = await db.query.bareMetalSyncState.findFirst({
    where: (t, { eq }) => eq(t.id, 'default'),
  })
  if (!existing) {
    await db.insert(bareMetalSyncState).values({
      id: 'default',
      lastRunAt: partial.lastRunAt ?? null,
      lastSuccessAt: partial.lastSuccessAt ?? null,
      orderSyncCursorEndDate: null,
    })
    return
  }
  await db
    .update(bareMetalSyncState)
    .set({
      lastRunAt: partial.lastRunAt ?? existing.lastRunAt,
      lastSuccessAt: partial.lastSuccessAt ?? existing.lastSuccessAt,
    })
    .where(sql`id = 'default'`)
}

export async function runScheduledBareMetalOrderSync(input: {
  trigger: 'scheduled' | 'manual'
  mode?: BareMetalOrderSyncMode
  startDate?: string
  endDate?: string
}): Promise<{ jobRunId: string; status: string }> {
  const mode = input.mode ?? 'incremental'
  const isBackfill = mode === 'backfill'

  if (isBackfill) {
    const startDate = input.startDate?.trim()
    const endDate = input.endDate?.trim()
    if (!startDate || !endDate) {
      throw new Error('补同步须填写开始日期与结束日期')
    }
    assertBackfillDateRange(startDate, endDate)
  }

  const traceId = crypto.randomUUID().slice(0, 8)
  const acquired = await tryAcquireLock()
  if (!acquired) {
    crmWarn('bare-metal-sync', 'skipped (lock held)', { traceId })
    return { jobRunId: '', status: 'skipped' }
  }

  const jobRunId = newId()
  const startedAt = new Date()
  await touchSyncState({ lastRunAt: startedAt })

  await db.insert(bareMetalSyncJobRun).values({
    id: jobRunId,
    trigger: input.trigger,
    startedAt,
    status: 'running',
  })

  let ordersFetchedCount = 0
  let unknownTenantCount = 0
  let tenantsAutoImportedCount = 0
  let billingSyncTenantCount = 0
  let orderUpsertedCount = 0
  let successCount = 0
  let failedCount = 0
  const errorParts: string[] = []

  const windowDays = getBareMetalOrderSyncWindowDays()
  let startAt: Date
  let endAt: Date
  let backfillStartDate: string | undefined
  let backfillEndDate: string | undefined

  if (isBackfill) {
    backfillStartDate = input.startDate!.trim()
    backfillEndDate = input.endDate!.trim()
    const range = cstDateRangeToInstantWindow(backfillStartDate, backfillEndDate)
    startAt = range.startAt
    endAt = range.endAt
  } else {
    const window = computeSlidingSyncWindow({ windowDays, now: startedAt })
    if (window.skipped) {
      crmLog('bare-metal-sync', 'skipped invalid window', {
        traceId,
        windowDays,
      })
      await db
        .update(bareMetalSyncJobRun)
        .set({
          finishedAt: new Date(),
          status: 'skipped',
          errorSummary: '滑动窗口配置无效',
        })
        .where(sql`id = ${jobRunId}`)
      await touchSyncState({ lastSuccessAt: new Date() })
      return { jobRunId, status: 'skipped' }
    }
    startAt = window.startAt
    endAt = window.endAt
  }

  try {
    crmLog('bare-metal-sync', 'fetch global orders', {
      traceId,
      mode,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      windowDays: isBackfill ? undefined : windowDays,
      startDate: backfillStartDate,
      endDate: backfillEndDate,
    })
    const orders = await fetchPlatformMetalOrdersGlobal({
      traceId,
      startAt,
      endAt,
    })
    ordersFetchedCount = orders.length

    const platformTenantIds = [
      ...new Set(orders.map((o) => String(o.tenant_id)).filter(Boolean)),
    ]

    const localTenants = await db
      .select({
        id: billingTenant.id,
        platformTenantId: billingTenant.platformTenantId,
      })
      .from(billingTenant)

    const knownPlatformIds = new Set(
      localTenants.map((t) => t.platformTenantId).filter(Boolean) as string[],
    )
    const unknownIds = platformTenantIds.filter((id) => !knownPlatformIds.has(id))
    unknownTenantCount = unknownIds.length

    const autoImport = await platformTenantImportDataAccess.autoImportTenantsForBareMetalSync(
      unknownIds,
      traceId,
    )
    tenantsAutoImportedCount = autoImport.importedCount
    failedCount += autoImport.errors.length
    for (const err of autoImport.errors) {
      errorParts.push(`租户 ${err.platformTenantId}: ${err.message}`)
    }

    const newlyImportedPlatformIds = unknownIds.filter((id) =>
      autoImport.tenantIdByPlatformId.has(id),
    )
    const lookbackMonths = getBareMetalOrderSyncBillingLookbackMonths()
    const billingStartDate = billingLookbackStartDate(lookbackMonths)
    const billingEndDate = formatCstDate(new Date())

    for (const platformTenantId of newlyImportedPlatformIds) {
      const tenantId = autoImport.tenantIdByPlatformId.get(platformTenantId)!
      billingSyncTenantCount++
      const tenantRow = await db.query.billingTenant.findFirst({
        where: (t, { eq }) => eq(t.id, tenantId),
        columns: { id: true, platformTenantId: true, customerId: true },
      })
      if (!tenantRow?.platformTenantId) {
        failedCount++
        errorParts.push(`租户 ${platformTenantId}: CRM 租户记录缺失`)
        continue
      }

      try {
        const result = await tenantBillingImportDataAccess.directImport({
          tenantId,
          startDate: billingStartDate,
          endDate: billingEndDate,
        })
        await db.insert(bareMetalSyncJobItem).values({
          id: newId(),
          jobRunId,
          platformTenantId,
          tenantId,
          phase: 'billing_sync',
          status: result.success ? 'success' : 'failed',
          orderCount: 0,
          errorMessage: result.success ? null : result.error,
        })
        if (result.success) successCount++
        else {
          failedCount++
          errorParts.push(`账单 ${platformTenantId}: ${result.error}`)
        }
      } catch (e) {
        failedCount++
        const msg = e instanceof Error ? e.message : '账单同步失败'
        errorParts.push(`账单 ${platformTenantId}: ${msg}`)
        await db.insert(bareMetalSyncJobItem).values({
          id: newId(),
          jobRunId,
          platformTenantId,
          tenantId,
          phase: 'billing_sync',
          status: 'failed',
          orderCount: 0,
          errorMessage: msg,
        })
      }

      try {
        const metalResult = await upsertBareMetalOrdersForTenantWindow({
          tenant: {
            tenantId: tenantRow.id,
            platformTenantId: tenantRow.platformTenantId,
            customerId: tenantRow.customerId,
          },
          startDate: billingStartDate,
          endDate: billingEndDate,
          traceId,
        })
        orderUpsertedCount += metalResult.orderUpsertedCount
        await db.insert(bareMetalSyncJobItem).values({
          id: newId(),
          jobRunId,
          platformTenantId,
          tenantId,
          phase: 'tenant_order_backfill',
          status: metalResult.failedCount === 0 ? 'success' : 'partial',
          orderCount: metalResult.orderUpsertedCount,
          errorMessage:
            metalResult.errors.length > 0 ? metalResult.errors.slice(0, 3).join('；') : null,
        })
        if (metalResult.failedCount === 0 && metalResult.orderUpsertedCount > 0) {
          successCount++
        } else if (metalResult.failedCount > 0) {
          failedCount += metalResult.failedCount
          for (const err of metalResult.errors.slice(0, 5)) {
            errorParts.push(`裸金属补齐 ${platformTenantId}: ${err}`)
          }
        }
      } catch (e) {
        failedCount++
        const msg = e instanceof Error ? e.message : '裸金属订单补齐失败'
        errorParts.push(`裸金属补齐 ${platformTenantId}: ${msg}`)
        await db.insert(bareMetalSyncJobItem).values({
          id: newId(),
          jobRunId,
          platformTenantId,
          tenantId,
          phase: 'tenant_order_backfill',
          status: 'failed',
          orderCount: 0,
          errorMessage: msg,
        })
      }
    }

    for (const record of orders) {
      const platformTenantId = String(record.tenant_id)
      const tenantRow = await db.query.billingTenant.findFirst({
        where: (t, { eq }) => eq(t.platformTenantId, platformTenantId),
        columns: { id: true, platformTenantId: true, customerId: true },
      })
      if (!tenantRow?.platformTenantId) {
        failedCount++
        const msg = `订单 ${record.order_no}: 平台租户 ${platformTenantId} 未导入`
        errorParts.push(msg)
        await insertUnknownTenantOrderFailureItem({ jobRunId, record })
        continue
      }

      try {
        await upsertPlatformBareMetalOrder({
          record,
          tenant: {
            tenantId: tenantRow.id,
            platformTenantId: tenantRow.platformTenantId,
            customerId: tenantRow.customerId,
          },
          traceId,
        })
        orderUpsertedCount++
      } catch (e) {
        failedCount++
        const msg = e instanceof Error ? e.message : 'upsert 失败'
        errorParts.push(`订单 ${record.order_no}: ${msg}`)
        await insertOrderSyncFailureItem({
          jobRunId,
          record,
          tenantId: tenantRow.id,
          errorCode: isBareMetalOrderSyncError(e) ? e.code : 'UPSERT_FAILED',
          errorMessage: msg,
        })
      }
    }

    const status =
      failedCount > 0 && orderUpsertedCount > 0
        ? 'partial'
        : failedCount > 0
          ? 'failed'
          : 'success'

    const backfillPrefix =
      isBackfill && backfillStartDate && backfillEndDate
        ? `[补同步 ${backfillStartDate}~${backfillEndDate}] `
        : ''

    await db
      .update(bareMetalSyncJobRun)
      .set({
        finishedAt: new Date(),
        status,
        ordersFetchedCount,
        unknownTenantCount,
        tenantsAutoImportedCount,
        billingSyncTenantCount,
        orderUpsertedCount,
        successCount,
        failedCount,
        errorSummary:
          errorParts.length > 0
            ? backfillPrefix + errorParts.slice(0, 20).join('；')
            : isBackfill
              ? `${backfillPrefix.trim()}完成`
              : null,
      })
      .where(sql`id = ${jobRunId}`)

    await notifyBareMetalSyncFailureToAdmins({ jobRunId })

    if (status !== 'failed') {
      await touchSyncState({ lastSuccessAt: new Date() })
    }

    crmLog('bare-metal-sync', 'done', {
      traceId,
      mode,
      status,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      ordersFetchedCount,
      orderUpsertedCount,
    })

    return { jobRunId, status }
  } catch (e) {
    crmError('bare-metal-sync', 'job failed', e, { traceId })
    await db
      .update(bareMetalSyncJobRun)
      .set({
        finishedAt: new Date(),
        status: 'failed',
        ordersFetchedCount,
        unknownTenantCount,
        tenantsAutoImportedCount,
        billingSyncTenantCount,
        orderUpsertedCount,
        successCount,
        failedCount,
        errorSummary: e instanceof Error ? e.message : '任务失败',
      })
      .where(sql`id = ${jobRunId}`)
    return { jobRunId, status: 'failed' }
  } finally {
    await releaseLock()
  }
}
