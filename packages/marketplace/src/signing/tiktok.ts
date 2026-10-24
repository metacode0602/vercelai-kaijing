/**
 * TikTok Shop Partner Center request signature (API style 202309+).
 *
 * 1. Collect query params excluding `sign` and `access_token`
 * 2. Sort keys alphabetically; concatenate `{key}{value}`
 * 3. Prepend exact request path (e.g. `/authorization/202309/shops`)
 * 4. If body is not multipart, append raw body bytes
 * 5. Wrap with app_secret on both ends
 * 6. HMAC-SHA256 with app_secret; lowercase hex
 */

import { createHmac } from "node:crypto"

export type TiktokSignParams = Record<string, string | number | boolean | undefined | null>

const EXCLUDED = new Set(["sign", "access_token"])

export function buildTiktokSignBase(
  path: string,
  params: TiktokSignParams,
  appSecret: string,
  body?: string,
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  const keys = Object.keys(params)
    .filter((key) => !EXCLUDED.has(key) && params[key] !== undefined && params[key] !== null)
    .sort()

  let middle = normalizedPath
  for (const key of keys) {
    middle += `${key}${String(params[key])}`
  }
  if (body) {
    middle += body
  }
  return `${appSecret}${middle}${appSecret}`
}

export function signTiktokRequest(
  path: string,
  params: TiktokSignParams,
  appSecret: string,
  body?: string,
): string {
  const base = buildTiktokSignBase(path, params, appSecret, body)
  return createHmac("sha256", appSecret).update(base, "utf8").digest("hex")
}
