import cron from 'node-cron'
import { supplierError, supplierLog } from '@/lib/server/dataaccess/supplier/logger'
import { runSlaDailyPipeline } from '@/lib/server/jobs/sla/run-sla-rollup'

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

export function registerSlaRollupCron(): void {
  if (registered) return
  registered = true
  // 每日 02:00 东八区跑昨日日切 + 当月月切
  const expression = process.env.SLA_ROLLUP_CRON?.trim() || '0 2 * * *'
  if (!cron.validate(expression)) {
    supplierError('sla-rollup-cron', 'invalid cron', new Error(expression))
    return
  }
  cron.schedule(
    expression,
    () => {
      const statDate = yesterdayShanghai()
      void runSlaDailyPipeline(statDate).catch((error) => {
        supplierError('sla-rollup-cron', 'pipeline failed', error, { statDate })
      })
    },
    { timezone: 'Asia/Shanghai' },
  )
  supplierLog('sla-rollup-cron', 'registered', { expression })
}
