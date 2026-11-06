/**
 * LAZOP (Daraz / Lazada) request signature.
 *
 * Algorithm (official SDK / Open Platform docs):
 * 1. Sort all params (except `sign` and byte arrays) by key ASCII order
 * 2. Concatenate key+value with no separators
 * 3. Prepend the API path (e.g. `/order/get`)
 * 4. Optionally append request body for POST
 * 5. HMAC-SHA256 with app secret; uppercase hex
 *
 * Known vector (Lazada docs):
 * path=/order/get secret=helloworld
 * params: access_token=test app_key=123456 order_id=1234 sign_method=sha256 timestamp=1517820392000
 * → 4190D32361CFB9581350222F345CB77F3B19F0E31D162316848A2C1FFD5FAB4A
 */

import { createHmac, timingSafeEqual } from "node:crypto"

export type LazopSignParams = Record<
  string,
  string | number | boolean | undefined | null
>

export function buildLazopSignBase(
  apiPath: string,
  params: LazopSignParams,
  body?: string
): string {
  const path = apiPath.startsWith("/") ? apiPath : `/${apiPath}`
  const entries = Object.entries(params)
    .filter(
      ([key, value]) => key !== "sign" && value !== undefined && value !== null
    )
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

  let base = path
  for (const [key, value] of entries) {
    base += `${key}${value}`
  }
  if (body) {
    base += body
  }
  return base
}

export function signLazopRequest(
  apiPath: string,
  params: LazopSignParams,
  appSecret: string,
  body?: string
): string {
  const base = buildLazopSignBase(apiPath, params, body)
  return createHmac("sha256", appSecret)
    .update(base, "utf8")
    .digest("hex")
    .toUpperCase()
}

/**
 * LAZOP push (webhook) signature.
 *
 * Lazada sends `Authorization: HEX(HMAC_SHA256(appKey + rawBody, appSecret))`.
 * The signature must be computed over the exact raw request body, not a
 * re-serialized JSON payload.
 */
export function computeLazopPushSignature(
  appKey: string,
  appSecret: string,
  rawBody: string
): string {
  return createHmac("sha256", appSecret)
    .update(`${appKey}${rawBody}`, "utf8")
    .digest("hex")
    .toUpperCase()
}

export function verifyLazopPushSignature(input: {
  appKey: string
  appSecret: string
  rawBody: string
  signature: string
}): boolean {
  const provided = input.signature
    .trim()
    .replace(/^bearer\s+/i, "")
    .toUpperCase()
  if (!/^[0-9A-F]+$/.test(provided)) return false

  const expected = computeLazopPushSignature(
    input.appKey,
    input.appSecret,
    input.rawBody
  )
  if (expected.length !== provided.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
}
