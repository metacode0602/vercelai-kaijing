import cron from 'node-cron'
import { crmError, crmLog } from '@/lib/server/dataaccess/crm/logger'
import {
  getSupplierBillingDailyCron,
  getSupplierBillingMonthlyCron,
  getSupplierBillingTimezone,
  isSupplierBillingEnabled,
} from '@/lib/server/dataaccess/supplier/supplier-billing-config'
import {
  runScheduledSupplierBilling,
  type RunSupplierBillingResult,
} from '@/lib/server/dataaccess/supplier/supplier-billing-scheduled'
import { sweepOrphanedInvoiceAttachments } from '@/lib/server/dataaccess/supplier/invoice-attachment-gc'

let dailyRegistered = false
let monthlyRegistered = false
let attachmentGcRegistered = false

/**
 * cron 回调的统一结果处理。
 *
 * 关键：`runScheduledSupplierBilling` 内部已兜住异常、**永不 reject**，
 * 所以此前 `.catch(...)` 形同虚设 —— 哪怕出账全军覆没，cron 也什么都不记。
 * 必须显式检查 `result.ok`。
 *
 * 为什么要在 cron 层重复告警（generateXxxBills 已 crmError 过）：
 * 这两个函数逐 (供应商, 机房) try/catch，部分失败时其余供应商照常出账，
 * 是**期望行为**；但「本次运行有 N 个单元失败」必须在调度层留下一条
 * 独立的、可被告警系统采集的记录，而不是混在逐条业务日志里。
 */
function handleCronResult(phase: 'daily' | 'monthly', result: RunSupplierBillingResult): void {
  if (result.ok) return
  crmError(
    'supplier-billing-cron',
    `${phase} run completed with failures`,
    new Error(
      result.error ??
        (result.failures ?? [])
          .map((f) => `${f.supplierId}${f.dataCenterId ? `/${f.dataCenterId}` : ''}@${f.billMonth}: ${f.error}`)
          .join(' | ') ??
        'unknown failure',
    ),
    {
      phase,
      trigger: result.trigger,
      daily: result.daily,
      monthly: result.monthly,
      failureCount: result.failures?.length ?? 0,
    },
  )
}

export function registerSupplierBillingCron(): void {
  if (dailyRegistered && monthlyRegistered && attachmentGcRegistered) return

  if (!isSupplierBillingEnabled()) {
    crmLog('supplier-billing-cron', 'disabled (SUPPLIER_BILLING_ENABLED != true)')
    dailyRegistered = true
    monthlyRegistered = true
    attachmentGcRegistered = true
    return
  }

  const timezone = getSupplierBillingTimezone()

  if (!dailyRegistered) {
    const expression = getSupplierBillingDailyCron()
    if (!cron.validate(expression)) {
      crmError('supplier-billing-cron', 'invalid daily cron', new Error(expression), {
        expression,
      })
    } else {
      cron.schedule(
        expression,
        () => {
          void runScheduledSupplierBilling({ trigger: 'scheduled', mode: 'daily' })
            .then((result) => handleCronResult('daily', result))
            .catch((error) => {
              crmError('supplier-billing-cron', 'daily run threw', error)
            })
        },
        { timezone },
      )
      crmLog('supplier-billing-cron', 'daily registered', { expression, timezone })
    }
    dailyRegistered = true
  }

  if (!monthlyRegistered) {
    const expression = getSupplierBillingMonthlyCron()
    if (!cron.validate(expression)) {
      crmError('supplier-billing-cron', 'invalid monthly cron', new Error(expression), {
        expression,
      })
    } else {
      cron.schedule(
        expression,
        () => {
          void runScheduledSupplierBilling({ trigger: 'scheduled', mode: 'monthly' })
            .then((result) => handleCronResult('monthly', result))
            .catch((error) => {
              crmError('supplier-billing-cron', 'monthly run threw', error)
            })
        },
        { timezone },
      )
      crmLog('supplier-billing-cron', 'monthly registered', { expression, timezone })
    }
    monthlyRegistered = true
  }

  // 发票附件孤儿清理：与出账同频（每天一次），只删「超过保留期且未被任何
  // 发票引用」的上传文件。独立 try/catch —— 清理失败绝不能影响出账。
  if (!attachmentGcRegistered) {
    const expression = getSupplierBillingDailyCron()
    if (!cron.validate(expression)) {
      crmError('invoice-attachment-gc', 'invalid cron', new Error(expression), { expression })
    } else {
      cron.schedule(
        expression,
        () => {
          void sweepOrphanedInvoiceAttachments('scheduled').catch((error) => {
            crmError('invoice-attachment-gc', 'sweep threw', error)
          })
        },
        { timezone },
      )
      crmLog('invoice-attachment-gc', 'registered', { expression, timezone })
    }
    attachmentGcRegistered = true
  }
}
