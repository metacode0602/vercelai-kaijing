import cron from 'node-cron'
import { supplierError, supplierLog } from '@/lib/server/dataaccess/supplier/logger'
import {
  getFeishuBitableSyncCron,
  getFeishuBitableSyncTimezone,
  isFeishuBitableSyncEnabled,
} from '@/lib/server/jobs/feishu-bitable-sync/bitable-sync-config'

import { runAllEnabledSlaBitableSyncs } from '@/lib/server/jobs/feishu-bitable-sync/run-sla-bitable-sync'

let registered = false

export function registerFeishuBitableSyncCron(): void {
  if (registered) return
  if (!isFeishuBitableSyncEnabled()) {
    supplierLog('feishu-bitable-cron', 'disabled (FEISHU_BITABLE_SYNC_ENABLED != true)')
    return
  }

  const expression = getFeishuBitableSyncCron()
  if (!cron.validate(expression)) {
    supplierError(
      'feishu-bitable-cron',
      'invalid cron expression',
      new Error(expression),
      { expression },
    )
    return
  }

  const timezone = getFeishuBitableSyncTimezone()
  cron.schedule(
    expression,
    () => {
      void runAllEnabledSlaBitableSyncs({ trigger: 'scheduled' }).catch((error) => {
        supplierError('feishu-bitable-cron', 'scheduled sla bitable run failed', error)
      })
    },
    { timezone },
  )

  registered = true
  supplierLog('feishu-bitable-cron', 'registered', { expression, timezone })
}
