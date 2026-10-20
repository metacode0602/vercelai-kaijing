import 'server-only'

import { db } from '@/lib/db'
import {
  bareMetalSyncJobItem,
  bareMetalSyncJobRun,
  user,
  userSiteMessage,
} from '@workspace/db/schema'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { BARE_METAL_SYNC_ERROR_LABELS } from '@/lib/supplier/bare-metal-sync-error-labels'

const notifiedJobRunIds = new Set<string>()

export async function notifyBareMetalSyncFailureToAdmins(input: {
  jobRunId: string
}): Promise<void> {
  if (notifiedJobRunIds.has(input.jobRunId)) return

  const run = await db.query.bareMetalSyncJobRun.findFirst({
    where: eq(bareMetalSyncJobRun.id, input.jobRunId),
  })
  if (!run || (run.status !== 'failed' && run.status !== 'partial')) return

  const failedItems = await db
    .select({
      orderNo: bareMetalSyncJobItem.orderNo,
      errorCode: bareMetalSyncJobItem.errorCode,
      errorMessage: bareMetalSyncJobItem.errorMessage,
    })
    .from(bareMetalSyncJobItem)
    .where(
      and(
        eq(bareMetalSyncJobItem.jobRunId, input.jobRunId),
        eq(bareMetalSyncJobItem.phase, 'order_upsert'),
        eq(bareMetalSyncJobItem.status, 'failed'),
      ),
    )
    .orderBy(bareMetalSyncJobItem.orderNo)
    .limit(20)

  if (failedItems.length === 0) return

  notifiedJobRunIds.add(input.jobRunId)

  const recipients = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.role, 'admin'))

  if (recipients.length === 0) return

  const failedOrderCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bareMetalSyncJobItem)
    .where(
      and(
        eq(bareMetalSyncJobItem.jobRunId, input.jobRunId),
        eq(bareMetalSyncJobItem.phase, 'order_upsert'),
        eq(bareMetalSyncJobItem.status, 'failed'),
      ),
    )

  const count = failedOrderCount[0]?.count ?? failedItems.length
  const triggerLabel = run.trigger === 'manual' ? '手动' : '定时'
  const startedAt = run.startedAt.toISOString().slice(0, 19).replace('T', ' ')

  const title = `裸金属订单同步失败（${count} 单）`
  const summary = `${triggerLabel} · ${startedAt} · 成功 ${run.orderUpsertedCount} / 失败 ${count}`

  const sampleLines = failedItems.slice(0, 5).map((item) => {
    const code = item.errorCode
      ? (BARE_METAL_SYNC_ERROR_LABELS[item.errorCode as keyof typeof BARE_METAL_SYNC_ERROR_LABELS] ??
        item.errorCode)
      : '失败'
    return `- **${item.orderNo ?? '—'}**（${code}）：${item.errorMessage ?? ''}`
  })

  const content = [
    `裸金属订单同步批次 **${input.jobRunId.slice(0, 8)}** 有 **${count}** 单未能写入。`,
    '',
    `成功 **${run.orderUpsertedCount}** 单，拉取 **${run.ordersFetchedCount}** 单。`,
    '',
    '**部分失败订单：**',
    ...sampleLines,
    ...(count > 5 ? [`- … 另有 ${count - 5} 单`] : []),
    '',
    '请打开同步错误处理页查看详情并重试。',
  ].join('\n')

  const links = [
    {
      label: '处理同步错误',
      href: `/supplier/bare-metal-orders/sync-errors?jobRunId=${input.jobRunId}`,
    },
  ]

  const now = new Date()
  await db.insert(userSiteMessage).values(
    recipients.map((recipient) => ({
      userId: recipient.id,
      title,
      summary,
      content,
      category: 'bare_metal_sync',
      links,
      read: false,
      createdAt: now,
      updatedAt: now,
    })),
  )
}

export async function countUnresolvedOrderSyncFailures(): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bareMetalSyncJobItem)
    .where(
      and(
        eq(bareMetalSyncJobItem.phase, 'order_upsert'),
        eq(bareMetalSyncJobItem.status, 'failed'),
        isNull(bareMetalSyncJobItem.resolvedAt),
      ),
    )
  return rows[0]?.count ?? 0
}

export async function listFailedOrderSyncJobRunIds(limit = 50): Promise<string[]> {
  const rows = await db
    .selectDistinct({ jobRunId: bareMetalSyncJobItem.jobRunId })
    .from(bareMetalSyncJobItem)
    .where(
      and(eq(bareMetalSyncJobItem.phase, 'order_upsert'), eq(bareMetalSyncJobItem.status, 'failed')),
    )
    .orderBy(desc(bareMetalSyncJobItem.jobRunId))
    .limit(limit)
  return rows.map((r) => r.jobRunId)
}

export { notifiedJobRunIds }
