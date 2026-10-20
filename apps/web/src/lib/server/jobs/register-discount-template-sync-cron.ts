import cron from 'node-cron'
import {
  getDiscountTemplateSyncCron,
  getDiscountTemplateSyncTimezone,
  isDiscountTemplateSyncEnabled,
} from '@/lib/server/dataaccess/crm/discount-template-sync-config'
import { syncDiscountTemplates } from '@/lib/server/dataaccess/crm/discount-template-sync'
import { crmError, crmLog } from '@/lib/server/dataaccess/crm/logger'

let registered = false

export function registerDiscountTemplateSyncCron(): void {
  if (registered) return
  if (!isDiscountTemplateSyncEnabled()) {
    crmLog('discount-template-cron', 'disabled')
    return
  }

  const expression = getDiscountTemplateSyncCron()
  if (!cron.validate(expression)) {
    crmError('discount-template-cron', 'invalid cron expression', new Error(expression), {
      expression,
    })
    return
  }

  const timezone = getDiscountTemplateSyncTimezone()
  cron.schedule(
    expression,
    () => {
      void syncDiscountTemplates().catch((error) => {
        crmError('discount-template-cron', 'scheduled run failed', error)
      })
    },
    { timezone },
  )

  registered = true
  crmLog('discount-template-cron', 'registered', { expression, timezone })
}
