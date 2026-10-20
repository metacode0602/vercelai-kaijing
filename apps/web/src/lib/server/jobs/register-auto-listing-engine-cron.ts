import cron from 'node-cron'
import { runAutoListingCron } from '@/lib/server/jobs/auto-listing-engine'

let registered = false

export function registerAutoListingEngineCron(): void {
  if (registered) return

  const cronExpression = '*/15 * * * *'
  const timezone = 'Asia/Shanghai'

  if (!cron.validate(cronExpression)) {
    console.error('[auto-listing-engine-cron] invalid cron expression:', cronExpression)
    return
  }

  cron.schedule(
    cronExpression,
    () => {
      void runAutoListingCron().catch((error) => {
        console.error('[auto-listing-engine-cron] run failed:', error)
      })
    },
    { timezone },
  )

  registered = true
  console.log('[auto-listing-engine-cron] registered', { cronExpression, timezone })
}
