export type CreateJigsawChallengeResult = {
  challengeId: string
  bgUrl: string
  puzzleUrl: string
  puzzleY: number
}

export type VerifyJigsawResult =
  | { ok: true; token: string }
  | { ok: false; error: 'INVALID_CHALLENGE' | 'SLIDER_MISMATCH' | 'TOO_MANY_ATTEMPTS' }

export type SmsCaptchaConfig = {
  redis?: {
    /** Upstash Redis REST URL（优先级高于本地配置，未配置时回落 REDIS_* 环境变量） */
    url?: string
    /** Upstash Redis REST Token */
    token?: string
    /** 本地 Redis 连接 URL（redis:// 或 rediss://，优先级高于 host/port） */
    redisUrl?: string
    host?: string
    port?: number
    password?: string
    db?: number
  }
  /** 拼图图片目录（相对 process.cwd()），默认 'public/images/blog' */
  galleryDir?: string
  /** challenge/token TTL 秒数，默认 120 */
  ttl?: number
  /** 最大尝试次数，默认 5 */
  maxAttempts?: number
  /** x 像素容差，默认 12 */
  tolerancePx?: number
  /** 图片访问地址的来源 URL（跨源部署时显式传入）；不传时生成相对路径，推荐同源接入使用 */
  appUrl?: string
  /** API 路由基础路径，默认 '/api/auth/sms-captcha' */
  apiBasePath?: string
}

export type RateLimitType =
  | 'smsPhoneMinute'
  | 'smsPhoneHour'
  | 'smsIpHour'
  | 'smsCaptchaChallengeIpMinute'
  | 'smsCaptchaVerifyIpMinute'

export type RateLimitResult = {
  ok: boolean
  remaining: number
  resetTime: number
  total: number
}

/** 兼容 better-auth 等传入的 context（可能带 request 或 headers） */
export type RequestLike = Request | { request?: Request; headers?: Headers } | undefined
