import assert from "node:assert/strict"
import { test } from "node:test"
import { assertDesktopMarketplaceScope, DESKTOP_SCOPE_MESSAGE } from "@workspace/commerce-domain"

test("Desktop 工具强制 Daraz 斯里兰卡，其他平台返回中文说明", () => {
  assert.throws(() => assertDesktopMarketplaceScope({ platform: "tiktok" }), (error: unknown) => {
    assert.ok(error instanceof Error)
    assert.equal(error.message, DESKTOP_SCOPE_MESSAGE)
    return true
  })
  assert.throws(() => assertDesktopMarketplaceScope({ site: "PK" }), /Daraz 斯里兰卡/)
  assert.deepEqual(assertDesktopMarketplaceScope({ platform: "daraz", site: "LK" }), {
    platform: "daraz",
    site: "LK",
  })
})
