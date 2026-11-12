import assert from "node:assert/strict"
import { test } from "node:test"
import {
  API_KEY_TOKEN_PREFIX,
  apiKeyHashesEqual,
  generateApiKeySecret,
  hashApiKey,
  isOpenshopApiKeyToken,
} from "./api-keys"

test("生成的密钥带 os_sk_ 前缀，哈希可复核且不含明文", () => {
  const secret = generateApiKeySecret()
  assert.equal(secret.plaintext.startsWith(API_KEY_TOKEN_PREFIX), true)
  assert.equal(isOpenshopApiKeyToken(secret.plaintext), true)
  assert.equal(secret.hash, hashApiKey(secret.plaintext))
  assert.equal(secret.hash.includes(secret.plaintext), false)
  assert.equal(secret.prefix.startsWith(API_KEY_TOKEN_PREFIX), true)
  assert.notEqual(secret.prefix, secret.plaintext)
})

test("哈希比较是恒定时间的等值判断", () => {
  const secret = generateApiKeySecret()
  assert.equal(apiKeyHashesEqual(secret.hash, hashApiKey(secret.plaintext)), true)
  assert.equal(apiKeyHashesEqual(secret.hash, hashApiKey("os_sk_other")), false)
})

test("内部同步密钥形态不会被误认为工作台 API 密钥", () => {
  assert.equal(isOpenshopApiKeyToken("internal-sync-secret"), false)
})
