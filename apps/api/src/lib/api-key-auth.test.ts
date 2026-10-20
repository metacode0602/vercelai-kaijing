/**
 * API-Key 鉴权中间件的纯逻辑测试。
 *
 * 只覆盖不需要数据库的部分：401/403 语义分界、错误响应体、header 提取。
 * 依赖真实 DB 的端到端行为（跨商户隔离、吊销、过期）用 curl + 本地 Postgres 验证。
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { extractApiKeyFromHeader, MerchantApiKeyError } from "@workspace/auth"
import { STATUS_BY_CODE, apiKeyErrorBody } from "./api-key-status"

describe("API-Key 错误状态码映射", () => {
  it("凭证本身不可信 → 401（缺失/无效/吊销/过期）", () => {
    for (const code of [
      "API_KEY_MISSING",
      "API_KEY_INVALID",
      "API_KEY_REVOKED",
      "API_KEY_EXPIRED",
    ] as const) {
      assert.equal(STATUS_BY_CODE[code], 401, `${code} 应为 401`)
    }
  })

  it("凭证有效但 scope 不足 → 403", () => {
    assert.equal(STATUS_BY_CODE.API_KEY_SCOPE_DENIED, 403)
  })
})

describe("鉴权失败响应体", () => {
  it("403 场景带上 requiredScope，让商户知道要申请哪个权限", () => {
    const body = apiKeyErrorBody("API_KEY_SCOPE_DENIED", "缺少 scope", "consumption:write")
    assert.deepEqual(body, {
      error: "unauthorized",
      code: "API_KEY_SCOPE_DENIED",
      message: "缺少 scope",
      requiredScope: "consumption:write",
    })
  })

  it("401 场景绝不泄露 requiredScope（否则等于泄露权限探测面）", () => {
    for (const code of ["API_KEY_MISSING", "API_KEY_INVALID", "API_KEY_REVOKED"] as const) {
      const body = apiKeyErrorBody(code, "x", "consumption:write")
      assert.equal(body.requiredScope, undefined, `${code} 不应带 requiredScope`)
    }
  })

  it("错误码全部有映射，不会漏成 undefined", () => {
    const codes: MerchantApiKeyError["code"][] = [
      "API_KEY_MISSING",
      "API_KEY_INVALID",
      "API_KEY_REVOKED",
      "API_KEY_EXPIRED",
      "API_KEY_SCOPE_DENIED",
    ]
    for (const code of codes) {
      assert.ok(STATUS_BY_CODE[code] === 401 || STATUS_BY_CODE[code] === 403, `${code} 未映射`)
    }
    assert.equal(Object.keys(STATUS_BY_CODE).length, codes.length)
  })
})

describe("Authorization 头提取", () => {
  it("接受 Bearer 与 Token 两种 scheme", () => {
    assert.equal(extractApiKeyFromHeader("Bearer grk_abc"), "grk_abc")
    assert.equal(extractApiKeyFromHeader("Token grk_abc"), "grk_abc")
  })

  it("大小写不敏感", () => {
    assert.equal(extractApiKeyFromHeader("bearer grk_abc"), "grk_abc")
  })

  it("裸 key（无 scheme）也接受，兼容直接发 key 的客户端", () => {
    assert.equal(extractApiKeyFromHeader("grk_abc"), "grk_abc")
  })

  it("容忍 scheme 与 token 之间的多余空白（HTTP 常见形态）", () => {
    assert.equal(extractApiKeyFromHeader("Bearer  grk_abc  "), "grk_abc")
  })

  it("缺失 / 畸形 / 未知 scheme 一律 null，绝不返回半截 token", () => {
    for (const raw of [
      null,
      undefined,
      "",
      "Bearer",
      "Bearer ",
      "Basic dXNlcjpwYXNz",
      "grk_a b c",
      "grk_abc grk_def",
    ]) {
      assert.equal(extractApiKeyFromHeader(raw as string), null, `${raw} 应为 null`)
    }
  })
})
