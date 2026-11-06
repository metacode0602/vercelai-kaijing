/**
 * 同步任务 dataaccess（模块13）。
 * 真实触发：入队 + 写 sync_job_runs，并调用 apps/api 平台 OpenAPI。
 * 写路径（库存推送/改价等）本轮未接通时会记录失败，禁止假成功。
 */
import { and, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import {
  integrationLogs,
  shops,
  syncJobRuns,
  syncTasks,
} from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import {
  formatStamp,
  toDbSyncStatus,
  toDbSyncType,
  toUiSyncStatus,
  toUiSyncType,
  type UiSyncTaskStatus,
  type UiSyncTaskType,
} from '@/lib/server/mappers/sync'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'
import { ensureSystemNotification } from '@/lib/server/dataaccess/notifications'
import {
  resourceForSyncTaskType,
  triggerMarketplaceSync,
} from '@/lib/server/marketplace/api-client'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

export type SyncTaskDto = {
  id: string
  taskNo: string
  type: UiSyncTaskType
  target: string
  shop: string
  shopId: string
  progressDone: number
  progressTotal: number
  progress: string
  error: string
  retries: number
  lastRun: string
  status: UiSyncTaskStatus
  requestId: string
  createdAt: string
  note: string
}

export type SyncJobRunDto = {
  id: string
  runNo: number
  status: UiSyncTaskStatus
  requestId: string
  httpStatus: number | null
  latencyMs: number | null
  message: string
  detail: string
  actor: string
  startedAt: string
  finishedAt: string
  createdAt: string
}

async function nextTaskNo(db: DbLike, organizationId: string): Promise<string> {
  const year = new Date().getFullYear()
  const rows = await db
    .select({ taskNo: syncTasks.taskNo })
    .from(syncTasks)
    .where(eq(syncTasks.organizationId, organizationId))
  let max = 0
  const re = new RegExp(`^TASK-${year}-(\\d+)$`)
  for (const row of rows) {
    const m = re.exec(row.taskNo)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `TASK-${year}-${String(max + 1).padStart(5, '0')}`
}

function mapTask(
  row: typeof syncTasks.$inferSelect,
  shopName: string,
): SyncTaskDto {
  const done = row.progressDone ?? 0
  const total = row.progressTotal ?? 0
  return {
    id: row.id,
    taskNo: row.taskNo,
    type: toUiSyncType(row.type),
    target: row.target || '—',
    shop: shopName || '—',
    shopId: row.shopId ?? '',
    progressDone: done,
    progressTotal: total,
    progress: `${done} / ${total}`,
    error: row.error?.trim() || '—',
    retries: row.retries ?? 0,
    lastRun: formatStamp(row.lastRunAt),
    status: toUiSyncStatus(row.status),
    requestId: row.requestId || '—',
    createdAt: formatStamp(row.createdAt),
    note: row.note || '',
  }
}

export async function listSyncTasks(
  db: AppDatabase,
  organizationId: string,
  input: {
    page?: number
    pageSize?: number
    q?: string
    status?: string
    type?: string
    shopId?: string
  },
): Promise<PaginatedResult<SyncTaskDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const filters: SQL[] = [eq(syncTasks.organizationId, organizationId)]
  const dbStatus = toDbSyncStatus(input.status)
  if (dbStatus) filters.push(eq(syncTasks.status, dbStatus))
  if (input.type) filters.push(eq(syncTasks.type, toDbSyncType(input.type)))
  if (input.shopId) filters.push(eq(syncTasks.shopId, input.shopId))
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(
      or(
        ilike(syncTasks.taskNo, q),
        ilike(syncTasks.target, q),
        ilike(syncTasks.error, q),
        ilike(syncTasks.requestId, q),
        ilike(shops.name, q),
      )!,
    )
  }
  const where = and(...filters)!

  const [totalRow] = await db
    .select({ value: count() })
    .from(syncTasks)
    .leftJoin(shops, eq(syncTasks.shopId, shops.id))
    .where(where)

  const rows = await db
    .select({ task: syncTasks, shopName: shops.name })
    .from(syncTasks)
    .leftJoin(shops, eq(syncTasks.shopId, shops.id))
    .where(where)
    .orderBy(desc(syncTasks.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return {
    items: rows.map((r) => mapTask(r.task, r.shopName ?? '')),
    total: Number(totalRow?.value ?? 0),
    page,
    pageSize,
  }
}

export async function syncTaskStats(db: AppDatabase, organizationId: string) {
  const rows = await db
    .select({ status: syncTasks.status, value: count() })
    .from(syncTasks)
    .where(eq(syncTasks.organizationId, organizationId))
    .groupBy(syncTasks.status)

  const byStatus: Record<string, number> = {}
  let total = 0
  for (const row of rows) {
    const ui = toUiSyncStatus(row.status)
    byStatus[ui] = (byStatus[ui] ?? 0) + Number(row.value)
    total += Number(row.value)
  }
  return {
    total,
    byStatus,
    success: byStatus['成功'] ?? 0,
    failed: byStatus['失败'] ?? 0,
    partialFailed: byStatus['部分失败'] ?? 0,
    queued: (byStatus['排队'] ?? 0) + (byStatus['排队重试'] ?? 0),
    running: byStatus['运行中'] ?? 0,
  }
}

export async function getSyncTask(
  db: AppDatabase,
  organizationId: string,
  idOrNo: string,
): Promise<(SyncTaskDto & { runs: SyncJobRunDto[] }) | null> {
  const [row] = await db
    .select({ task: syncTasks, shopName: shops.name })
    .from(syncTasks)
    .leftJoin(shops, eq(syncTasks.shopId, shops.id))
    .where(
      and(
        eq(syncTasks.organizationId, organizationId),
        or(eq(syncTasks.id, idOrNo), eq(syncTasks.taskNo, idOrNo))!,
      ),
    )
    .limit(1)
  if (!row) return null

  const runs = await db
    .select()
    .from(syncJobRuns)
    .where(
      and(
        eq(syncJobRuns.organizationId, organizationId),
        eq(syncJobRuns.syncTaskId, row.task.id),
      ),
    )
    .orderBy(desc(syncJobRuns.runNo))

  return {
    ...mapTask(row.task, row.shopName ?? ''),
    runs: runs.map((r) => ({
      id: r.id,
      runNo: r.runNo,
      status: toUiSyncStatus(r.status),
      requestId: r.requestId || '—',
      httpStatus: r.httpStatus,
      latencyMs: r.latencyMs,
      message: r.message || '',
      detail: r.detail || '',
      actor: r.actor || '',
      startedAt: formatStamp(r.startedAt),
      finishedAt: formatStamp(r.finishedAt),
      createdAt: formatStamp(r.createdAt),
    })),
  }
}

async function nextRunNo(db: DbLike, syncTaskId: string): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`coalesce(max(${syncJobRuns.runNo}), 0)` })
    .from(syncJobRuns)
    .where(eq(syncJobRuns.syncTaskId, syncTaskId))
  return Number(row?.value ?? 0) + 1
}

/**
 * 入队 / 重试：写任务状态 + job run，并调用 apps/api 真实 OpenAPI。
 */
export async function enqueueOrRetrySyncTask(
  db: AppDatabase,
  organizationId: string,
  input: {
    id?: string
    type?: string
    target?: string
    shopId?: string
    actor?: string
    note?: string
    /** When true, only enqueue DB rows; caller triggers apps/api. */
    skipPlatformTrigger?: boolean
  },
): Promise<SyncTaskDto> {
  const now = new Date()
  const requestId = `req_${createId().slice(0, 12)}`
  const actor = input.actor?.trim() || 'console'

  return db.transaction(async (tx) => {
    let taskId = input.id
    let taskRow: typeof syncTasks.$inferSelect | undefined

    if (taskId) {
      const [existing] = await tx
        .select()
        .from(syncTasks)
        .where(and(eq(syncTasks.organizationId, organizationId), eq(syncTasks.id, taskId)))
        .limit(1)
      if (!existing) throw new Error(`同步任务不存在：${taskId}`)
      const retries = (existing.retries ?? 0) + 1
      await tx
        .update(syncTasks)
        .set({
          status: 'retry_queued',
          retries,
          requestId,
          enqueuedAt: now,
          lastRunAt: now,
          error: null,
          note: input.note ?? existing.note,
          updatedAt: now,
        })
        .where(eq(syncTasks.id, existing.id))
      const [updated] = await tx.select().from(syncTasks).where(eq(syncTasks.id, existing.id)).limit(1)
      taskRow = updated!
      taskId = existing.id
    } else {
      const taskNo = await nextTaskNo(tx, organizationId)
      const id = createId()
      await tx.insert(syncTasks).values({
        id,
        organizationId,
        shopId: input.shopId || null,
        taskNo,
        type: toDbSyncType(input.type),
        target: input.target?.trim() || '',
        status: 'queued',
        progressDone: 0,
        progressTotal: 1,
        retries: 0,
        requestId,
        enqueuedAt: now,
        lastRunAt: now,
        note:
          input.note?.trim() ||
          '已入队：准备调用 apps/api 平台 OpenAPI。',
        raw: { source: 'console_enqueue' },
      })
      const [created] = await tx.select().from(syncTasks).where(eq(syncTasks.id, id)).limit(1)
      taskRow = created!
      taskId = id
    }

    const runNo = await nextRunNo(tx, taskId!)
    await tx.insert(syncJobRuns).values({
      id: createId(),
      organizationId,
      syncTaskId: taskId!,
      runNo,
      status: 'queued',
      requestId,
      message: '已入队，等待平台同步',
      detail: '将调用 apps/api → marketplace connector；结果回写本 run。',
      actor,
      startedAt: now,
      createdAt: now,
    })

    if (taskRow!.shopId) {
      await tx.insert(integrationLogs).values({
        id: createId(),
        shopId: taskRow!.shopId,
        direction: 'out',
        action: `sync.${taskRow!.type}.enqueue`,
        requestId,
        status: 'queued',
        message: `同步任务 ${taskRow!.taskNo} 已入队`,
        payloadSummary: JSON.stringify({
          taskId: taskRow!.id,
          type: taskRow!.type,
          target: taskRow!.target,
        }),
        createdAt: now,
      })
    }

    const [shop] = taskRow!.shopId
      ? await tx.select({ name: shops.name }).from(shops).where(eq(shops.id, taskRow!.shopId)).limit(1)
      : [null]
    await ensureSystemNotification(tx, organizationId, {
      category: 'system',
      title: `同步任务已入队 ${taskRow!.taskNo}`,
      summary: `${taskRow!.type} · ${taskRow!.target || '—'}`,
      body: `requestId=${requestId}。仅站内信，不外传。`,
      href: '/console/sync-tasks',
      sourceType: 'sync_enqueue',
      sourceId: taskRow!.id,
    })

    const mapped = mapTask(taskRow!, shop?.name ?? '')
    const dbType = taskRow!.type
    if (!input.skipPlatformTrigger && (dbType === 'inventory' || dbType === 'price')) {
      await tx
        .update(syncTasks)
        .set({
          status: 'failed',
          error: '本轮仅读同步：库存推送/改价平台写入未接通',
          finishedAt: new Date(),
          note: '禁止假成功：平台写接口不在本轮范围',
          updatedAt: new Date(),
        })
        .where(eq(syncTasks.id, taskRow!.id))
      const [failed] = await tx.select().from(syncTasks).where(eq(syncTasks.id, taskRow!.id)).limit(1)
      return mapTask(failed!, shop?.name ?? '')
    }
    return mapped
  }).then(async (mapped) => {
    if (input.skipPlatformTrigger) return mapped
    const dbType = toDbSyncType(mapped.type)
    if (dbType === 'inventory' || dbType === 'price' || mapped.status === '失败') {
      return mapped
    }

    const triggered = await triggerMarketplaceSync({
      resource: resourceForSyncTaskType(dbType),
      organizationId,
      shopId: mapped.shopId || input.shopId,
      syncTaskId: mapped.id,
      requestId: mapped.requestId || undefined,
      wait: true,
    })
    if (!triggered.ok) {
      await db
        .update(syncTasks)
        .set({
          status: 'failed',
          error: triggered.error || '平台同步失败',
          finishedAt: new Date(),
          note: triggered.error || 'apps/api 调用失败',
          updatedAt: new Date(),
        })
        .where(and(eq(syncTasks.organizationId, organizationId), eq(syncTasks.id, mapped.id)))
    }
    const refreshed = await getSyncTask(db, organizationId, mapped.id)
    return refreshed ?? mapped
  })
}

export async function retrySyncTask(
  db: AppDatabase,
  organizationId: string,
  id: string,
  actor?: string,
): Promise<SyncTaskDto> {
  return enqueueOrRetrySyncTask(db, organizationId, { id, actor })
}
