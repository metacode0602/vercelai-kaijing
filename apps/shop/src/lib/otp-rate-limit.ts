/**
 * OTP send / verify rate limiting for shop auth.
 *
 * Demo default: in-memory store (single Node process only — resets on restart,
 * not shared across replicas). Swap `createMemoryOtpRateLimitStore` for a Redis
 * implementation of `OtpRateLimitStore` when Redis is wired.
 *
 * Rules (apply to phone and email send):
 * - Min interval between sends per identifier: 60s
 * - Max sends per identifier: 5 / rolling 15 minutes
 * - Max sends per IP: 10 / rolling 15 minutes
 * - Max verify attempts per identifier+code window: 5 / 15 minutes
 */

export type OtpChannel = 'phone' | 'email'

export type RateLimitDecision =
  | { ok: true }
  | { ok: false; status: 429; message: string; retryAfterSeconds?: number }

export type OtpRateLimitStore = {
  /** Timestamp ms of last successful send for key */
  getLastSendAt(key: string): Promise<number | null>
  setLastSendAt(key: string, at: number): Promise<void>
  /** Count events in rolling window; returns new count after increment */
  incrementWindow(key: string, windowMs: number, now?: number): Promise<number>
  getWindowCount(key: string, windowMs: number, now?: number): Promise<number>
}

export const OTP_RATE_LIMIT = {
  minIntervalMs: 60_000,
  identifierWindowMs: 15 * 60_000,
  identifierMaxSends: 5,
  ipWindowMs: 15 * 60_000,
  ipMaxSends: 10,
  verifyWindowMs: 15 * 60_000,
  verifyMaxAttempts: 5,
} as const

type WindowEntry = { timestamps: number[] }

export function createMemoryOtpRateLimitStore(): OtpRateLimitStore {
  const lastSend = new Map<string, number>()
  const windows = new Map<string, WindowEntry>()

  function prune(entry: WindowEntry, windowMs: number, now: number) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs)
  }

  return {
    async getLastSendAt(key) {
      return lastSend.get(key) ?? null
    },
    async setLastSendAt(key, at) {
      lastSend.set(key, at)
    },
    async getWindowCount(key, windowMs, now = Date.now()) {
      const entry = windows.get(key)
      if (!entry) return 0
      prune(entry, windowMs, now)
      return entry.timestamps.length
    },
    async incrementWindow(key, windowMs, now = Date.now()) {
      const entry = windows.get(key) ?? { timestamps: [] }
      prune(entry, windowMs, now)
      entry.timestamps.push(now)
      windows.set(key, entry)
      return entry.timestamps.length
    },
  }
}

let defaultStore: OtpRateLimitStore | null = null

export function getOtpRateLimitStore(): OtpRateLimitStore {
  if (!defaultStore) defaultStore = createMemoryOtpRateLimitStore()
  return defaultStore
}

/** Test helper / Redis swap */
export function setOtpRateLimitStore(store: OtpRateLimitStore | null) {
  defaultStore = store
}

function identifierKey(channel: OtpChannel, identifier: string) {
  return `id:${channel}:${identifier.trim().toLowerCase()}`
}

function ipKey(ip: string) {
  return `ip:${ip || '0.0.0.0'}`
}

function verifyKey(channel: OtpChannel, identifier: string) {
  return `verify:${channel}:${identifier.trim().toLowerCase()}`
}

export async function checkAndConsumeSendRateLimit(params: {
  channel: OtpChannel
  identifier: string
  ip: string
  store?: OtpRateLimitStore
}): Promise<RateLimitDecision> {
  const store = params.store ?? getOtpRateLimitStore()
  const idKey = identifierKey(params.channel, params.identifier)
  const now = Date.now()

  const last = await store.getLastSendAt(idKey)
  if (last != null) {
    const elapsed = now - last
    if (elapsed < OTP_RATE_LIMIT.minIntervalMs) {
      const retryAfterSeconds = Math.ceil((OTP_RATE_LIMIT.minIntervalMs - elapsed) / 1000)
      return {
        ok: false,
        status: 429,
        retryAfterSeconds,
        message: `发送验证码过于频繁，请 ${retryAfterSeconds} 秒后再试`,
      }
    }
  }

  const idCount = await store.getWindowCount(idKey, OTP_RATE_LIMIT.identifierWindowMs, now)
  if (idCount >= OTP_RATE_LIMIT.identifierMaxSends) {
    return {
      ok: false,
      status: 429,
      message: '该账号验证码发送次数已达上限，请 15 分钟后再试',
    }
  }

  const ipCount = await store.getWindowCount(ipKey(params.ip), OTP_RATE_LIMIT.ipWindowMs, now)
  if (ipCount >= OTP_RATE_LIMIT.ipMaxSends) {
    return {
      ok: false,
      status: 429,
      message: '当前网络请求过于频繁，请稍后再试',
    }
  }

  await store.setLastSendAt(idKey, now)
  await store.incrementWindow(idKey, OTP_RATE_LIMIT.identifierWindowMs, now)
  await store.incrementWindow(ipKey(params.ip), OTP_RATE_LIMIT.ipWindowMs, now)
  return { ok: true }
}

export async function checkAndConsumeVerifyRateLimit(params: {
  channel: OtpChannel
  identifier: string
  store?: OtpRateLimitStore
}): Promise<RateLimitDecision> {
  const store = params.store ?? getOtpRateLimitStore()
  const key = verifyKey(params.channel, params.identifier)
  const count = await store.incrementWindow(key, OTP_RATE_LIMIT.verifyWindowMs)
  if (count > OTP_RATE_LIMIT.verifyMaxAttempts) {
    return {
      ok: false,
      status: 429,
      message: '验证码尝试次数过多，请重新获取验证码',
    }
  }
  return { ok: true }
}

export function getClientIpFromRequest(request: Request): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const xri = request.headers.get('x-real-ip')
  if (xri) return xri.trim()
  return '0.0.0.0'
}
