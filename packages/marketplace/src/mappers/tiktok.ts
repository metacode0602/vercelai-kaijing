import type { DomainOrder, DomainOrderLine, DomainProduct } from "../domain/types"

type Json = Record<string, unknown>

function asRecord(value: unknown): Json {
  return value && typeof value === "object" ? (value as Json) : {}
}

/** Map TikTok Shop order status strings into lean domain statuses. */
export function mapTiktokOrderStatus(raw: string | undefined): string {
  const s = (raw ?? "").toUpperCase()
  if (!s) return "unknown"
  if (s.includes("CANCEL")) return "cancelled"
  if (s.includes("DELIVER")) return "delivered"
  if (
    s.includes("AWAITING_COLLECTION") ||
    s.includes("IN_TRANSIT") ||
    s.includes("SHIPPED")
  ) {
    return "shipped"
  }
  if (s.includes("AWAITING_SHIPMENT") || s.includes("READY")) {
    return "ready_to_ship"
  }
  if (s.includes("UNPAID")) return "created"
  if (s.includes("ON_HOLD") || s.includes("PARTIALLY") || s.includes("PAID")) {
    return "paid"
  }
  return "unknown"
}

function unixToIso(value: unknown): string | null {
  if (value == null || value === "") return null
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  const ms = n < 1_000_000_000_000 ? n * 1000 : n
  const date = new Date(ms)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function mapTiktokOrderLine(line: Json): DomainOrderLine {
  return {
    externalLineId: String(line.id ?? line.order_line_id ?? ""),
    sku: String(line.seller_sku ?? line.sku_id ?? ""),
    title: String(line.product_name ?? line.sku_name ?? ""),
    qty: line.quantity != null ? Number(line.quantity) : 1,
    unitPrice:
      line.sale_price != null
        ? String(line.sale_price)
        : line.original_price != null
          ? String(line.original_price)
          : undefined,
    raw: line,
  }
}

export function mapTiktokOrder(data: Json): DomainOrder {
  const lines = (data.line_items ?? data.item_list ?? []) as Json[]
  const payment = asRecord(data.payment)
  return {
    externalOrderId: String(data.id ?? data.order_id ?? ""),
    status: mapTiktokOrderStatus(String(data.status ?? "")),
    currency: payment.currency ? String(payment.currency) : undefined,
    totalAmount:
      payment.total_amount != null ? String(payment.total_amount) : undefined,
    placedAt: unixToIso(data.create_time),
    paidAt: unixToIso(data.paid_time),
    lines: lines.map((line) => mapTiktokOrderLine(line)),
    raw: data,
  }
}

export function mapTiktokProduct(data: Json): DomainProduct {
  const skus = (data.skus ?? []) as Json[]
  return {
    externalId: String(data.id ?? data.product_id ?? ""),
    title: String(data.title ?? data.product_name ?? ""),
    status: String(data.status ?? ""),
    skus: skus.map((sku) => {
      const price = asRecord(sku.price)
      const inventory =
        sku.inventory != null && typeof sku.inventory === "object"
          ? asRecord(sku.inventory)
          : null
      return {
        externalSkuId: String(sku.id ?? ""),
        sellerSku: String(sku.seller_sku ?? ""),
        priceAmount: price.amount != null ? String(price.amount) : undefined,
        priceCurrency:
          price.currency != null ? String(price.currency) : undefined,
        quantity:
          inventory?.quantity != null
            ? Number(inventory.quantity)
            : sku.inventory != null && typeof sku.inventory !== "object"
              ? Number(sku.inventory)
              : undefined,
        raw: sku,
      }
    }),
    raw: data,
  }
}
