import cron from 'node-cron'
import { crmError, crmLog } from '@/lib/server/dataaccess/crm/logger'
import { runMerchantDailyPipeline } from '@/lib/server/jobs/merchant-rollup/run-merchant-rollup'

let registered = false

function yesterdayShanghai(): string {
  const now = new Date()
  // 近似东八区昨日：UTC+8
  const sh = new Date(now.getTime() + 8 * 3600_000)
  sh.setUTCDate(sh.getUTCDate() - 1)
  const y = sh.getUTCFullYear()
  const m = String(sh.getUTCMonth() + 1).padStart(2, '0')
  const d = String(sh.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function registerMerchantRollupCron(): void {
  if (registered) return
  registered = true
  
  // 每日 03:00 东八区跑昨日商户日报 + 当月月报 rollup
  const expression = process.env.MERCHANT_ROLLUP_CRON?.trim() || '0 3 * * *'
  
  if (!cron.validate(expression)) {
    crmError('merchant-rollup-cron', 'invalid cron', new Error(expression))
    return
  }
  
  cron.schedule(
    expression,
    () => {
      const statDate = yesterdayShanghai()
      void runMerchantDailyPipeline(statDate).catch((error) => {
        crmError('merchant-rollup-cron', 'pipeline failed', error, { statDate })
      })
    },
    { timezone: 'Asia/Shanghai' },
  )
  
  crmLog('merchant-rollup-cron', 'registered', { expression })
}
