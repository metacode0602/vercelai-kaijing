export function formatReportMoney(value: number, fractionDigits = 2): string {
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
}

export function formatReportCount(value: number): string {
  return value.toLocaleString('zh-CN')
}

export function formatPercent(value: number | null, fractionDigits = 1): string {
  if (value == null || Number.isNaN(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(fractionDigits)}%`
}

export function formatRate(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `${value.toFixed(1)}%`
}

export function grossMargin(consumption: number, grossProfit: number): string {
  if (consumption <= 0) return '—'
  return `${((grossProfit / consumption) * 100).toFixed(1)}%`
}

export function avgPerCustomer(total: number, count: number): string {
  if (count <= 0) return '—'
  return formatReportMoney(total / count)
}
