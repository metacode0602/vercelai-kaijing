import {
  platformMetalOrderListAmountToMoneyString,
  platformMetalOrderListAmountToRmb,
} from '@/lib/crm/tenant-billing-import-utils'

export const BARE_METAL_ORDER_MARK_LABELS: Record<string, string> = {
  online: '线上',
  offline: '线下',
}

export const BARE_METAL_ORDER_SOURCE_LABELS: Record<string, string> = {
  platform_sync: '平台同步',
  offline_excel: '线下 Excel',
}

export const BARE_METAL_ORDER_STATUS_LABELS: Record<string, string> = {
  pending: '待处理',
  provisioning: '开通中',
  paid: '已支付',
  active: '进行中',
  completed: '已完成',
  cancelled: '已取消',
  refunded: '已退款',
}

export const BARE_METAL_BILLING_UNIT_LABELS: Record<string, string> = {
  hour: '小时',
  day: '天',
  week: '周',
  month: '月',
}

export function formatBareMetalPurchaseQty(input: {
  purchaseQty?: number | null
  billingUnit?: string | null
  purchaseQtyText?: string | null
}): string {
  const { purchaseQty, billingUnit, purchaseQtyText } = input
  if (purchaseQty != null && billingUnit) {
    const unitLabel = BARE_METAL_BILLING_UNIT_LABELS[billingUnit] ?? billingUnit
    return `${purchaseQty} ${unitLabel}`
  }
  if (purchaseQtyText?.trim()) return purchaseQtyText.trim()
  if (purchaseQty != null) return String(purchaseQty)
  if (billingUnit) return BARE_METAL_BILLING_UNIT_LABELS[billingUnit] ?? billingUnit
  return '—'
}

export function bareMetalOrderDetailPath(id: string) {
  return `/supplier/bare-metal-orders/${id}`
}

export function formatBareMetalMoney(value: string | number | null | undefined) {
  if (value == null || value === '') return '—'
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return String(value)
  return `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatBareMetalDateTime(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function parseMoneyAmount(value: string | number | null | undefined): number {
  if (value == null || value === '') return 0
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

/** 商业折扣金额 = 订单金额 − 折后应付 */
export function computeBareMetalDiscountAmount(input: {
  orderAmount: string | number | null | undefined
  finalAmount: string | number | null | undefined
}): number {
  const order = parseMoneyAmount(input.orderAmount)
  const final = parseMoneyAmount(input.finalAmount)
  if (order <= 0 && final <= 0) return 0
  const base = order > 0 ? order : final
  return Math.max(0, base - final)
}

/** 设备级支付快照（存于 bare_metal_order_device.platform_payload.payment） */
export type BareMetalDevicePaymentSnapshot = {
  orderAmount: string
  finalAmount: string
  /** 确收口径：Waiting / 无租期时为 0 */
  couponAmount: string
  /** 确收口径：Waiting / 无租期时为 0 */
  balanceAmount: string
  discountAmount: string
  actuallyTotalPrice: string
  cancelActuallyTotalPrice: string
  cancelDiscountTotalPrice: string
  revenuePending: boolean
  /** 平台原始算力券拆分（审计） */
  platformCouponAmount: string
  /** 平台原始余额拆分（审计） */
  platformBalanceAmount: string
}

export type PlatformMetalOrderDetailPaymentInput = {
  old_total_price?: number | null
  total_price?: number | null
  discount_price?: number | null
  actually_total_price?: number | null
  cancel_actually_total_price?: number | null
  cancel_discount_total_price?: number | null
  order_detail_status?: string | null
  status?: string | null
}

/** Waiting / 开通中 / 无租期开始时间 → 暂不确收 */
export function isBareMetalDeviceRevenuePending(input: {
  deviceStatus?: string | null
  rentStartsAt?: Date | string | null
}): boolean {
  const status = (input.deviceStatus ?? '').toLowerCase()
  if (status.includes('wait')) return true
  if (status.includes('provision')) return true
  const rentStart = input.rentStartsAt
  if (rentStart == null || rentStart === '') return true
  return false
}

/** 从 details.order_details[] 映射设备级支付拆分 */
export function mapPlatformMetalOrderDetailPaymentAmounts(
  detail: PlatformMetalOrderDetailPaymentInput,
  rentStartsAt: Date | null,
): { payment: BareMetalDevicePaymentSnapshot; matchFlags: Record<string, unknown> } {
  const matchFlags: Record<string, unknown> = {}
  const oldTotalRaw = detail.old_total_price ?? detail.total_price ?? 0
  const finalRaw = detail.total_price ?? 0
  const couponRaw = detail.discount_price ?? 0
  const balanceRaw = finalRaw - couponRaw

  const deviceStatus = detail.order_detail_status ?? detail.status ?? null
  const revenuePending = isBareMetalDeviceRevenuePending({ deviceStatus, rentStartsAt })

  const orderAmount = platformMetalOrderListAmountToMoneyString(oldTotalRaw)
  const finalAmount = platformMetalOrderListAmountToMoneyString(finalRaw)
  const platformCouponAmount = platformMetalOrderListAmountToMoneyString(couponRaw)
  const platformBalanceAmount = platformMetalOrderListAmountToMoneyString(balanceRaw)
  const discountAmount = platformMetalOrderListAmountToMoneyString(Math.max(0, oldTotalRaw - finalRaw))

  const finalRmb = platformMetalOrderListAmountToRmb(finalRaw)
  const couponRmb = platformMetalOrderListAmountToRmb(couponRaw)
  const balanceRmb = platformMetalOrderListAmountToRmb(balanceRaw)
  if (Math.abs(balanceRmb + couponRmb - finalRmb) > 0.0001) {
    matchFlags.payment_split_mismatch = true
  }
  if (detail.old_total_price != null && detail.old_total_price < finalRaw) {
    matchFlags.old_total_less_than_total = true
  }
  if (revenuePending) {
    matchFlags.revenue_pending = true
  }

  return {
    payment: {
      orderAmount,
      finalAmount,
      couponAmount: revenuePending ? '0.0000' : platformCouponAmount,
      balanceAmount: revenuePending ? '0.0000' : platformBalanceAmount,
      discountAmount,
      actuallyTotalPrice: platformMetalOrderListAmountToMoneyString(detail.actually_total_price ?? 0),
      cancelActuallyTotalPrice: platformMetalOrderListAmountToMoneyString(
        detail.cancel_actually_total_price ?? 0,
      ),
      cancelDiscountTotalPrice: platformMetalOrderListAmountToMoneyString(
        detail.cancel_discount_total_price ?? 0,
      ),
      revenuePending,
      platformCouponAmount,
      platformBalanceAmount,
    },
    matchFlags,
  }
}

/** 从 platform_payload.payment 读取设备级确收金额 */
export function extractBareMetalDevicePayment(
  platformPayload: unknown,
): BareMetalDevicePaymentSnapshot | null {
  if (platformPayload == null || typeof platformPayload !== 'object') return null
  const payment = (platformPayload as Record<string, unknown>).payment
  if (payment == null || typeof payment !== 'object') return null
  const p = payment as Record<string, unknown>
  const required = ['orderAmount', 'finalAmount', 'couponAmount', 'balanceAmount'] as const
  for (const key of required) {
    if (typeof p[key] !== 'string') return null
  }
  return {
    orderAmount: p.orderAmount as string,
    finalAmount: p.finalAmount as string,
    couponAmount: p.couponAmount as string,
    balanceAmount: p.balanceAmount as string,
    discountAmount: typeof p.discountAmount === 'string' ? p.discountAmount : '0.0000',
    actuallyTotalPrice:
      typeof p.actuallyTotalPrice === 'string' ? p.actuallyTotalPrice : '0.0000',
    cancelActuallyTotalPrice:
      typeof p.cancelActuallyTotalPrice === 'string' ? p.cancelActuallyTotalPrice : '0.0000',
    cancelDiscountTotalPrice:
      typeof p.cancelDiscountTotalPrice === 'string' ? p.cancelDiscountTotalPrice : '0.0000',
    revenuePending: p.revenuePending === true,
    platformCouponAmount:
      typeof p.platformCouponAmount === 'string' ? p.platformCouponAmount : (p.couponAmount as string),
    platformBalanceAmount:
      typeof p.platformBalanceAmount === 'string' ? p.platformBalanceAmount : (p.balanceAmount as string),
  }
}

/** 统计尚未确收或无有效租期的设备行数 */
export function countBareMetalDevicesAwaitingRevenue(
  devices: Array<{
    revenuePending?: boolean
    rentStartsAt?: string | null
    rentEndsAt?: string | null
  }>,
): number {
  return devices.filter(
    (d) =>
      d.revenuePending ||
      !d.rentStartsAt ||
      !d.rentEndsAt,
  ).length
}

/** 余额消费计算公式文案：实付 − 算力券 = 余额消费 */
export function formatBareMetalBalanceConsumptionFormula(input: {
  finalAmount: string | number | null | undefined
  couponAmount: string | number | null | undefined
  balanceAmount: string | number | null | undefined
}): string {
  const final = formatBareMetalMoney(input.finalAmount)
  const coupon = formatBareMetalMoney(input.couponAmount)
  const balance = formatBareMetalMoney(input.balanceAmount)
  return `实付 ${final} − 算力券 ${coupon} = 余额 ${balance}`
}

function toMoneyFixed4(value: number): string {
  return value.toFixed(4)
}

/** 按行金额占比分摊订单头 balance / coupon 至设备明细（明细表无独立列时） */
export function allocateBareMetalDevicePaymentAmounts(input: {
  devices: Array<{ lineAmount: string | null }>
  balanceAmount: string
  couponAmount: string
}): Array<{ balanceAmount: string; couponAmount: string }> {
  const balanceTotal = parseMoneyAmount(input.balanceAmount)
  const couponTotal = parseMoneyAmount(input.couponAmount)
  const lineAmounts = input.devices.map((d) => parseMoneyAmount(d.lineAmount))
  const lineSum = lineAmounts.reduce((sum, n) => sum + n, 0)
  const count = input.devices.length

  if (count === 0) return []

  if (lineSum <= 0) {
    const shareBalance = balanceTotal / count
    const shareCoupon = couponTotal / count
    return input.devices.map(() => ({
      balanceAmount: toMoneyFixed4(shareBalance),
      couponAmount: toMoneyFixed4(shareCoupon),
    }))
  }

  return lineAmounts.map((lineAmount) => {
    const ratio = lineAmount / lineSum
    return {
      balanceAmount: toMoneyFixed4(balanceTotal * ratio),
      couponAmount: toMoneyFixed4(couponTotal * ratio),
    }
  })
}
