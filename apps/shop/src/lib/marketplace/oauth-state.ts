import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const COOKIE = 'marketplace_oauth_state'
const TTL_MS = 15 * 60 * 1000

function secret() {
  return (
    process.env.MARKETPLACE_CREDENTIALS_KEY ||
    process.env.BETTER_AUTH_SECRET ||
    'shop-dev-secret-change-me'
  )
}

export interface OAuthStatePayload {
  nonce: string
  platform: string
  shopId: string
  organizationId: string
  locale: string
  region?: string
  exp: number
}

function sign(body: string): string {
  return createHmac('sha256', secret()).update(body).digest('base64url')
}

export function encodeOAuthState(payload: Omit<OAuthStatePayload, 'nonce' | 'exp'> & { region?: string }) {
  const full: OAuthStatePayload = {
    ...payload,
    nonce: randomBytes(16).toString('hex'),
    exp: Date.now() + TTL_MS,
  }
  const body = Buffer.from(JSON.stringify(full), 'utf8').toString('base64url')
  return `${body}.${sign(body)}`
}

export function decodeOAuthState(state: string): OAuthStatePayload | null {
  const [body, sig] = state.split('.')
  if (!body || !sig) return null
  const expected = sign(body)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthStatePayload
    if (!parsed.exp || parsed.exp < Date.now()) return null
    return parsed
  } catch {
    return null
  }
}

export function oauthStateCookieOptions(maxAgeSec = Math.floor(TTL_MS / 1000)) {
  return {
    name: COOKIE,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSec,
  }
}

export { COOKIE as OAUTH_STATE_COOKIE }
