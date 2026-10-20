import { parseMoney, toMoneyString } from '@/lib/finance/income-row-utils'
import { overlapHoursInMonth } from '@/lib/monthly-cost/bare-metal-monthly-amortization'
import { extractBareMetalDevicePayment } from '@/lib/supplier/bare-metal-order-utils'
import { db } from '@/lib/db'
import {
  isBaremetalPayStatusPaid,
} from '@/lib/server/dataaccess/finance/baremetal-order-parse'
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
import type { TenantRegionGpuConsumptionMonthlyRowInput } from './types'

type MonthMetrics = {
  totalConsumption: number
  voucherConsumption: number
  balanceConsumption: number
  totalCardHours: number
  voucherCardHours: number
  balanceCardHours: number
}

function emptyMetrics(): MonthMetrics {
  return {
    totalConsumption: 0,
    voucherConsumption: 0,
    balanceConsumption: 0,
    totalCardHours: 0,
    voucherCardHours: 0,
    balanceCardHours: 0,
  }
}

function monthEndExclusiveDate(usageMonth: string): string {
  const [y, m] = usageMonth.split('-').map(Number)
  const nextMonth =
    m === 12 ? `${y! + 1}-01-01` : `${y}-${String(m! + 1).padStart(2, '0')}-01`
  return nextMonth
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

function orderLabel(input: {
  orderNo: string | null
  platformOrderId: string | null
  platformTenantId: string
}): string {
  const orderRef = input.orderNo?.trim() || input.platformOrderId?.trim()
  if (orderRef) return `订单 ${orderRef}（租户 ${input.platformTenantId}）`
  return `租户 ${input.platformTenantId} 的裸金属订单`
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
  // 订单未绑机房时，允许用平台 idc_name 作为区域候选（常与裸金属区域同名）
  const name = input.idcName?.trim()
  if (name) return normalizeBillingRegion(name)
  return null
}

type ResolvedDataCenter = {
  id: string
  name: string
  bareMetalRegion: string | null
  containerInstanceRegion: string | null
}

/**
 * 解析订单对应机房：
 * 1) 已绑定 data_center_id → 用 join 结果
 * 2) 否则按 idc_name / idc_code 匹配：裸金属区域 / 机房 code / 机房名称（任一命中）
 */
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
): ResolvedDataCenter | null {
  if (input.dataCenterId) {
    return {
      id: input.dataCenterId,
      name: input.dataCenterName ?? input.dataCenterId,
      bareMetalRegion: input.bareMetalRegion,
      containerInstanceRegion: input.containerInstanceRegion,
    }
  }

  const candidates = [input.idcName, input.idcCode]
    .map((v) => v?.trim() || null)
    .filter((v): v is string => Boolean(v))

  for (const candidate of candidates) {
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

function resolveDeviceCardCode(
  gpuCardTypeCode: string | null,
  deviceModelText: string | null,
): string | null {
  const code = gpuCardTypeCode?.trim()
  if (code) return code
  const text = deviceModelText?.trim()
  return text || null
}

function addDeviceToAggregate(
  acc: MonthMetrics,
  input: {
    lineAmount: number
    finalAmount: number
    couponAmount: number
    overlapHours: number
    totalHours: number
    gpuCount: number
  },
) {
  if (input.overlapHours <= 0 || input.totalHours <= 0 || input.gpuCount <= 0) return

  const ratio = input.overlapHours / input.totalHours
  const amount = input.lineAmount * ratio
  const voucherRatio =
    input.finalAmount > 0
      ? Math.min(1, Math.max(0, input.couponAmount / input.finalAmount))
      : 0
  const voucherAmount = amount * voucherRatio
  const balanceAmount = amount - voucherAmount
  const cardHours = input.gpuCount * input.overlapHours
  const voucherCardHours = cardHours * voucherRatio
  const balanceCardHours = cardHours - voucherCardHours

  acc.totalConsumption += amount
  acc.voucherConsumption += voucherAmount
  acc.balanceConsumption += balanceAmount
  acc.totalCardHours += cardHours
  acc.voucherCardHours += voucherCardHours
  acc.balanceCardHours += balanceCardHours
}

export type BareMetalMonthlyImportBuildResult = {
  rows: TenantRegionGpuConsumptionMonthlyRowInput[]
  /** 硬错误：存在时须中断整次月度导入 */
  errors: string[]
}

/**
 * 按结算月从裸金属订单设备明细生成月表行（product_line = bare_metal）。
 * 同期判定：设备 rent_starts_at（平台 start_time）与 rent_ends_at 与结算月相交。
 * 区域未匹配机房、卡型无法解析等异常会写入 errors，调用方应中断导入。
 */
export async function buildBareMetalMonthlyImportRows(
  usageMonth: string,
): Promise<BareMetalMonthlyImportBuildResult> {
  const errors: string[] = []
  const errorKeys = new Set<string>()
  const pushError = (message: string) => {
    if (errorKeys.has(message)) return
    errorKeys.add(message)
    errors.push(message)
  }

  const windowStart = new Date(`${usageMonth}-01T00:00:00+08:00`)
  const windowEndExclusive = new Date(`${monthEndExclusiveDate(usageMonth)}T00:00:00+08:00`)
  const masterCtx = await loadCostMasterDataContext()

  const deviceRows = await db
    .select({
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
      platformPayload: bareMetalOrderDevice.platformPayload,
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

  const grouped = new Map<string, MonthMetrics>()

  for (const row of deviceRows) {
    if (!isBaremetalPayStatusPaid(row.payStatus)) continue

    const rentStart = row.rentStartsAt
    const rentEnd = row.rentEndsAt
    if (!rentStart || !rentEnd || rentStart >= rentEnd) continue

    const overlapHours = overlapHoursInMonth(rentStart, rentEnd, usageMonth)
    if (overlapHours <= 0) continue

    const label = orderLabel({
      orderNo: row.orderNo,
      platformOrderId: row.platformOrderId,
      platformTenantId: row.platformTenantId,
    })

    const cardCode = resolveDeviceCardCode(row.gpuCardTypeCode, row.deviceModelText)
    if (!cardCode || row.gpuCount <= 0) {
      pushError(
        `${label}：无法解析卡型（device_model=${row.deviceModelText ?? '空'}，gpu_count=${row.gpuCount}）。请补全订单设备卡型关联，或修正设备型号为「卡型 x 数量」格式后重新同步。`,
      )
      continue
    }

    if (!resolveGpuCardType(masterCtx, cardCode)) {
      pushError(
        `${label}：卡型「${cardCode}」未在 CRM 卡型主数据中找到。请在卡型管理中新增该卡型，或修正订单设备卡型后重试。`,
      )
      continue
    }

    const dc = resolveOrderDataCenter(masterCtx, {
      dataCenterId: row.dataCenterId,
      dataCenterName: row.dataCenterName,
      bareMetalRegion: row.bareMetalRegion,
      containerInstanceRegion: row.containerInstanceRegion,
      idcCode: row.idcCode,
      idcName: row.idcName,
    })
    if (!dc) {
      pushError(
        `${label}：无法匹配机房（idc_code=${row.idcCode ?? '空'}，idc_name=${row.idcName ?? '空'}，data_center_id=${row.dataCenterId ?? '空'}）。请确认机房主数据中存在 code / 名称 / 裸金属区域 任一等于「${row.idcName?.trim() || row.idcCode?.trim() || '（未知）'}」的机房；若机房是后补的，可重新同步该订单以回写机房绑定。`,
      )
      continue
    }

    const regionCode = resolveRegionCode({
      bareMetalRegion: dc.bareMetalRegion,
      containerInstanceRegion: dc.containerInstanceRegion,
      idcCode: row.idcCode,
      idcName: row.idcName,
    })
    if (!regionCode) {
      pushError(
        `${label}：机房「${dc.name}」缺少可解析区域（裸金属区域 / 容器区域 / idc_code / idc_name 均为空）。请在机房主数据填写「裸金属区域」后重试。`,
      )
      continue
    }

    const gpuModel = formatDeviceModel(cardCode, row.gpuCount)
    const groupKey = `${row.platformTenantId}::${regionCode}::${gpuModel}`
    const acc = grouped.get(groupKey) ?? emptyMetrics()

    const lineAmount = parseMoney(row.lineAmount)
    if (lineAmount <= 0) continue

    const totalHours = resolveTotalHours(row.durationHours, rentStart, rentEnd)
    if (totalHours <= 0) {
      pushError(
        `${label}：设备租期时长无效（duration_hours=${row.durationHours ?? '空'}，rent=${rentStart.toISOString()}~${rentEnd.toISOString()}）。请检查订单设备租期后重新同步。`,
      )
      continue
    }

    const devicePayment = extractBareMetalDevicePayment(row.platformPayload)
    const deviceFinalAmount = devicePayment
      ? parseMoney(devicePayment.finalAmount)
      : parseMoney(row.finalAmount)
    const deviceCouponAmount = devicePayment
      ? parseMoney(devicePayment.couponAmount)
      : parseMoney(row.couponAmount)

    addDeviceToAggregate(acc, {
      lineAmount,
      finalAmount: deviceFinalAmount > 0 ? deviceFinalAmount : lineAmount,
      couponAmount: deviceCouponAmount,
      overlapHours,
      totalHours,
      gpuCount: row.gpuCount,
    })
    grouped.set(groupKey, acc)
  }

  if (errors.length > 0) {
    return { rows: [], errors }
  }

  const rows: TenantRegionGpuConsumptionMonthlyRowInput[] = []
  for (const [key, metrics] of grouped) {
    const [tenantPlatformId, regionCode, gpuModel] = key.split('::')
    rows.push({
      tenantPlatformId: tenantPlatformId!,
      usageMonth,
      regionCode: regionCode!,
      gpuModel: gpuModel!,
      productLine: 'bare_metal',
      baseValue: null,
      totalConsumption: toMoneyString(metrics.totalConsumption),
      voucherConsumption: toMoneyString(metrics.voucherConsumption),
      balanceConsumption: toMoneyString(metrics.balanceConsumption),
      totalCardHours: toMoneyString(metrics.totalCardHours),
      voucherCardHours: toMoneyString(metrics.voucherCardHours),
      balanceCardHours: toMoneyString(metrics.balanceCardHours),
      source: 'backfill',
    })
  }

  rows.sort((a, b) =>
    `${a.tenantPlatformId}:${a.regionCode}:${a.gpuModel}`.localeCompare(
      `${b.tenantPlatformId}:${b.regionCode}:${b.gpuModel}`,
    ),
  )

  return { rows, errors: [] }
}
