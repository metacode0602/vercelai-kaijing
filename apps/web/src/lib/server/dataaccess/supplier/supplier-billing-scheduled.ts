import { crmError, crmLog } from '@/lib/server/dataaccess/crm/logger'
import {
  generateDailyBills,
  generateMonthlyBills,
  previousShanghaiDate,
  previousShanghaiMonth,
  type BillGenerationFailure,
} from '@/lib/server/dataaccess/supplier/supplier-bill-generation'

const LOG = 'supplier-billing-scheduled'

export type SupplierBillingTrigger = 'scheduled' | 'manual'

export type RunSupplierBillingInput = {
  trigger: SupplierBillingTrigger
  /** YYYY-MM-DD — defaults to previous Shanghai calendar day for daily */
  date?: string
  /** YYYY-MM — defaults to previous Shanghai calendar month for monthly */
  month?: string
  /** Which phases to run; default both for scheduled, both for manual unless narrowed */
  mode?: 'daily' | 'monthly' | 'both'
}

export type RunSupplierBillingResult = {
  /**
   * 仅当**所有**阶段都无失败时为 true。
   *
   * 出账按 (供应商, 机房) 逐个 try/catch，一个机房出错不阻断其余供应商 ——
   * 但失败必须冒泡。早期实现里 catch 只写日志就继续，函数照样返回成功，
   * 于是「定价缺失 / 阶梯未接入 / DB 报错」都表现为「本次运行成功，
   * 只是账单没生成」：cron 绿灯、无人告警、供应商没账单。W-13「缺价即中止」
   * 与 W-21「不一致即拒绝」的意图都被这个吞异常的 catch 抵消了。
   */
  ok: boolean
  trigger: SupplierBillingTrigger
  mode: 'daily' | 'monthly' | 'both'
  daily?: { date: string; billsCreated: number; failed: number }
  monthly?: { month: string; billsCreated: number; failed: number }
  /** 逐条失败明细（供应商 × 机房 × 月份 + 原因），供告警与排障 */
  failures?: BillGenerationFailure[]
  error?: string
}

function parseDateOnly(raw: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error(`Invalid date: ${raw}`)
  }
  return new Date(`${raw}T12:00:00+08:00`)
}

export async function runScheduledSupplierBilling(
  input: RunSupplierBillingInput,
): Promise<RunSupplierBillingResult> {
  const mode = input.mode ?? 'both'
  crmLog(LOG, 'run start', { trigger: input.trigger, mode, date: input.date, month: input.month })

  try {
    const result: RunSupplierBillingResult = {
      ok: true,
      trigger: input.trigger,
      mode,
    }
    const failures: BillGenerationFailure[] = []

    if (mode === 'daily' || mode === 'both') {
      const usageDate = input.date ? parseDateOnly(input.date) : previousShanghaiDate()
      const dateStr = usageDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
      const { billsCreated, failures: dailyFailures } = await generateDailyBills(usageDate)
      result.daily = {
        date: dateStr,
        billsCreated,
        failed: dailyFailures.length,
      }
      failures.push(...dailyFailures)
    }

    if (mode === 'monthly' || mode === 'both') {
      const billMonth = input.month ?? previousShanghaiMonth()
      const { billsCreated, failures: monthlyFailures } = await generateMonthlyBills(billMonth)
      result.monthly = {
        month: billMonth,
        billsCreated,
        failed: monthlyFailures.length,
      }
      failures.push(...monthlyFailures)
    }

    if (failures.length > 0) {
      result.ok = false
      result.failures = failures
      // 单独 error 级别：这是需要人介入的配置/数据问题，不是普通运行日志。
      crmError(
        LOG,
        `出账存在 ${failures.length} 个失败单元，本次运行标记为失败`,
        new Error(failures.map((f) => f.error).join(' | ')),
        { trigger: input.trigger, mode, failures },
      )
    }

    crmLog(LOG, 'run done', result)
    return result
  } catch (error) {
    crmError(LOG, 'run failed', error)
    return {
      ok: false,
      trigger: input.trigger,
      mode,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
