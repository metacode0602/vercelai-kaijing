import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

/** 工作台 API 密钥前缀。禁止与 INTERNAL_SYNC_API_KEY 混用。 */
export const API_KEY_TOKEN_PREFIX = "os_sk_"

export function isOpenshopApiKeyToken(value: string): boolean {
  return value.startsWith(API_KEY_TOKEN_PREFIX)
}

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex")
}

export function apiKeyPublicPrefix(plaintext: string): string {
  return plaintext.slice(0, API_KEY_TOKEN_PREFIX.length + 8)
}

export function generateApiKeySecret(): {
  plaintext: string
  prefix: string
  hash: string
} {
  const plaintext = `${API_KEY_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`
  return {
    plaintext,
    prefix: apiKeyPublicPrefix(plaintext),
    hash: hashApiKey(plaintext),
  }
}

export function apiKeyHashesEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8")
  const b = Buffer.from(right, "utf8")
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
