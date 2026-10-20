import cron from 'node-cron'
import { crmError, crmLog } from '@/lib/server/dataaccess/crm/logger'
import { generateMonthlyRecon, runReconPreflight } from '@/lib/server/dataaccess/recon'

let registered = false

function yesterdayShanghai(): { date: string; month: string } {
  const sh = new Date(Date.now() + 8 * 3600_000)
  sh.setUTCDate(sh.getUTCDate() - 1)
  const y = sh.getUTCFullYear()
  const m = String(sh.getUTCMonth() + 1).padStart(2, '0')
  const d = String(sh.getUTCDate()).padStart(2, '0')
  return { date: `${y}-${m}-${d}`, month: `${y}-${m}` }
}

export function registerMerchantReconCron(): void {
  if (registered) return
  registered = true

  // 日终 T+1 自动跑（设计 §5.6 规则 2）。排在 rollup(03:00) 之后，
  // 避免与商户日报争抢同一批计量数据。
  const expression = process.env.MERCHANT_RECON_CRON?.trim() || '40 3 * * *'

  if (!cron.validate(expression)) {
    crmError('merchant-recon-cron', 'invalid cron', new Error(expression))
    return
  }

  cron.schedule(
    expression,
    () => {
      const { date, month } = yesterdayShanghai()
      void (async () => {
        await runReconPreflight()
        await generateMonthlyRecon(month)
      })().catch((error) => {
        crmError('merchant-recon-cron', 'run failed', error, { date, month })
      })
    },
    { timezone: 'Asia/Shanghai' },
  )

  crmLog('merchant-recon-cron', 'registered', { expression })
}
