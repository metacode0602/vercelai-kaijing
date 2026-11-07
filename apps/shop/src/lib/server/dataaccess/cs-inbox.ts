/**
 * 客服收件箱 dataaccess（模块 F28）：只读拉取平台 IM 消息 + 本地持久化。
 *
 * 平台 IM 能力差异（见 packages/marketplace adapters imCapability）：
 * - Lazada：IM API 已确认（/im/session/list、/im/message/list 等），adapter 未实现 → known_unimplemented
 * - Daraz：复用 Lazop 体系，IM 文档未独立确认 → unknown
 * - TikTok：文档树有 Customer Service / Send Message 页，正文未抓到 → unknown
 *
 * 本模块只读拉取 + 标记已读；不实现发送（只读工作台）。
 * syncFromPlatform 对 unknown / known_unimplemented / unsupported 平台抛清晰错误，不写假数据。
 */
import { and, count, desc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { csInboxMessages, shops } from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

export type CsInboxMessageDto = {
  id: string
  shopId: string
  shop: string
  platform: string
  externalMessageId: string
  externalSessionId: string
  customer: string
  customerExternalId: string
  subject: string
  preview: string
  body: string
  sku: string
  status: 'unread' | 'read' | string
  receivedAt: string
  readAt: string
}

export type CsInboxStatsDto = {
  total: number
  unread: number
  byPlatform: Array<{ platform: string; total: number; unread: number }>
  byShop: Array<{ shopId: string; shop: string; total: number; unread: number }>
}

export type CsInboxListInput = {
  page?: number
  pageSize?: number
  q?: string
  platform?: string
  shopId?: string
  sku?: string
  status?: string
}

function toDto(
  row: typeof csInboxMessages.$inferSelect,
  shopName: string,
): CsInboxMessageDto {
  return {
    id: row.id,
    shopId: row.shopId,
    shop: shopName,
    platform: row.platform,
    externalMessageId: row.externalMessageId,
    externalSessionId: row.externalSessionId || '',
    customer: row.customer || '',
    customerExternalId: row.customerExternalId || '',
    subject: row.subject || '',
    preview: row.preview || '',
    body: row.body || '',
    sku: row.sku || '',
    status: row.status,
    receivedAt: row.receivedAt ? formatStamp(row.receivedAt) : '',
    readAt: row.readAt ? formatStamp(row.readAt) : '',
  }
}

function formatStamp(d: Date | string | null | undefined): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return typeof d === 'string' ? d : ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

async function loadShopMap(db: DbLike, organizationId: string, shopIds: string[]) {
  if (shopIds.length === 0) return new Map<string, string>()
  const rows = await db
    .select({ id: shops.id, name: shops.name })
    .from(shops)
    .where(and(eq(shops.organizationId, organizationId), sql`${shops.id} = any (${shopIds})`))
  return new Map(rows.map((r) => [r.id, r.name]))
}

export async function listMessages(
  db: AppDatabase,
  organizationId: string,
  input: CsInboxListInput = {},
): Promise<PaginatedResult<CsInboxMessageDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const conditions: SQL[] = [eq(csInboxMessages.organizationId, organizationId)]
  if (input.platform?.trim()) {
    conditions.push(eq(csInboxMessages.platform, input.platform.trim()))
  }
  if (input.shopId?.trim()) {
    conditions.push(eq(csInboxMessages.shopId, input.shopId.trim()))
  }
  if (input.sku?.trim()) {
    conditions.push(eq(csInboxMessages.sku, input.sku.trim()))
  }
  if (input.status?.trim()) {
    conditions.push(eq(csInboxMessages.status, input.status.trim()))
  }
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    conditions.push(
      or(
        ilike(csInboxMessages.customer, q),
        ilike(csInboxMessages.subject, q),
        ilike(csInboxMessages.preview, q),
        ilike(csInboxMessages.body, q),
        ilike(csInboxMessages.sku, q),
      )!,
    )
  }
  const where = and(...conditions)
  const [totalRow] = await db.select({ c: count() }).from(csInboxMessages).where(where)
  const rows = await db
    .select()
    .from(csInboxMessages)
    .where(where)
    .orderBy(desc(csInboxMessages.receivedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  const shopMap = await loadShopMap(
    db,
    organizationId,
    Array.from(new Set(rows.map((r) => r.shopId))),
  )
  const items = rows.map((r) => toDto(r, shopMap.get(r.shopId) || ''))
  return { items, total: Number(totalRow?.c || 0), page, pageSize }
}

export async function messageStats(
  db: AppDatabase,
  organizationId: string,
): Promise<CsInboxStatsDto> {
  const [totalRow] = await db
    .select({ c: count() })
    .from(csInboxMessages)
    .where(eq(csInboxMessages.organizationId, organizationId))
  const [unreadRow] = await db
    .select({ c: count() })
    .from(csInboxMessages)
    .where(
      and(
        eq(csInboxMessages.organizationId, organizationId),
        eq(csInboxMessages.status, 'unread'),
      ),
    )
  const platformRows = await db
    .select({
      platform: csInboxMessages.platform,
      total: count(),
      unread: sql<number>`count(*) filter (where ${csInboxMessages.status} = 'unread')`,
    })
    .from(csInboxMessages)
    .where(eq(csInboxMessages.organizationId, organizationId))
    .groupBy(csInboxMessages.platform)
  const shopRows = await db
    .select({
      shopId: csInboxMessages.shopId,
      total: count(),
      unread: sql<number>`count(*) filter (where ${csInboxMessages.status} = 'unread')`,
    })
    .from(csInboxMessages)
    .where(eq(csInboxMessages.organizationId, organizationId))
    .groupBy(csInboxMessages.shopId)
  const shopMap = await loadShopMap(
    db,
    organizationId,
    shopRows.map((r) => r.shopId),
  )
  return {
    total: Number(totalRow?.c || 0),
    unread: Number(unreadRow?.c || 0),
    byPlatform: platformRows.map((r) => ({
      platform: r.platform,
      total: Number(r.total),
      unread: Number(r.unread),
    })),
    byShop: shopRows.map((r) => ({
      shopId: r.shopId,
      shop: shopMap.get(r.shopId) || '',
      total: Number(r.total),
      unread: Number(r.unread),
    })),
  }
}

export async function markRead(
  db: AppDatabase,
  organizationId: string,
  id: string,
  actor?: string,
): Promise<CsInboxMessageDto> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(csInboxMessages)
      .where(
        and(
          eq(csInboxMessages.organizationId, organizationId),
          eq(csInboxMessages.id, id),
        ),
      )
      .limit(1)
    if (!row) throw new Error('消息不存在')
    const now = new Date()
    await tx
      .update(csInboxMessages)
      .set({ status: 'read', readAt: now, updatedAt: now })
      .where(eq(csInboxMessages.id, id))
    const [shop] = await tx.select({ name: shops.name }).from(shops).where(eq(shops.id, row.shopId)).limit(1)
    const [fresh] = await tx
      .select()
      .from(csInboxMessages)
      .where(eq(csInboxMessages.id, id))
      .limit(1)
    void actor
    return toDto(fresh!, shop?.name || '')
  })
}

export async function markAllRead(
  db: AppDatabase,
  organizationId: string,
  actor?: string,
): Promise<{ updated: number }> {
  return db.transaction(async (tx) => {
    const now = new Date()
    const updated = await tx
      .update(csInboxMessages)
      .set({ status: 'read', readAt: now, updatedAt: now })
      .where(
        and(
          eq(csInboxMessages.organizationId, organizationId),
          eq(csInboxMessages.status, 'unread'),
        ),
      )
    void actor
    return { updated: updated.rowCount ?? 0 }
  })
}

/**
 * 从平台同步消息到本地表。当前所有平台 IM adapter 未实现 listMessages，
 * 一律抛清晰错误，禁止写入演示数据冒充同步成功。
 *
 * 当某平台 adapter 实现 listMessages（capability === 'ready'）后，
 * 在此调用 connector.listMessages 并 upsert 到 cs_inbox_messages。
 */
export async function syncMessagesFromPlatform(
  _db: AppDatabase,
  _organizationId: string,
  _input: { shopId?: string; platform?: string; limit?: number } = {},
): Promise<{ synced: number; capability: string }> {
  throw new Error(
    '平台 IM 拉取未接线：Lazada IM API 已确认（known_unimplemented），Daraz/TikTok 文档未确认（unknown）。adapter 未实现 listMessages，禁止写入演示消息。请等待 IM adapter 落地或手工导入消息。',
  )
}

/**
 * 手工 upsert 一条消息（用于测试 / 数据导入）。生产路径应走平台同步。
 */
export async function upsertMessage(
  db: AppDatabase,
  organizationId: string,
  input: {
    shopId: string
    platform: string
    externalMessageId: string
    externalSessionId?: string
    customer?: string
    customerExternalId?: string
    subject?: string
    preview?: string
    body?: string
    sku?: string
    status?: 'unread' | 'read'
    receivedAt?: Date
  },
): Promise<CsInboxMessageDto> {
  if (!input.shopId.trim()) throw new Error('shopId 不能为空')
  if (!input.externalMessageId.trim()) throw new Error('externalMessageId 不能为空')
  return db.transaction(async (tx) => {
    const [shop] = await tx
      .select()
      .from(shops)
      .where(and(eq(shops.organizationId, organizationId), eq(shops.id, input.shopId)))
      .limit(1)
    if (!shop) throw new Error('店铺不存在')
    const [existing] = await tx
      .select()
      .from(csInboxMessages)
      .where(
        and(
          eq(csInboxMessages.shopId, input.shopId),
          eq(csInboxMessages.externalMessageId, input.externalMessageId),
        ),
      )
      .limit(1)
    const receivedAt = input.receivedAt ?? new Date()
    if (existing) {
      await tx
        .update(csInboxMessages)
        .set({
          externalSessionId: input.externalSessionId ?? existing.externalSessionId,
          customer: input.customer ?? existing.customer,
          customerExternalId: input.customerExternalId ?? existing.customerExternalId,
          subject: input.subject ?? existing.subject,
          preview: input.preview ?? existing.preview,
          body: input.body ?? existing.body,
          sku: input.sku ?? existing.sku,
          platform: input.platform || existing.platform,
          receivedAt,
          updatedAt: new Date(),
        })
        .where(eq(csInboxMessages.id, existing.id))
      const [fresh] = await tx
        .select()
        .from(csInboxMessages)
        .where(eq(csInboxMessages.id, existing.id))
        .limit(1)
      return toDto(fresh!, shop.name)
    }
    const id = createId()
    await tx.insert(csInboxMessages).values({
      id,
      organizationId,
      shopId: input.shopId,
      platform: input.platform,
      externalMessageId: input.externalMessageId,
      externalSessionId: input.externalSessionId || null,
      customer: input.customer || null,
      customerExternalId: input.customerExternalId || null,
      subject: input.subject || null,
      preview: input.preview || null,
      body: input.body || null,
      sku: input.sku || null,
      status: input.status || 'unread',
      receivedAt,
    })
    const [fresh] = await tx
      .select()
      .from(csInboxMessages)
      .where(eq(csInboxMessages.id, id))
      .limit(1)
    return toDto(fresh!, shop.name)
  })
}

/** 列出组织下有 IM 消息或店铺的全部平台 + 店铺，供页面筛选下拉用。 */
export async function listFilterOptions(
  db: AppDatabase,
  organizationId: string,
): Promise<{
  platforms: string[]
  shops: Array<{ shopId: string; shop: string; platform: string }>
}> {
  const shopRows = await db
    .select({ id: shops.id, name: shops.name, platform: shops.platform })
    .from(shops)
    .where(and(eq(shops.organizationId, organizationId), isNull(shops.deletedAt)))
    .orderBy(shops.name)
  const platforms = Array.from(new Set(shopRows.map((s) => s.platform)))
  return {
    platforms,
    shops: shopRows.map((s) => ({ shopId: s.id, shop: s.name, platform: s.platform })),
  }
}
