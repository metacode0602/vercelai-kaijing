/**
 * 账单明细计价快照（P0-8）
 *
 * 背景：`merchant_sales_price` 此前只被写、不被计费读取。商户在定价页设了售价，
 * 出账却完全按平台刊例价走 —— 商户自定价从未参与计费，C 形态双记账从第一笔
 * 就对不上。本模块给 `tenant_consumption_daily_detail` 补上「时点单价 + 来源」。
 *
 * 为什么单独跑一遍而不是在导入时就算：
 *   账单导入是全量 upsert、每天重跑，导入源（平台 billing API）的 `amounts`
 *   只按产品类型给金额，**没有** data_center_id / gpu_card_type_id / 卡时。
 *   而商户销售价按 (商户, 机房, 卡型, 产品线, 计费单位, 生效期) 定价，
 *   缺任何一个维度都无法定位价格。补价因此必须能独立重跑，且对「维度不足」
 *   的行如实标记，而不是硬凑一个价。
 *
 * 状态语义（pricing_resolve_status）：
 *   resolved      —— 已定价，unitPrice/priceSource 有效
 *   unresolvable  —— 维度不足（缺机房或卡型），无法定价；不猜、不回落
 *   no_price      —— 维度齐全但商户价与刊例价都查不到
 *   pending       —— 还没跑过
 */

import { resolveBillingPrice } from '@workspace/billing'
import { tenantConsumptionDailyDetail } from '@workspace/db/schema'
import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'

export const PRICING_STATUS = {
  pending: 'pending',
  resolved: 'resolved',
  unresolvable: 'unresolvable',
  noPrice: 'no_price',
} as const

export interface RepriceOptions {
  /** 只补某个 usage_date（YYYY-MM-DD）之前的明细；缺省不限 */
  usageDate?: string
  /** 单批条数上限，避免一次锁太多行 */
  batchSize?: number
  /** 限制商户 */
  merchantId?: string
}

export interface RepriceResult {
  scanned: number
  resolved: number
  sales: number
  list: number
  unresolvable: number
  noPrice: number
  failed: number
  errors: { key: string; message: string }[]
}

/**
 * 把 `date` 列归一成 UTC 零点。
 *
 * drizzle 的 `date()` 默认 string 模式返回 'YYYY-MM-DD'，但原生 pg 会把它解析成
 * Date。两种形态都要接住：直接 `${date}T00:00:00Z` 拼串在 Date 上会得到
 * Invalid time value，而这种错误要等到真跑补价才会暴露。
 */
function usageDateToUtcMidnight(value: string | Date): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error('usageDate 非法日期')
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
  }
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) throw new Error(`usageDate 非法日期: ${value}`)
  return parsed
}

/**
 * 解析单条 usage 明细的计费单价。
 *
 * usageDate 是 `date` 列，按 UTC 天比较即可（与 merchant_price_rules 的
 * effectiveFrom/To 口径一致）。
 */
export async function resolveDetailPrice(
  row: {
    merchantId: string | null
    dataCenterId: string | null
    gpuCardTypeId: string | null
    productLine: string
    usageDate: string | Date
  },
  options: { billingUnit?: string; tx?: typeof db } = {},
) {
  const client = options.tx ?? db
  // 维度不足：不猜价。销售价按机房+卡型定价，缺了就只能回落刊例价，
  // 但那会让「无法定价」和「确实按刊例价计费」两种情况无法区分。
  if (!row.dataCenterId || !row.gpuCardTypeId) {
    return { status: PRICING_STATUS.unresolvable, unitPrice: null, priceSource: null, salesPriceId: null }
  }

  const resolved = await resolveBillingPrice(client, {
    merchantId: row.merchantId,
    dataCenterId: row.dataCenterId,
    gpuCardTypeId: row.gpuCardTypeId,
    productLine: row.productLine,
    billingUnit: options.billingUnit ?? 'hour',
    usageTime: usageDateToUtcMidnight(row.usageDate),
  })

  if (!resolved) {
    return { status: PRICING_STATUS.noPrice, unitPrice: null, priceSource: null, salesPriceId: null }
  }

  return {
    status: PRICING_STATUS.resolved,
    unitPrice: resolved.unitPrice.toFixed(4),
    priceSource: resolved.priceSource,
    salesPriceId: resolved.salesPriceId,
  }
}

/**
 * 批量补价：捞出尚未定价的明细，逐条解析时点价并落库。
 *
 * 逐条处理而不是一条 SQL 批量 update：价格解析要按 (商户,机房,卡型,产品线,日期)
 * 命中不同的价格行，聚合会让「命中哪条销售价」丢失可追溯性。
 */
export async function repriceConsumptionDailyDetails(
  options: RepriceOptions = {},
): Promise<RepriceResult> {
  const batchSize = Math.min(1000, Math.max(1, options.batchSize ?? 200))
  const conditions = [
    inArray(tenantConsumptionDailyDetail.pricingResolveStatus, [
      PRICING_STATUS.pending,
      PRICING_STATUS.unresolvable,
      PRICING_STATUS.noPrice,
    ]),
  ]
  if (options.usageDate) {
    conditions.push(
      sql`${tenantConsumptionDailyDetail.usageDate} = ${options.usageDate}`,
    )
  } else {
    conditions.push(
      or(isNull(tenantConsumptionDailyDetail.usageDate), lt(tenantConsumptionDailyDetail.usageDate, '9999-12-31'))!,
    )
  }
  if (options.merchantId) {
    conditions.push(eq(tenantConsumptionDailyDetail.merchantId, options.merchantId))
  }

  const rows = await db
    .select({
      id: tenantConsumptionDailyDetail.id,
      merchantId: tenantConsumptionDailyDetail.merchantId,
      dataCenterId: tenantConsumptionDailyDetail.dataCenterId,
      gpuCardTypeId: tenantConsumptionDailyDetail.gpuCardTypeId,
      productLine: tenantConsumptionDailyDetail.productLine,
      usageDate: tenantConsumptionDailyDetail.usageDate,
    })
    .from(tenantConsumptionDailyDetail)
    .where(and(...conditions))
    .limit(batchSize)

  const result: RepriceResult = {
    scanned: rows.length,
    resolved: 0,
    sales: 0,
    list: 0,
    unresolvable: 0,
    noPrice: 0,
    failed: 0,
    errors: [],
  }

  for (const row of rows) {
    try {
      const priced = await resolveDetailPrice(row)
      await db
        .update(tenantConsumptionDailyDetail)
        .set({
          unitPrice: priced.unitPrice,
          priceSource: priced.priceSource,
          salesPriceId: priced.salesPriceId,
          pricingResolveStatus: priced.status,
          updatedAt: new Date(),
        })
        .where(eq(tenantConsumptionDailyDetail.id, row.id))

      if (priced.status === PRICING_STATUS.resolved) {
        result.resolved += 1
        if (priced.priceSource === 'sales') result.sales += 1
        else result.list += 1
      } else if (priced.status === PRICING_STATUS.unresolvable) {
        result.unresolvable += 1
      } else {
        result.noPrice += 1
      }
    } catch (e) {
      result.failed += 1
      result.errors.push({
        key: row.id,
        message: e instanceof Error ? e.message : '明细补价失败',
      })
    }
  }

  return result
}
