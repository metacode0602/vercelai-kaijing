import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  mapLazopOrder,
  mapLazopOrderItems,
  mapLazopPayoutStatus,
  mapLazopProduct,
  mapLazopTransactionDetail,
  parseMoneyWithCurrency,
} from "./lazop"

describe("lazop pure mappers", () => {
  it("treats empty order items array as valid (not a fetch failure)", () => {
    assert.deepEqual(mapLazopOrderItems({ data: [] }), [])
    assert.deepEqual(mapLazopOrderItems({ data: { order_items: [] } }), [])
  })

  it("maps order items as unit lines with qty=1", () => {
    const lines = mapLazopOrderItems({
      data: [
        {
          order_item_id: 101,
          sku: "TEE-BLK-L",
          name: "Tee Black L",
          paid_price: "12.50",
          currency: "LKR",
        },
        {
          order_item_id: 102,
          sku: "TEE-BLK-L",
          name: "Tee Black L",
          paid_price: "12.50",
          currency: "LKR",
        },
      ],
    })
    assert.equal(lines.length, 2)
    assert.equal(lines[0]!.externalLineId, "101")
    assert.equal(lines[0]!.qty, 1)
    assert.equal(lines[1]!.externalLineId, "102")
    assert.equal(lines[1]!.sku, "TEE-BLK-L")
  })

  it("maps order header and merges item lines", () => {
    const order = mapLazopOrder(
      {
        order_id: "9001",
        statuses: ["pending"],
        price: "25.00",
        price_unit: "LKR",
        created_at: "2026-11-01 10:00:00",
      },
      mapLazopOrderItems({
        data: [
          {
            order_item_id: "a1",
            sku: "SKU-1",
            name: "Item",
            paid_price: "25.00",
            payment_time: 1730448000000,
          },
        ],
      })
    )
    assert.equal(order.externalOrderId, "9001")
    assert.equal(order.status, "created")
    assert.equal(order.lines?.length, 1)
    assert.equal(order.lines?.[0]?.externalLineId, "a1")
    assert.ok(order.paidAt)
  })

  it("maps product / listing payload", () => {
    const product = mapLazopProduct({
      item_id: "ITEM-9",
      status: "Active",
      attributes: { name: "Demo Tee" },
      skus: [{ sku_id: "S1", SellerSku: "TEE-1", price: "9.9", quantity: 3 }],
    })
    assert.equal(product.externalId, "ITEM-9")
    assert.equal(product.status, "live")
    assert.equal(product.skus?.[0]?.sellerSku, "TEE-1")
  })

  it("parses payout amount with currency suffix", () => {
    assert.deepEqual(parseMoneyWithCurrency("3962.41 EUR"), {
      amount: "3962.41",
      currency: "EUR",
    })
    const settlement = mapLazopPayoutStatus({
      statement_number: "STMT-1",
      payout: "100.00 LKR",
      paid: "1",
      item_revenue: "120.00",
      fees_total: "20.00",
      opening_balance: "0",
      closing_balance: "100.00",
    })
    assert.equal(settlement.externalSettlementId, "STMT-1")
    assert.equal(settlement.payoutAmount, "100.00")
    assert.equal(settlement.currency, "LKR")
    assert.equal(settlement.paid, true)
    assert.equal(settlement.payoutStatus, "paid")
  })

  it("maps transaction detail without inventing amounts", () => {
    const line = mapLazopTransactionDetail({
      transaction_number: "Seller-1",
      fee_name: "Commission",
      fee_type: "COM",
      amount: "-1.20",
      currency: "LKR",
      order_no: "9001",
      seller_sku: "TEE-1",
      paid_status: "Not paid",
      statement: "STMT-1",
    })
    assert.equal(line.externalTransactionId, "Seller-1")
    assert.equal(line.amount, "-1.20")
    assert.equal(line.feeKind, "platform")
    assert.equal(line.statement, "STMT-1")
  })
})
