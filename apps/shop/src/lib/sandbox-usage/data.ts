import type {
  ComputeUsageChartFilters,
  CostUsageChartFilters,
  SandboxUsageKpi,
  SandboxUsagePageData,
  SandboxUsageTemplateOption,
  SandboxUsageTimeSeries,
  StorageUsageChartFilters,
  UsageChartPoint,
  UsageDateRange,
  UsageHourDayGroupBy,
  UsageMinuteDayGroupBy,
} from "./types"

export const SANDBOX_USAGE_ALL_TEMPLATE_VALUE = "all"

export const SANDBOX_USAGE_TEMPLATE_OPTIONS: SandboxUsageTemplateOption[] = [
  { value: SANDBOX_USAGE_ALL_TEMPLATE_VALUE, label: "全部" },
  { value: "kk065fn4aju6x2v0ghgk", label: "base" },
  { value: "ey23rva572ael79qxmtv", label: "code-interpreter-v1" },
  { value: "k5eovgvu6ae6sdpvu84m", label: "desktop" },
]

const MOCK_USAGE_RANGE_DAYS = 7

const TEMPLATE_USAGE_SCALE: Record<string, number> = {
  [SANDBOX_USAGE_ALL_TEMPLATE_VALUE]: 1,
  kk065fn4aju6x2v0ghgk: 0.42,
  ey23rva572ael79qxmtv: 0.35,
  k5eovgvu6ae6sdpvu84m: 0.23,
}

type AggregateMode = "sum" | "max" | "last"

function utcTodayRange(now = new Date()): UsageDateRange {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const day = now.getUTCDate()
  const startDate = new Date(Date.UTC(year, month, day))
  const endDate = new Date(Date.UTC(year, month, day))
  return { startDate, endDate }
}

function utcDayMs(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function eachUtcDay(range: UsageDateRange): Date[] {
  const days: Date[] = []
  for (
    let cursor = utcDayMs(range.startDate);
    cursor <= utcDayMs(range.endDate);
    cursor += 24 * 60 * 60 * 1000
  ) {
    days.push(new Date(cursor))
  }
  return days
}

function eachUtcHour(range: UsageDateRange): Date[] {
  const hours: Date[] = []
  const start = utcDayMs(range.startDate)
  const end = utcDayMs(range.endDate) + 24 * 60 * 60 * 1000 - 60 * 60 * 1000
  for (let cursor = start; cursor <= end; cursor += 60 * 60 * 1000) {
    hours.push(new Date(cursor))
  }
  return hours
}

function eachUtcMinute(range: UsageDateRange, intervalMinutes = 15): Date[] {
  const minutes: Date[] = []
  const start = utcDayMs(range.startDate)
  const end = utcDayMs(range.endDate) + 24 * 60 * 60 * 1000 - intervalMinutes * 60 * 1000
  for (
    let cursor = start;
    cursor <= end;
    cursor += intervalMinutes * 60 * 1000
  ) {
    minutes.push(new Date(cursor))
  }
  return minutes
}

function toIsoTimestamp(date: Date): string {
  return date.toISOString()
}

function buildZeroSeries(dates: Date[]): UsageChartPoint[] {
  return dates.map((date) => ({
    timestamp: toIsoTimestamp(date),
    value: 0,
  }))
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function usageActivityFactor(hour: number, dayIndex: number): number {
  const isPeakHour = hour >= 8 && hour <= 20
  const hourWave = isPeakHour ? 0.65 + Math.sin((hour - 8) / 12 * Math.PI) * 0.35 : 0.12
  const dayWave = 0.82 + (dayIndex % 5) * 0.05
  return hourWave * dayWave
}

function buildMockComputeSeries(now = new Date()): {
  vcpuHours: UsageChartPoint[]
  ramHours: UsageChartPoint[]
  runningSandboxes: UsageChartPoint[]
} {
  const endMs = utcDayMs(now) + 24 * 60 * 60 * 1000
  const startMs = endMs - MOCK_USAGE_RANGE_DAYS * 24 * 60 * 60 * 1000
  const intervalMs = 15 * 60 * 1000

  const vcpuHours: UsageChartPoint[] = []
  const ramHours: UsageChartPoint[] = []
  const runningSandboxes: UsageChartPoint[] = []

  for (let cursor = startMs; cursor < endMs; cursor += intervalMs) {
    const date = new Date(cursor)
    const hour = date.getUTCHours()
    const dayIndex = Math.floor((cursor - startMs) / (24 * 60 * 60 * 1000))
    const activity = usageActivityFactor(hour, dayIndex)

    const vcpu = round2(activity * 0.38)
    const ram = round2(vcpu * 3.2)
    const sandboxes = Math.max(0, Math.round(activity * 5))

    const timestamp = toIsoTimestamp(date)
    vcpuHours.push({ timestamp, value: vcpu })
    ramHours.push({ timestamp, value: ram })
    runningSandboxes.push({ timestamp, value: sandboxes })
  }

  return { vcpuHours, ramHours, runningSandboxes }
}

function buildMockStorageSeries(now = new Date()): UsageChartPoint[] {
  const endMs = utcDayMs(now) + 24 * 60 * 60 * 1000
  const startMs = endMs - MOCK_USAGE_RANGE_DAYS * 24 * 60 * 60 * 1000
  const intervalMs = 60 * 60 * 1000

  const points: UsageChartPoint[] = []
  let storageGb = 11.4

  for (let cursor = startMs; cursor < endMs; cursor += intervalMs) {
    const date = new Date(cursor)
    const hour = date.getUTCHours()
    const growth = hour >= 9 && hour <= 18 ? 0.08 : 0.02
    storageGb = round2(storageGb + growth + Math.sin(cursor / 1_000_000) * 0.03)
    points.push({ timestamp: toIsoTimestamp(date), value: storageGb })
  }

  return points
}

function buildMockCostSeries(now = new Date()): UsageChartPoint[] {
  const todayMs = utcDayMs(now)
  const startMs = todayMs - (MOCK_USAGE_RANGE_DAYS - 1) * 24 * 60 * 60 * 1000
  const dailyCosts = [3.2, 4.8, 2.6, 5.1, 3.9, 6.4, 4.2]

  return dailyCosts.map((cost, index) => ({
    timestamp: toIsoTimestamp(new Date(startMs + index * 24 * 60 * 60 * 1000)),
    value: cost,
  }))
}

function sumSeriesInRange(series: UsageChartPoint[], range: UsageDateRange): number {
  const start = utcDayMs(range.startDate)
  const end = utcDayMs(range.endDate) + 24 * 60 * 60 * 1000 - 1

  return round2(
    series
      .filter((point) => {
        const ts = new Date(point.timestamp).getTime()
        return ts >= start && ts <= end
      })
      .reduce((total, point) => total + point.value, 0),
  )
}

function maxSeriesInRange(series: UsageChartPoint[], range: UsageDateRange): number {
  const start = utcDayMs(range.startDate)
  const end = utcDayMs(range.endDate) + 24 * 60 * 60 * 1000 - 1

  const values = series
    .filter((point) => {
      const ts = new Date(point.timestamp).getTime()
      return ts >= start && ts <= end
    })
    .map((point) => point.value)

  return values.length > 0 ? Math.max(...values) : 0
}

function lastSeriesInRange(series: UsageChartPoint[], range: UsageDateRange): number {
  const start = utcDayMs(range.startDate)
  const end = utcDayMs(range.endDate) + 24 * 60 * 60 * 1000 - 1

  const values = series
    .filter((point) => {
      const ts = new Date(point.timestamp).getTime()
      return ts >= start && ts <= end
    })
    .map((point) => point.value)

  return values.length > 0 ? round2(values[values.length - 1]!) : 0
}

function buildMockKpi(timeSeries: SandboxUsageTimeSeries, now = new Date()): SandboxUsageKpi {
  const today = utcTodayRange(now)

  return {
    vcpuHoursToday: sumSeriesInRange(timeSeries.vcpuHours, today),
    ramHoursToday: sumSeriesInRange(timeSeries.ramHours, today),
    storageUsedGb: lastSeriesInRange(timeSeries.storageGb, today),
    storageFreeQuotaGb: 60,
    runningSandboxes: maxSeriesInRange(timeSeries.runningSandboxes, today),
    costTodayUsd: lastSeriesInRange(timeSeries.costUsd, today),
  }
}

function buildMockTimeSeries(now = new Date()): SandboxUsageTimeSeries {
  const compute = buildMockComputeSeries(now)

  return {
    vcpuHours: compute.vcpuHours,
    ramHours: compute.ramHours,
    runningSandboxes: compute.runningSandboxes,
    storageGb: buildMockStorageSeries(now),
    costUsd: buildMockCostSeries(now),
  }
}

function buildSandboxUsagePageData(now = new Date()): SandboxUsagePageData {
  const timeSeries = buildMockTimeSeries(now)
  return {
    kpi: buildMockKpi(timeSeries, now),
    templates: SANDBOX_USAGE_TEMPLATE_OPTIONS,
    timeSeries,
  }
}

/** 演示数据；接入 API 后替换为真实数据源 */
const MOCK_SANDBOX_USAGE_DATA: SandboxUsagePageData = buildSandboxUsagePageData()

export function getDefaultUsageDateRange(now = new Date()): UsageDateRange {
  return utcTodayRange(now)
}

export async function getSandboxUsagePageData(): Promise<SandboxUsagePageData> {
  return buildSandboxUsagePageData()
}

function bucketKey(date: Date, groupBy: "hour" | "day"): string {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()

  if (groupBy === "day") {
    return `${year}-${month}-${day}`
  }

  return `${year}-${month}-${day}-${date.getUTCHours()}`
}

function aggregateSeries(
  series: UsageChartPoint[],
  groupBy: UsageMinuteDayGroupBy | UsageHourDayGroupBy,
  range: UsageDateRange,
  mode: AggregateMode = "sum",
): UsageChartPoint[] {
  if (groupBy === "minute") {
    return filterSeriesByRange(series, range)
  }

  const bucketGroupBy = groupBy as "hour" | "day"
  const start = utcDayMs(range.startDate)
  const end = utcDayMs(range.endDate) + 24 * 60 * 60 * 1000 - 1

  const buckets = new Map<string, number>()

  for (const point of series) {
    const ts = new Date(point.timestamp).getTime()
    if (ts < start || ts > end) continue

    const key = bucketKey(new Date(point.timestamp), bucketGroupBy)
    const existing = buckets.get(key)

    if (existing === undefined) {
      buckets.set(key, point.value)
      continue
    }

    buckets.set(
      key,
      mode === "sum"
        ? existing + point.value
        : mode === "max"
          ? Math.max(existing, point.value)
          : point.value,
    )
  }

  const slots =
    bucketGroupBy === "hour" ? eachUtcHour(range) : eachUtcDay(range)

  return slots.map((slot) => ({
    timestamp: toIsoTimestamp(slot),
    value: round2(buckets.get(bucketKey(slot, bucketGroupBy)) ?? 0),
  }))
}

function filterSeriesByRange(
  series: UsageChartPoint[],
  range: UsageDateRange,
): UsageChartPoint[] {
  const start = utcDayMs(range.startDate)
  const end = utcDayMs(range.endDate) + 24 * 60 * 60 * 1000 - 1

  const filtered = series.filter((point) => {
    const ts = new Date(point.timestamp).getTime()
    return ts >= start && ts <= end
  })

  if (filtered.length > 0) return filtered
  return buildZeroSeries(eachUtcMinute(range))
}

function scaleSeries(series: UsageChartPoint[], scale: number): UsageChartPoint[] {
  if (scale === 1) return series

  return series.map((point) => ({
    ...point,
    value: round2(point.value * scale),
  }))
}

function getTemplateScale(templateId: string): number {
  return TEMPLATE_USAGE_SCALE[templateId] ?? 1
}

export function getComputeUsageChartData(
  timeSeries: SandboxUsageTimeSeries,
  filters: ComputeUsageChartFilters,
): {
  vcpuHours: UsageChartPoint[]
  ramHours: UsageChartPoint[]
  runningSandboxes: UsageChartPoint[]
} {
  const { dateRange, groupBy, templateId } = filters
  const scale = getTemplateScale(templateId)

  return {
    vcpuHours: scaleSeries(
      aggregateSeries(timeSeries.vcpuHours, groupBy, dateRange, "sum"),
      scale,
    ),
    ramHours: scaleSeries(
      aggregateSeries(timeSeries.ramHours, groupBy, dateRange, "sum"),
      scale,
    ),
    runningSandboxes: scaleSeries(
      aggregateSeries(timeSeries.runningSandboxes, groupBy, dateRange, "max"),
      scale,
    ),
  }
}

export function getStorageUsageChartData(
  timeSeries: SandboxUsageTimeSeries,
  filters: StorageUsageChartFilters,
): UsageChartPoint[] {
  return aggregateSeries(
    timeSeries.storageGb,
    filters.groupBy,
    filters.dateRange,
    "last",
  )
}

export function getCostUsageChartData(
  timeSeries: SandboxUsageTimeSeries,
  filters: CostUsageChartFilters,
): UsageChartPoint[] {
  const scale = getTemplateScale(filters.templateId)
  return scaleSeries(timeSeries.costUsd, scale)
}

export function formatUsageCurrency(amount: number): string {
  return `$${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
}

export function formatUsageStorageGb(amount: number): string {
  return amount.toFixed(2)
}

export function formatUsageHours(amount: number): string {
  return amount.toLocaleString("en-US", { maximumFractionDigits: 2 })
}
