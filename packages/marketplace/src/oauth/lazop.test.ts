import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { buildLazopAuthorizeUrl } from "./lazop"
import { resolveLazopTokenBase } from "../regions/endpoints"

describe("lazop oauth hosts", () => {
  it("uses the Daraz regional host for authorize and token", () => {
    const url = new URL(
      buildLazopAuthorizeUrl({
        family: "daraz",
        region: "lk",
        appKey: "app",
        redirectUri: "https://example.com/cb",
        state: "state",
      }),
    )
    assert.equal(url.origin, "https://api.daraz.lk")
    assert.equal(url.pathname, "/oauth/authorize")
    assert.equal(
      resolveLazopTokenBase("daraz", "lk"),
      "https://api.daraz.lk/rest",
    )
  })

  it("uses the shared Lazada auth host for authorize and token", () => {
    const url = new URL(
      buildLazopAuthorizeUrl({
        family: "lazada",
        region: "my",
        appKey: "app",
        redirectUri: "https://example.com/cb",
        state: "state",
      }),
    )
    assert.equal(url.origin, "https://auth.lazada.com")
    assert.equal(url.pathname, "/oauth/authorize")
    assert.equal(
      resolveLazopTokenBase("lazada", "my"),
      "https://auth.lazada.com/rest",
    )
  })
})
