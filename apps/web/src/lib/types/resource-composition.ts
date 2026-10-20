/** 资源构成聚合载荷 — 由 supplier.overview 与已下线的大盘共享 */

export type ResourceCompositionDisplayUnit = 'gpu_cards' | 'card_hours'

export type ResourceCompositionSliceKind = 'entity' | 'pipeline_virtual'

export type GlobalResourceCompositionBreakdown = {
  cardType: string
  gpuCount: number
  deviceCount: number
  cardHours?: number
  machineHours?: number
}

export type GlobalResourceCompositionSlice = {
  key: string
  label: string
  kind: ResourceCompositionSliceKind
  gpuCount: number
  deviceCount: number
  cardHours?: number
  machineHours?: number
  netChangeLabel?: string
  breakdownByCardType?: GlobalResourceCompositionBreakdown[]
}

export type GlobalResourceCompositionDenominator = {
  gpuCount: number
  deviceCount: number
  cardHours?: number
  machineHours?: number
}

export type GlobalResourceCompositionPayload = {
  displayUnit: ResourceCompositionDisplayUnit
  denominator: GlobalResourceCompositionDenominator
  slices: GlobalResourceCompositionSlice[]
  centerPrimary: string
  centerSecondary?: string
  footnote: string
  /** 主数据快照缺失时用当前态恒定回填 */
  approximate?: boolean
}

export type GlobalDashboardFilters = {
  region?: string
  cardType?: string
  dataCenterId?: string
  supplierId?: string
}
