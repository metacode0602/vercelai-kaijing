/**
 * Pure Lazop payload mappers — no network / credentials.
 * Used by adapters and unit tests.
 */
import type {
  DomainOrder,
  DomainOrderLine,
  DomainProduct,
  DomainSettlement,
  DomainSettlementLine,
} from "../domain/types"

type Json = Record<string, unknown>

function asRecord(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : {}
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (value == null || value === "") continue
    const text = String(value).trim()
    if (text) return text
  }
  return undefined
}

export function parseMoneyWithCurrency(raw: unknown): {
  amount?: string
  currency?: string
} {
  if (raw == null || raw === "") return {}
  const text = String(raw).trim()
  const match = text.match(
    /^([+-]?\d+(?:\.\d+)?)\s*([A-Za-z]{3})?$/
  )
  if (match) {
    return {
      amount: match[1],
      currency: match[2]?.toUpperCase(),
    }
  }
  const currencyFirst = text.match(/^([A-Za-z]{3})\s*([+-]?\d+(?:\.\d+)?)$/)
  if (currencyFirst) {
    return {
      amount: currencyFirst[2],
      currency: currencyFirst[1]?.toUpperCase(),
    }
  }
  return { amount: text }
}

export function mapLazopOrderStatus(raw: string | undefined): string {
  const s = (raw ?? "").toLowerCase()
  if (!s) return "unknown"
  if (s.includes("cancel")) return "cancelled"
  if (s.includes("deliver") || s.includes("delivered")) return "delivered"
  if (s.includes("ship") || s.includes("transit") || s.includes("picked"))
    return "shipped"
  if (s.includes("ready") || s.includes("rts") || s.includes("packed"))
    return "ready_to_ship"
  if (s.includes("unpaid") || s.includes("pending")) return "created"
  if (
    s.includes("paid") ||
    s.includes("repacked") ||
    s.includes("confirmed") ||
    s.includes("processing")
  ) {
    return "paid"
  }
  return "unknown"
}

export function mapLazopListingStatus(raw: string | undefined): string {
  const s = (raw ?? "").toLowerCase()
  if (!s) return "draft"
  if (s.includes("live") || s.includes("active") || s === "1") return "live"
  if (s.includes("pending") || s.includes("audit") || s.includes("qc"))
    return "submitted"
  if (s.includes("reject") || s.includes("fail")) return "rejected"
  if (s.includes("inactiv") || s.includes("suspend") || s.includes("lock"))
    return "paused"
  if (s.includes("delete") || s.includes("archiv") || s.includes("sold_out"))
    return "archived"
  return "draft"
}

/** Each Lazop order item unit becomes one line with qty=1. */
export function mapLazopOrderItem(data: unknown): DomainOrderLine {
  const line = asRecord(data)
  const sku = firstString(
    line.sku,
    line.SellerSku,
    line.seller_sku,
    line.shop_sku
  )
  return {
    externalLineId: firstString(line.order_item_id, line.order_line_id, line.id),
    sku,
    title: firstString(line.name, line.product_name, line.title),
    qty: 1,
    unitPrice: firstString(line.paid_price, line.item_price, line.price),
    raw: line,
  }
}

export function mapLazopOrderItems(payload: unknown): DomainOrderLine[] {
  const root = asRecord(payload)
  const data = root.data ?? payload
  const rows = Array.isArray(data)
    ? data
    : ((asRecord(data).order_items ??
        asRecord(data).items ??
        asRecord(data).order_item_list ??
        []) as unknown[])
  return (Array.isArray(rows) ? rows : [])
    .map((row) => mapLazopOrderItem(row))
    .filter((line) => Boolean(line.externalLineId || line.sku))
}

export function mapLazopOrder(
  data: unknown,
  linesOverride?: DomainOrderLine[]
): DomainOrder {
  const order = asRecord(data)
  const nestedLines = mapLazopOrderItems(
    order.order_items ?? order.items ?? order.order_line ?? []
  )
  const lines = linesOverride?.length ? linesOverride : nestedLines
  const statusRaw = firstString(
    Array.isArray(order.statuses) ? order.statuses[0] : undefined,
    order.status
  )
  const paidAt =
    firstString(order.payment_time) ??
    lines
      .map((line) => firstString(asRecord(line.raw).payment_time))
      .find(Boolean) ??
    null

  return {
    externalOrderId: String(order.order_id ?? order.order_number ?? ""),
    status: mapLazopOrderStatus(statusRaw),
    currency: firstString(order.currency, order.price_unit, lines[0] && asRecord(lines[0].raw).currency),
    totalAmount: firstString(order.price, order.order_total, order.grand_total),
    placedAt: firstString(order.created_at, order.created_time) ?? null,
    paidAt,
    lines,
    raw: order,
  }
}

export function mapLazopProduct(data: unknown): DomainProduct {
  const product = asRecord(data)
  const attrs = asRecord(product.attributes)
  const skus = (product.skus ?? product.sku_list ?? []) as unknown[]
  return {
    externalId: String(
      product.item_id ?? product.product_id ?? product.id ?? ""
    ),
    title: String(
      firstString(attrs.name, product.name, product.title) ?? ""
    ),
    status: mapLazopListingStatus(String(product.status ?? "")),
    skus: (Array.isArray(skus) ? skus : []).map((skuRaw) => {
      const sku = asRecord(skuRaw)
      return {
        externalSkuId: firstString(sku.sku_id, sku.ShopSku, sku.shop_sku),
        sellerSku: firstString(sku.SellerSku, sku.seller_sku, sku.sku),
        priceAmount:
          sku.price != null
            ? String(sku.price)
            : sku.special_price != null
              ? String(sku.special_price)
              : undefined,
        quantity: sku.quantity != null ? Number(sku.quantity) : undefined,
        raw: sku,
      }
    }),
    raw: product,
  }
}

export function mapLazopPayoutStatus(data: unknown): DomainSettlement {
  const row = asRecord(data)
  const payout = parseMoneyWithCurrency(row.payout)
  const paidRaw = firstString(row.paid, row.paid_status)
  const paid =
    paidRaw == null
      ? null
      : paidRaw === "1" ||
          paidRaw.toLowerCase() === "paid" ||
          paidRaw.toLowerCase() === "true"
  return {
    externalSettlementId: String(
      row.statement_number ?? row.statement ?? row.id ?? ""
    ),
    payoutStatus: paid == null ? paidRaw : paid ? "paid" : "unpaid",
    paid,
    currency: payout.currency ?? firstString(row.currency),
    payoutAmount: payout.amount,
    openingBalance: firstString(row.opening_balance),
    closingBalance: firstString(row.closing_balance),
    guaranteeDeposit: firstString(row.guarantee_deposit),
    itemRevenue: firstString(row.item_revenue),
    otherRevenueTotal: firstString(row.other_revenue_total),
    subtotal1: firstString(row.subtotal1),
    subtotal2: firstString(row.subtotal2),
    refundsAmount: firstString(row.refunds, row.refunds_amount),
    feesOnRefundsTotal: firstString(row.fees_on_refunds_total),
    shipmentFee: firstString(row.shipment_fee),
    shipmentFeeCredit: firstString(row.shipment_fee_credit),
    feesTotal: firstString(row.fees_total),
    billAmount: firstString(row.closing_balance, payout.amount),
    createdAt: firstString(row.created_at) ?? null,
    updatedAt: firstString(row.updated_at) ?? null,
    raw: row,
  }
}

function inferFeeKind(feeType?: string, feeName?: string, transactionType?: string): string {
  const text = `${feeType ?? ""} ${feeName ?? ""} ${transactionType ?? ""}`.toLowerCase()
  if (text.includes("refund") || text.includes("return")) return "refund"
  if (text.includes("ship") || text.includes("logistic") || text.includes("freight"))
    return "logistics"
  if (text.includes("ad") || text.includes("sponsor") || text.includes("campaign"))
    return "ads"
  if (text.includes("fx") || text.includes("exchange")) return "fx"
  if (text.includes("fee") || text.includes("commission") || text.includes("payment"))
    return "platform"
  return "other"
}

export function mapLazopTransactionDetail(data: unknown): DomainSettlementLine {
  const row = asRecord(data)
  const feeType = firstString(row.fee_type, row.feeType)
  const feeName = firstString(row.fee_name, row.feeName, row.details)
  const transactionType = firstString(row.transaction_type, row.trans_type)
  const whtIncluded = firstString(row.WHT_included_in_amount, row.wht_included_in_amount)
  return {
    externalTransactionId: String(
      row.transaction_number ?? row.transaction_id ?? row.id ?? ""
    ),
    transactionType,
    feeType,
    feeName,
    feeKind: inferFeeKind(feeType, feeName, transactionType),
    amount: firstString(row.amount),
    taxAmount: firstString(row.VAT_in_amount, row.vat_in_amount, row.tax_amount),
    whtAmount: firstString(row.WHT_amount, row.wht_amount),
    whtIncludedInAmount:
      whtIncluded == null
        ? undefined
        : ["yes", "true", "1"].includes(whtIncluded.toLowerCase()),
    currency: firstString(row.currency),
    paidStatus: firstString(row.paid_status),
    paymentReference: firstString(row.payment_ref_id, row.pmt_reference, row.reference),
    externalOrderNo: firstString(row.order_no, row.trade_order_id),
    externalOrderItemNo: firstString(row.orderItem_no, row.order_item_no, row.trade_order_line_id),
    sellerSku: firstString(row.seller_sku),
    platformSkuId: firstString(row.lazada_sku, row.platform_sku),
    shippingProvider: firstString(row.shipping_provider),
    shippingSpeed: firstString(row.shipping_speed),
    shipmentType: firstString(row.shipment_type),
    statement: firstString(row.statement, row.statement_number),
    note: firstString(row.comment, row.details),
    transactionDate: firstString(row.transaction_date, row.transaction_time) ?? null,
    raw: row,
  }
}

export function mapLazopPayoutList(payload: unknown): DomainSettlement[] {
  const root = asRecord(payload)
  const data = root.data ?? payload
  const rows = Array.isArray(data) ? data : ((asRecord(data).data ?? []) as unknown[])
  return (Array.isArray(rows) ? rows : [])
    .map((row) => mapLazopPayoutStatus(row))
    .filter((row) => Boolean(row.externalSettlementId))
}

export function mapLazopTransactionDetails(
  payload: unknown
): DomainSettlementLine[] {
  const root = asRecord(payload)
  const data = root.data ?? payload
  const rows = Array.isArray(data) ? data : ((asRecord(data).data ?? []) as unknown[])
  return (Array.isArray(rows) ? rows : [])
    .map((row) => mapLazopTransactionDetail(row))
    .filter((row) => Boolean(row.externalTransactionId))
}
