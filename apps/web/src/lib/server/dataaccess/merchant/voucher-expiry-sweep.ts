import { and, eq, lte } from 'drizzle-orm'
import { expireMerchantCoupon } from '@workspace/billing'
import { coupon } from '@workspace/db'
import { db } from '@/lib/db'
import { crmError, crmLog } from '@/lib/server/dataaccess/crm/logger'
import {
  getMerchantVoucherExpiryBatchSize,
  getMerchantVoucherExpiryMaxBatches,
} from './voucher-expiry-config'

export type VoucherExpirySweepResult = {
  ok: boolean
  trigger: 'scheduled' | 'manual'
  /** 本次扫描到的过期未回收券数量 */
  scanned: number
  /** 成功回收的张数 */
  expired: number
  /** 回收到商户券池的金额合计（元） */
  releasedAmount: number
  /** 实际跑了几个批次 */
  batches: number
  failures: { couponId: string; error: string }[]
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

/**
 * 扫描并回收已过期的算力券。
 *
 * 为什么要一个调度任务：
 * `expireMerchantCoupon()` 是**逐张**回收（每张一个事务），并且只有被调用才会
 * 把冻结在券池的剩余额度从 reserved 退回 available。此前这个函数在生产代码里
 * 没有任何调用方 —— 也就是说券过期后，商户的钱一直被锁在 reserved 里，
 * 用户拿不到券、商户拿不到钱（P1-12）。
 *
 * 分批跑的原因：一次把几万张过期券塞进同一个事务，要么超时要么把行锁占满。
 * 每批各自调用 `expireMerchantCoupon`（内部自带事务），单张失败只记一条
 * failure，绝不让整批回滚 —— 已经回收的钱没有理由再退回去。
 *
 * 并发安全：`expireMerchantCoupon` 用带 status 条件的 UPDATE 原子抢占，
 * 与核销（redeem）互为反面条件，同一张券被核销与回收同时命中时谁先提交谁赢；
 * 重复调度只是拿到 `replay: true`，不会二次放钱。
 */
export async function sweepExpiredMerchantCoupons(
  trigger: 'scheduled' | 'manual' = 'scheduled',
): Promise<VoucherExpirySweepResult> {
  const batchSize = getMerchantVoucherExpiryBatchSize()
  const maxBatches = getMerchantVoucherExpiryMaxBatches()

  let scanned = 0
  let expired = 0
  let releasedAmount = 0
  let batches = 0
  const failures: { couponId: string; error: string }[] = []

  for (let i = 0; i < maxBatches; i++) {
    const now = new Date()
    const rows = await db
      .select({ id: coupon.id, surplusAmount: coupon.surplusAmount })
      .from(coupon)
      .where(and(eq(coupon.status, 'active'), lte(coupon.expiredAt, now)))
      .limit(batchSize)

    if (rows.length === 0) break
    batches += 1
    scanned += rows.length

    for (const row of rows) {
      try {
        const result = await expireMerchantCoupon(db, {
          couponId: row.id,
          reason: 'expired',
        })
        if (!result.replay) {
          expired += 1
          releasedAmount += num(result.released)
        }
      } catch (error) {
        failures.push({
          couponId: row.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // 最后一批没取满，说明积压已清空，不用再跑一轮
    if (rows.length < batchSize) break
  }

  const result: VoucherExpirySweepResult = {
    ok: failures.length === 0,
    trigger,
    scanned,
    expired,
    releasedAmount,
    batches,
    failures,
  }

  if (failures.length > 0) {
    crmError(
      'merchant-voucher-expiry',
      'sweep completed with failures',
      new Error(
        failures
          .slice(0, 5)
          .map((f) => `${f.couponId}: ${f.error}`)
          .join(' | '),
      ),
      { trigger, scanned, expired, releasedAmount, failureCount: failures.length },
    )
  } else if (expired > 0) {
    crmLog('merchant-voucher-expiry', 'sweep done', {
      trigger,
      scanned,
      expired,
      releasedAmount,
      batches,
    })
  }

  return result
}
