/** SLA 展示格式化（静态页 / 后续 API 共用） */

/**
 * 合同 SLA（§8.3 / §8.8，统一供给口径）：
 * (供给卡时 − 故障卡时) / 供给卡时
 *
 * 供给可用率（§8.1）：
 * 供给卡时 / 合同卡时
 *
 * 闲置率 / 浪费率（§8.4）：
 * 闲置卡时 / 供给卡时 · 浪费卡时 / 供给卡时
 */
export function computeSlaRate(
  supplyCardHours: number,
  faultCardHours: number,
): number | null {
  if (supplyCardHours <= 0) return null
  return Math.max(0, (supplyCardHours - faultCardHours) / supplyCardHours)
}

/** @deprecated 使用 computeSlaRate */
export const computeFaultSlaRate = computeSlaRate

export function formatAvailabilityRate(rate: number | null | undefined): string {
  if (rate == null) return '—'
  return `${(rate * 100).toFixed(2)}%`
}

export function formatSlaPercent(rate: number | null | undefined): string {
  if (rate == null) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

export function formatCardHours(value: number | null | undefined): string {
  if (value == null) return '—'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
}

export function formatCount(value: number | null | undefined): string {
  if (value == null) return '—'
  return value.toLocaleString('zh-CN')
}

export function formatMoney(value: number | null | undefined): string {
  if (value == null) return '—'
  return `¥ ${value.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export function formatMoneyPrecise(value: number | null | undefined): string {
  if (value == null) return '—'
  return `¥ ${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatMonthLabel(slaMonth: string): string {
  const [year, month] = slaMonth.split('-')
  if (!year || !month) return slaMonth
  return `${year} 年 ${Number(month)} 月`
}

export function formatCompensationTier(rate: number | null | undefined): string {
  if (rate == null) return '—'
  return `${(rate * 100).toFixed(0)}%`
}

/** 合同约定单设备月度可用性目标 */
export const DEVICE_SLA_TARGET = 0.995

/** 机房/卡型 SLA 目标（与合同单设备目标默认一致） */
export const SLA_TARGET_AVAILABILITY = DEVICE_SLA_TARGET

/**
 * 赔偿梯度（合同约定阶梯）
 * ≥99.5% → 0；≥99% → 10%；≥95% → 25%；≥90% → 50%；&lt;90% → 100%
 */
export function getCompensationTier(slaRate: number): number {
  if (slaRate >= 0.995) return 0
  if (slaRate >= 0.99) return 0.1
  if (slaRate >= 0.95) return 0.25
  if (slaRate >= 0.9) return 0.5
  return 1
}

export const SLA_RATE_FORMULA_LABEL = '(供给卡时 − 故障卡时) / 供给卡时'
