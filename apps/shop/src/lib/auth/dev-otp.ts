/**
 * Development-only OTP memo for optional `devCode` response field.
 * Never populated / never returned when NODE_ENV === 'production'.
 */

type Channel = 'phone' | 'email'

const store = new Map<string, { code: string; at: number }>()
const TTL_MS = 5 * 60_000

function key(channel: Channel, identifier: string) {
  return `${channel}:${identifier.trim().toLowerCase()}`
}

export function isDevOtpExposureEnabled() {
  return process.env.NODE_ENV === 'development'
}

export function rememberDevOtp(channel: Channel, identifier: string, code: string) {
  if (!isDevOtpExposureEnabled()) return
  store.set(key(channel, identifier), { code, at: Date.now() })
}

export function takeDevOtp(channel: Channel, identifier: string): string | undefined {
  if (!isDevOtpExposureEnabled()) return undefined
  const entry = store.get(key(channel, identifier))
  if (!entry) return undefined
  if (Date.now() - entry.at > TTL_MS) {
    store.delete(key(channel, identifier))
    return undefined
  }
  return entry.code
}
