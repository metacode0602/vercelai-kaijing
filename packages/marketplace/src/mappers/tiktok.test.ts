import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  mapTiktokOrder,
  mapTiktokOrderLine,
  mapTiktokOrderStatus,
  mapTiktokProduct,
} from "./tiktok"

describe("tiktok pure mappers", () => {
  it("maps order statuses including cancel / unpaid / ready / shipped", () => {
    assert.equal(mapTiktokOrderStatus("CANCELLED"), "cancelled")
    assert.equal(mapTiktokOrderStatus("CANCEL"), "cancelled")
    assert.equal(mapTiktokOrderStatus("UNPAID"), "created")
    assert.equal(mapTiktokOrderStatus("AWAITING_SHIPMENT"), "ready_to_ship")
    assert.equal(mapTiktokOrderStatus("IN_TRANSIT"), "shipped")
    assert.equal(mapTiktokOrderStatus("DELIVERED"), "delivered")
    assert.equal(mapTiktokOrderStatus("ON_HOLD"), "paid")
    assert.equal(mapTiktokOrderStatus(""), "unknown")
  })

  it("maps order header + line_items with seller_sku and qty", () => {
    const order = mapTiktokOrder({
      id: "5764607523456789012",
      status: "AWAITING_SHIPMENT",
      create_time: 1730448000,
      paid_time: 1730448600,
      payment: { currency: "USD", total_amount: "19.90" },
      line_items: [
        {
          id: "line-1",
          seller_sku: "TT-SKU-1",
          product_name: "Tee",
          quantity: 2,
          sale_price: "9.95",
        },
      ],
    })
    assert.equal(order.externalOrderId, "5764607523456789012")
    assert.equal(order.status, "ready_to_ship")
    assert.equal(order.currency, "USD")
    assert.equal(order.totalAmount, "19.90")
    assert.ok(order.placedAt)
    assert.ok(order.paidAt)
    assert.equal(order.lines?.length, 1)
    assert.equal(order.lines?.[0]?.externalLineId, "line-1")
    assert.equal(order.lines?.[0]?.sku, "TT-SKU-1")
    assert.equal(order.lines?.[0]?.qty, 2)
  })

  it("falls back to item_list and sku_id when seller_sku missing", () => {
    const line = mapTiktokOrderLine({
      id: "L2",
      sku_id: "SKU-ID-9",
      sku_name: "Fallback",
      quantity: 1,
      original_price: "3.00",
    })
    assert.equal(line.sku, "SKU-ID-9")
    assert.equal(line.title, "Fallback")
    assert.equal(line.unitPrice, "3.00")
  })

  it("maps cancelled order without inventing lines", () => {
    const order = mapTiktokOrder({
      order_id: "TT-CANCEL-1",
      status: "CANCELLED",
      line_items: [],
    })
    assert.equal(order.status, "cancelled")
    assert.deepEqual(order.lines, [])
  })

  it("maps product listing payload with sku price/inventory", () => {
    const product = mapTiktokProduct({
      id: "P-100",
      title: "Demo Hoodie",
      status: "ACTIVATE",
      skus: [
        {
          id: "S-1",
          seller_sku: "HOODIE-M",
          price: { amount: "29.9", currency: "USD" },
          inventory: { quantity: 12 },
        },
      ],
    })
    assert.equal(product.externalId, "P-100")
    assert.equal(product.skus?.[0]?.sellerSku, "HOODIE-M")
    assert.equal(product.skus?.[0]?.priceAmount, "29.9")
    assert.equal(product.skus?.[0]?.quantity, 12)
  })
})
