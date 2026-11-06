import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { createRedisClient, type RedisClient } from '@workspace/redis'

const COOKIE = 'marketplace_oauth_state'
const TTL_MS = 15 * 60 * 1000
const NONCE_PREFIX = 'marketplace:oauth:nonce:'
const localNonces = new Map<string, number>()
let redis: RedisClient | null = null

function getRedis(): RedisClient {
  if (!redis) {
    redis = createRedisClient({ maxRetriesPerRequest: 1 })
    redis.on('error', () => undefined)
  }
  return redis
}

function withTimeout<T>(promise: Promise<T>, ms = 500): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('redis timeout')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function secret() {
  return (
    process.env.MARKETPLACE_CREDENTIALS_KEY ||
    process.env.BETTER_AUTH_SECRET ||
    'shop-dev-secret-change-me'
  )
}

export type OAuthStateMode = 'bind' | 'reauth'

export interface OAuthStatePayload {
  nonce: string
  mode: OAuthStateMode
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

export function encodeOAuthState(
  payload: Omit<OAuthStatePayload, 'nonce' | 'exp'> & { region?: string },
) {
  const full: OAuthStatePayload = {
    ...payload,
    nonce: randomBytes(16).toString('hex'),
    exp: Date.now() + TTL_MS,
  }
  const body = Buffer.from(JSON.stringify(full), 'utf8').toString('base64url')
  return `${body}.${sign(body)}`
}

export async function storeOAuthNonce(nonce: string): Promise<void> {
  localNonces.set(nonce, Date.now() + TTL_MS)
  try {
    await withTimeout(
      getRedis().set(`${NONCE_PREFIX}${nonce}`, '1', 'EX', Math.floor(TTL_MS / 1000)),
    )
  } catch {
    // 本地 Redis 不可用时退化为单实例内存 nonce。
  }
}

export async function consumeOAuthNonce(nonce: string): Promise<boolean> {
  const expiresAt = localNonces.get(nonce)
  const consumedLocal = Boolean(expiresAt && expiresAt > Date.now())
  localNonces.delete(nonce)
  const key = `${NONCE_PREFIX}${nonce}`
  if (consumedLocal) {
    try {
      await withTimeout(getRedis().del(key))
    } catch {
      // 已由本地 nonce 完成校验，Redis 清理失败不阻塞回调。
    }
    return true
  }
  try {
    const client = getRedis()
    const value = await withTimeout(client.get(key))
    if (value) await withTimeout(client.del(key))
    return Boolean(value)
  } catch {
    return false
  }
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
