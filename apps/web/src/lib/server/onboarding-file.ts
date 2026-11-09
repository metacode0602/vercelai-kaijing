import { createHmac, timingSafeEqual } from 'node:crypto'

const TTL_SECONDS = 300

function secret(): string {
  const value =
    process.env.ONBOARDING_FILE_SECRET?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim()
  if (!value) throw new Error('ONBOARDING_FILE_SECRET 未配置')
  return value
}

function signature(key: string, expires: number): string {
  return createHmac('sha256', secret()).update(`${key}:${expires}`).digest('hex')
}

export function signOnboardingFileUrl(
  uri: string | null,
  name?: string | null,
): string | null {
  if (!uri) return null
  const expires = Math.floor(Date.now() / 1000) + TTL_SECONDS
  const params = new URLSearchParams({
    key: uri,
    expires: String(expires),
    sig: signature(uri, expires),
  })
  if (name) params.set('name', name)
  return `/api/onboarding/file?${params.toString()}`
}

export function verifyOnboardingFileSignature(input: {
  key: string
  expires: string | null
  sig: string | null
}): boolean {
  if (!input.expires || !input.sig) return false
  const expires = Number(input.expires)
  if (!Number.isFinite(expires)) return false
  const now = Math.floor(Date.now() / 1000)
  if (expires < now || expires > now + TTL_SECONDS + 60) return false
  const expected = Buffer.from(signature(input.key, expires))
  const actual = Buffer.from(input.sig)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
