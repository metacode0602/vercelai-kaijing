import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildLazopSignBase,
  computeLazopPushSignature,
  signLazopRequest,
  verifyLazopPushSignature,
} from "./lazop"

describe("signLazopRequest", () => {
  it("matches Lazada Open Platform known vector", () => {
    const path = "/order/get"
    const secret = "helloworld"
    const params = {
      access_token: "test",
      app_key: "123456",
      order_id: "1234",
      sign_method: "sha256",
      timestamp: "1517820392000",
    }
    const base = buildLazopSignBase(path, params)
    assert.equal(
      base,
      "/order/getaccess_tokentestapp_key123456order_id1234sign_methodsha256timestamp1517820392000"
    )
    assert.equal(
      signLazopRequest(path, params, secret),
      "4190D32361CFB9581350222F345CB77F3B19F0E31D162316848A2C1FFD5FAB4A"
    )
  })

  it("ignores sign param and nullish values", () => {
    const sign = signLazopRequest(
      "/order/get",
      {
        access_token: "test",
        app_key: "123456",
        order_id: "1234",
        sign_method: "sha256",
        timestamp: "1517820392000",
        sign: "SHOULD_IGNORE",
        unused: null,
      },
      "helloworld"
    )
    assert.equal(
      sign,
      "4190D32361CFB9581350222F345CB77F3B19F0E31D162316848A2C1FFD5FAB4A"
    )
  })
})

describe("Lazop push signature", () => {
  const rawBody = '{"seller_id":"123"}'
  const appKey = "test_app"
  const appSecret = "secret"
  const expected =
    "42B1CF7F667571AF706750C9575D8B502282A58C56E35BAE9E26E8FFB8DEA36C"

  it("computes HMAC-SHA256 over appKey + raw body", () => {
    assert.equal(
      computeLazopPushSignature(appKey, appSecret, rawBody),
      expected
    )
  })

  it("accepts the exact signature and strips Bearer", () => {
    assert.equal(
      verifyLazopPushSignature({
        appKey,
        appSecret,
        rawBody,
        signature: expected,
      }),
      true
    )
    assert.equal(
      verifyLazopPushSignature({
        appKey,
        appSecret,
        rawBody,
        signature: `Bearer ${expected}`,
      }),
      true
    )
  })

  it("rejects tampered bodies and malformed signatures", () => {
    assert.equal(
      verifyLazopPushSignature({
        appKey,
        appSecret,
        rawBody: '{"seller_id":"124"}',
        signature: expected,
      }),
      false
    )
    assert.equal(
      verifyLazopPushSignature({
        appKey,
        appSecret,
        rawBody,
        signature: "not-a-signature",
      }),
      false
    )
  })
})
