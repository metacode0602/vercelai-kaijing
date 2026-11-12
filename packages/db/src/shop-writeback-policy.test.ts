import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  isShopWriteSwitchEnabled,
  shopWriteSwitchDisabledReason,
  SHOP_INVENTORY_PUSH_DISABLED_REASON,
  SHOP_PRICE_WRITEBACK_DISABLED_REASON,
} from "./shop-writeback-policy"

describe("isShopWriteSwitchEnabled", () => {
  it("treats null, undefined and true as enabled (upgrade default ON)", () => {
    assert.equal(isShopWriteSwitchEnabled(null), true)
    assert.equal(isShopWriteSwitchEnabled(undefined), true)
    assert.equal(isShopWriteSwitchEnabled(true), true)
  })

  it("treats only explicit false as disabled", () => {
    assert.equal(isShopWriteSwitchEnabled(false), false)
  })
})

describe("shopWriteSwitchDisabledReason", () => {
  it("returns a clear Chinese skip reason per switch", () => {
    assert.equal(shopWriteSwitchDisabledReason("inventory"), SHOP_INVENTORY_PUSH_DISABLED_REASON)
    assert.equal(shopWriteSwitchDisabledReason("price"), SHOP_PRICE_WRITEBACK_DISABLED_REASON)
  })
})
