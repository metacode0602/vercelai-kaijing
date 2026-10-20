import {
  computeSlidingSyncWindow,
  formatCstDate,
  validateBillingDateRange,
} from '@/lib/crm/tenant-billing-import-utils'
import { db, pgPool } from '@/lib/db'
import type {
  BillingSyncConfigDto,
  BillingSyncJobItemDto,
  BillingSyncJobRunDetailDto,
  BillingSyncJobRunDto,
  BillingSyncJobStatus,
  BillingSyncRunResult,
  BillingSyncTrigger,
} from '@/lib/types/billing-scheduled-sync'
import {
  billingSyncJobItem,
  billingSyncJobRun,
  billingTenant,
  crmProject,
} from '@workspace/db/schema'
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm'
import {
  getBillingSyncConfig,
  getBillingSyncProjectStatuses,
  getBillingSyncWindowDays,
} from './billing-sync-config'
import {
  formatBareMetalDailyConsumptionSummary,
  syncBareMetalDailyConsumptionForTenant,
} from './bare-metal-daily-consumption'
import { crmError, crmLog, crmWarn } from './logger'
import { projectsDataAccess } from './projects'
import { tenantBillingImportDataAccess } from './tenant-billing-import'
import { isPlatformMerchantTenantImportExcluded } from '@/lib/server/dataaccess/merchant/merchant-tenant-import-config'
import { merchantPlatformSyncDataAccess } from '@/lib/server/dataaccess/merchant/merchant-platform-sync'
import { merchantTenantSyncDataAccess } from '@/lib/server/dataaccess/merchant/merchant-tenant-sync'

const BILLING_SYNC_LOCK_KEY = 89451236789
/** 超过该时长仍为 running 的 job 视为僵尸任务并标记失败 */
const STALE_RUNNING_JOB_MS = 12 * 60 * 60 * 1000

function newId(): string {
  return crypto.randomUUID()
}

function formatDateOnly(value: Date | string | null | undefined): string | null {
  if (!value) return null
  if (typeof value === 'string') return value.slice(0, 10)
  return value.toISOString().slice(0, 10)
}

function toIso(value: Date | null | undefined): string | null {
  return value?.toISOString() ?? null
}

function mapJobRun(row: typeof billingSyncJobRun.$inferSelect): BillingSyncJobRunDto {
  return {
    id: row.id,
    trigger: row.trigger as BillingSyncTrigger,
    startedAt: row.startedAt.toISOString(),
    finishedAt: toIso(row.finishedAt),
    status: row.status as BillingSyncJobRunDto['status'],
    syncEndDate: formatDateOnly(row.syncEndDate)!,
    windowDays: row.safetyDays,
    projectCount: row.projectCount,
    tenantCount: row.tenantCount,
    successCount: row.successCount,
    failedCount: row.failedCount,
    skippedCount: row.skippedCount,
    errorSummary: row.errorSummary,
  }
}

async function cleanupStaleRunningJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_RUNNING_JOB_MS)
  const rows = await db
    .update(billingSyncJobRun)
    .set({
      status: 'failed',
      finishedAt: new Date(),
      errorSummary: '任务超时或进程中断，已自动标记失败',
    })
    .where(and(eq(billingSyncJobRun.status, 'running'), lt(billingSyncJobRun.startedAt, cutoff)))
    .returning({ id: billingSyncJobRun.id })

  if (rows.length > 0) {
    crmWarn('billing-scheduled-sync', 'cleaned stale running jobs', { count: rows.length })
  }
  return rows.length
}

async function countRunningJobs(): Promise<number> {
  const rows = await db
    .select({ id: billingSyncJobRun.id })
    .from(billingSyncJobRun)
    .where(eq(billingSyncJobRun.status, 'running'))
  return rows.length
}

type TenantSyncTarget = {
  tenantId: string
  projectId: string | null
  /** 来源：项目路径 / 商户路径 */
  source: 'project' | 'merchant'
}

async function collectTenantTargets(projectIds?: string[]): Promise<{
  projectCount: number
  targets: TenantSyncTarget[]
}> {
  const statuses = getBillingSyncProjectStatuses()
  const conditions = [inArray(crmProject.status, statuses)]
  if (projectIds?.length) {
    conditions.push(inArray(crmProject.id, projectIds))
  }

  const projects = await db
    .select({ id: crmProject.id })
    .from(crmProject)
    .where(and(...conditions))

  const tenantById = new Map<string, TenantSyncTarget>()
  for (const project of projects) {
    const tenantIds = await projectsDataAccess.getBillingTenantIdsForProject(project.id)
    for (const tenantId of tenantIds) {
      if (!tenantById.has(tenantId)) {
        tenantById.set(tenantId, {
          tenantId,
          projectId: project.id,
          source: 'project',
        })
      }
    }
  }

  return {
    projectCount: projects.length,
    targets: [...tenantById.values()],
  }
}

type MerchantAutoImportPhaseResult = {
  merchantCount: number
  tenantTargets: TenantSyncTarget[]
  summaryParts: string[]
  errors: string[]
}

/**
 * 追加阶段：自动导入平台商户列表 → 各商户下全部租户。
 * 不改动项目租户收集逻辑；返回可用于账单导入的商户侧租户。
 */
async function runMerchantAutoImportPhase(): Promise<MerchantAutoImportPhaseResult> {
  const summaryParts: string[] = []
  const errors: string[] = []

  const merchantSync = await merchantPlatformSyncDataAccess.syncAllFromPlatform()
  summaryParts.push(
    `商户同步 新建 ${merchantSync.created} / 更新 ${merchantSync.updated} / 无变更 ${merchantSync.unchanged}`,
  )
  for (const err of merchantSync.errors.slice(0, 10)) {
    errors.push(`商户 ${err.platformMerchantId}: ${err.message}`)
  }

  const tenantById = new Map<string, TenantSyncTarget>()
  let createdTenants = 0
  let updatedTenants = 0
  let reboundTenants = 0
  let skippedRebinds = 0
  let skippedMerchantCount = 0

  for (const m of merchantSync.merchants) {
    if (isPlatformMerchantTenantImportExcluded(m.platformMerchantId)) {
      skippedMerchantCount++
      crmLog('billing-scheduled-sync', 'skip tenant import for excluded merchant', {
        platformMerchantId: m.platformMerchantId,
      })
      continue
    }

    try {
      const tenantSync = await merchantTenantSyncDataAccess.autoSyncFromPlatformTenantIds({
        merchantId: m.localMerchantId,
        platformMerchantId: m.platformMerchantId,
        platformTenantIds: m.tenantIds,
      })
      createdTenants += tenantSync.createdTenants
      updatedTenants += tenantSync.updatedTenants
      reboundTenants += tenantSync.reboundTenants
      skippedRebinds += tenantSync.skippedRebinds
      for (const err of tenantSync.errors.slice(0, 5)) {
        errors.push(
          `商户 ${m.platformMerchantId} 租户 ${err.platformTenantId}: ${err.message}`,
        )
      }
      for (const tenantId of tenantSync.localTenantIds) {
        if (!tenantById.has(tenantId)) {
          tenantById.set(tenantId, {
            tenantId,
            projectId: null,
            source: 'merchant',
          })
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : '商户租户同步失败'
      errors.push(`商户 ${m.platformMerchantId}: ${message}`)
      crmWarn('billing-scheduled-sync', 'merchant tenant auto sync failed', {
        platformMerchantId: m.platformMerchantId,
        err: message,
      })
    }
  }

  summaryParts.push(
    `商户租户 新建 ${createdTenants} / 更新 ${updatedTenants} / 跳过改绑 ${skippedRebinds}`,
  )
  if (skippedMerchantCount > 0) {
    summaryParts.push(`跳过租户导入商户 ${skippedMerchantCount} 个（含共绩等排除项）`)
  }

  crmLog('billing-scheduled-sync', 'merchant auto import phase done', {
    merchantCount: merchantSync.merchants.length,
    skippedMerchantCount,
    tenantCount: tenantById.size,
    createdTenants,
    updatedTenants,
    reboundTenants,
    skippedRebinds,
    merchantErrors: merchantSync.errors.length,
    tenantErrors: errors.length - merchantSync.errors.slice(0, 10).length,
  })

  return {
    merchantCount: merchantSync.merchants.length,
    tenantTargets: [...tenantById.values()],
    summaryParts,
    errors,
  }
}

type SyncWindow = {
  startDate: string
  endDate: string
  startAt?: Date
  endAt?: Date
  skipped: boolean
}

async function syncOneTenantBilling(input: {
  jobRunId: string
  tenant: {
    id: string
    name: string
    customerId: string
    platformTenantId: string | null
  }
  target: TenantSyncTarget
  window: SyncWindow
  scope: BillingImportScope
  isBackfill: boolean
  isDailyOnly: boolean
  isCouponsOnly: boolean
}): Promise<{ status: 'success' | 'failed' | 'skipped'; error?: string }> {
  const {
    jobRunId,
    tenant,
    target,
    window,
    scope,
    isBackfill,
    isDailyOnly,
    isCouponsOnly,
  } = input
  const sourcePrefix = target.source === 'merchant' ? '[商户]' : ''

  const itemStartedAt = new Date()
  await db
    .update(billingTenant)
    .set({ billingSyncLastStartedAt: itemStartedAt })
    .where(eq(billingTenant.id, tenant.id))

  if (!tenant.platformTenantId?.trim()) {
    const error = '未关联平台租户 ID'
    await db.insert(billingSyncJobItem).values({
      id: newId(),
      jobRunId,
      tenantId: tenant.id,
      projectId: target.projectId,
      startDate: window.startDate,
      endDate: window.endDate,
      status: 'skipped',
      error,
      summary: sourcePrefix || null,
    })
    await db
      .update(billingTenant)
      .set({
        billingSyncLastFinishedAt: new Date(),
        billingSyncLastStatus: 'skipped',
        billingSyncLastError: error,
      })
      .where(eq(billingTenant.id, tenant.id))
    return { status: 'skipped' }
  }

  if (window.skipped) {
    await db.insert(billingSyncJobItem).values({
      id: newId(),
      jobRunId,
      tenantId: tenant.id,
      projectId: target.projectId,
      startDate: window.startDate,
      endDate: window.endDate,
      status: 'skipped',
      summary: sourcePrefix ? `${sourcePrefix} 同步窗口为空` : '同步窗口为空',
    })
    await db
      .update(billingTenant)
      .set({
        billingSyncLastFinishedAt: new Date(),
        billingSyncLastStatus: 'skipped',
        billingSyncLastError: null,
      })
      .where(eq(billingTenant.id, tenant.id))
    return { status: 'skipped' }
  }

  validateBillingDateRange(window.startDate, window.endDate)

  const result = await tenantBillingImportDataAccess.directImport({
    tenantId: tenant.id,
    startDate: window.startDate,
    endDate: window.endDate,
    startAt: window.startAt,
    endAt: window.endAt,
    scope,
  })

  const finishedAt = new Date()

  if (result.success) {
    const backfillScopeLabel = isDailyOnly
      ? '·仅日账单'
      : isCouponsOnly
        ? '·仅算力券'
        : ''
    let summary = isBackfill
      ? `[补同步${backfillScopeLabel}] ${result.summary ?? '无变更'}`
      : (result.summary ?? '无变更')
    if (sourcePrefix) {
      summary = `${sourcePrefix} ${summary}`
    }

    if (!isDailyOnly && !isCouponsOnly) {
      try {
        const metalResult = await syncBareMetalDailyConsumptionForTenant({
          tenantId: tenant.id,
          customerId: tenant.customerId,
          startDate: window.startDate,
          endDate: window.endDate,
        })
        const metalSummary = formatBareMetalDailyConsumptionSummary(metalResult)
        if (metalSummary) {
          summary = summary ? `${summary}；${metalSummary}` : metalSummary
        }
        if (metalResult.errors.length > 0) {
          crmWarn('billing-scheduled-sync', 'bare metal daily consumption partial failure', {
            tenantId: tenant.id,
            errors: metalResult.errors.slice(0, 5),
          })
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : '裸金属日消耗写入失败'
        crmWarn('billing-scheduled-sync', 'bare metal daily consumption failed', {
          tenantId: tenant.id,
          err: message,
        })
        summary = `${summary}；裸金属日消耗失败：${message}`
      }
    }

    await db.insert(billingSyncJobItem).values({
      id: newId(),
      jobRunId,
      tenantId: tenant.id,
      projectId: target.projectId,
      startDate: window.startDate,
      endDate: window.endDate,
      status: 'success',
      summary,
    })
    await db
      .update(billingTenant)
      .set({
        billingSyncLastFinishedAt: finishedAt,
        billingSyncLastStatus: 'success',
        billingSyncLastError: null,
      })
      .where(eq(billingTenant.id, tenant.id))
    return { status: 'success' }
  }

  const error = result.error ?? '账单导入失败'
  await db.insert(billingSyncJobItem).values({
    id: newId(),
    jobRunId,
    tenantId: tenant.id,
    projectId: target.projectId,
    startDate: window.startDate,
    endDate: window.endDate,
    status: 'failed',
    summary: sourcePrefix
      ? `${sourcePrefix} ${result.summary ?? ''}`.trim()
      : result.summary,
    error,
  })
  await db
    .update(billingTenant)
    .set({
      billingSyncLastFinishedAt: finishedAt,
      billingSyncLastStatus: 'failed',
      billingSyncLastError: error,
    })
    .where(eq(billingTenant.id, tenant.id))
  return { status: 'failed', error }
}

function resolveJobStatus(counts: {
  successCount: number
  failedCount: number
  skippedCount: number
  tenantCount: number
}): BillingSyncJobStatus {
  if (counts.tenantCount === 0) return 'skipped'
  if (counts.failedCount === 0) return 'success'
  if (counts.successCount === 0) return 'failed'
  return 'partial'
}

export type BillingSyncMode = 'incremental' | 'backfill'

export type BillingImportScope = 'full' | 'daily_bills_only' | 'coupons_only'

function assertBackfillDateRange(startDate: string, endDate: string): void {
  validateBillingDateRange(startDate, endDate)
  const todayCst = formatCstDate(new Date())
  if (endDate > todayCst) {
    throw new Error('结束日期不能晚于东八区今天')
  }
}

export async function runScheduledBillingSync(options?: {
  trigger?: BillingSyncTrigger
  projectIds?: string[]
  mode?: BillingSyncMode
  scope?: BillingImportScope
  startDate?: string
  endDate?: string
}): Promise<BillingSyncRunResult> {
  const trigger = options?.trigger ?? 'scheduled'
  const mode = options?.mode ?? 'incremental'
  const scope = options?.scope ?? 'full'
  const isBackfill = mode === 'backfill'
  const isDailyOnly = scope === 'daily_bills_only'
  const isCouponsOnly = scope === 'coupons_only'

  if (isBackfill) {
    const startDate = options?.startDate?.trim()
    const endDate = options?.endDate?.trim()
    if (!startDate || !endDate) {
      throw new Error('补同步须填写开始日期与结束日期')
    }
    assertBackfillDateRange(startDate, endDate)
  }

  await cleanupStaleRunningJobs()

  const lockClient = await pgPool.connect()
  let lockHeld = false
  try {
    const lockResult = await lockClient.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock($1) AS acquired',
      [BILLING_SYNC_LOCK_KEY],
    )
    lockHeld = Boolean(lockResult.rows[0]?.acquired)
    if (!lockHeld) {
      crmWarn('billing-scheduled-sync', 'skip: advisory lock held')
      return { acquiredLock: false, message: '已有同步任务正在运行' }
    }

    const runningJobs = await countRunningJobs()
    if (runningJobs > 0) {
      crmWarn('billing-scheduled-sync', 'skip: running job in database', { runningJobs })
      return { acquiredLock: false, message: '已有同步任务正在运行（请稍后再试）' }
    }

    const windowDays = getBillingSyncWindowDays()
    const jobRunId = newId()
    const startedAt = new Date()
    const slidingWindow = isBackfill
      ? null
      : computeSlidingSyncWindow({ windowDays, now: startedAt })
    const syncEndDate = isBackfill
      ? options!.endDate!.trim()
      : slidingWindow!.endDate

    try {
      await db.insert(billingSyncJobRun).values({
        id: jobRunId,
        trigger,
        startedAt,
        status: 'running',
        syncEndDate,
        safetyDays: windowDays,
      })

    // 全量定时/手动（未指定 projectIds）时追加：商户列表 + 商户下全部租户
    const includeMerchantPhase = !options?.projectIds?.length
    let merchantPhase: MerchantAutoImportPhaseResult | null = null
    if (includeMerchantPhase) {
      try {
        merchantPhase = await runMerchantAutoImportPhase()
      } catch (e) {
        const message = e instanceof Error ? e.message : '商户自动导入失败'
        crmError('billing-scheduled-sync', 'merchant auto import phase failed', e, {
          jobRunId,
        })
        merchantPhase = {
          merchantCount: 0,
          tenantTargets: [],
          summaryParts: [],
          errors: [message],
        }
      }
    }

    // 原有逻辑：按项目状态收集计费租户（口径不变）
    const { projectCount, targets: projectTargets } = await collectTenantTargets(
      options?.projectIds,
    )
    const projectTenantIdSet = new Set(projectTargets.map((t) => t.tenantId))

    // 商户侧租户中尚未被项目路径覆盖的，追加账单导入（窗口与项目一致）
    const merchantOnlyTargets = (merchantPhase?.tenantTargets ?? []).filter(
      (t) => !projectTenantIdSet.has(t.tenantId),
    )
    const targets: TenantSyncTarget[] = [...projectTargets, ...merchantOnlyTargets]
    const tenantIds = targets.map((t) => t.tenantId)

    if (tenantIds.length === 0) {
      const finishedAt = new Date()
      const merchantErrorSummary =
        merchantPhase?.errors.length
          ? merchantPhase.errors.slice(0, 20).join('；')
          : null
      const phaseSummary = merchantPhase?.summaryParts.join('；') ?? null
      await db
        .update(billingSyncJobRun)
        .set({
          finishedAt,
          status: merchantErrorSummary ? 'failed' : 'skipped',
          projectCount,
          tenantCount: 0,
          errorSummary:
            merchantErrorSummary ??
            (phaseSummary
              ? `${phaseSummary}；未找到可同步租户`
              : '未找到可同步租户'),
        })
        .where(eq(billingSyncJobRun.id, jobRunId))

      crmLog('billing-scheduled-sync', 'completed with no tenants', { jobRunId })
      return {
        acquiredLock: true,
        jobRunId,
        status: merchantErrorSummary ? 'failed' : 'skipped',
      }
    }

    const tenantRows = await db
      .select({
        id: billingTenant.id,
        name: billingTenant.name,
        customerId: billingTenant.customerId ?? '',
        platformTenantId: billingTenant.platformTenantId,
      })
      .from(billingTenant)
      .where(inArray(billingTenant.id, tenantIds))

    const tenantById = new Map<string, {
      id: string
      name: string
      customerId: string
      platformTenantId: string | null
    }>(
      tenantRows.map((row) => [row.id, { ...row, customerId: row.customerId ?? '' }]),
    )
    let successCount = 0
    let failedCount = 0
    let skippedCount = 0
    const errors: string[] = [...(merchantPhase?.errors ?? [])]

    const window: SyncWindow = isBackfill
      ? {
          startDate: options!.startDate!.trim(),
          endDate: options!.endDate!.trim(),
          startAt: undefined,
          endAt: undefined,
          skipped: false,
        }
      : {
          startDate: slidingWindow!.startDate,
          endDate: slidingWindow!.endDate,
          startAt: slidingWindow!.startAt,
          endAt: slidingWindow!.endAt,
          skipped: slidingWindow!.skipped,
        }

    for (const target of targets) {
      const tenant = tenantById.get(target.tenantId)
      if (!tenant) continue

      const itemResult = await syncOneTenantBilling({
        jobRunId,
        tenant,
        target,
        window,
        scope,
        isBackfill,
        isDailyOnly,
        isCouponsOnly,
      })

      if (itemResult.status === 'success') successCount += 1
      else if (itemResult.status === 'failed') {
        failedCount += 1
        errors.push(`${tenant.name}: ${itemResult.error ?? '账单导入失败'}`)
      } else skippedCount += 1
    }

    const status = resolveJobStatus({
      successCount,
      failedCount,
      skippedCount,
      tenantCount: targets.length,
    })
    const finalStatus =
      status === 'success' && (merchantPhase?.errors.length ?? 0) > 0
        ? 'partial'
        : status
    const finishedAt = new Date()
    const errorSummary = errors.length > 0 ? errors.slice(0, 20).join('；') : null

    await db
      .update(billingSyncJobRun)
      .set({
        finishedAt,
        status: finalStatus,
        projectCount,
        tenantCount: targets.length,
        successCount,
        failedCount,
        skippedCount,
        errorSummary,
      })
      .where(eq(billingSyncJobRun.id, jobRunId))

    crmLog('billing-scheduled-sync', 'completed', {
      jobRunId,
      status: finalStatus,
      projectTenantCount: projectTargets.length,
      merchantOnlyTenantCount: merchantOnlyTargets.length,
      merchantCount: merchantPhase?.merchantCount ?? 0,
      merchantPhaseSummary: merchantPhase?.summaryParts.join('；') ?? null,
      successCount,
      failedCount,
      skippedCount,
    })

      return { acquiredLock: true, jobRunId, status: finalStatus }
    } catch (error) {
      crmError('billing-scheduled-sync', 'job failed', error, { jobRunId })
      const message = error instanceof Error ? error.message : '同步任务失败'
      await db
        .update(billingSyncJobRun)
        .set({
          finishedAt: new Date(),
          status: 'failed',
          errorSummary: message,
        })
        .where(eq(billingSyncJobRun.id, jobRunId))
      return { acquiredLock: true, jobRunId, status: 'failed', message }
    }
  } finally {
    if (lockHeld) {
      try {
        await lockClient.query('SELECT pg_advisory_unlock($1)', [BILLING_SYNC_LOCK_KEY])
      } catch (e) {
        crmWarn('billing-scheduled-sync', 'advisory unlock failed', {
          err: e instanceof Error ? e.message : String(e),
        })
      }
    }
    lockClient.release()
  }
}

export const billingScheduledSyncDataAccess = {
  getConfig(): BillingSyncConfigDto {
    return getBillingSyncConfig()
  },

  runNow(input?: {
    projectIds?: string[]
    mode?: BillingSyncMode
    scope?: BillingImportScope
    startDate?: string
    endDate?: string
  }): Promise<BillingSyncRunResult> {
    return runScheduledBillingSync({
      trigger: 'manual',
      projectIds: input?.projectIds,
      mode: input?.mode,
      scope: input?.scope,
      startDate: input?.startDate,
      endDate: input?.endDate,
    })
  },

  async listRuns(input?: { limit?: number; offset?: number }): Promise<{
    runs: BillingSyncJobRunDto[]
    total: number
  }> {
    const limit = Math.min(Math.max(input?.limit ?? 20, 1), 100)
    const offset = Math.max(input?.offset ?? 0, 0)

    const runs = await db
      .select()
      .from(billingSyncJobRun)
      .orderBy(desc(billingSyncJobRun.startedAt))
      .limit(limit)
      .offset(offset)

    const countRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(billingSyncJobRun)

    return {
      runs: runs.map(mapJobRun),
      total: countRows[0]?.count ?? 0,
    }
  },

  async getRunById(id: string): Promise<BillingSyncJobRunDetailDto | null> {
    const run = await db.query.billingSyncJobRun.findFirst({
      where: eq(billingSyncJobRun.id, id),
    })
    if (!run) return null

    const items = await db
      .select({
        id: billingSyncJobItem.id,
        jobRunId: billingSyncJobItem.jobRunId,
        tenantId: billingSyncJobItem.tenantId,
        tenantName: billingTenant.name,
        platformTenantId: billingTenant.platformTenantId,
        projectId: billingSyncJobItem.projectId,
        projectName: crmProject.name,
        startDate: billingSyncJobItem.startDate,
        endDate: billingSyncJobItem.endDate,
        status: billingSyncJobItem.status,
        summary: billingSyncJobItem.summary,
        error: billingSyncJobItem.error,
      })
      .from(billingSyncJobItem)
      .innerJoin(billingTenant, eq(billingSyncJobItem.tenantId, billingTenant.id))
      .leftJoin(crmProject, eq(billingSyncJobItem.projectId, crmProject.id))
      .where(eq(billingSyncJobItem.jobRunId, id))
      .orderBy(billingSyncJobItem.startDate)

    const mappedItems: BillingSyncJobItemDto[] = items.map((item) => ({
      id: item.id,
      jobRunId: item.jobRunId,
      tenantId: item.tenantId,
      tenantName: item.tenantName,
      platformTenantId: item.platformTenantId,
      projectId: item.projectId,
      projectName: item.projectName,
      startDate: formatDateOnly(item.startDate)!,
      endDate: formatDateOnly(item.endDate)!,
      status: item.status as BillingSyncJobItemDto['status'],
      summary: item.summary,
      error: item.error,
    }))

    return {
      ...mapJobRun(run),
      items: mappedItems,
    }
  },
}
