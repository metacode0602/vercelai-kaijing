import cron from 'node-cron'
import { crmError, crmLog } from '@/lib/server/dataaccess/crm/logger'
import {
  getMerchantVoucherExpiryCron,
  getMerchantVoucherExpiryTimezone,
  isMerchantVoucherExpiryEnabled,
} from '@/lib/server/dataaccess/merchant/voucher-expiry-config'
import { sweepExpiredMerchantCoupons } from '@/lib/server/dataaccess/merchant/voucher-expiry-sweep'

let registered = false

/**
 * 注册商户算力券过期回收调度（P1-12）。
 *
 * 回收本身在 `sweepExpiredMerchantCoupons()` 里做；这里只负责「什么时候跑」，
 * 并且**永不让异常逃出 cron**：一张券回收失败不应该影响下一次调度，
 * 失败明细由 sweep 内部 crmError 落日志。
 */
export function registerMerchantVoucherExpiryCron(): void {
  if (registered) return

  if (!isMerchantVoucherExpiryEnabled()) {
    crmLog('merchant-voucher-expiry', 'disabled (MERCHANT_VOUCHER_EXPIRY_ENABLED=false)')
    registered = true
    return
  }

  const expression = getMerchantVoucherExpiryCron()
  const timezone = getMerchantVoucherExpiryTimezone()

  if (!cron.validate(expression)) {
    crmError(
      'merchant-voucher-expiry',
      'invalid cron',
      new Error(expression),
      { expression, timezone },
    )
    registered = true
    return
  }

  cron.schedule(
    expression,
    () => {
      void sweepExpiredMerchantCoupons('scheduled').catch((error) => {
        crmError('merchant-voucher-expiry', 'sweep threw', error)
      })
    },
    { timezone },
  )

  crmLog('merchant-voucher-expiry', 'registered', { expression, timezone })
  registered = true
}
