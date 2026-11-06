import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  computeAvailable,
  parseReserveQty,
  pickFulfillmentWarehouse,
  reservationIdempotencyKey,
} from "./reserve-rules"

describe("reserve-rules", () => {
  it("computes available excluding qc_hold and damaged", () => {
    assert.equal(
      computeAvailable({
        warehouseCode: "WH-A",
        onHand: 10,
        reserved: 2,
        qcHold: 3,
        damaged: 1,
      }),
      4
    )
    assert.equal(
      computeAvailable({
        warehouseCode: "WH-A",
        onHand: 5,
        reserved: 5,
        qcHold: 0,
        damaged: 0,
      }),
      0
    )
  })

  it("rejects non-integer or non-positive qty", () => {
    assert.equal(parseReserveQty(1).ok, true)
    assert.equal(parseReserveQty("2").ok, true)
    assert.equal(parseReserveQty(1.5).ok, false)
    assert.equal(parseReserveQty(0).ok, false)
    assert.equal(parseReserveQty(-1).ok, false)
    assert.equal(parseReserveQty("x").ok, false)
  })

  it("does not invent a default warehouse when none is available", () => {
    const none = pickFulfillmentWarehouse({
      requiredQty: 1,
      balances: [
        {
          warehouseCode: "WH-A",
          onHand: 5,
          reserved: 0,
          qcHold: 5,
          damaged: 0,
        },
      ],
    })
    assert.equal(none.ok, false)
    if (!none.ok) assert.match(none.reason, /无可用仓位/)
  })

  it("prefers explicit line/order warehouse and requires fit", () => {
    const balances = [
      {
        warehouseCode: "WH-A",
        onHand: 10,
        reserved: 0,
        qcHold: 0,
        damaged: 0,
      },
      {
        warehouseCode: "WH-B",
        onHand: 1,
        reserved: 0,
        qcHold: 0,
        damaged: 0,
      },
    ]
    const ok = pickFulfillmentWarehouse({
      lineWarehouseCode: "WH-B",
      requiredQty: 1,
      balances,
    })
    assert.equal(ok.ok, true)
    if (ok.ok) assert.equal(ok.warehouseCode, "WH-B")

    const fail = pickFulfillmentWarehouse({
      orderWarehouseCode: "WH-MISSING",
      requiredQty: 1,
      balances,
    })
    assert.equal(fail.ok, false)
  })

  it("picks highest available warehouse when none specified", () => {
    const pick = pickFulfillmentWarehouse({
      requiredQty: 2,
      balances: [
        {
          warehouseCode: "WH-SMALL",
          onHand: 2,
          reserved: 0,
          qcHold: 0,
          damaged: 0,
        },
        {
          warehouseCode: "WH-BIG",
          onHand: 9,
          reserved: 1,
          qcHold: 0,
          damaged: 0,
        },
      ],
    })
    assert.equal(pick.ok, true)
    if (pick.ok) assert.equal(pick.warehouseCode, "WH-BIG")
  })

  it("builds stable idempotency keys per order line", () => {
    assert.equal(
      reservationIdempotencyKey("ORD-1", "line-a"),
      "ledger:order_reserve:ORD-1:line-a"
    )
  })
})
