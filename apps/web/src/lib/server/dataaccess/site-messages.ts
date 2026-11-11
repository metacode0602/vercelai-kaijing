import { webAuthDb } from '@/lib/db'
import type {
  SiteMessageDetail,
  SiteMessageListResult,
  SiteMessageReadFilter,
} from '@/lib/types/site-messages'
import {
  webUserSiteMessage,
  type NewWebUserSiteMessage,
  type WebSiteMessageLinkRecord,
  type WebUserSiteMessage,
} from '@workspace/db'
import { and, count, desc, eq } from 'drizzle-orm'

const DEFAULT_PAGE_SIZE = 10

type SiteMessageListRow = Pick<
  WebUserSiteMessage,
  'id' | 'title' | 'summary' | 'category' | 'read' | 'createdAt'
>

type SiteMessageDetailRow = SiteMessageListRow & {
  content: string
  links: WebSiteMessageLinkRecord[] | null
  readAt: Date | null
}

function toIso(value: Date | null | undefined): string | null {
  if (!value) return null
  return value.toISOString()
}

function mapListItem(row: SiteMessageListRow) {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    category: row.category,
    read: row.read,
    createdAt: row.createdAt.toISOString(),
  }
}

function mapDetail(row: SiteMessageDetailRow): SiteMessageDetail {
  return {
    ...mapListItem(row),
    content: row.content,
    links: row.links ?? [],
    readAt: toIso(row.readAt),
  }
}

const demoMessages: Omit<NewWebUserSiteMessage, 'id' | 'userId'>[] = [
  {
    title: '新的入驻申请待审核',
    summary: '有 2 家新租户提交了 Daraz 斯里兰卡站入驻申请，请尽快完成资质审核。',
    content: `平台收到 **2 家新租户** 的入驻申请，当前均处于「待审核」状态。

- 科伦坡优选贸易（Colombo Select）
- 锡兰家居供应链（Ceylon Home Supply）

请核对营业执照、Daraz 店铺授权与联系人信息后再通过审核。`,
    category: '入驻',
    links: [{ label: '前往入驻审核', href: '/console/onboarding' }],
    read: false,
    createdAt: new Date('2026-11-10T03:20:00.000Z'),
  },
  {
    title: '店铺同步任务出现异常',
    summary: '3 个店铺的订单同步任务连续失败，已自动进入重试队列。',
    content: `同步监控发现以下店铺的订单同步连续失败：

- Lanka Digital Store：连续失败 3 次
- Kandy Fashion Hub：连续失败 2 次
- Galle Grocery Mart：连续失败 2 次

系统已自动加入重试队列。若 30 分钟内仍未恢复，请检查平台授权凭证或稍后手动触发同步。`,
    category: '同步',
    links: [{ label: '查看同步健康', href: '/console/sync-health' }],
    read: false,
    createdAt: new Date('2026-11-09T14:05:00.000Z'),
  },
  {
    title: '平台运营周报已生成',
    summary: '第 45 周运营周报已生成，包含租户增长、店铺健康度与待审动作汇总。',
    content: `第 **45 周** 平台运营周报已生成。

- 新增租户：4 家
- 新增店铺：7 个
- 待审动作：12 条
- 同步健康率：96.4%

可在运营总览中查看完整指标趋势。`,
    category: '系统',
    links: [{ label: '打开运营总览', href: '/console' }],
    read: true,
    readAt: new Date('2026-11-08T09:30:00.000Z'),
    createdAt: new Date('2026-11-08T09:00:00.000Z'),
  },
]

async function ensureDemoMessages(userId: string) {
  if (process.env.NODE_ENV === 'production') return

  const existing = await webAuthDb
    .select({
      id: webUserSiteMessage.id,
      title: webUserSiteMessage.title,
      content: webUserSiteMessage.content,
    })
    .from(webUserSiteMessage)
    .where(eq(webUserSiteMessage.userId, userId))

  if (existing.length === 0) {
    await webAuthDb.insert(webUserSiteMessage).values(
      demoMessages.map((message) => ({
        ...message,
        userId,
      })),
    )
    return
  }

  for (const demo of demoMessages) {
    const row = existing.find((item) => item.title === demo.title)
    if (row && row.content !== demo.content) {
      await webAuthDb
        .update(webUserSiteMessage)
        .set({ content: demo.content })
        .where(eq(webUserSiteMessage.id, row.id))
    }
  }
}

function buildReadFilter(userId: string, readFilter: SiteMessageReadFilter) {
  const conditions = [eq(webUserSiteMessage.userId, userId)]

  if (readFilter === 'unread') {
    conditions.push(eq(webUserSiteMessage.read, false))
  } else if (readFilter === 'read') {
    conditions.push(eq(webUserSiteMessage.read, true))
  }

  return and(...conditions)
}

export const siteMessagesDataAccess = {
  async list(input: {
    userId: string
    page: number
    pageSize: number
    readFilter: SiteMessageReadFilter
  }): Promise<SiteMessageListResult> {
    await ensureDemoMessages(input.userId)

    const page = Math.max(1, input.page)
    const pageSize = Math.min(50, Math.max(1, input.pageSize))
    const offset = (page - 1) * pageSize
    const whereClause = buildReadFilter(input.userId, input.readFilter)

    const [totalRow] = await webAuthDb
      .select({ total: count() })
      .from(webUserSiteMessage)
      .where(whereClause)

    const total = totalRow?.total ?? 0
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize)

    const rows = await webAuthDb
      .select({
        id: webUserSiteMessage.id,
        title: webUserSiteMessage.title,
        summary: webUserSiteMessage.summary,
        category: webUserSiteMessage.category,
        read: webUserSiteMessage.read,
        createdAt: webUserSiteMessage.createdAt,
      })
      .from(webUserSiteMessage)
      .where(whereClause)
      .orderBy(desc(webUserSiteMessage.createdAt), desc(webUserSiteMessage.id))
      .limit(pageSize)
      .offset(offset)

    return {
      items: rows.map(mapListItem),
      page,
      pageSize,
      total,
      totalPages,
    }
  },

  async getUnreadCount(userId: string): Promise<number> {
    await ensureDemoMessages(userId)

    const [row] = await webAuthDb
      .select({ total: count() })
      .from(webUserSiteMessage)
      .where(
        and(
          eq(webUserSiteMessage.userId, userId),
          eq(webUserSiteMessage.read, false),
        ),
      )

    return row?.total ?? 0
  },

  async getById(userId: string, id: string): Promise<SiteMessageDetail | null> {
    const [row] = await webAuthDb
      .select({
        id: webUserSiteMessage.id,
        title: webUserSiteMessage.title,
        summary: webUserSiteMessage.summary,
        content: webUserSiteMessage.content,
        category: webUserSiteMessage.category,
        links: webUserSiteMessage.links,
        read: webUserSiteMessage.read,
        readAt: webUserSiteMessage.readAt,
        createdAt: webUserSiteMessage.createdAt,
      })
      .from(webUserSiteMessage)
      .where(
        and(eq(webUserSiteMessage.id, id), eq(webUserSiteMessage.userId, userId)),
      )
      .limit(1)

    if (!row) return null
    return mapDetail(row)
  },

  async markRead(userId: string, id: string): Promise<boolean> {
    const [updated] = await webAuthDb
      .update(webUserSiteMessage)
      .set({
        read: true,
        readAt: new Date(),
      })
      .where(
        and(eq(webUserSiteMessage.id, id), eq(webUserSiteMessage.userId, userId)),
      )
      .returning({ id: webUserSiteMessage.id })

    return Boolean(updated)
  },

  async markAllRead(userId: string): Promise<number> {
    const updated = await webAuthDb
      .update(webUserSiteMessage)
      .set({
        read: true,
        readAt: new Date(),
      })
      .where(
        and(
          eq(webUserSiteMessage.userId, userId),
          eq(webUserSiteMessage.read, false),
        ),
      )
      .returning({ id: webUserSiteMessage.id })

    return updated.length
  },
}

export { DEFAULT_PAGE_SIZE as SITE_MESSAGE_DEFAULT_PAGE_SIZE }
