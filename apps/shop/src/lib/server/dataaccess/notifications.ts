/**
 * 站内信 console_notifications（模块14）。
 * org + user；同步任务 / 订单异常可写系统通知，不自动外传。
 */
import { and, count, desc, eq, isNull, or, sql, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { consoleNotifications } from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import {
  formatStamp,
  toUiNotificationCategory,
  type UiNotificationCategory,
} from '@/lib/server/mappers/notifications'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

export type NotificationDto = {
  id: string
  category: UiNotificationCategory
  title: string
  summary: string
  body: string
  href: string
  read: boolean
  readAt: string
  sourceType: string
  sourceId: string
  createdAt: string
  createdAtMs: number
}

function mapRow(row: typeof consoleNotifications.$inferSelect): NotificationDto {
  const created = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt)
  return {
    id: row.id,
    category: toUiNotificationCategory(row.category),
    title: row.title,
    summary: row.summary ?? '',
    body: row.body ?? '',
    href: row.href ?? '',
    read: Boolean(row.readAt),
    readAt: formatStamp(row.readAt),
    sourceType: row.sourceType ?? '',
    sourceId: row.sourceId ?? '',
    createdAt: formatStamp(row.createdAt),
    createdAtMs: created.getTime(),
  }
}

function audienceFilter(organizationId: string, userId: string | null | undefined): SQL {
  if (userId) {
    return and(
      eq(consoleNotifications.organizationId, organizationId),
      or(isNull(consoleNotifications.userId), eq(consoleNotifications.userId, userId))!,
    )!
  }
  return and(
    eq(consoleNotifications.organizationId, organizationId),
    isNull(consoleNotifications.userId),
  )!
}

export async function listNotifications(
  db: DbLike,
  organizationId: string,
  userId: string | null | undefined,
  input: { page?: number; pageSize?: number; unreadOnly?: boolean } = {},
): Promise<PaginatedResult<NotificationDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize ?? 50)
  const filters: SQL[] = [audienceFilter(organizationId, userId)]
  if (input.unreadOnly) filters.push(isNull(consoleNotifications.readAt))
  const where = and(...filters)!

  const [totalRow] = await db.select({ value: count() }).from(consoleNotifications).where(where)
  const rows = await db
    .select()
    .from(consoleNotifications)
    .where(where)
    .orderBy(desc(consoleNotifications.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return {
    items: rows.map(mapRow),
    total: Number(totalRow?.value ?? 0),
    page,
    pageSize,
  }
}

export async function unreadCount(
  db: DbLike,
  organizationId: string,
  userId: string | null | undefined,
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(consoleNotifications)
    .where(and(audienceFilter(organizationId, userId), isNull(consoleNotifications.readAt)))
  return Number(row?.value ?? 0)
}

export async function markRead(
  db: DbLike,
  organizationId: string,
  userId: string | null | undefined,
  id: string,
): Promise<NotificationDto | null> {
  const [existing] = await db
    .select()
    .from(consoleNotifications)
    .where(and(eq(consoleNotifications.id, id), audienceFilter(organizationId, userId)))
    .limit(1)
  if (!existing) return null
  if (!existing.readAt) {
    await db
      .update(consoleNotifications)
      .set({ readAt: new Date(), updatedAt: new Date() })
      .where(eq(consoleNotifications.id, existing.id))
  }
  const [row] = await db.select().from(consoleNotifications).where(eq(consoleNotifications.id, id)).limit(1)
  return row ? mapRow(row) : null
}

export async function markAllRead(
  db: DbLike,
  organizationId: string,
  userId: string | null | undefined,
): Promise<{ updated: number }> {
  const result = await db
    .update(consoleNotifications)
    .set({ readAt: new Date(), updatedAt: new Date() })
    .where(and(audienceFilter(organizationId, userId), isNull(consoleNotifications.readAt)))
    .returning({ id: consoleNotifications.id })
  return { updated: result.length }
}

export type CreateNotificationInput = {
  userId?: string | null
  category?: string
  title: string
  summary?: string
  body?: string
  href?: string
  sourceType?: string
  sourceId?: string
}

export async function createNotification(
  db: DbLike,
  organizationId: string,
  input: CreateNotificationInput,
): Promise<NotificationDto> {
  const id = createId()
  const now = new Date()
  await db.insert(consoleNotifications).values({
    id,
    organizationId,
    userId: input.userId ?? null,
    category: input.category ?? 'system',
    title: input.title.trim(),
    summary: input.summary?.trim() ?? '',
    body: input.body?.trim() ?? '',
    href: input.href?.trim() || null,
    sourceType: input.sourceType ?? null,
    sourceId: input.sourceId ?? null,
    createdAt: now,
    updatedAt: now,
  })
  const [row] = await db.select().from(consoleNotifications).where(eq(consoleNotifications.id, id)).limit(1)
  return mapRow(row!)
}

/** 幂等：同 org+sourceType+sourceId 已存在则跳过 */
export async function ensureSystemNotification(
  db: DbLike,
  organizationId: string,
  input: CreateNotificationInput & { sourceType: string; sourceId: string },
): Promise<NotificationDto | null> {
  const [existing] = await db
    .select()
    .from(consoleNotifications)
    .where(
      and(
        eq(consoleNotifications.organizationId, organizationId),
        eq(consoleNotifications.sourceType, input.sourceType),
        eq(consoleNotifications.sourceId, input.sourceId),
      ),
    )
    .limit(1)
  if (existing) return mapRow(existing)
  return createNotification(db, organizationId, input)
}
