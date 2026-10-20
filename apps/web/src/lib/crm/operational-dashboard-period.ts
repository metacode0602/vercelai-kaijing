import { formatShanghaiDate } from '@/lib/crm/balance-snapshot-utils'
import {
  addShanghaiDays,
  daysInclusive,
  enumerateShanghaiDates,
  normalizeDateRange,
  resolveWorkbenchPresetRange,
  shanghaiDateRangeToUtcBounds,
} from '@/lib/crm/workbench-date-range'
import type { BillingPeriodDateRange } from '@/lib/finance/internal-tenant-income-exclusion'

export type OperationalPeriodPreset = 'last7days' | 'thisMonth' | 'customMonth'

export type OperationalPeriod = {
  preset: OperationalPeriodPreset
  customMonth: string
  startDate: string
  endDate: string
  monthsInRange: string[]
  periodRange: BillingPeriodDateRange
}

export type OperationalComparePeriod = {
  startDate: string
  endDate: string
  monthsInRange: string[]
}

function parseDateParts(dateStr: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateStr.split('-').map(Number)
  return { year: year!, month: month!, day: day! }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function enumerateMonthsInRange(startDate: string, endDate: string): string[] {
  const { startDate: from, endDate: to } = normalizeDateRange(startDate, endDate)
  const start = parseDateParts(from)
  const end = parseDateParts(to)
  const months: string[] = []
  let year = start.year
  let month = start.month
  while (year < end.year || (year === end.year && month <= end.month)) {
    months.push(`${year}-${pad2(month)}`)
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return months
}

function resolveCustomMonthRange(customMonth: string, now = new Date()): {
  startDate: string
  endDate: string
} {
  const [yearStr, monthStr] = customMonth.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const today = formatShanghaiDate(now)
  const monthStart = `${yearStr}-${monthStr}-01`
  const monthEndDay = lastDayOfMonth(year, month)
  const monthEnd = `${yearStr}-${monthStr}-${pad2(monthEndDay)}`
  const endDate = monthEnd < today ? monthEnd : today
  return { startDate: monthStart, endDate }
}

export function resolveOperationalPeriod(
  preset: OperationalPeriodPreset,
  customMonth: string,
  now = new Date(),
): OperationalPeriod {
  let startDate: string
  let endDate: string

  if (preset === 'customMonth') {
    ;({ startDate, endDate } = resolveCustomMonthRange(customMonth, now))
  } else {
    ;({ startDate, endDate } = resolveWorkbenchPresetRange(preset, now))
  }

  const monthsInRange = enumerateMonthsInRange(startDate, endDate)
  return {
    preset,
    customMonth,
    startDate,
    endDate,
    monthsInRange,
    periodRange: { periodStart: startDate, periodEnd: endDate },
  }
}

export function resolveOperationalComparePeriod(
  period: OperationalPeriod,
  now = new Date(),
): OperationalComparePeriod {
  const { preset, startDate, endDate, customMonth } = period

  if (preset === 'customMonth') {
    const [yearStr, monthStr] = customMonth.split('-')
    let year = Number(yearStr)
    let month = Number(monthStr) - 1
    if (month <= 0) {
      month = 12
      year -= 1
    }
    const compareStart = `${year}-${pad2(month)}-01`
    const compareEndDay = lastDayOfMonth(year, month)
    const compareEnd = `${year}-${pad2(month)}-${pad2(compareEndDay)}`
    return {
      startDate: compareStart,
      endDate: compareEnd,
      monthsInRange: [`${year}-${pad2(month)}`],
    }
  }

  if (preset === 'thisMonth') {
    const { year, month, day } = parseDateParts(endDate)
    let prevYear = year
    let prevMonth = month - 1
    if (prevMonth <= 0) {
      prevMonth = 12
      prevYear -= 1
    }
    const compareEndDay = Math.min(day, lastDayOfMonth(prevYear, prevMonth))
    const compareStart = `${prevYear}-${pad2(prevMonth)}-01`
    const compareEnd = `${prevYear}-${pad2(prevMonth)}-${pad2(compareEndDay)}`
    return {
      startDate: compareStart,
      endDate: compareEnd,
      monthsInRange: enumerateMonthsInRange(compareStart, compareEnd),
    }
  }

  const compareStart = addShanghaiDays(startDate, -7)
  const compareEnd = addShanghaiDays(startDate, -1)
  return {
    startDate: compareStart,
    endDate: compareEnd,
    monthsInRange: enumerateMonthsInRange(compareStart, compareEnd),
  }
}

export function getOperationalPeriodLabel(preset: OperationalPeriodPreset, customMonth: string): string {
  if (preset === 'last7days') return '近 7 天'
  if (preset === 'thisMonth') return '本月'
  return customMonth
}

export function isFunnelAvailable(preset: OperationalPeriodPreset): boolean {
  return preset !== 'last7days'
}

export function resolveIsPreviewData(
  preset: OperationalPeriodPreset,
  customMonth: string,
  isBillingPeriodPublished: boolean,
): boolean {
  if (preset === 'last7days' || preset === 'thisMonth') return true
  return !isBillingPeriodPublished
}

export { enumerateShanghaiDates, shanghaiDateRangeToUtcBounds, daysInclusive }
