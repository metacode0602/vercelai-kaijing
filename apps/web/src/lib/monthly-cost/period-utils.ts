/** 账期 period_code → usage_month（YYYY-MM） */
export function usageMonthFromPeriodCode(periodCode: string): string {
  const trimmed = periodCode.trim()
  if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed
  const compact = trimmed.replace(/-/g, '')
  if (/^\d{6}$/.test(compact)) {
    return `${compact.slice(0, 4)}-${compact.slice(4, 6)}`
  }
  throw new Error(`无法解析账期编码：${periodCode}`)
}

export function lastDayOfUsageMonth(usageMonth: string): string {
  const [y, m] = usageMonth.split('-').map(Number)
  const last = new Date(y!, m!, 0).getDate()
  return `${usageMonth}-${String(last).padStart(2, '0')}`
}
