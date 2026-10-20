import {
  parsePlatformDateTime,
  platformMetalOrderListAmountToMoneyString,
  platformMetalOrderListAmountToRmb,
} from '@/lib/crm/tenant-billing-import-utils'
import { db } from '@/lib/db'
import {
  fetchPlatformMetalOrderDetails,
  fetchPlatformMetalOrderDevice,
  type PlatformMetalOrderDetailItem,
  type PlatformMetalOrderRecord,
} from '@/lib/server/integrations/suanli-billing-api'
import { getTenantMerchantId } from '@/lib/server/dataaccess/merchant/merchant-resolve'
import { crmWarn } from '@/lib/server/dataaccess/crm/logger'
import {
  loadCostMasterDataContext,
  resolveDataCenterForBareMetal,
  resolveGpuCardType,
} from '@/lib/server/dataaccess/finance/cost-master-data'
import {
  bareMetalOrder,
  bareMetalOrderDevice,
  billingTenant,
  dataCenter,
  supplier,
} from '@workspace/db/schema'
import { eq, inArray } from 'drizzle-orm'
import {
  mapPlatformMetalOrderDetailPaymentAmounts,
} from '@/lib/supplier/bare-metal-order-utils'
import { BareMetalOrderSyncError } from './bare-metal-order-sync-errors-codes'

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

function toMoney(n: number): string {
  return n.toFixed(4)
}

function parsePlatformDate(raw: string | undefined): Date {
  if (!raw?.trim()) return new Date()
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? new Date() : d
}

export function mapPlatformBillingUnit(raw: string | undefined): string {
  const v = (raw ?? '').toLowerCase()
  if (v.includes('day')) return 'day'
  if (v.includes('week')) return 'week'
  if (v.includes('month')) return 'month'
  return 'hour'
}

export function mapPlatformOrderStatus(raw: string | undefined): string {
  const v = (raw ?? '').toLowerCase()
  if (v.includes('cancel') && v.includes('refund')) return 'refunded'
  if (v.includes('cancel')) return 'cancelled'
  if (v.includes('finish') || v.includes('complete')) return 'completed'
  if (v.includes('wait')) return 'provisioning'
  if (v.includes('active') || v.includes('running')) return 'active'
  if (v.includes('process') || v.includes('provision')) return 'provisioning'
  if (v.includes('paid')) return 'paid'
  if (v.includes('pending')) return 'pending'
  return 'paid'
}

type TenantRef = {
  tenantId: string
  platformTenantId: string
  customerId: string | null
}

function computeHeadGpuCount(record: PlatformMetalOrderRecord): number {
  const models = record.gpu_models ?? []
  if (models.length === 0) return 0
  return models.reduce((sum, model) => sum + (Number(model.gpu_count ?? 0) || 0), 0)
}

const PAYMENT_SPLIT_EPSILON = 0.0001

export function mapPlatformMetalOrderPaymentAmounts(record: PlatformMetalOrderRecord): {
  orderAmount: string
  finalAmount: string
  couponAmount: string
  balanceAmount: string
  matchFlags: Record<string, unknown>
} {
  const legacyFallback = record.old_total_price == null
  const oldTotal = record.old_total_price ?? record.total_price
  const discountedTotal = record.total_price
  const couponRaw = record.discount_price ?? 0
  const balanceRaw = discountedTotal - couponRaw

  const matchFlags: Record<string, unknown> = {}
  if (legacyFallback) matchFlags.amount_legacy_fallback = true

  const finalRmb = platformMetalOrderListAmountToRmb(discountedTotal)
  const couponRmb = platformMetalOrderListAmountToRmb(couponRaw)
  const balanceRmb = platformMetalOrderListAmountToRmb(balanceRaw)
  if (Math.abs(balanceRmb + couponRmb - finalRmb) > PAYMENT_SPLIT_EPSILON) {
    matchFlags.payment_split_mismatch = true
  }
  if (record.old_total_price != null && record.old_total_price < record.total_price) {
    matchFlags.old_total_less_than_total = true
  }

  return {
    orderAmount: platformMetalOrderListAmountToMoneyString(oldTotal),
    finalAmount: platformMetalOrderListAmountToMoneyString(discountedTotal),
    couponAmount: platformMetalOrderListAmountToMoneyString(couponRaw),
    balanceAmount: platformMetalOrderListAmountToMoneyString(balanceRaw),
    matchFlags,
  }
}

function computeDurationHours(rentStartsAt: Date | null, rentEndsAt: Date | null): string | null {
  if (!rentStartsAt || !rentEndsAt) return null
  const hours = (rentEndsAt.getTime() - rentStartsAt.getTime()) / 3_600_000
  if (!Number.isFinite(hours) || hours <= 0) return null
  return toMoney(hours)
}

function computeUnitPricePerCardHour(
  lineAmount: string | null,
  durationHours: string | null,
  gpuCount: number,
): string | null {
  if (!lineAmount || !durationHours || gpuCount <= 0) return null
  const amountNum = Number(lineAmount)
  const hoursNum = Number(durationHours)
  const denom = hoursNum * gpuCount
  if (!Number.isFinite(amountNum) || !Number.isFinite(hoursNum) || denom <= 0) return null
  return toMoney(amountNum / denom)
}

function resolveRentRange(input: {
  detailStart: string | null | undefined
  detailEnd: string | null | undefined
  deviceStart: string | null | undefined
  deviceEnd: string | null | undefined
}): { rentStartsAt: Date | null; rentEndsAt: Date | null } {
  const deviceStart = input.deviceStart ? parsePlatformDateTime(input.deviceStart) : null
  const deviceEnd = input.deviceEnd ? parsePlatformDateTime(input.deviceEnd) : null
  const detailStart = input.detailStart ? parsePlatformDateTime(input.detailStart) : null
  const detailEnd = input.detailEnd ? parsePlatformDateTime(input.detailEnd) : null
  return {
    rentStartsAt: deviceStart ?? detailStart,
    rentEndsAt: deviceEnd ?? detailEnd,
  }
}

async function loadTenantByPlatformId(platformTenantId: string): Promise<TenantRef | null> {
  const rows = await db
    .select({
      tenantId: billingTenant.id,
      platformTenantId: billingTenant.platformTenantId,
      customerId: billingTenant.customerId,
    })
    .from(billingTenant)
    .where(eq(billingTenant.platformTenantId, platformTenantId))
    .limit(1)
  const row = rows[0]
  if (!row?.platformTenantId) return null
  return {
    tenantId: row.tenantId,
    platformTenantId: row.platformTenantId,
    customerId: row.customerId,
  }
}

async function insertOrderDevices(input: {
  orderId: string
  record: PlatformMetalOrderRecord
  orderDetails: PlatformMetalOrderDetailItem[]
  traceId?: string
}): Promise<{
  rentStarts: Date[]
  rentEnds: Date[]
  partialFailure: boolean
  devicePaymentSum: {
    finalAmount: number
    platformCouponAmount: number
    platformBalanceAmount: number
    confirmedCouponAmount: number
    confirmedBalanceAmount: number
  }
  deviceRevenuePendingCount: number
}> {
  const master = await loadCostMasterDataContext()
  const rentStarts: Date[] = []
  const rentEnds: Date[] = []
  let partialFailure = false
  let deviceRevenuePendingCount = 0
  const devicePaymentSum = {
    finalAmount: 0,
    platformCouponAmount: 0,
    platformBalanceAmount: 0,
    confirmedCouponAmount: 0,
    confirmedBalanceAmount: 0,
  }

  const platformDeviceIds = input.orderDetails.map((d) => String(d.order_detail_id))
  if (platformDeviceIds.length > 0) {
    await db
      .delete(bareMetalOrderDevice)
      .where(inArray(bareMetalOrderDevice.platformDeviceId, platformDeviceIds))
  }

  const deviceRows = []

  for (let index = 0; index < input.orderDetails.length; index++) {
    const detail = input.orderDetails[index]!
    const lineNo = index + 1

    let deviceData
    try {
      deviceData = await fetchPlatformMetalOrderDevice({
        orderDetailId: detail.order_detail_id,
        traceId: input.traceId,
      })
    } catch (e) {
      partialFailure = true
      crmWarn('bare-metal-order-sync', 'device fetch failed', {
        traceId: input.traceId,
        orderId: input.orderId,
        orderDetailId: detail.order_detail_id,
        error: e instanceof Error ? e.message : String(e),
      })
      throw new BareMetalOrderSyncError(
        `设备 ${detail.order_detail_id} 拉取失败: ${e instanceof Error ? e.message : '未知错误'}`,
        'DEVICE_FETCH_FAILED',
      )
    }

    const { rentStartsAt, rentEndsAt } = resolveRentRange({
      detailStart: detail.start_time,
      detailEnd: detail.end_time,
      deviceStart: deviceData.start_time,
      deviceEnd: deviceData.end_time,
    })

    const { payment, matchFlags: paymentMatchFlags } = mapPlatformMetalOrderDetailPaymentAmounts(
      detail,
      rentStartsAt,
    )
    if (payment.revenuePending) deviceRevenuePendingCount += 1

    devicePaymentSum.finalAmount += platformMetalOrderListAmountToRmb(detail.total_price ?? 0)
    devicePaymentSum.platformCouponAmount += Number(payment.platformCouponAmount)
    devicePaymentSum.platformBalanceAmount += Number(payment.platformBalanceAmount)
    devicePaymentSum.confirmedCouponAmount += Number(payment.couponAmount)
    devicePaymentSum.confirmedBalanceAmount += Number(payment.balanceAmount)

    const lineAmount = payment.finalAmount
    const detailGpuCount = detail.gpu_count ?? 0
    const gpuCount = deviceData.gpu_count ?? detailGpuCount
    const durationHours = computeDurationHours(rentStartsAt, rentEndsAt)
    const unitPricePerCardHour = computeUnitPricePerCardHour(lineAmount, durationHours, gpuCount)

    const deviceModelText =
      deviceData.gpu_model ?? (detail.gpu_model != null ? String(detail.gpu_model) : null)
    const card =
      deviceModelText != null
        ? resolveGpuCardType(master, deviceModelText.split(/\s+/)[0] ?? deviceModelText)
        : null

    const matchFlags: Record<string, unknown> = { ...paymentMatchFlags }
    if (
      deviceData.gpu_count != null &&
      detail.gpu_count != null &&
      deviceData.gpu_count !== detail.gpu_count
    ) {
      matchFlags.gpu_count_mismatch = true
    }

    deviceRows.push({
      id: newId('bmord-dev'),
      bareMetalOrderId: input.orderId,
      lineNo,
      allocationStatus: 'planned' as const,
      gpuCardTypeId: card?.id ?? null,
      deviceModelText,
      gpuCount: gpuCount > 0 ? gpuCount : detailGpuCount,
      platformDeviceId: String(detail.order_detail_id),
      deviceStatus: detail.order_detail_status ?? detail.status ?? null,
      externalIp: deviceData.pub_ip ?? null,
      internalIp: deviceData.inner_ip ?? null,
      lineAmount,
      durationHours,
      unitPricePerCardHour,
      rentStartsAt,
      rentEndsAt,
      platformPayload: {
        details: detail,
        device: deviceData,
        payment,
      },
      matchFlags,
    })

    if (rentStartsAt) rentStarts.push(rentStartsAt)
    if (rentEndsAt) rentEnds.push(rentEndsAt)
  }

  if (deviceRows.length > 0) {
    await db.insert(bareMetalOrderDevice).values(deviceRows)
  }

  return { rentStarts, rentEnds, partialFailure, devicePaymentSum, deviceRevenuePendingCount }
}

export async function upsertPlatformBareMetalOrder(input: {
  record: PlatformMetalOrderRecord
  tenant: TenantRef
  traceId?: string
  /** 新建时写入；更新时仅当已有 project_id 为空才回填，cron 同步不传此字段 */
  projectId?: string | null
}): Promise<{ orderId: string; created: boolean }> {
  const { record, tenant } = input

  try {
    const master = await loadCostMasterDataContext()
    const platformOrderId = String(record.order_id)
    const orderedAt = parsePlatformDate(record.create_time)
    const dc = record.idc_name ? resolveDataCenterForBareMetal(master, record.idc_name) : null

    let supplierId: string | null = null
    if (dc) {
      const sup = await db
        .select({ id: supplier.id })
        .from(dataCenter)
        .innerJoin(supplier, eq(supplier.id, dataCenter.supplierId))
        .where(eq(dataCenter.id, dc.id))
        .limit(1)
      supplierId = sup[0]?.id ?? null
    }

    const deviceCount = Math.max(0, record.device_count ?? 0)
    const gpuCount = computeHeadGpuCount(record)
    const paymentAmounts = mapPlatformMetalOrderPaymentAmounts(record)
    const matchFlags: Record<string, unknown> = { ...paymentAmounts.matchFlags }
    if (record.idc_name && !dc) matchFlags.idc_unmatched = true

    const resolvedProjectId = input.projectId ?? null
    const merchantId = await getTenantMerchantId(tenant.tenantId)

    const headValues = {
      platformOrderId,
      orderNo: record.order_no,
      orderMark: 'online' as const,
      tenantId: tenant.tenantId,
      merchantId,
      platformTenantId: tenant.platformTenantId,
      customerId: tenant.customerId,
      projectId: resolvedProjectId,
      dataCenterId: dc?.id ?? null,
      supplierId,
      idcCode: dc?.code ?? null,
      idcName: record.idc_name ?? null,
      status: mapPlatformOrderStatus(record.status),
      payStatus: 'paid' as const,
      billingUnit: mapPlatformBillingUnit(record.billing_type),
      purchaseQty: record.buy_count ?? null,
      purchaseQtyText: null,
      deviceCount,
      gpuCount,
      orderAmount: paymentAmounts.orderAmount,
      refundAmount: platformMetalOrderListAmountToMoneyString(record.cancel_total_price ?? 0),
      finalAmount: paymentAmounts.finalAmount,
      balanceAmount: paymentAmounts.balanceAmount,
      couponAmount: paymentAmounts.couponAmount,
      orderedAt,
      paidAt: orderedAt,
      source: 'platform_sync' as const,
      platformPayload: record as unknown as Record<string, unknown>,
      matchFlags,
    }

    const existing = await db
      .select({ id: bareMetalOrder.id, projectId: bareMetalOrder.projectId })
      .from(bareMetalOrder)
      .where(eq(bareMetalOrder.platformOrderId, platformOrderId))
      .limit(1)

    let orderId: string
    let created = false

    if (existing[0]) {
      orderId = existing[0].id
      const { projectId: _omitProjectId, ...updateValues } = headValues
      await db.update(bareMetalOrder).set(updateValues).where(eq(bareMetalOrder.id, orderId))
      if (!existing[0].projectId && resolvedProjectId) {
        await db
          .update(bareMetalOrder)
          .set({ projectId: resolvedProjectId })
          .where(eq(bareMetalOrder.id, orderId))
      }
      await db.delete(bareMetalOrderDevice).where(eq(bareMetalOrderDevice.bareMetalOrderId, orderId))
    } else {
      orderId = newId('bmord')
      created = true
      await db
        .insert(bareMetalOrder)
        .values({ id: orderId, ...headValues, importedAt: new Date() })
    }

    let detailsRecord
    try {
      detailsRecord = await fetchPlatformMetalOrderDetails({
        orderId: record.order_id,
        traceId: input.traceId,
      })
    } catch (e) {
      throw new BareMetalOrderSyncError(
        e instanceof Error ? e.message : '订单详情拉取失败',
        'DETAILS_FETCH_FAILED',
      )
    }

    const orderDetails = detailsRecord.order_details ?? []
    if (orderDetails.length === 0) {
      throw new BareMetalOrderSyncError('订单详情无明细行', 'DETAILS_FETCH_FAILED')
    }

    if (deviceCount > 0 && orderDetails.length !== deviceCount) {
      matchFlags.detail_count_mismatch = true
    }

    const platformPayload = {
      ...(record as unknown as Record<string, unknown>),
      details_snapshot: detailsRecord,
    }
    await db
      .update(bareMetalOrder)
      .set({ platformPayload, matchFlags })
      .where(eq(bareMetalOrder.id, orderId))

    const { rentStarts, rentEnds, partialFailure, devicePaymentSum, deviceRevenuePendingCount } =
      await insertOrderDevices({
      orderId,
      record,
      orderDetails,
      traceId: input.traceId,
    })

    const headFinalRmb = platformMetalOrderListAmountToRmb(record.total_price)
    const headCouponRmb = platformMetalOrderListAmountToRmb(record.discount_price ?? 0)
    const headBalanceRmb = headFinalRmb - headCouponRmb
    if (Math.abs(devicePaymentSum.finalAmount - headFinalRmb) > PAYMENT_SPLIT_EPSILON) {
      matchFlags.device_payment_sum_mismatch = true
    }
    if (
      deviceRevenuePendingCount < orderDetails.length &&
      (Math.abs(devicePaymentSum.platformCouponAmount - headCouponRmb) > PAYMENT_SPLIT_EPSILON ||
        Math.abs(devicePaymentSum.platformBalanceAmount - headBalanceRmb) > PAYMENT_SPLIT_EPSILON)
    ) {
      matchFlags.device_platform_payment_sum_mismatch = true
    }
    if (deviceRevenuePendingCount > 0) {
      matchFlags.device_revenue_pending_count = deviceRevenuePendingCount
    }

    const headUpdate: {
      rentStartsAt?: Date
      rentEndsAt?: Date
      matchFlags?: Record<string, unknown>
    } = {}

    if (rentStarts.length > 0) {
      headUpdate.rentStartsAt = new Date(Math.min(...rentStarts.map((d) => d.getTime())))
    }
    if (rentEnds.length > 0) {
      headUpdate.rentEndsAt = new Date(Math.max(...rentEnds.map((d) => d.getTime())))
    }

    if (partialFailure || matchFlags.detail_count_mismatch) {
      headUpdate.matchFlags = {
        ...matchFlags,
        ...(partialFailure ? { device_enrich_partial: true } : {}),
      }
    }

    if (Object.keys(headUpdate).length > 0) {
      await db.update(bareMetalOrder).set(headUpdate).where(eq(bareMetalOrder.id, orderId))
    }

    return { orderId, created }
  } catch (e) {
    if (e instanceof BareMetalOrderSyncError) throw e
    throw new BareMetalOrderSyncError(
      e instanceof Error ? e.message : '裸金属订单 upsert 失败',
      'UPSERT_FAILED',
    )
  }
}

export async function resolveTenantForPlatformOrder(
  platformTenantId: string,
): Promise<TenantRef | null> {
  return loadTenantByPlatformId(platformTenantId)
}

export { toMoney, newId as newBareMetalId }
