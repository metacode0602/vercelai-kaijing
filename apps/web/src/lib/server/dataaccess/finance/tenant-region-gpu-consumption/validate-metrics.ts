export type TenantRegionGpuMetrics = {
  baseValue: string
  totalConsumption: string
  voucherConsumption: string
  balanceConsumption: string
  totalCardHours: string
  voucherCardHours: string
  balanceCardHours: string
}

const MONEY_TOLERANCE = 0.02
const HOURS_TOLERANCE = 0.02

export function validateTenantRegionGpuMetrics(input: {
  totalConsumption: string | number
  voucherConsumption?: string | number | null
  balanceConsumption: string | number
  totalCardHours: string | number
  voucherCardHours?: string | number | null
  balanceCardHours: string | number
}): string | null {
  const voucher = Number(input.voucherConsumption ?? 0)
  const balance = Number(input.balanceConsumption)
  const total = Number(input.totalConsumption)
  const voucherHours = Number(input.voucherCardHours ?? 0)
  const balanceHours = Number(input.balanceCardHours)
  const totalHours = Number(input.totalCardHours)

  if (voucher < 0 || balance < 0) return '券消费或余额消费不能为负'
  if (voucherHours < 0 || balanceHours < 0) return '券卡时或余额卡时不能为负'
  if (Math.abs(total - voucher - balance) > MONEY_TOLERANCE) {
    return '总消费与券消费+余额消费不一致'
  }
  if (Math.abs(totalHours - voucherHours - balanceHours) > HOURS_TOLERANCE) {
    return '总卡时与券卡时+余额卡时不一致'
  }
  return null
}

export function metricsFromRow(row: {
  baseValue?: string | null
  totalConsumption: string
  voucherConsumption: string
  balanceConsumption: string
  totalCardHours: string
  voucherCardHours: string
  balanceCardHours: string
}): TenantRegionGpuMetrics {
  return {
    baseValue: row.baseValue ?? '0',
    totalConsumption: row.totalConsumption,
    voucherConsumption: row.voucherConsumption,
    balanceConsumption: row.balanceConsumption,
    totalCardHours: row.totalCardHours,
    voucherCardHours: row.voucherCardHours,
    balanceCardHours: row.balanceCardHours,
  }
}

function num(value: string): number {
  return Number(value)
}

export function metricsMatch(a: TenantRegionGpuMetrics, b: TenantRegionGpuMetrics): boolean {
  return (
    Math.abs(num(a.baseValue) - num(b.baseValue)) <= MONEY_TOLERANCE &&
    Math.abs(num(a.totalConsumption) - num(b.totalConsumption)) <= MONEY_TOLERANCE &&
    Math.abs(num(a.voucherConsumption) - num(b.voucherConsumption)) <= MONEY_TOLERANCE &&
    Math.abs(num(a.balanceConsumption) - num(b.balanceConsumption)) <= MONEY_TOLERANCE &&
    Math.abs(num(a.totalCardHours) - num(b.totalCardHours)) <= HOURS_TOLERANCE &&
    Math.abs(num(a.voucherCardHours) - num(b.voucherCardHours)) <= HOURS_TOLERANCE &&
    Math.abs(num(a.balanceCardHours) - num(b.balanceCardHours)) <= HOURS_TOLERANCE
  )
}

export function subtractMetrics(
  monthly: TenantRegionGpuMetrics,
  daily: TenantRegionGpuMetrics,
): TenantRegionGpuMetrics {
  return {
    baseValue: (num(monthly.baseValue) - num(daily.baseValue)).toFixed(4),
    totalConsumption: (num(monthly.totalConsumption) - num(daily.totalConsumption)).toFixed(4),
    voucherConsumption: (num(monthly.voucherConsumption) - num(daily.voucherConsumption)).toFixed(4),
    balanceConsumption: (num(monthly.balanceConsumption) - num(daily.balanceConsumption)).toFixed(4),
    totalCardHours: (num(monthly.totalCardHours) - num(daily.totalCardHours)).toFixed(4),
    voucherCardHours: (num(monthly.voucherCardHours) - num(daily.voucherCardHours)).toFixed(4),
    balanceCardHours: (num(monthly.balanceCardHours) - num(daily.balanceCardHours)).toFixed(4),
  }
}
