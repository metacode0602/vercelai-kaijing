import type { TenantBillingImportCommitResult } from '@/lib/types/tenant-billing-import'

export function formatBillingCommitSummary(result: TenantBillingImportCommitResult): string {
  const parts: string[] = []
  const push = (label: string, s: { created?: number; updated?: number }) => {
    const created = s.created ?? 0
    const updated = s.updated ?? 0
    if (created + updated > 0) {
      parts.push(`${label} 新增 ${created} / 更新 ${updated}`)
    }
  }
  const pushUpserted = (label: string, s: { upserted: number }) => {
    if (s.upserted > 0) {
      parts.push(`${label} 写入 ${s.upserted}`)
    }
  }
  push('月度账单', result.monthlyBills)
  push('充值', result.recharges)
  push('算力券', result.coupons)
  pushUpserted('每日用量', result.dailyUsageBills)
  pushUpserted('每日任务明细', result.dailyConsumptionDetails)
  if ((result.billDetails.created ?? 0) + (result.billDetails.updated ?? 0) > 0) {
    parts.push(`账单明细 ${result.billDetails.created ?? 0} 行`)
  }
  return parts.join('；') || '无变更'
}

/** 租户账单同步 — 日期、金额、映射工具 */

/** billing_value / total_billing_value / discount_value — 10^6 平台单位 = 1 元 */
export const PLATFORM_BILLING_VALUE_DIVISOR = 1_000_000

/** total_price（裸金属，非 metal_order/list 等路径的历史口径）— 10^4 平台单位 = 1 元 */
export const PLATFORM_ORDER_AMOUNT_DIVISOR = 10_000

/** POST /admin/metal_order/list 的 total_price — 10^6 平台单位 = 1 元（如 643200000 → 643.20） */
export const PLATFORM_METAL_ORDER_LIST_AMOUNT_DIVISOR = 1_000_000

/** total_amount（充值）— 1 分 = 0.01 元 */
export const PLATFORM_RECHARGE_AMOUNT_DIVISOR = 100

/** @deprecated 请使用 PLATFORM_ORDER_AMOUNT_DIVISOR */
export const PLATFORM_AMOUNT_DIVISOR = PLATFORM_ORDER_AMOUNT_DIVISOR

export function platformBillingValueToRmb(raw: number | null | undefined): number {
  if (raw == null || Number.isNaN(raw)) return 0
  return raw / PLATFORM_BILLING_VALUE_DIVISOR
}

export function platformOrderAmountToRmb(raw: number | null | undefined): number {
  if (raw == null || Number.isNaN(raw)) return 0
  return raw / PLATFORM_ORDER_AMOUNT_DIVISOR
}

export function platformBillingValueToMoneyString(
  raw: number | null | undefined,
): string {
  return platformBillingValueToRmb(raw).toFixed(4)
}

export function platformOrderAmountToMoneyString(
  raw: number | null | undefined,
): string {
  return platformOrderAmountToRmb(raw).toFixed(4)
}

export function platformMetalOrderListAmountToRmb(raw: number | null | undefined): number {
  if (raw == null || Number.isNaN(raw)) return 0
  return raw / PLATFORM_METAL_ORDER_LIST_AMOUNT_DIVISOR
}

export function platformMetalOrderListAmountToMoneyString(
  raw: number | null | undefined,
): string {
  return platformMetalOrderListAmountToRmb(raw).toFixed(4)
}

/** 充值 total_amount：第三方金额，单位为分，÷100 为元 */
export function platformRechargeAmountToRmb(raw: number | null | undefined): number {
  if (raw == null || Number.isNaN(raw)) return 0
  return raw / PLATFORM_RECHARGE_AMOUNT_DIVISOR
}

export function platformRechargeAmountToMoneyString(
  raw: number | null | undefined,
): string {
  return platformRechargeAmountToRmb(raw).toFixed(4)
}

/** @deprecated 裸金属请用 platformOrderAmountToRmb；充值请用 platformRechargeAmountToRmb */
export function platformAmountToRmb(raw: number | null | undefined): number {
  return platformOrderAmountToRmb(raw)
}

/** @deprecated 裸金属请用 platformOrderAmountToMoneyString；充值请用 platformRechargeAmountToMoneyString */
export function platformAmountToMoneyString(raw: number | null | undefined): string {
  return platformOrderAmountToMoneyString(raw)
}

export function moneyStringsEqual(a: string, b: string): boolean {
  return Math.abs(Number(a) - Number(b)) < 0.0001
}

export function validateBillingDateRange(startDate?: string, endDate?: string) {
  const hasStart = Boolean(startDate?.trim())
  const hasEnd = Boolean(endDate?.trim())
  if (hasStart !== hasEnd) {
    throw new Error('开始日期与结束日期须同时填写或同时留空')
  }
  if (hasStart && hasEnd && startDate! > endDate!) {
    throw new Error('开始日期不能晚于结束日期')
  }
}

const CST_TIMEZONE = 'Asia/Shanghai'

/** 东八区自然日 YYYY-MM-DD */
export function formatCstDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CST_TIMEZONE }).format(date)
}

/** 日期字符串减 N 天（日历日，非时区感知边界；用于 YYYY-MM-DD 运算） */
export function subtractCalendarDays(dateStr: string, days: number): string {
  const [yearStr, monthStr, dayStr] = dateStr.split('-')
  const y = Number(yearStr)
  const m = Number(monthStr)
  const d = Number(dayStr)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() - days)
  return dt.toISOString().slice(0, 10)
}

/** 东八区当月 1 日 */
export function cstMonthStartDate(referenceDateStr: string): string {
  const [y, m] = referenceDateStr.split('-')
  return `${y}-${m}-01`
}

export const MS_PER_SYNC_WINDOW_DAY = 24 * 60 * 60 * 1000

export type ApiQueryTimes = {
  start_time: string
  end_time: string
}

/** 滑动同步窗口：精确 [startAt, endAt]（默认 windowDays=2 即 48 小时） */
export function computeSlidingSyncWindow(params: {
  windowDays: number
  now?: Date
}): {
  startAt: Date
  endAt: Date
  startDate: string
  endDate: string
  skipped: boolean
} {
  if (params.windowDays < 0) {
    const now = params.now ?? new Date()
    return {
      startAt: now,
      endAt: now,
      startDate: formatCstDate(now),
      endDate: formatCstDate(now),
      skipped: true,
    }
  }
  const endAt = params.now ?? new Date()
  const startAt = new Date(endAt.getTime() - params.windowDays * MS_PER_SYNC_WINDOW_DAY)
  return {
    startAt,
    endAt,
    startDate: formatCstDate(startAt),
    endDate: formatCstDate(endAt),
    skipped: false,
  }
}

/** 滑动窗口 API 时间：左闭右闭，使用执行时刻 ISO */
export function toSlidingWindowQueryTimes(startAt: Date, endAt: Date): ApiQueryTimes {
  return {
    start_time: startAt.toISOString(),
    end_time: endAt.toISOString(),
  }
}

/** 东八区自然日区间 → 精确时间窗（起始日 00:00 含，结束日全天含） */
export function cstDateRangeToInstantWindow(
  startDate: string,
  endDate: string,
): { startAt: Date; endAt: Date } {
  return {
    startAt: new Date(`${startDate}T00:00:00+08:00`),
    endAt: new Date(cstDateEndExclusiveToUtcIso(endDate)),
  }
}

/** 东八区自然日 00:00 → UTC ISO（月度账单 overview 查询） */
export function cstDateStartToUtcIso(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00+08:00`).toISOString()
}

/** 东八区结束日 inclusive → 次日 00:00 CST 的 UTC ISO */
export function cstDateEndExclusiveToUtcIso(dateStr: string): string {
  const start = new Date(`${dateStr}T00:00:00+08:00`)
  return new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString()
}

function emptyApiDateRange() {
  return { start_time: '', end_time: '' }
}

/** 裸金属订单 API：UTC ISO，东八区自然日 00:00 → 结束日次日 00:00（左闭右开） */
export function toMetalOrderQueryTimes(startDate?: string, endDate?: string) {
  if (!startDate || !endDate) return emptyApiDateRange()
  return {
    start_time: cstDateStartToUtcIso(startDate),
    end_time: cstDateEndExclusiveToUtcIso(endDate),
  }
}

/** 月度账单 overview API：UTC ISO，东八区自然日界（与裸金属请求规则一致） */
export function toMonthlyBillQueryTimes(startDate?: string, endDate?: string) {
  if (!startDate || !endDate) return emptyApiDateRange()
  return {
    start_time: cstDateStartToUtcIso(startDate),
    end_time: cstDateEndExclusiveToUtcIso(endDate),
  }
}

/** 充值列表 API：UTC ISO，东八区自然日界（左闭右开） */
export function toRechargeQueryTimes(startDate?: string, endDate?: string) {
  if (!startDate || !endDate) return emptyApiDateRange()
  return {
    start_time: cstDateStartToUtcIso(startDate),
    end_time: cstDateEndExclusiveToUtcIso(endDate),
  }
}

/** 每日用量账单 API：UTC ISO，东八区自然日界（左闭右开） */
export function toDailyUsageBillQueryTimes(startDate?: string, endDate?: string) {
  if (!startDate || !endDate) return emptyApiDateRange()
  return {
    start_time: cstDateStartToUtcIso(startDate),
    end_time: cstDateEndExclusiveToUtcIso(endDate),
  }
}

/** 平台 Pod 任务类型 → 产品线（billing_pod_record_list task_type） */
export const PLATFORM_DAILY_USAGE_TASK_TYPES = ['Deployment', 'Job', 'Development'] as const

const TASK_TYPE_PRODUCT_LINE_MAP: Record<
  string,
  { productLine: string; label: string }
> = {
  Deployment: { productLine: 'pod_deployment', label: '弹性部署' },
  Job: { productLine: 'pod_job', label: 'Job' },
  Development: { productLine: 'pod_development', label: '云主机' },
}

export function mapPlatformTaskType(taskType: string) {
  const mapped = TASK_TYPE_PRODUCT_LINE_MAP[taskType]
  if (mapped) return mapped
  const snake = taskType.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()
  return { productLine: snake, label: taskType }
}

/** 自然日 → 账期月 YYYY-MM */
export function usageMonthFromDate(usageDate: string): string {
  return usageDate.slice(0, 7)
}

/** 从平台账期 start_time 提取东八区 usage_date（YYYY-MM-DD） */
export function usageDateFromPlatformPeriod(startTime: string): string {
  const d = parsePlatformDateTime(startTime)
  if (d) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d)
  }
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(startTime)
  return m ? m[1]! : startTime.slice(0, 10)
}

/** 账单明细 API：必须与 overview 返回的 start_time / end_time 原样一致 */
export function toBillDetailQueryTimes(startTime: string, endTime: string) {
  return { start_time: startTime, end_time: endTime }
}

export function billMonthFromPlatformPeriod(startTime: string): string {
  const m = /^(\d{4}-\d{2})/.exec(startTime)
  if (m) return m[1]!
  const d = new Date(startTime)
  if (Number.isNaN(d.getTime())) return startTime.slice(0, 7)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(d)
  const y = parts.find((p) => p.type === 'year')?.value
  const mo = parts.find((p) => p.type === 'month')?.value
  return y && mo ? `${y}-${mo}` : startTime.slice(0, 7)
}

export function dueDateForBillMonth(billMonth: string): string {
  return `${billMonth}-15`
}

export function parsePlatformDateTime(raw: string): Date | null {
  if (!raw?.trim()) return null
  const trimmed = raw.trim()
  const direct = new Date(trimmed)
  if (!Number.isNaN(direct.getTime())) return direct

  const normalized = trimmed
    .replace(' +00:00', 'Z')
    .replace(' ', 'T')
    .replace(/ \+(\d{2}:\d{2})$/, '+$1')
  const d = new Date(normalized)
  return Number.isNaN(d.getTime()) ? null : d
}

const PRODUCT_LINE_MAP: Record<string, { productLine: string; resourceName: string }> = {
  'Pod:Job': { productLine: 'pod_job', resourceName: 'Job' },
  'Pod:Deployment': { productLine: 'pod_deployment', resourceName: '弹性部署' },
  'Pod:Development': { productLine: 'pod_development', resourceName: '云主机' },
  MaasToken: { productLine: 'maas_token', resourceName: 'Token服务' },
  BareMetalFullRental: { productLine: 'bare_metal', resourceName: '裸金属整租' },
  Juicefs: { productLine: 'juicefs', resourceName: '对象存储加速' },
  ShareStorage: { productLine: 'share_storage', resourceName: '共享存储卷' },
  Harbor: { productLine: 'harbor', resourceName: '镜像仓库' },
  PrepaidDeduction: { productLine: 'prepaid_deduction', resourceName: '预付费抵扣' },
}

const DB_PRODUCT_LINE_LABELS: Record<string, string> = Object.fromEntries(
  Object.values(PRODUCT_LINE_MAP).map(({ productLine, resourceName }) => [productLine, resourceName]),
)

export const BILLING_PRODUCT_LINE_REGISTRY = Object.values(PRODUCT_LINE_MAP).map(
  ({ productLine, resourceName }) => ({
    productLine,
    label: resourceName,
  }),
)

export function getBillingProductLineLabel(productLine: string): string {
  return DB_PRODUCT_LINE_LABELS[productLine] ?? productLine
}

export function mapPlatformProductLine(platformKey: string) {
  const mapped = PRODUCT_LINE_MAP[platformKey]
  if (mapped) return mapped
  const snake = platformKey.replace(/[:]/g, '_').replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()
  return { productLine: snake, resourceName: platformKey }
}

/** 解析模板 support_products（如 "MaasToken,BareMetalFullRental,"）→ CRM 产品线列表 */
export function parseSupportProductLines(supportProducts: string | null | undefined): string[] {
  if (!supportProducts?.trim()) return []
  const lines = new Set<string>()
  for (const part of supportProducts.split(',')) {
    const key = part.trim()
    if (!key) continue
    lines.add(mapPlatformProductLine(key).productLine)
  }
  return [...lines]
}

export function supportProductLinesToStorage(productLines: string[]): string | null {
  if (productLines.length === 0) return null
  return productLines.join(',')
}

export function mapMetalOrderStatus(status: string): string {
  switch (status) {
    case 'Finished':
      return 'completed'
    case 'Canceled':
    case 'Cancelled':
      return 'cancelled'
    default:
      return status.toLowerCase()
  }
}

export function mapMetalBillingUnit(billingType: string | null | undefined): string | null {
  if (!billingType) return null
  switch (billingType) {
    case 'Hour':
      return 'hour'
    case 'Day':
      return 'day'
    case 'Month':
      return 'month'
    default:
      return billingType.toLowerCase()
  }
}

export function mapPayChannel(payChannel: string | null | undefined): string {
  switch (payChannel) {
    case 'Offline':
      return 'bank_transfer'
    case 'WeChat':
      return 'wechat'
    case 'Alipay':
      return 'alipay'
    default:
      return 'bank_transfer'
  }
}

export function payChannelLabel(method: string): string {
  switch (method) {
    case 'bank_transfer':
      return '银行转账'
    case 'wechat':
      return '微信'
    case 'alipay':
      return '支付宝'
    case 'invoice':
      return '发票对公'
    default:
      return method
  }
}

export function mapRechargeStatus(status: string): string {
  return status === 'Completed' ? 'paid' : status.toLowerCase()
}

export function detailLineType(productLine: string): string {
  return productLine === 'bare_metal' || productLine === 'prepaid_deduction'
    ? 'prepaid'
    : 'postpaid'
}

export function formatGpuSummary(
  gpuModels: Array<{ gpu_model?: string; gpu_count?: number }> | undefined,
): string {
  if (!gpuModels?.length) return '—'
  return gpuModels
    .map((g) => `${g.gpu_model ?? '?'} × ${g.gpu_count ?? 0}`)
    .join(', ')
}

export function summarizeSection<T extends { action: string }>(items: T[]) {
  return {
    total: items.length,
    toCreate: items.filter((i) => i.action === 'create').length,
    toUpdate: items.filter((i) => i.action === 'update').length,
    skipped: items.filter((i) => i.action === 'skip').length,
  }
}
