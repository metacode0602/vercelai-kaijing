/** 仪表盘筛选窗口、币种与利润口径的纯函数（客户端/服务端共用）。 */
export type DashboardTrendRange = 7 | 30 | 90

export type DashboardFilterInput = {
  range?: DashboardTrendRange
  dateFrom?: string | null
  dateTo?: string | null
  platform?: string | null
  site?: string | null
  shopId?: string | null
}

export type DashboardWindow = {
  from: Date
  to: Date
  dateFrom: string
  dateTo: string
  dayCount: number
  range: DashboardTrendRange
}

export const CANONICAL_DEMO_ORG_ID = 'org_shop_dev_demo'
export const DEMO_ORG_SLUG = 'shop-dev-demo'

/** 与 finance.overview / 售后待办对齐的进行中逆向单状态。 */
export const REFUND_PENDING_PLATFORM_STATUSES = [
  'pending',
  'open',
  'PROCESSING',
  'REQUESTED',
  'WAIT_SELLER',
  'REVERSE_PENDING',
] as const

export const REFUND_PENDING_FULFILLMENT_STATUSES = [
  'pending',
  'open',
  'processing',
  'pending_review',
  'pending_qc',
] as const

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/

export function startOfLocalDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function dateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function isYmd(value: string): boolean {
  if (!YMD.test(value)) return false
  const match = value.match(YMD)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(year, month - 1, day)
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  )
}

export function parseYmdStart(value: string): Date {
  const match = value.match(YMD)
  if (!match) throw new Error(`invalid date ${value}`)
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0)
}

export function normalizeFilterToken(value?: string | null): string | undefined {
  const v = value?.trim()
  if (!v || v === 'all') return undefined
  return v
}

function nearestRange(dayCount: number): DashboardTrendRange {
  if (dayCount <= 7) return 7
  if (dayCount <= 30) return 30
  return 90
}

/** 解析筛选窗口：自定义日期优先（含首尾、最多 90 天）；否则近 range 天（含今天）。 */
export function resolveDashboardWindow(
  input: DashboardFilterInput = {},
  now = new Date(),
): DashboardWindow {
  const range: DashboardTrendRange = input.range === 30 || input.range === 90 ? input.range : 7
  const fromStr = input.dateFrom?.trim() ?? ''
  const toStr = input.dateTo?.trim() ?? ''
  if (fromStr && toStr && isYmd(fromStr) && isYmd(toStr)) {
    let from = parseYmdStart(fromStr)
    let toInclusive = parseYmdStart(toStr)
    if (toInclusive < from) {
      const swap = from
      from = toInclusive
      toInclusive = swap
    }
    const maxInclusive = addDays(from, 89)
    if (toInclusive > maxInclusive) toInclusive = maxInclusive
    const to = addDays(toInclusive, 1)
    const dayCount = Math.round((to.getTime() - from.getTime()) / 86_400_000)
    return {
      from,
      to,
      dateFrom: dateKey(from),
      dateTo: dateKey(toInclusive),
      dayCount,
      range: nearestRange(dayCount),
    }
  }
  const today = startOfLocalDay(now)
  const to = addDays(today, 1)
  const from = addDays(to, -range)
  return {
    from,
    to,
    dateFrom: dateKey(from),
    dateTo: dateKey(today),
    dayCount: range,
    range,
  }
}

export function defaultDateRange(
  now = new Date(),
  range: DashboardTrendRange = 7,
): { dateFrom: string; dateTo: string } {
  const window = resolveDashboardWindow({ range }, now)
  return { dateFrom: window.dateFrom, dateTo: window.dateTo }
}

export function isDemoOrganization(org: { id?: string | null; slug?: string | null }): boolean {
  return org.id === CANONICAL_DEMO_ORG_ID || org.slug === DEMO_ORG_SLUG
}

export function uniqueCurrencies(values: Array<string | null | undefined>): string[] {
  const set = new Set<string>()
  for (const value of values) {
    const c = value?.trim().toUpperCase()
    if (c) set.add(c)
  }
  return [...set].sort()
}

export function currencyModeOf(currencies: string[]): {
  currencyMode: 'single' | 'mixed' | 'empty'
  currency: string | null
  currencies: string[]
} {
  const list = uniqueCurrencies(currencies)
  if (list.length === 0) return { currencyMode: 'empty', currency: null, currencies: list }
  if (list.length === 1) return { currencyMode: 'single', currency: list[0]!, currencies: list }
  return { currencyMode: 'mixed', currency: null, currencies: list }
}

/** 毛利 = 收入 − 成本；净利 = 收入 − 成本 − 费用（与 finance.overview 同一公式）。 */
export function profitFromComponents(revenue: number, cost: number, fees: number) {
  const grossProfit = revenue - cost
  const netProfit = revenue - cost - fees
  const grossMargin = revenue > 0 ? Number(((grossProfit / revenue) * 100).toFixed(1)) : null
  const netMargin = revenue > 0 ? Number(((netProfit / revenue) * 100).toFixed(1)) : null
  return { grossProfit, netProfit, grossMargin, netMargin }
}

export function isRefundPendingStatus(
  platformStatus?: string | null,
  fulfillmentStatus?: string | null,
): boolean {
  const platform = (platformStatus ?? '').trim()
  const fulfillment = (fulfillmentStatus ?? '').trim()
  return (
    (REFUND_PENDING_PLATFORM_STATUSES as readonly string[]).includes(platform) ||
    (REFUND_PENDING_FULFILLMENT_STATUSES as readonly string[]).includes(fulfillment)
  )
}

function formatPlain(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export function formatAmount(
  value: number | null | undefined,
  currency: string | null | undefined,
  opts?: { compact?: boolean },
): string {
  if (value == null || !currency) return '跨币种暂不合计'
  const compact = opts?.compact ?? false
  if (compact) {
    if (Math.abs(value) >= 1_000_000) return `${currency} ${(value / 1_000_000).toFixed(2)}M`
    if (Math.abs(value) >= 1_000) return `${currency} ${Math.round(value / 1_000)}k`
  }
  return `${currency} ${formatPlain(value)}`
}


export function formatDashboardMoney(
  value: number | null | undefined,
  currency: string | null | undefined,
  currencyMode: 'single' | 'mixed' | 'empty',
  opts?: { compact?: boolean },
): string {
  if (currencyMode === 'mixed') return '跨币种暂不合计'
  if (value == null) return '—'
  if (!currency) return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
  return formatAmount(value, currency, opts)
}
