import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  parseInventoryPriceWriteTarget,
  resolveWriteKind,
} from "./inventory-price-write-core"
import {
  platformSupportsPriceQuantityWrite,
  unsupportedPriceQuantityWriteMessage,
} from "@workspace/marketplace"

describe("parseInventoryPriceWriteTarget", () => {
  it("parses a single listing target", () => {
    assert.deepEqual(parseInventoryPriceWriteTarget("listing:lst_1"), { listingId: "lst_1", kind: undefined })
    assert.deepEqual(parseInventoryPriceWriteTarget("listing:lst_1#price"), { listingId: "lst_1", kind: "price" })
    assert.deepEqual(parseInventoryPriceWriteTarget("listing:lst_1#inventory"), {
      listingId: "lst_1",
      kind: "inventory",
    })
  })

  it("returns empty for shop-wide or informal targets", () => {
    assert.deepEqual(parseInventoryPriceWriteTarget("控制台手动入队"), {})
    assert.deepEqual(parseInventoryPriceWriteTarget(undefined), {})
  })
})

describe("resolveWriteKind", () => {
  it("prefers target kind then task type, defaulting to inventory", () => {
    assert.equal(resolveWriteKind("inventory", "price"), "price")
    assert.equal(resolveWriteKind("price"), "price")
    assert.equal(resolveWriteKind("inventory"), "inventory")
    assert.equal(resolveWriteKind(undefined), "inventory")
  })
})

describe("platform honesty", () => {
  it("keeps platforms without a callable write API as unsupported", () => {
    assert.equal(platformSupportsPriceQuantityWrite("daraz"), true)
    assert.equal(platformSupportsPriceQuantityWrite("lazada"), true)
    assert.equal(platformSupportsPriceQuantityWrite("tiktok_shop"), false)
    assert.equal(platformSupportsPriceQuantityWrite("shopee"), false)
    assert.match(unsupportedPriceQuantityWriteMessage("shopee"), /暂无已接入/)
  })
})
