import { parseMoney } from '@/lib/finance/income-row-utils'

export const BARE_METAL_CARD_HOURS_TOLERANCE = 0.02
export const BARE_METAL_AMOUNT_TOLERANCE = 0.01

export type BareMetalAmortizationKey = {
  tenantPlatformId: string
  dataCenterId: string
  gpuCardTypeId: string
}

export type BareMetalAmortizationAggregate = {
  balanceCardHours: number
  voucherCardHours: number
  matchedDeviceCount: number
  missingRentDeviceCount: number
}

export type BareMetalOrderDeviceInput = {
  tenantPlatformId: string
  dataCenterId: string | null
  gpuCardTypeId: string | null
  payStatus: string
  finalAmount: string
  couponAmount: string
  rentStartsAt: Date | null
  rentEndsAt: Date | null
  durationHours: string | null
  gpuCount: number
}

function monthStartMs(usageMonth: string): number {
  return new Date(`${usageMonth}-01T00:00:00+08:00`).getTime()
}

function monthEndExclusiveMs(usageMonth: string): number {
  const [y, m] = usageMonth.split('-').map(Number)
  const nextMonth =
    m === 12 ? `${y! + 1}-01` : `${y}-${String(m! + 1).padStart(2, '0')}`
  return new Date(`${nextMonth}-01T00:00:00+08:00`).getTime()
}

export function overlapHoursInMonth(
  rentStart: Date,
  rentEnd: Date,
  usageMonth: string,
): number {
  const overlapStart = Math.max(rentStart.getTime(), monthStartMs(usageMonth))
  const overlapEnd = Math.min(rentEnd.getTime(), monthEndExclusiveMs(usageMonth))
  if (overlapEnd <= overlapStart) return 0
  return (overlapEnd - overlapStart) / 3_600_000
}

function resolveTotalHours(
  durationHours: string | null,
  rentStart: Date,
  rentEnd: Date,
): number {
  const fromDuration = parseMoney(durationHours)
  if (fromDuration > 0) return fromDuration
  const diffHours = (rentEnd.getTime() - rentStart.getTime()) / 3_600_000
  return diffHours > 0 ? diffHours : 0
}

export function amortizeBareMetalDevicesForMonth(input: {
  usageMonth: string
  devices: BareMetalOrderDeviceInput[]
  isPaid: (payStatus: string) => boolean
}): Map<string, BareMetalAmortizationAggregate> {
  const result = new Map<string, BareMetalAmortizationAggregate>()

  for (const device of input.devices) {
    if (!device.dataCenterId || !device.gpuCardTypeId) continue
    if (!input.isPaid(device.payStatus)) continue

    const key = `${device.tenantPlatformId}::${device.dataCenterId}::${device.gpuCardTypeId}`
    const acc = result.get(key) ?? {
      balanceCardHours: 0,
      voucherCardHours: 0,
      matchedDeviceCount: 0,
      missingRentDeviceCount: 0,
    }

    const rentStart = device.rentStartsAt
    const rentEnd = device.rentEndsAt
    if (!rentStart || !rentEnd || rentStart >= rentEnd) {
      acc.missingRentDeviceCount += 1
      result.set(key, acc)
      continue
    }

    const overlapHours = overlapHoursInMonth(rentStart, rentEnd, input.usageMonth)
    if (overlapHours <= 0) continue

    const totalHours = resolveTotalHours(device.durationHours, rentStart, rentEnd)
    if (totalHours <= 0 || device.gpuCount <= 0) continue

    const amortRatio = Math.min(1, overlapHours / totalHours)
    const effectiveHours = totalHours * amortRatio

    const finalAmount = parseMoney(device.finalAmount)
    const voucherRatio =
      finalAmount > 0
        ? Math.min(1, Math.max(0, parseMoney(device.couponAmount) / finalAmount))
        : 0

    const totalCardHours = device.gpuCount * effectiveHours
    acc.balanceCardHours += totalCardHours * (1 - voucherRatio)
    acc.voucherCardHours += totalCardHours * voucherRatio
    acc.matchedDeviceCount += 1
    result.set(key, acc)
  }

  return result
}

export function bareMetalAmortizationKey(input: BareMetalAmortizationKey): string {
  return `${input.tenantPlatformId}::${input.dataCenterId}::${input.gpuCardTypeId}`
}

export function formatBareMetalAmortizationRemark(input: {
  monthlyBalanceCardHours: number
  monthlyVoucherCardHours: number
  amortBalanceCardHours: number
  amortVoucherCardHours: number
  missingRentDeviceCount: number
}): string | null {
  const parts: string[] = []

  if (input.missingRentDeviceCount > 0) {
    parts.push(`订单缺少有效租期 ${input.missingRentDeviceCount} 条`)
  }

  const balanceDiff = Math.abs(input.monthlyBalanceCardHours - input.amortBalanceCardHours)
  const voucherDiff = Math.abs(input.monthlyVoucherCardHours - input.amortVoucherCardHours)
  if (
    balanceDiff > BARE_METAL_CARD_HOURS_TOLERANCE ||
    voucherDiff > BARE_METAL_CARD_HOURS_TOLERANCE
  ) {
    parts.push(
      `摊销偏差: 月表余额卡时=${input.monthlyBalanceCardHours.toFixed(2)}, 订单摊销=${input.amortBalanceCardHours.toFixed(2)}; 券卡时=${input.monthlyVoucherCardHours.toFixed(2)}/${input.amortVoucherCardHours.toFixed(2)}`,
    )
  }

  return parts.length > 0 ? parts.join('; ') : null
}
