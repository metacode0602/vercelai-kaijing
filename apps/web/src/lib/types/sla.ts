/** SLA 前端 / API 共用类型（无 Mock） */

export type SlaCardTypeMonthlyRow = {
  gpuCardTypeId: string
  gpuCardTypeCode: string
  gpuCardTypeName: string
  contractCardHours: number
  totalSupplyCardHours: number
  onboardingLossCardHours: number
  supplyAvailabilityRate: number | null
  faultSlaRate: number | null
  slaMet: boolean | null
  newFaultCount: number
  carryoverFaultCountEnd: number
  closedFaultCount: number
  newFaultDeviceCount: number
  carryoverFaultDeviceCountEnd: number
  externalFaultCardHours: number
  internalFaultCardHours: number
  actualUsageCardHours: number
  idleCardHours: number
  idleRateAvg: number | null
  wasteCardHours: number
  wasteRateAvg: number | null
  internalUsageCardHours: number
  onboardingLossEventCount: number
  compensationAmountTotal: number
  exemptIncidentCount: number
}

export type SlaDailyTrendPoint = {
  statDate: string
  label: string
  faultSlaRate: number | null
  newFaultCount: number
  externalFaultCardHours: number
}

export type SlaDeviceMonthlyRow = {
  deviceId: string
  deviceSn: string
  deviceAssetNo: string
  gpuCardTypeName: string
  supplyCardHours: number
  faultCardHours: number
  faultSlaRate: number
  slaMet: boolean
  serviceFee: number
  compensationTier: number
  compensationAmount: number
}

export type SlaReportImpactScope = '全平台' | '单台设备'

export type SlaReportIncidentRow = {
  id: string
  groupId: string
  recordedAt: string
  resolvedAt: string
  faultType: string
  impactMinutes: number
  impactScope: SlaReportImpactScope
  affectedDeviceCount: number
  review: string
  instanceAvailability: number | null
  compensationTier: number | null
  serviceFee: number | null
  compensationAmount: number | null
  compensationNote?: string
  isGroupHead: boolean
  groupRowSpan: number
}

export type SlaMonthlyReport = {
  dataCenterId: string
  dataCenterName: string
  supplierName: string
  slaMonth: string
  incidents: SlaReportIncidentRow[]
  totalCompensation: number
  summaryFaultSlaRate: number | null
  summarySupplyCardHours: number
  summaryFaultCardHours: number
}

export type SlaDatacenterMonthlyDetail = {
  dataCenterId: string
  dataCenterCode: string
  dataCenterName: string
  supplierId: string
  supplierName: string
  location: string
  slaMonth: string
  contractCardHours: number
  totalSupplyCardHours: number
  totalSupplyMachineHours: number
  onboardingLossCardHours: number
  supplyAvailabilityRate: number | null
  faultSlaRate: number | null
  slaMet: boolean | null
  newFaultCount: number
  carryoverFaultCountEnd: number
  closedFaultCount: number
  newFaultDeviceCount: number
  carryoverFaultDeviceCountEnd: number
  externalFaultCardHours: number
  internalFaultCardHours: number
  actualUsageCardHours: number
  idleCardHours: number
  idleRateAvg: number | null
  wasteCardHours: number
  wasteRateAvg: number | null
  internalUsageCardHours: number
  onboardingLossEventCount: number
  platformOfflineIncidentCount: number
  platformOnlineIncidentCount: number
  compensationAmountTotal: number
  exemptIncidentCount: number
  cardTypes: SlaCardTypeMonthlyRow[]
  dailyTrend: SlaDailyTrendPoint[]
  devices: SlaDeviceMonthlyRow[]
  rollupAt: string | null
  hasRollup: boolean
}

export type SlaDatacenterOverviewRow = {
  dataCenterId: string
  dataCenterCode: string
  dataCenterName: string
  supplierId: string
  supplierName: string
  location: string
  faultSlaRate: number | null
  slaMet: boolean | null
  newFaultCount: number
  newFaultDeviceCount: number
  carryoverFaultCountEnd: number
  carryoverFaultDeviceCountEnd: number
  contractCardHours: number
  totalSupplyCardHours: number
  hasRollup: boolean
}

export type SlaCompensationRow = {
  id: string
  slaMonth: string
  dataCenterId: string
  groupKey: string
  serviceFee: number | null
  compensationTier: number | null
  compensationAmount: number | null
  compensationNote: string | null
  updatedAt: string
}

export const SLA_SYNC_KINDS = [
  'platform_offline_baremetal',
  'platform_online_incident',
  'platform_internal_usage',
  'supplier_capacity_contract',
] as const

export type SlaSyncKind = (typeof SLA_SYNC_KINDS)[number]

export const SLA_SYNC_KIND_LABELS: Record<SlaSyncKind, string> = {
  platform_offline_baremetal: '线下裸金属交付故障',
  platform_online_incident: '线上故障',
  platform_internal_usage: '内部使用',
  supplier_capacity_contract: '供应商产能合同',
}

export function currentSlaMonth(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export function listRecentSlaMonths(count = 12, now = new Date()): string[] {
  const months: string[] = []
  const d = new Date(now.getFullYear(), now.getMonth(), 1)
  for (let i = 0; i < count; i++) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    months.push(`${y}-${m}`)
    d.setMonth(d.getMonth() - 1)
  }
  return months
}

export function formatSlaMonthOption(value: string): { value: string; label: string } {
  const [y, m] = value.split('-')
  return { value, label: `${y} 年 ${Number(m)} 月` }
}
