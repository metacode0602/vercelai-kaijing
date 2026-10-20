/**
 * 上游 billing API 消费维度的解析（P0-8）
 *
 * 单独成文件的原因：纯字段映射逻辑与 HTTP / 日志 / 数据库无关，却和它们同处一个
 * 模块，导致它既无法脱离 Next.js（`server-only`）单独跑测试，改字段名时也没有
 * 任何测试兜底。这里保持零依赖，便于直接断言。
 *
 * 背景：平台刊例价按卡型定价（默认价），而商户销售价按
 * (商户, 机房, 卡型, 产品线, 计费单位, 生效期) 定价。还原「这笔消费发生在哪个
 * 机房的哪种卡上、跑了多少卡时」是时点计价的必要输入；缺任何一个维度，下游只能
 * 把该行标成 `unresolvable`，不能猜价。
 */

export type PlatformDailyTaskSummaryRecord = {
  task_id: number
  task_type: string
  task_name: string
  billing_value: number
  discount_value: number
  /** 消费维度。上游 billing API v2 起提供，v1 缺失（此时下游标 unresolvable） */
  data_center_id?: string | null
  data_center_code?: string | null
  data_center_name?: string | null
  gpu_card_type_id?: string | null
  gpu_card_type_code?: string | null
  gpu_card_type_name?: string | null
  /** 卡时 = 计价数量 */
  card_hours?: number | null
  /** 上游实际计费单价，用于与商户自定价交叉校验 */
  unit_price?: number | null
  /** 上游采用的默认卡型刊例价 */
  list_price?: number | null
}

/**
 * 宽松读取上游字符串字段。
 *
 * 第三方 API 的 ID/编码可能是 string、number 或 null。直接 `String(x ?? null)`
 * 会把 0、空串变成 "0" / "" 这类「看起来有效、实际查不到库」的值，
 * 下游就会误判成维度已提供。统一归一成「非空字符串或 null」，
 * 让「没给」和「给了」可可靠区分。
 */
export function readString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null
  return null
}

/** 宽松读取上游数值字段；NaN / 非数值视为「没给」而不是 0 */
export function readNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * 上游 task summary 原始行 → 内部记录。
 *
 * 卡时字段名在上游有多个历史叫法（billing_card_hours / card_hours /
 * total_card_hours），按此优先级取值；单价同理兼容 price。
 */
export function mapDailyTaskSummaryRow(
  row: Record<string, unknown>,
  fallbackTaskType: string,
): PlatformDailyTaskSummaryRecord {
  return {
    task_id: Number(row.task_id ?? 0),
    task_type: String(row.task_type ?? fallbackTaskType),
    task_name: String(row.task_name ?? ''),
    billing_value: Number(row.billing_value ?? 0),
    discount_value: Number(row.discount_value ?? 0),
    data_center_id: readString(row.data_center_id),
    data_center_code: readString(row.data_center_code),
    data_center_name: readString(row.data_center_name),
    gpu_card_type_id: readString(row.gpu_card_type_id),
    gpu_card_type_code: readString(row.gpu_card_type_code),
    gpu_card_type_name: readString(row.gpu_card_type_name),
    card_hours: readNumber(row.billing_card_hours ?? row.card_hours ?? row.total_card_hours),
    unit_price: readNumber(row.unit_price ?? row.price),
    list_price: readNumber(row.list_price),
  }
}

/**
 * 维度是否足以做时点计价。
 *
 * 机房与卡型缺一不可：销售价按机房+卡型定价，缺了就只能回落刊例价，
 * 那会让「无法定价」和「确实按刊例价计费」两种情况再也分不开。
 */
export function hasPricingDimensions(
  row: Pick<PlatformDailyTaskSummaryRecord, 'data_center_id' | 'gpu_card_type_id'>,
): boolean {
  return Boolean(row.data_center_id && row.gpu_card_type_id)
}
