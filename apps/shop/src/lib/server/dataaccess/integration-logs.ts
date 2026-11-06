/**
 * integration_logs — 平台 HTTP/同步流水（组织经 shops join）；payload 脱敏。
 */
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm'
import { integrationLogs, shops, syncTasks } from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import { formatStamp } from '@/lib/server/mappers/ops-master'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'
import {
  extractSyncTaskIdFromPayload,
  redactPayloadSummary,
} from '@/lib/settings/payload-redact'
import * as syncDa from '@/lib/server/dataaccess/sync'

export type IntegrationLogDto = {
  id: string
  at: string
  shopId: string
  shop: string
  direction: string
  action: string
  requestId: string
  status: string
  result: string
  message: string
  detail: string
  payloadSummary: string
  syncTaskId: string
  /** 是否具备可重试的真实 sync_tasks 依据 */
  canRetry: boolean
  method: string
  path: string
  httpStatus: string
  latencyMs: string
  errorCode: string
  actor: string
  object: string
}

function uiResult(status: string): string {
  const s = (status || '').toLowerCase()
  if (s === 'success' || s === 'ok' || s === 'succeeded') return '成功'
  if (s === 'queued' || s === 'retry_queued' || s === 'pending') return '排队中'
  if (s === 'partial' || s === 'partial_success') return '部分成功'
  if (s === 'unconnected' || s === 'not_connected') return '未连接'
  if (s === 'failed' || s === 'error') return '失败'
  return status || '—'
}

function parseMeta(payloadSummary: string): {
  method: string
  path: string
  httpStatus: string
  latencyMs: string
  errorCode: string
  actor: string
  object: string
  syncTaskId: string
} {
  const empty = {
    method: '—',
    path: '—',
    httpStatus: '',
    latencyMs: '',
    errorCode: '',
    actor: 'system',
    object: '',
    syncTaskId: '',
  }
  if (!payloadSummary) return empty
  try {
    const p = JSON.parse(payloadSummary) as Record<string, unknown>
    const syncTaskId =
      (typeof p.taskId === 'string' && p.taskId) ||
      (typeof p.syncTaskId === 'string' && p.syncTaskId) ||
      ''
    return {
      method: typeof p.method === 'string' ? p.method : '—',
      path: typeof p.path === 'string' ? p.path : typeof p.url === 'string' ? p.url : '—',
      httpStatus:
        p.httpStatus != null
          ? String(p.httpStatus)
          : p.statusCode != null
            ? String(p.statusCode)
            : '',
      latencyMs: p.latencyMs != null ? String(p.latencyMs) : '',
      errorCode: typeof p.errorCode === 'string' ? p.errorCode : '',
      actor: typeof p.actor === 'string' ? p.actor : 'system',
      object: typeof p.object === 'string' ? p.object : typeof p.target === 'string' ? p.target : syncTaskId,
      syncTaskId,
    }
  } catch {
    return empty
  }
}

function mapJoined(row: {
  log: typeof integrationLogs.$inferSelect
  shopName: string | null
  shopOrgId: string | null
  syncTaskIdByRequest: string | null
}): IntegrationLogDto {
  const redacted = redactPayloadSummary(row.log.payloadSummary)
  const meta = parseMeta(redacted || row.log.payloadSummary || '')
  const fromPayload = extractSyncTaskIdFromPayload(row.log.payloadSummary)
  const syncTaskId = row.syncTaskIdByRequest || fromPayload || meta.syncTaskId || ''
  const result = uiResult(row.log.status)
  const canRetry =
    Boolean(syncTaskId) && (result === '失败' || result === '未连接' || result === '部分成功' || result === '排队中')
  return {
    id: row.log.id,
    at: formatStamp(row.log.createdAt),
    shopId: row.log.shopId,
    shop: row.shopName || row.log.shopId,
    direction: row.log.direction,
    action: row.log.action,
    requestId: row.log.requestId || '',
    status: row.log.status,
    result,
    message: row.log.message || '',
    detail: row.log.message || '',
    payloadSummary: redacted,
    syncTaskId,
    canRetry: Boolean(syncTaskId) && (result === '失败' || result === '未连接' || result === '部分成功'),
    method: meta.method,
    path: meta.path,
    httpStatus: meta.httpStatus,
    latencyMs: meta.latencyMs,
    errorCode: meta.errorCode,
    actor: meta.actor,
    object: meta.object || row.log.action,
  }
}

export async function listIntegrationLogs(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string; requestId?: string; shopId?: string; status?: string } = {},
): Promise<PaginatedResult<IntegrationLogDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize ?? 50)
  const filters: SQL[] = [eq(shops.organizationId, organizationId)]
  if (input.shopId?.trim()) filters.push(eq(integrationLogs.shopId, input.shopId.trim()))
  if (input.requestId?.trim()) filters.push(eq(integrationLogs.requestId, input.requestId.trim()))
  if (input.status?.trim()) filters.push(eq(integrationLogs.status, input.status.trim()))
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(
      or(
        ilike(integrationLogs.action, q),
        ilike(integrationLogs.message, q),
        ilike(integrationLogs.requestId, q),
        ilike(shops.name, q),
      )!,
    )
  }
  const where = and(...filters)!

  const [totalRow] = await db
    .select({ value: count() })
    .from(integrationLogs)
    .innerJoin(shops, eq(integrationLogs.shopId, shops.id))
    .where(where)

  const rows = await db
    .select({
      log: integrationLogs,
      shopName: shops.name,
      shopOrgId: shops.organizationId,
      syncTaskIdByRequest: syncTasks.id,
    })
    .from(integrationLogs)
    .innerJoin(shops, eq(integrationLogs.shopId, shops.id))
    .leftJoin(
      syncTasks,
      and(eq(syncTasks.organizationId, organizationId), eq(syncTasks.requestId, integrationLogs.requestId)),
    )
    .where(where)
    .orderBy(desc(integrationLogs.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return {
    items: rows.map(mapJoined),
    total: Number(totalRow?.value ?? 0),
    page,
    pageSize,
  }
}

export async function getIntegrationLog(db: AppDatabase, organizationId: string, id: string) {
  const [row] = await db
    .select({
      log: integrationLogs,
      shopName: shops.name,
      shopOrgId: shops.organizationId,
      syncTaskIdByRequest: syncTasks.id,
    })
    .from(integrationLogs)
    .innerJoin(shops, eq(integrationLogs.shopId, shops.id))
    .leftJoin(
      syncTasks,
      and(eq(syncTasks.organizationId, organizationId), eq(syncTasks.requestId, integrationLogs.requestId)),
    )
    .where(and(eq(shops.organizationId, organizationId), eq(integrationLogs.id, id)))
    .limit(1)
  return row ? mapJoined(row) : null
}

/**
 * 仅当日志能关联到真实 sync_tasks 时允许重试；走 sync dataaccess（含 apps/api wait=true）。
 */
export async function retryIntegrationLog(
  db: AppDatabase,
  organizationId: string,
  input: { id: string; actor?: string },
) {
  const log = await getIntegrationLog(db, organizationId, input.id)
  if (!log) throw new Error('接口日志不存在')
  if (!log.syncTaskId) {
    throw new Error('该日志无关联同步任务，无法重试（禁止伪造任务）')
  }
  if (!log.canRetry && log.result !== '排队中') {
    throw new Error(`当前结果「${log.result}」不可重试`)
  }
  const task = await syncDa.retrySyncTask(db, organizationId, log.syncTaskId, input.actor)
  return {
    logId: log.id,
    syncTaskId: task.id,
    taskStatus: task.status,
    note: `已通过 sync.retry 重试任务 ${task.taskNo || task.id}；状态 ${task.status}`,
    task,
  }
}
