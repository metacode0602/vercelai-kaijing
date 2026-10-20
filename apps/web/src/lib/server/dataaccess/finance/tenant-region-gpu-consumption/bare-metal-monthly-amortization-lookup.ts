import { parseMoney, toMoneyString } from '@/lib/finance/income-row-utils'
import { overlapHoursInMonth } from '@/lib/monthly-cost/bare-metal-monthly-amortization'
import { db } from '@/lib/db'
import { isBaremetalPayStatusPaid } from '@/lib/server/dataaccess/finance/baremetal-order-parse'
import { normalizeBillingRegion } from '@/lib/server/dataaccess/finance/tenant-bill-pricing'
import {
  loadCostMasterDataContext,
  resolveDataCenterForBareMetal,
  resolveGpuCardType,
  type CostMasterDataContext,
} from '@/lib/server/dataaccess/finance/cost-master-data'
import {
  bareMetalOrder,
  bareMetalOrderDevice,
  dataCenter,
  gpuCardType,
} from '@workspace/db/schema'
import { and, eq, gt, isNotNull, lt } from 'drizzle-orm'

const HOURS_EPS = 1e-6

export type BareMetalMonthlyOrderLineDto = {
  orderId: string
  orderNo: string | null
  platformOrderId: string | null
  deviceModelText: string | null
  gpuCount: number
  rentStartsAt: string
  rentEndsAt: string
  durationHours: string | null
  totalHours: number
  overlapHours: number
  amortRatio: number
  hasAmortization: boolean
  lineAmount: string
  finalAmount: string
  couponAmount: string
  idcName: string | null
  regionCode: string
  gpuModel: string
  preAmortBalanceConsumption: string
  preAmortBalanceCardHours: string
  amortBalanceConsumption: string
  amortBalanceCardHours: string
}

export type BareMetalMonthlyAmortizationBucket = {
  hasAmortization: boolean
  preAmortBalanceConsumption: number
  preAmortBalanceCardHours: number
  amortBalanceConsumption: number
  amortBalanceCardHours: number
  orderLines: BareMetalMonthlyOrderLineDto[]
}

function monthEndExclusiveDate(usageMonth: string): string {
  const [y, m] = usageMonth.split('-').map(Number)
  return m === 12
    ? `${y! + 1}-01-01`
    : `${y}-${String(m! + 1).padStart(2, '0')}-01`
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

function formatDeviceModel(cardCode: string, gpuCount: number): string {
  return `${cardCode} x ${gpuCount}`
}

function resolveDeviceCardCode(
  gpuCardTypeCode: string | null,
  deviceModelText: string | null,
): string | null {
  const code = gpuCardTypeCode?.trim()
  if (code) return code
  const text = deviceModelText?.trim()
  return text || null
}

function resolveRegionCode(input: {
  bareMetalRegion: string | null
  containerInstanceRegion: string | null
  idcCode: string | null
  idcName: string | null
}): string | null {
  const bare = input.bareMetalRegion?.trim()
  if (bare) return normalizeBillingRegion(bare)
  const idc = input.idcCode?.trim()
  if (idc) return normalizeBillingRegion(idc)
  const container = input.containerInstanceRegion?.trim()
  if (container) return normalizeBillingRegion(container)
  const name = input.idcName?.trim()
  if (name) return normalizeBillingRegion(name)
  return null
}

function resolveOrderDataCenter(
  ctx: CostMasterDataContext,
  input: {
    dataCenterId: string | null
    dataCenterName: string | null
    bareMetalRegion: string | null
    containerInstanceRegion: string | null
    idcCode: string | null
    idcName: string | null
  },
) {
  if (input.dataCenterId) {
    return {
      id: input.dataCenterId,
      name: input.dataCenterName ?? input.dataCenterId,
      bareMetalRegion: input.bareMetalRegion,
      containerInstanceRegion: input.containerInstanceRegion,
    }
  }

  for (const candidate of [input.idcName, input.idcCode]
    .map((v) => v?.trim() || null)
    .filter((v): v is string => Boolean(v))) {
    const hit = resolveDataCenterForBareMetal(ctx, candidate)
    if (hit) {
      return {
        id: hit.id,
        name: hit.name,
        bareMetalRegion: hit.bareMetalRegion,
        containerInstanceRegion: hit.containerInstanceRegion,
      }
    }
  }

  return null
}

function emptyBucket(): BareMetalMonthlyAmortizationBucket {
  return {
    hasAmortization: false,
    preAmortBalanceConsumption: 0,
    preAmortBalanceCardHours: 0,
    amortBalanceConsumption: 0,
    amortBalanceCardHours: 0,
    orderLines: [],
  }
}

export function bareMetalMonthlyKey(input: {
  tenantPlatformId: string
  regionCode: string
  gpuModel: string
}): string {
  return `${input.tenantPlatformId}::${input.regionCode}::${input.gpuModel}`
}

/**
 * 按结算月加载裸金属订单设备摊销明细，按「租户 × 区域 × GPU型号」聚合。
 * 键规则与月表导入 `buildBareMetalMonthlyImportRows` 一致。
 */
export async function loadBareMetalMonthlyAmortizationMap(
  usageMonth: string,
): Promise<Map<string, BareMetalMonthlyAmortizationBucket>> {
  const windowStart = new Date(`${usageMonth}-01T00:00:00+08:00`)
  const windowEndExclusive = new Date(`${monthEndExclusiveDate(usageMonth)}T00:00:00+08:00`)
  const masterCtx = await loadCostMasterDataContext()

  const deviceRows = await db
    .select({
      orderId: bareMetalOrder.id,
      platformTenantId: bareMetalOrder.platformTenantId,
      orderNo: bareMetalOrder.orderNo,
      platformOrderId: bareMetalOrder.platformOrderId,
      payStatus: bareMetalOrder.payStatus,
      finalAmount: bareMetalOrder.finalAmount,
      couponAmount: bareMetalOrder.couponAmount,
      idcCode: bareMetalOrder.idcCode,
      idcName: bareMetalOrder.idcName,
      dataCenterId: bareMetalOrder.dataCenterId,
      gpuCardTypeCode: gpuCardType.code,
      deviceModelText: bareMetalOrderDevice.deviceModelText,
      gpuCount: bareMetalOrderDevice.gpuCount,
      lineAmount: bareMetalOrderDevice.lineAmount,
      durationHours: bareMetalOrderDevice.durationHours,
      rentStartsAt: bareMetalOrderDevice.rentStartsAt,
      rentEndsAt: bareMetalOrderDevice.rentEndsAt,
      bareMetalRegion: dataCenter.bareMetalRegion,
      containerInstanceRegion: dataCenter.containerInstanceRegion,
      dataCenterName: dataCenter.name,
    })
    .from(bareMetalOrder)
    .innerJoin(
      bareMetalOrderDevice,
      eq(bareMetalOrderDevice.bareMetalOrderId, bareMetalOrder.id),
    )
    .leftJoin(dataCenter, eq(dataCenter.id, bareMetalOrder.dataCenterId))
    .leftJoin(gpuCardType, eq(gpuCardType.id, bareMetalOrderDevice.gpuCardTypeId))
    .where(
      and(
        isNotNull(bareMetalOrderDevice.rentStartsAt),
        isNotNull(bareMetalOrderDevice.rentEndsAt),
        lt(bareMetalOrderDevice.rentStartsAt, windowEndExclusive),
        gt(bareMetalOrderDevice.rentEndsAt, windowStart),
      ),
    )

  const map = new Map<string, BareMetalMonthlyAmortizationBucket>()

  for (const row of deviceRows) {
    if (!isBaremetalPayStatusPaid(row.payStatus)) continue

    const rentStart = row.rentStartsAt
    const rentEnd = row.rentEndsAt
    if (!rentStart || !rentEnd || rentStart >= rentEnd) continue

    const overlapHours = overlapHoursInMonth(rentStart, rentEnd, usageMonth)
    if (overlapHours <= 0) continue

    const cardCode = resolveDeviceCardCode(row.gpuCardTypeCode, row.deviceModelText)
    if (!cardCode || row.gpuCount <= 0) continue
    if (!resolveGpuCardType(masterCtx, cardCode)) continue

    const dc = resolveOrderDataCenter(masterCtx, {
      dataCenterId: row.dataCenterId,
      dataCenterName: row.dataCenterName,
      bareMetalRegion: row.bareMetalRegion,
      containerInstanceRegion: row.containerInstanceRegion,
      idcCode: row.idcCode,
      idcName: row.idcName,
    })
    if (!dc) continue

    const regionCode = resolveRegionCode({
      bareMetalRegion: dc.bareMetalRegion,
      containerInstanceRegion: dc.containerInstanceRegion,
      idcCode: row.idcCode,
      idcName: row.idcName,
    })
    if (!regionCode) continue

    const totalHours = resolveTotalHours(row.durationHours, rentStart, rentEnd)
    if (totalHours <= 0) continue

    const lineAmount = parseMoney(row.lineAmount)
    if (lineAmount <= 0) continue

    const finalAmount = parseMoney(row.finalAmount)
    const couponAmount = parseMoney(row.couponAmount)
    const voucherRatio =
      finalAmount > 0 ? Math.min(1, Math.max(0, couponAmount / finalAmount)) : 0

    const amortRatio = Math.min(1, overlapHours / totalHours)
    const hasAmortization = overlapHours + HOURS_EPS < totalHours

    const preAmortBalanceConsumption = lineAmount * (1 - voucherRatio)
    const preAmortBalanceCardHours = row.gpuCount * totalHours * (1 - voucherRatio)
    const amortBalanceConsumption = preAmortBalanceConsumption * amortRatio
    const amortBalanceCardHours = preAmortBalanceCardHours * amortRatio

    const gpuModel = formatDeviceModel(cardCode, row.gpuCount)
    const key = bareMetalMonthlyKey({
      tenantPlatformId: row.platformTenantId,
      regionCode,
      gpuModel,
    })
    const bucket = map.get(key) ?? emptyBucket()

    if (hasAmortization) bucket.hasAmortization = true
    bucket.preAmortBalanceConsumption += preAmortBalanceConsumption
    bucket.preAmortBalanceCardHours += preAmortBalanceCardHours
    bucket.amortBalanceConsumption += amortBalanceConsumption
    bucket.amortBalanceCardHours += amortBalanceCardHours
    bucket.orderLines.push({
      orderId: row.orderId,
      orderNo: row.orderNo,
      platformOrderId: row.platformOrderId,
      deviceModelText: row.deviceModelText,
      gpuCount: row.gpuCount,
      rentStartsAt: rentStart.toISOString(),
      rentEndsAt: rentEnd.toISOString(),
      durationHours: row.durationHours,
      totalHours,
      overlapHours,
      amortRatio,
      hasAmortization,
      lineAmount: toMoneyString(lineAmount),
      finalAmount: toMoneyString(finalAmount),
      couponAmount: toMoneyString(couponAmount),
      idcName: row.idcName,
      regionCode,
      gpuModel,
      preAmortBalanceConsumption: toMoneyString(preAmortBalanceConsumption),
      preAmortBalanceCardHours: toMoneyString(preAmortBalanceCardHours),
      amortBalanceConsumption: toMoneyString(amortBalanceConsumption),
      amortBalanceCardHours: toMoneyString(amortBalanceCardHours),
    })

    map.set(key, bucket)
  }

  for (const bucket of map.values()) {
    bucket.orderLines.sort((a, b) => {
      const aRef = a.orderNo ?? a.platformOrderId ?? a.orderId
      const bRef = b.orderNo ?? b.platformOrderId ?? b.orderId
      const byOrder = aRef.localeCompare(bRef)
      if (byOrder !== 0) return byOrder
      return a.rentStartsAt.localeCompare(b.rentStartsAt)
    })
  }

  return map
}
