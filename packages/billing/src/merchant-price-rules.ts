/**
 * 商户销售价的**纯判定规则**（P0-8）
 *
 * 单独成文件的原因：这些函数不依赖数据库，却会被
 * `merchant-price-resolver.ts` 里的查库逻辑复用；而 resolver 依赖
 * `@workspace/db/schema` 桶文件（内部是 extensionless 相对导入），
 * Node 原生 `--experimental-strip-types` 无法解析它。
 * 把纯规则隔离出来后，单测可在不连库、不引 DB 桶文件的前提下直接跑。
 */

export const PRICE_SOURCE_SALES = "sales"
export const PRICE_SOURCE_LIST = "list"

export type PriceSource = typeof PRICE_SOURCE_SALES | typeof PRICE_SOURCE_LIST

export interface EffectiveRange {
  effectiveFrom: Date | string
  effectiveTo: Date | string | null
}

/** date 列以 'YYYY-MM-DD' 字符串存储，或已解析为 Date */
function toUtcMs(value: Date | string): number | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.getTime()
  }
  const ms = Date.parse(`${value}T00:00:00.000Z`)
  return Number.isNaN(ms) ? null : ms
}

/**
 * 判定某条价格在 at 时刻是否生效。
 *
 * 边界口径：`effectiveFrom` 含当日 00:00，`effectiveTo` **不含**当日 00:00
 * （即结束日当天起失效）—— 否则相邻两段有效期会在同一天重叠，
 * 解析时将无法确定取哪一条。
 */
export function isEffectiveAt(row: EffectiveRange, at: Date): boolean {
  const atMs = at.getTime()
  if (Number.isNaN(atMs)) return false

  const from = toUtcMs(row.effectiveFrom)
  if (from === null) return false
  if (atMs < from) return false

  const to = row.effectiveTo === null ? null : toUtcMs(row.effectiveTo)
  if (to === null) return true
  return atMs < to
}

/**
 * 单价是否可用于计费：必须是有限正数。
 *
 * 0 与负数一律拒绝 —— 否则一条误配的商户销售价就能让消费免费。
 */
export function isUsablePrice(value: number): boolean {
  return Number.isFinite(value) && value > 0
}
