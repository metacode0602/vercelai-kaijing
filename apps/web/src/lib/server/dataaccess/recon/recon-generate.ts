import 'server-only'

import { db } from '@/lib/db'
import { crmError, crmLog } from '@/lib/server/dataaccess/crm/logger'
import { createMerchantSiteMessage } from '@/lib/server/dataaccess/merchant/merchant-site-message'
import { notifyReconAlert } from '@/lib/server/dataaccess/merchant/merchant-rollup-alert'
import {
  computeDailyCosts,
  loadHourlyListPrices,
} from '@/lib/server/jobs/merchant-rollup/run-merchant-rollup'
import {
  merchant,
  merchantAccountLedger,
  merchantBill,
  merchantReconDiff,
  merchantReconStatement,
  tenantConsumptionDailyDetail,
} from '@workspace/db/schema'
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm'

/** 两侧折算后的金额差绝对值 ≤ 该容差视为匹配（折算链路有 4 位小数舍入） */
export const RECON_AMOUNT_TOLERANCE = 0.01

/** 匹配率低于该阈值触发运营告警（设计 §5.6 规则 3） */
export const RECON_MATCH_RATE_THRESHOLD = 0.99

const READ_ONLY_STATUSES = ['confirmed', 'disputed', 'closed']

function newId(): string {
  return crypto.randomUUID()
}

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

function monthBounds(month: string): { start: string; end: string } {
  const [year, monthNum] = month.split('-').map(Number)
  const y = year ?? 1970
  const m = (monthNum ?? 1) - 1
  const end = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10)
  return { start: `${month}-01`, end }
}

type DiffDraft = {
  reconDate: string
  diffType: string
  platformAmount: number
  resourceAmount: number
  resourceQty: number
}

type DaySum = Map<string, Map<string, number>>

function push(map: Map<string, Map<string, number>>, merchantId: string, day: string, value: number) {
  const byDay = map.get(merchantId) ?? new Map<string, number>()
  byDay.set(day, (byDay.get(day) ?? 0) + value)
  map.set(merchantId, byDay)
}

/**
 * 生成某月的商户对账单（月度口径 + 日粒度差异）。
 *
 * 比对两方（2026-10-05 Q1 拍板）：
 *   平台账本 = Σ merchant_account_ledger(ref_type='consume')，按上海时区归日
 *   资源计量 = tenant_consumption_daily_detail 按平台进货价折算（复用 rollup 的 computeDailyCosts）
 * 商户账本本期不比，`merchantAmount` 恒 0。
 */
export async function generateMonthlyRecon(
  month: string,
): Promise<{ statements: number; diffs: number }> {
  const { start, end } = monthBounds(month)
  const startAt = new Date(`${start}T00:00:00+08:00`)
  const endAt = new Date(`${end}T23:59:59.999+08:00`)

  const dayExpr = sql<string>`to_char(${merchantAccountLedger.occurredAt} at time zone 'Asia/Shanghai', 'YYYY-MM-DD')`

  const [ledgerRows, meterRows] = await Promise.all([
    db
      .select({
        merchantId: merchantAccountLedger.merchantId,
        day: dayExpr,
        amount: sql<string>`coalesce(sum(${merchantAccountLedger.amount}), 0)::text`,
      })
      .from(merchantAccountLedger)
      .where(
        and(
          eq(merchantAccountLedger.refType, 'consume'),
          gte(merchantAccountLedger.occurredAt, startAt),
          lte(merchantAccountLedger.occurredAt, endAt),
        ),
      )
      .groupBy(merchantAccountLedger.merchantId, dayExpr),
    db
      .select({
        merchantId: tenantConsumptionDailyDetail.merchantId,
        day: tenantConsumptionDailyDetail.usageDate,
        qty: sql<string>`coalesce(sum(${tenantConsumptionDailyDetail.totalCardHours}), 0)::text`,
      })
      .from(tenantConsumptionDailyDetail)
      .where(
        and(gte(tenantConsumptionDailyDetail.usageDate, start), lte(tenantConsumptionDailyDetail.usageDate, end)),
      )
      .groupBy(tenantConsumptionDailyDetail.merchantId, tenantConsumptionDailyDetail.usageDate),
  ])

  const merchantIds = [
    ...new Set([...ledgerRows.map((r) => r.merchantId), ...meterRows.map((r) => r.merchantId)]),
  ]
  if (merchantIds.length === 0) {
    crmLog('merchant-recon', 'no data', { month })
    return { statements: 0, diffs: 0 }
  }

  const ledgerByMerchant: DaySum = new Map()
  for (const row of ledgerRows) {
    push(ledgerByMerchant, row.merchantId, row.day, toNum(row.amount))
  }
  const qtyByMerchant: DaySum = new Map()
  const meterDaySet: DaySum = new Map()
  for (const row of meterRows) {
    push(qtyByMerchant, row.merchantId, row.day, toNum(row.qty))
    push(meterDaySet, row.merchantId, row.day, 1)
  }

  const merchants = await db
    .select({ id: merchant.id, name: merchant.name, fundingMode: merchant.fundingMode })
    .from(merchant)
    .where(inArray(merchant.id, merchantIds))

  const listPrices = await loadHourlyListPrices()

  let statements = 0
  let diffs = 0
  const lowMatchAlerts: {
    merchantId: string
    merchantName: string
    month: string
    matchRate: number
    diffAmount: number
  }[] = []

  for (const row of merchants) {
    const ledgerDays = ledgerByMerchant.get(row.id) ?? new Map<string, number>()
    const meterDays = meterDaySet.get(row.id) ?? new Map<string, number>()
    const days = [...new Set([...ledgerDays.keys(), ...meterDays.keys()])].sort()
    if (days.length === 0) continue

    const [existing] = await db
      .select()
      .from(merchantReconStatement)
      .where(
        and(
          eq(merchantReconStatement.merchantId, row.id),
          eq(merchantReconStatement.periodType, 'month'),
          eq(merchantReconStatement.periodStart, start),
        ),
      )
      .limit(1)

    if (existing && READ_ONLY_STATUSES.includes(existing.status)) continue

    let platformTotal = 0
    let resourceTotal = 0
    let diffTotal = 0
    let matched = 0
    let total = 0
    let uncomparable = 0
    const drafts: DiffDraft[] = []

    for (const day of days) {
      const platformAmount = ledgerDays.get(day) ?? 0
      const breakdown = await computeDailyCosts({
        merchantId: row.id,
        fundingMode: row.fundingMode,
        rollupDate: day,
        listPrices,
      })
      const resourceAmount = breakdown.platformCost
      const resourceQty = qtyByMerchant.get(row.id)?.get(day) ?? 0
      const hasActivity = platformAmount > 0 || resourceAmount > 0 || resourceQty > 0
      if (!hasActivity) continue

      platformTotal += platformAmount
      resourceTotal += resourceAmount

      if (breakdown.missingProductLines.length > 0) {
        uncomparable += 1
        drafts.push({
          reconDate: day,
          diffType: 'uncomparable',
          platformAmount,
          resourceAmount,
          resourceQty,
        })
        continue
      }

      total += 1
      const diff = platformAmount - resourceAmount
      if (Math.abs(diff) <= RECON_AMOUNT_TOLERANCE) {
        matched += 1
        continue
      }

      diffTotal += Math.abs(diff)
      drafts.push({
        reconDate: day,
        diffType:
          platformAmount > 0 && resourceAmount === 0
            ? 'platform_only'
            : platformAmount === 0 && resourceAmount > 0
              ? 'resource_only'
              : 'amount_mismatch',
        platformAmount,
        resourceAmount,
        resourceQty,
      })
    }

    const matchRate = total === 0 ? 1 : Number((matched / total).toFixed(4))
    const status = drafts.length === 0 ? 'matched' : 'open'
    const values = {
      platformAmount: platformTotal.toFixed(4),
      merchantAmount: '0',
      resourceAmount: resourceTotal.toFixed(4),
      diffAmount: diffTotal.toFixed(4),
      matchRate: matchRate.toFixed(4),
      matchedCount: matched,
      totalCount: total,
      uncomparableCount: uncomparable,
      status,
      generatedAt: new Date(),
      updatedAt: new Date(),
    }

    if (existing) {
      await db
        .update(merchantReconStatement)
        .set(values)
        .where(eq(merchantReconStatement.id, existing.id))
    } else {
      await db.insert(merchantReconStatement).values({
        id: newId(),
        merchantId: row.id,
        periodType: 'month',
        periodStart: start,
        periodEnd: end,
        ...values,
        createdAt: new Date(),
      })
      statements += 1
    }

    // D4-4=A：对账单生成即月账单 open → reconciled（比对完成，待商户确认）
    await db
      .update(merchantBill)
      .set({ status: 'reconciled', updatedAt: new Date() })
      .where(
        and(
          eq(merchantBill.merchantId, row.id),
          eq(merchantBill.billMonth, month),
          inArray(merchantBill.status, ['open', 'pending']),
        ),
      )

    const statementId = existing?.id ?? (await loadStatementId(row.id, start))

    const existingDiffs = await db
      .select({ id: merchantReconDiff.id, reconDate: merchantReconDiff.reconDate, status: merchantReconDiff.status })
      .from(merchantReconDiff)
      .where(eq(merchantReconDiff.statementId, statementId))

    const draftByDate = new Map(drafts.map((d) => [d.reconDate, d]))
    const openDates = new Set(
      existingDiffs.filter((d) => d.status === 'open').map((d) => d.reconDate),
    )

    for (const draft of drafts) {
      await db
        .insert(merchantReconDiff)
        .values({
          id: newId(),
          statementId,
          merchantId: row.id,
          ...draft,
          merchantAmount: '0',
          platformAmount: draft.platformAmount.toFixed(4),
          resourceAmount: draft.resourceAmount.toFixed(4),
          resourceQty: draft.resourceQty.toFixed(4),
          status: 'open',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [merchantReconDiff.statementId, merchantReconDiff.reconDate],
          set: {
            diffType: draft.diffType,
            platformAmount: draft.platformAmount.toFixed(4),
            resourceAmount: draft.resourceAmount.toFixed(4),
            resourceQty: draft.resourceQty.toFixed(4),
            updatedAt: new Date(),
          },
        })
      if (openDates.has(draft.reconDate)) openDates.delete(draft.reconDate)
      diffs += 1
    }

    const stale = [...openDates].filter((day) => !draftByDate.has(day))
    if (stale.length > 0) {
      await db
        .delete(merchantReconDiff)
        .where(
          and(
            eq(merchantReconDiff.statementId, statementId),
            eq(merchantReconDiff.status, 'open'),
            inArray(merchantReconDiff.reconDate, stale),
          ),
        )
    }

    if (!existing) {
      await notifyMerchantStatement(row.id, row.name, month, matchRate, drafts.length)
    }
    if (matchRate < RECON_MATCH_RATE_THRESHOLD && total > 0) {
      lowMatchAlerts.push({
        merchantId: row.id,
        merchantName: row.name,
        month,
        matchRate,
        diffAmount: diffTotal,
      })
    }
  }

  if (lowMatchAlerts.length > 0) {
    await notifyReconAlert(lowMatchAlerts)
  }

  crmLog('merchant-recon', 'generated', { month, statements, diffs })
  return { statements, diffs }
}

async function loadStatementId(merchantId: string, periodStart: string): Promise<string> {
  const [row] = await db
    .select({ id: merchantReconStatement.id })
    .from(merchantReconStatement)
    .where(
      and(
        eq(merchantReconStatement.merchantId, merchantId),
        eq(merchantReconStatement.periodType, 'month'),
        eq(merchantReconStatement.periodStart, periodStart),
      ),
    )
    .limit(1)
  if (!row) throw new Error('merchant-recon: 对账单写入后未能回读')
  return row.id
}

async function notifyMerchantStatement(
  merchantId: string,
  merchantName: string,
  month: string,
  matchRate: number,
  diffCount: number,
): Promise<void> {
  try {
    await createMerchantSiteMessage({
      merchantId,
      category: 'recon',
      title: `${month} 对账单已生成`,
      summary:
        diffCount > 0
          ? `本期发现 ${diffCount} 天差异，请在对账中心确认或提出异议。`
          : '本期两侧账目全部匹配，请在对账中心确认。',
      content: [
        `平台已于日终完成 **${month}** 的账目比对。`,
        '',
        '- 比对范围：平台账本（消费扣款） ↔ 资源计量（按平台进货价折算）',
        `- 匹配率：**${(matchRate * 100).toFixed(2)}%**`,
        `- 差异天数：**${diffCount}**`,
        '',
        '确认即表示账目无误（确认不涉及付款）；如有异议请先提交申诉，由运营复核后再调账。',
      ].join('\n'),
      linkLabel: '前往对账中心',
      linkHref: '/console/recon',
    })
  } catch (error) {
    crmError('merchant-recon', 'notify merchant failed', error, { merchantId, month })
  }
}
