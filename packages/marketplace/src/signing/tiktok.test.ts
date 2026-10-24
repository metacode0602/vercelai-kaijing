import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { describe, it } from "node:test"
import { buildTiktokSignBase, signTiktokRequest } from "./tiktok"

describe("signTiktokRequest", () => {
  it("wraps path+sorted params with app_secret and HMACs", () => {
    const appSecret = "e59af819cc"
    const path = "/authorization/202309/shops"
    const params = { app_key: "29a39d", timestamp: "1623812664" }
    const base = buildTiktokSignBase(path, params, appSecret)
    assert.equal(
      base,
      `${appSecret}/authorization/202309/shopsapp_key29a39dtimestamp1623812664${appSecret}`,
    )
    const expected = createHmac("sha256", appSecret).update(base, "utf8").digest("hex")
    assert.equal(signTiktokRequest(path, params, appSecret), expected)
  })

  it("excludes sign and access_token from the base", () => {
    const appSecret = "secret"
    const a = signTiktokRequest(
      "/product/202309/products/search",
      { app_key: "k", timestamp: "1", sign: "x", access_token: "t" },
      appSecret,
      '{"status":"ACTIVE"}',
    )
    const b = signTiktokRequest(
      "/product/202309/products/search",
      { app_key: "k", timestamp: "1" },
      appSecret,
      '{"status":"ACTIVE"}',
    )
    assert.equal(a, b)
  })
})
