import { createRedisClient, type RedisClient } from '@workspace/redis'
import type { SmsCaptchaConfig, RateLimitType, RateLimitResult } from '../types'

const RATE_LIMITS: Record<RateLimitType, { limit: number; period: number }> = {
  smsPhoneMinute: { limit: 1, period: 60 * 1000 },
  smsPhoneHour: { limit: 5, period: 60 * 60 * 1000 },
  smsIpHour: { limit: 10, period: 60 * 60 * 1000 },
  smsCaptchaChallengeIpMinute: { limit: 20, period: 60 * 1000 },
  smsCaptchaVerifyIpMinute: { limit: 60, period: 60 * 1000 },
}

let redis: RedisClient | null = null

function getRedis(config?: SmsCaptchaConfig): RedisClient {
  if (redis) return redis
  redis = createRedisClient({
    url: config?.redis?.url,
    token: config?.redis?.token,
    redisUrl: config?.redis?.redisUrl,
    host: config?.redis?.host,
    port: config?.redis?.port,
    password: config?.redis?.password,
    db: config?.redis?.db,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    retryStrategy: () => null,
  })
  redis.on('error', (err) => {
    if (process.env.NEXT_PHASE !== 'phase-production-build') {
      console.warn('[Redis rate-limiter]', err.message)
    }
  })
  return redis
}

function getRedisKey(limitType: RateLimitType, key: string): string {
  return `rate_limit:${limitType}:${key}`
}

function getResetTime(period: number): number {
  return Date.now() + period
}

export async function checkRateLimit(
  limitType: RateLimitType,
  key: string,
  config?: SmsCaptchaConfig
): Promise<RateLimitResult> {
  const r = getRedis(config)
  const config_ = RATE_LIMITS[limitType]
  const redisKey = getRedisKey(limitType, key)

  try {
    const current = await r.get(redisKey)
    const count = current ? Number.parseInt(current, 10) : 0
    return {
      ok: count < config_.limit,
      remaining: Math.max(0, config_.limit - count),
      resetTime: getResetTime(config_.period),
      total: config_.limit,
    }
  } catch {
    return {
      ok: true,
      remaining: config_.limit,
      resetTime: Date.now() + config_.period,
      total: config_.limit,
    }
  }
}

export async function consumeRateLimit(
  limitType: RateLimitType,
  key: string,
  options: { throws?: boolean } = {},
  config?: SmsCaptchaConfig
): Promise<RateLimitResult> {
  const r = getRedis(config)
  const config_ = RATE_LIMITS[limitType]
  const redisKey = getRedisKey(limitType, key)

  try {
    const pipeline = r.pipeline()
    pipeline.incr(redisKey)
    pipeline.expire(redisKey, Math.ceil(config_.period / 1000))
    const results = await pipeline.exec()
    const count = results?.[0]?.[1] as number

    if (count === 1) {
      await r.expire(redisKey, Math.ceil(config_.period / 1000))
    }

    const result: RateLimitResult = {
      ok: count <= config_.limit,
      remaining: Math.max(0, config_.limit - count),
      resetTime: getResetTime(config_.period),
      total: config_.limit,
    }

    if (!result.ok && options.throws) {
      throw new Error(`Rate limit exceeded for ${limitType}`)
    }

    return result
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Rate limit')) throw error
    return {
      ok: true,
      remaining: config_.limit,
      resetTime: Date.now() + config_.period,
      total: config_.limit,
    }
  }
}

/** 短信验证码限流：先检查三个维度均未超限，再统一扣减 */
export async function checkAndConsumeSmsRateLimit(
  phoneNumber: string,
  ip: string,
  config?: SmsCaptchaConfig
): Promise<void> {
  const r1 = await checkRateLimit('smsPhoneMinute', phoneNumber, config)
  const r2 = await checkRateLimit('smsPhoneHour', phoneNumber, config)
  const r3 = await checkRateLimit('smsIpHour', ip, config)
  if (!r1.ok) throw new Error('发送验证码过于频繁，请 1 分钟后再试')
  if (!r2.ok) throw new Error('该手机号今日验证码次数已达上限，请稍后再试')
  if (!r3.ok) throw new Error('请求过于频繁，请稍后再试')
  await consumeRateLimit('smsPhoneMinute', phoneNumber, { throws: true }, config)
  await consumeRateLimit('smsPhoneHour', phoneNumber, { throws: true }, config)
  await consumeRateLimit('smsIpHour', ip, { throws: true }, config)
}
