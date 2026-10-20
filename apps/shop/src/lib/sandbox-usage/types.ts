export type UsageMinuteDayGroupBy = "minute" | "day"

export type UsageHourDayGroupBy = "hour" | "day"

export interface SandboxUsageKpi {
  vcpuHoursToday: number
  ramHoursToday: number
  storageUsedGb: number
  storageFreeQuotaGb: number
  runningSandboxes: number
  costTodayUsd: number
}

export interface SandboxUsageTemplateOption {
  value: string
  label: string
}

export interface UsageChartPoint {
  timestamp: string
  value: number
}

export interface SandboxUsageTimeSeries {
  vcpuHours: UsageChartPoint[]
  ramHours: UsageChartPoint[]
  runningSandboxes: UsageChartPoint[]
  storageGb: UsageChartPoint[]
  costUsd: UsageChartPoint[]
}

export interface SandboxUsagePageData {
  kpi: SandboxUsageKpi
  templates: SandboxUsageTemplateOption[]
  timeSeries: SandboxUsageTimeSeries
}

export interface UsageDateRange {
  startDate: Date
  endDate: Date
}

export interface ComputeUsageChartFilters {
  dateRange: UsageDateRange
  groupBy: UsageMinuteDayGroupBy
  templateId: string
}

export interface StorageUsageChartFilters {
  dateRange: UsageDateRange
  groupBy: UsageHourDayGroupBy
}

export interface CostUsageChartFilters {
  templateId: string
}
