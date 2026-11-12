import assert from "node:assert/strict"
import { test } from "node:test"
import {
  DESKTOP_SCOPE_MESSAGE,
  assertDesktopMarketplaceScope,
  isDarazLkShop,
} from "./desktop-scope"

test("Desktop 工具只允许 Daraz LK", () => {
  assert.deepEqual(assertDesktopMarketplaceScope({}), { platform: "daraz", site: "LK" })
  assert.deepEqual(assertDesktopMarketplaceScope({ platform: "Daraz", site: "lk" }), {
    platform: "daraz",
    site: "LK",
  })
  assert.throws(() => assertDesktopMarketplaceScope({ platform: "lazada" }), (error: unknown) => {
    assert.ok(error instanceof Error)
    assert.equal(error.message, DESKTOP_SCOPE_MESSAGE)
    return true
  })
  assert.throws(() => assertDesktopMarketplaceScope({ site: "PK" }), /仅开放 Daraz 斯里兰卡/)
})

test("店铺判定：platform=daraz 且国家/地区为 LK", () => {
  assert.equal(isDarazLkShop({ platform: "daraz", marketplaceCountry: "LK" }), true)
  assert.equal(isDarazLkShop({ platform: "daraz", region: "lk" }), true)
  assert.equal(isDarazLkShop({ platform: "lazada", marketplaceCountry: "LK" }), false)
  assert.equal(isDarazLkShop({ platform: "daraz", marketplaceCountry: "PK" }), false)
})
