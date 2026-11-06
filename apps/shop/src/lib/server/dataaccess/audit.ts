/**
 * audit_events（模块15）。
 * 只读列表 + 可选 append；不再用 demo localStorage。
 */
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { auditEvents } from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import { formatStamp } from '@/lib/server/mappers/ops-master'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

export type AuditEventDto = {
  id: string
  at: string
  actor: string
  action: string
  object: string
  entityType: string
  entityId: string
  result: string
  detail: string
}

function mapRow(row: typeof auditEvents.$inferSelect): AuditEventDto {
  return {
    id: row.id,
    at: formatStamp(row.createdAt),
    actor: row.actorLabel || row.actorUserId || 'system',
    action: row.action,
    object: row.entityId || row.entityType,
    entityType: row.entityType,
    entityId: row.entityId || '',
    result: row.result || '—',
    detail: row.detail || '',
  }
}

export async function listAuditEvents(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string } = {},
): Promise<PaginatedResult<AuditEventDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize ?? 50)
  const filters: SQL[] = [eq(auditEvents.organizationId, organizationId)]
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(
      or(
        ilike(auditEvents.action, q),
        ilike(auditEvents.actorLabel, q),
        ilike(auditEvents.entityType, q),
        ilike(auditEvents.entityId, q),
        ilike(auditEvents.detail, q),
      )!,
    )
  }
  const where = and(...filters)!
  const [totalRow] = await db.select({ value: count() }).from(auditEvents).where(where)
  const rows = await db
    .select()
    .from(auditEvents)
    .where(where)
    .orderBy(desc(auditEvents.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  return { items: rows.map(mapRow), total: Number(totalRow?.value ?? 0), page, pageSize }
}

export async function appendAuditEvent(
  db: DbLike,
  organizationId: string,
  input: {
    actorUserId?: string
    actorLabel?: string
    action: string
    entityType: string
    entityId?: string
    result?: string
    detail?: string
    before?: Record<string, unknown>
    after?: Record<string, unknown>
  },
) {
  const id = createId()
  await db.insert(auditEvents).values({
    id,
    organizationId,
    actorUserId: input.actorUserId,
    actorLabel: input.actorLabel,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    result: input.result,
    detail: input.detail,
    before: input.before,
    after: input.after,
    createdAt: new Date(),
  })
  return id
}
