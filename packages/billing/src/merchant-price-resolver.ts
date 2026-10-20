/**
 * 商户销售价解析（P0-8）
 *
 * 背景：`merchant_sales_price` 一直只被写、不被计费读取 —— 商户在定价页设了自己
 * 的售价，平台出账却完全按 `platform_card_price_record` 走，导致：
 *   - 商户自设价从未参与计费（B/C 形态下商户无利可图）
 *   - C 形态双记账从第一笔就对不上，对账必然全差异
 *
 * 本模块提供**时点价**解析：按 `usageTime` 匹配当时生效的商户销售价，未命中回落
 * 平台刊例价，并把 `priceSource` 一并返回，供出账时快照进 `tenant_bill_detail`。
 *
 * 口径（设计 v3 P0-8）：
 *   - `sales`：命中商户销售价
 *   - `list`：未命中，回落平台刊例价
 *   - 价格为 0 或负数视为无效配置，回落 `list`（绝不让商户把价配成 0 白送）
 */

import { and, asc, desc, eq, gt, isNull, lte, or, type SQL } from "drizzle-orm"
import { merchantSalesPrice, platformCardPriceRecord } from "@workspace/db/schema"
import {
  isEffectiveAt,
  isUsablePrice,
  PRICE_SOURCE_LIST,
  PRICE_SOURCE_SALES,
  type PriceSource,
} from "./merchant-price-rules"

export {
  isEffectiveAt,
  isUsablePrice,
  PRICE_SOURCE_LIST,
  PRICE_SOURCE_SALES,
  type PriceSource,
} from "./merchant-price-rules"

export interface ResolvedPrice {
  /** 实际用于计费的单价 */
  unitPrice: number
  priceSource: PriceSource
  /** priceSource='sales' 时命中的 merchant_sales_price.id */
  salesPriceId: string | null
  /** priceSource='list' 时命中的 platform_card_price_record.id */
  listPriceRecordId: string | null
  gpuCardTypeId: string
  productLine: string
  billingUnit: string
}

export interface ResolvePriceParams {
  merchantId: string | null
  /**
   * 机房 ID。销售价按机房定价，**必填**：为 null 时不会匹配任何商户销售价，
   * 直接回落刊例价（宁可少赚也不能拿别的机房的价计错账）。
   */
  dataCenterId: string | null
  gpuCardTypeId: string
  productLine: string
  billingUnit?: string
  /**
   * 消费发生时刻。**必须**传真实 usage_time：解析历史账单时若用「现在」，
   * 会把当时没生效的价套到旧账上，对账反而更乱。
   */
  usageTime: Date
}

type Db = any

/**
 * 构造「在 at 时刻生效」的 SQL 条件。
 *
 * 导出供单测直接断言边界（避免只测 happy path）。
 */
export function effectiveAtConditions(
  table: typeof merchantSalesPrice,
  at: Date,
): SQL[] {
  const atDay = at.toISOString().slice(0, 10)
  return [
    eq(table.status, "active"),
    lte(table.effectiveFrom, atDay),
    // effectiveTo 为空 = 长期有效；非空时排他（结束日当天起失效）
    or(isNull(table.effectiveTo), gt(table.effectiveTo, atDay)) as SQL,
  ]
}

/**
 * 解析计费单价：商户销售价优先，未命中回落平台刊例价。
 *
 * 永不抛错、未命中返回 null —— 定价是可选能力，不该让计费链路崩掉。
 */
export async function resolveBillingPrice(
  db: Db,
  params: ResolvePriceParams,
): Promise<ResolvedPrice | null> {
  const billingUnit = params.billingUnit ?? "hour"

  // 1) 商户销售价时点价
  // 机房是销售价的必备维度：缺 merchantId 或 dataCenterId 都直接回落刊例价。
  if (params.merchantId && params.dataCenterId) {
    const salesConditions: SQL[] = [
      eq(merchantSalesPrice.merchantId, params.merchantId),
      eq(merchantSalesPrice.gpuCardTypeId, params.gpuCardTypeId),
      eq(merchantSalesPrice.productLine, params.productLine),
      eq(merchantSalesPrice.billingUnit, billingUnit),
      ...effectiveAtConditions(merchantSalesPrice, params.usageTime),
      // 销售价按机房定价，**必须**精确匹配机房。
      // 拿不到机房时宁可回落刊例价，也不能拿 A 机房的价去计 B 机房的账。
      eq(merchantSalesPrice.dataCenterId, params.dataCenterId),
    ]

    const salesRows = await db
      .select({
        id: merchantSalesPrice.id,
        salesPrice: merchantSalesPrice.salesPrice,
        effectiveFrom: merchantSalesPrice.effectiveFrom,
        effectiveTo: merchantSalesPrice.effectiveTo,
      })
      .from(merchantSalesPrice)
      .where(and(...salesConditions))
      // 多条命中时取最近生效的那条（时间上更贴近 usageTime）
      .orderBy(desc(merchantSalesPrice.effectiveFrom), asc(merchantSalesPrice.id))
      .limit(5)

    for (const row of salesRows) {
      if (!isEffectiveAt(row, params.usageTime)) continue
      const price = Number(row.salesPrice)
      if (!isUsablePrice(price)) continue
      return {
        unitPrice: price,
        priceSource: PRICE_SOURCE_SALES,
        salesPriceId: row.id,
        listPriceRecordId: null,
        gpuCardTypeId: params.gpuCardTypeId,
        productLine: params.productLine,
        billingUnit,
      }
    }
  }

  // 2) 回落平台刊例价
  const [listRow] = await db
    .select({
      id: platformCardPriceRecord.id,
      sellPrice: platformCardPriceRecord.sellPrice,
    })
    .from(platformCardPriceRecord)
    .where(
      and(
        eq(platformCardPriceRecord.gpuCardTypeId, params.gpuCardTypeId),
        eq(platformCardPriceRecord.productLine, params.productLine),
        eq(platformCardPriceRecord.billingUnit, billingUnit),
      ),
    )
    .limit(1)

  if (!listRow) return null
  const listPrice = Number(listRow.sellPrice)
  if (!isUsablePrice(listPrice)) return null

  return {
    unitPrice: listPrice,
    priceSource: PRICE_SOURCE_LIST,
    salesPriceId: null,
    listPriceRecordId: listRow.id,
    gpuCardTypeId: params.gpuCardTypeId,
    productLine: params.productLine,
    billingUnit,
  }
}
