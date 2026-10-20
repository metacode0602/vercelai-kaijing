import 'server-only'

import { db } from '@/lib/db'
import { crmError, crmLog } from '@/lib/server/dataaccess/crm/logger'
import {
  notifyReconDrift,
  type ReconDriftInput,
} from '@/lib/server/dataaccess/merchant/merchant-rollup-alert'
import {
  listMerchantPoolTotalMismatch,
  runMerchantAccountSelfCheck,
  snapshotMerchantAccount,
} from '@workspace/billing/merchant-account'
import {
  merchant,
  merchantAccount,
  merchantAccountSnapshot,
} from '@workspace/db/schema'
import { and, desc, eq, lt } from 'drizzle-orm'

/** 基线超过该时长视为过期，不拿来做区间自检（避免长区间误报） */
const MAX_BASELINE_AGE_MS = 7 * 24 * 3600 * 1000

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * 对账第 0 环：实时值自检（设计 §5.6 / §3.2④）。
 *
 * 顺序：先取上一次 `pre_recon` 作为期初 → 落本次 `pre_recon` 快照（作为下次期初）
 * → 跑「期初 + Σ流水 =? 期末实时值」与「池实时值 =? Σ流水」两套校验 → 漂移告警。
 * 三方对账不能跳过本闸门。
 */
export async function runReconPreflight(): Promise<{ checked: number; drifted: number }> {
  const accounts = await db
    .select({ merchantId: merchantAccount.merchantId, merchantName: merchant.name })
    .from(merchantAccount)
    .innerJoin(merchant, eq(merchantAccount.merchantId, merchant.id))

  if (accounts.length === 0) return { checked: 0, drifted: 0 }

  const now = new Date()
  const alerts: ReconDriftInput[] = []

  for (const account of accounts) {
    const [baseline] = await db
      .select({
        snapshotAt: merchantAccountSnapshot.snapshotAt,
      })
      .from(merchantAccountSnapshot)
      .where(
        and(
          eq(merchantAccountSnapshot.merchantId, account.merchantId),
          eq(merchantAccountSnapshot.trigger, 'pre_recon'),
          lt(merchantAccountSnapshot.snapshotAt, now),
        ),
      )
      .orderBy(desc(merchantAccountSnapshot.snapshotAt))
      .limit(1)

    try {
      await snapshotMerchantAccount(db, {
        merchantId: account.merchantId,
        trigger: 'pre_recon',
        snapshotAt: now,
      })
    } catch (error) {
      crmError('merchant-recon-preflight', 'snapshot failed', error, {
        merchantId: account.merchantId,
      })
    }

    if (baseline && now.getTime() - baseline.snapshotAt.getTime() <= MAX_BASELINE_AGE_MS) {
      try {
        const drifts = await runMerchantAccountSelfCheck(db, {
          merchantId: account.merchantId,
          beginSnapshotAt: baseline.snapshotAt,
          endAt: now,
        })
        for (const drift of drifts) {
          alerts.push({
            merchantId: account.merchantId,
            merchantName: account.merchantName,
            scope: `期初快照 + Σ流水 ≠ 期末实时值（${drift.pool} / ${drift.bucket}）`,
            drift: toNum(drift.drift),
            detail: `期初 ${toNum(drift.beginValue)} + 流水 ${toNum(drift.ledgerDelta)} ≠ 期末 ${toNum(drift.endValue)}`,
          })
        }
      } catch (error) {
        crmError('merchant-recon-preflight', 'range self-check failed', error, {
          merchantId: account.merchantId,
        })
      }
    }

    try {
      const mismatches = await listMerchantPoolTotalMismatch(db, {
        merchantId: account.merchantId,
      })
      for (const row of mismatches) {
        alerts.push({
          merchantId: account.merchantId,
          merchantName: account.merchantName,
          scope: `池实时值 ≠ Σ流水（${row.pool}）`,
          drift: toNum(row.diff),
          detail: `实时值 ${toNum(row.poolTotal)} ≠ 流水合计 ${toNum(row.ledgerTotal)}`,
        })
      }
    } catch (error) {
      crmError('merchant-recon-preflight', 'cumulative self-check failed', error, {
        merchantId: account.merchantId,
      })
    }
  }

  if (alerts.length > 0) await notifyReconDrift(alerts)

  crmLog('merchant-recon-preflight', 'done', {
    checked: accounts.length,
    drifted: alerts.length,
    baseline: 'pre_recon',
  })
  return { checked: accounts.length, drifted: alerts.length }
}
