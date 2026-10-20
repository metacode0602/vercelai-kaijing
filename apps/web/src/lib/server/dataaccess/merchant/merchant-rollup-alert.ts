import 'server-only'

import { db } from '@/lib/db'
import { user, userSiteMessage } from '@workspace/db/schema'
import { eq } from 'drizzle-orm'

const CATEGORY = 'merchant_rollup'

const notified = new Set<string>()

export type MissingPriceAlertInput = {
  rollupDate: string
  merchantId: string
  merchantName: string
  missingProductLines: string[]
}

function buildContent(input: MissingPriceAlertInput, lines: string[]): string {
  const sample = lines.slice(0, 10).map((line) => `- **${line}**`)
  const more = lines.length > 10 ? [`- … 另有 ${lines.length - 10} 条产品线`] : []

  return [
    `商户 **${input.merchantName}**（\`${input.merchantId}\`）在 **${input.rollupDate}** 的消费中，以下产品线没有命中生效的进货价：`,
    '',
    ...sample,
    ...more,
    '',
    '按现行口径，缺价当日**不产出毛利**，收入与券成本照常落库。补齐进货价后重跑该日 rollup 即可回填。',
    '',
    '- GPU 卡时类：商户定价页维护 `merchant_purchase_price`',
    '- 非卡时产品线：`merchant_product_purchase_price`',
  ].join('\n')
}

export async function notifyMissingPurchasePrice(
  inputs: MissingPriceAlertInput[],
): Promise<void> {
  const fresh = inputs.filter(
    (input) =>
      input.missingProductLines.length > 0 &&
      !notified.has(`${input.rollupDate}:${input.merchantId}`),
  )
  if (fresh.length === 0) return

  const recipients = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.role, 'admin'))
  if (recipients.length === 0) return

  const now = new Date()
  const rows = fresh.flatMap((input) => {
    notified.add(`${input.rollupDate}:${input.merchantId}`)
    const lines = [...new Set(input.missingProductLines)].sort()

    return recipients.map((recipient) => ({
      userId: recipient.id,
      title: `毛利未出：${input.merchantName} 缺进货价`,
      summary: `${input.rollupDate} 有 ${lines.length} 条产品线没有生效的进货价，当日毛利不计算`,
      content: buildContent(input, lines),
      category: CATEGORY,
      links: [{ label: '前往商户定价配置', href: `/merchant/${input.merchantId}/pricing` }],
      read: false,
      createdAt: now,
      updatedAt: now,
    }))
  })

  await db.insert(userSiteMessage).values(rows)
}

export type ReconAlertInput = {
  merchantId: string
  merchantName: string
  month: string
  matchRate: number
  diffAmount: number
}

const reconNotified = new Set<string>()

/** 匹配率低于阈值（设计 §5.6 规则 3）→ 运营站内信，D1-7=A 只走站内信 */
export async function notifyReconAlert(inputs: ReconAlertInput[]): Promise<void> {
  const fresh = inputs.filter((input) => {
    const key = `${input.month}:${input.merchantId}`
    if (reconNotified.has(key)) return false
    reconNotified.add(key)
    return true
  })
  if (fresh.length === 0) return

  const recipients = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.role, 'admin'))
  if (recipients.length === 0) return

  const now = new Date()
  const rows = fresh.flatMap((input) =>
    recipients.map((recipient) => ({
      userId: recipient.id,
      title: `对账匹配率不足：${input.merchantName}`,
      summary: `${input.month} 匹配率 ${(input.matchRate * 100).toFixed(2)}%，差异合计 ${input.diffAmount.toFixed(2)} 元`,
      content: [
        `商户 **${input.merchantName}**（\`${input.merchantId}\`）**${input.month}** 的对账匹配率低于 ${(0.99 * 100).toFixed(0)}%。`,
        '',
        `- 匹配率：**${(input.matchRate * 100).toFixed(2)}%**`,
        `- 差异金额合计：**¥${input.diffAmount.toFixed(2)}**`,
        '',
        '请到对账中心复核差异明细，必要时按「申诉 → 复核 → 调账」处理。',
      ].join('\n'),
      category: 'merchant_recon',
      links: [],
      read: false,
      createdAt: now,
      updatedAt: now,
    })),
  )

  await db.insert(userSiteMessage).values(rows)
}

export type ReconDriftInput = {
  merchantId: string
  merchantName: string
  scope: string
  drift: number
  detail: string
}

const driftNotified = new Set<string>()

/** 对账第 0 环账实漂移（设计 §5.6：P0 资金事故）→ 运营站内信 */
export async function notifyReconDrift(inputs: ReconDriftInput[]): Promise<void> {
  const fresh = inputs.filter((input) => {
    const key = `${input.merchantId}:${input.scope}`
    if (driftNotified.has(key)) return false
    driftNotified.add(key)
    return true
  })
  if (fresh.length === 0) return

  const recipients = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.role, 'admin'))
  if (recipients.length === 0) return

  const now = new Date()
  const rows = fresh.flatMap((input) =>
    recipients.map((recipient) => ({
      userId: recipient.id,
      title: `🔴 账实漂移：${input.merchantName}`,
      summary: `${input.scope} 漂移 ${input.drift.toFixed(2)} 元，对账前置闸门未通过`,
      content: [
        `商户 **${input.merchantName}**（\`${input.merchantId}\`）的实时值与流水不一致。`,
        '',
        `- 校验口径：**${input.scope}**`,
        `- 漂移金额：**¥${input.drift.toFixed(2)}**`,
        `- 明细：${input.detail}`,
        '',
        '按设计 §5.6，第 0 环漂移时三方对账结果无效，请先定位漂移小时（hourly 快照）并修复账本。',
      ].join('\n'),
      category: 'merchant_recon',
      links: [],
      read: false,
      createdAt: now,
      updatedAt: now,
    })),
  )

  await db.insert(userSiteMessage).values(rows)
}
