/**
 * 短信验证码拼图：challenge 创建、图片读取、校验、一次性 token 发放与消费
 * 与 Better-Auth 自定义 captcha 插件配合：校验通过后返回 token，前端通过 Header 携带，插件内消费
 */

import crypto from 'node:crypto'
import { createRedisClient, type RedisClient } from '@workspace/redis'
import { createPuzzle } from './puzzle-generator'
import type { SmsCaptchaConfig, CreateJigsawChallengeResult, VerifyJigsawResult } from '../types'

const CHALLENGE_PREFIX = 'sms_captcha_challenge:'
const TOKEN_PREFIX = 'sms_captcha_token:'

type ChallengeData = {
  x: number
  y: number
  attempts: number
  bgBase64: string
  puzzleBase64: string
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
      console.warn('[Redis sms-captcha]', err.message)
    }
  })
  return redis
}

function getTTL(config?: SmsCaptchaConfig) {
  return config?.ttl ?? 120
}

function getMaxAttempts(config?: SmsCaptchaConfig) {
  return config?.maxAttempts ?? 5
}

function getTolerancePx(config?: SmsCaptchaConfig) {
  return config?.tolerancePx ?? 12
}

/**
 * 图片访问地址的来源 URL：只在显式传入 config.appUrl 时拼绝对地址。
 * 默认输出相对路径，由浏览器按页面当前源解析，避免 env 中的
 * NEXT_PUBLIC_APP_URL 与实际访问端口/域名不一致导致拼图图片加载失败。
 */
function getAppUrl(config?: SmsCaptchaConfig) {
  return config?.appUrl?.replace(/\/$/, '') ?? ''
}

function getApiBasePath(config?: SmsCaptchaConfig) {
  return config?.apiBasePath ?? '/api/auth/sms-captcha'
}

/**
 * 创建拼图 challenge：生成 bg/puzzle，存 Redis，返回 challengeId 与图片 URL（不包含 x,y）
 */
export async function createJigsawChallenge(
  config?: SmsCaptchaConfig
): Promise<CreateJigsawChallengeResult> {
  const r = getRedis(config)
  const challengeId = crypto.randomUUID()
  const { bg, puzzle, x, y } = await createPuzzle(undefined, {
    galleryDir: config?.galleryDir,
  })
  const data: ChallengeData = {
    x,
    y,
    attempts: 0,
    bgBase64: bg.toString('base64'),
    puzzleBase64: puzzle.toString('base64'),
  }
  const value = JSON.stringify(data)
  await r.setex(CHALLENGE_PREFIX + challengeId, getTTL(config), value)

  const base = getAppUrl(config)
  const apiBase = getApiBasePath(config)
  const bgUrl = `${base}${apiBase}/image?challengeId=${encodeURIComponent(challengeId)}&type=bg`
  const puzzleUrl = `${base}${apiBase}/image?challengeId=${encodeURIComponent(challengeId)}&type=puzzle`

  return { challengeId, bgUrl, puzzleUrl, puzzleY: data.y }
}

/**
 * 根据 challengeId 与 type 取背景图或拼图 Buffer
 */
export async function getChallengeImage(
  challengeId: string,
  type: 'bg' | 'puzzle',
  config?: SmsCaptchaConfig
): Promise<Buffer | null> {
  const r = getRedis(config)
  const raw = await r.get(CHALLENGE_PREFIX + challengeId)
  if (!raw) return null
  const data = JSON.parse(raw) as ChallengeData
  const b64 = type === 'bg' ? data.bgBase64 : data.puzzleBase64
  return Buffer.from(b64, 'base64')
}

/**
 * 拼图校验：比对前端提交的 x 与 Redis 中存储的缺口位置，通过则发放一次性 token
 */
export async function verifyJigsawChallenge(
  challengeId: string,
  x: number,
  y?: number,
  config?: SmsCaptchaConfig
): Promise<VerifyJigsawResult> {
  const r = getRedis(config)
  const key = CHALLENGE_PREFIX + challengeId
  const raw = await r.get(key)
  if (!raw) return { ok: false, error: 'INVALID_CHALLENGE' }
  const data = JSON.parse(raw) as ChallengeData

  if (data.attempts >= getMaxAttempts(config)) {
    await r.del(key)
    return { ok: false, error: 'TOO_MANY_ATTEMPTS' }
  }

  const diffX = Math.abs(x - data.x)
  const pass = diffX <= getTolerancePx(config)

  if (!pass) {
    data.attempts += 1
    await r.setex(key, getTTL(config), JSON.stringify(data))
    return { ok: false, error: 'SLIDER_MISMATCH' }
  }

  await r.del(key)
  const token = crypto.randomBytes(16).toString('hex')
  await r.setex(TOKEN_PREFIX + token, getTTL(config), '1')
  return { ok: true, token }
}

/**
 * 校验并消费 token（一次性），存在则删除并返回 true；供 Better-Auth 插件使用
 */
export async function consumeAndValidateToken(
  token: string,
  config?: SmsCaptchaConfig
): Promise<boolean> {
  const r = getRedis(config)
  const key = TOKEN_PREFIX + token
  const exists = await r.get(key)
  if (!exists) return false
  await r.del(key)
  return true
}
