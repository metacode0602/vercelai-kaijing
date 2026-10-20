import { sms as tencentcloudSms } from 'tencentcloud-sdk-nodejs'
import { createRedisClient, type RedisClient } from './index'

type TencentSmsClientCtor = typeof tencentcloudSms.v20210111.Client
type TencentSmsClient = InstanceType<TencentSmsClientCtor>
type TencentSendSmsRequest = Parameters<TencentSmsClient['SendSms']>[0]
type TencentSendSmsResponse = Awaited<ReturnType<TencentSmsClient['SendSms']>>

/**
 * 统一腾讯云短信配置：
 * 优先读取 COS_* 变量（COS_SECRET_ID / COS_SECRET_KEY / COS_SMS_APPID / COS_SMS_TEMPLATEID / COS_SMS_SIGN_NAME），
 * 兼容历史遗留的 SMS_TENCENT_* / SMS_* / COS_SECERT_* 变量名。
 */
function env(...names: Array<string | undefined>): string | undefined {
  for (const name of names) {
    const value = name ? process.env[name] : undefined
    if (value) return value
  }
  return undefined
}

function requiredConfig(): {
  secretId: string
  secretKey: string
  appId: string
  templateId: string
  signName: string
  region: string
} {
  const secretId = env('COS_SECRET_ID', 'SMS_TENCENT_SECRET_ID', 'COS_SECERT_ID')
  const secretKey = env('COS_SECRET_KEY', 'SMS_TENCENT_SECRET_KEY', 'COS_SECERT_KEY')
  const appId = env('COS_SMS_APPID', 'SMS_SDK_APP_ID')
  const templateId = env('COS_SMS_TEMPLATEID', 'SMS_TEMPLATE_ID')
  const signName = env('COS_SMS_SIGN_NAME', 'SMS_SIGN_NAME')
  const region = env('SMS_REGION') ?? 'ap-nanjing'

  const missing = [
    ['COS_SECRET_ID', secretId],
    ['COS_SECRET_KEY', secretKey],
    ['COS_SMS_APPID', appId],
    ['COS_SMS_TEMPLATEID', templateId],
    ['COS_SMS_SIGN_NAME', signName],
  ]
    .filter(([, v]) => !v)
    .map(([n]) => n)
  if (missing.length > 0) {
    throw new Error(`Tencent Sms 缺少配置: ${missing.join(', ')}`)
  }

  return {
    secretId: secretId as string,
    secretKey: secretKey as string,
    appId: appId as string,
    templateId: templateId as string,
    signName: signName as string,
    region,
  }
}

/** 验证码有效期（分钟），环境变量 COS_SMS_SIGN_MINUTE，默认 5，作为短信模板的第二个参数。 */
export function getSmsOtpValidityMinutes(): number {
  const raw = env('COS_SMS_SIGN_MINUTE', 'SMS_SIGN_MINUTE')
  const parsed = raw ? Number.parseInt(raw, 10) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5
}

export type TencentSmsSendStatus = {
  phoneNumber?: string
  code?: string
  message?: string
  isoCode?: string
  fee?: number
  serialNumber?: string
  sessionContext?: string
}

export type TencentSmsSendResult = {
  requestId?: string
  sendStatus?: TencentSmsSendStatus[]
  /** 开发环境为 true：未真实发送，仅本地模拟 */
  simulated?: boolean
}

export type TencentSmsOptions = {
  /** 手机号（11 位国内号码，或 +86 前缀） */
  phone: string
  /** 模板参数，与模板变量一一对应。验证码类模板建议传 [验证码, 有效期] */
  templateParams: string[]
  /** 覆盖环境变量默认值：短信 SdkAppId */
  appId?: string
  /** 覆盖环境变量默认值：模板 ID */
  templateId?: string
  /** 覆盖环境变量默认值：短信签名 */
  signName?: string
  /** 覆盖环境变量默认值：产品地域，默认 ap-nanjing */
  region?: string
}

function mapSendStatus(status?: TencentSendSmsResponse['SendStatusSet']): TencentSmsSendStatus[] {
  return (status ?? []).map((s) => ({
    phoneNumber: s?.PhoneNumber,
    code: s?.Code,
    message: s?.Message,
    isoCode: s?.IsoCode,
    fee: s?.Fee,
    serialNumber: s?.SerialNo,
    sessionContext: s?.SessionContext,
  }))
}

/**
 * 是否真实发送短信：生产环境真实发送；开发环境默认模拟（跳过真实 API，避免打扰真实用户/产生费用）。
 * 可用 SMS_FORCE_REAL_SEND=1 在开发环境强制真实发送。
 */
function isRealSend(): boolean {
  if (process.env.NODE_ENV === 'production') return true
  return process.env.SMS_FORCE_REAL_SEND === '1'
}

/**
 * 通过腾讯云短信发送短信。配置缺失或缺省时抛错，调用方自行决定吞掉或上抛。
 * 开发环境（NODE_ENV !== 'production'）默认模拟发送，不调用真实接口。
 */
export async function sendTencentSms(options: TencentSmsOptions): Promise<TencentSmsSendResult> {
  if (!isRealSend()) {
    console.log(
      `[sms:dev] 开发环境模拟发送 phone=${options.phone} params=${JSON.stringify(options.templateParams)}`,
    )
    return {
      simulated: true,
      requestId: `sim-${Date.now()}`,
      sendStatus: [
        { phoneNumber: options.phone, code: 'Ok', message: 'Simulated in dev env', isoCode: 'CN' },
      ],
    }
  }

  const cfg = requiredConfig()
  const SmsClient: TencentSmsClientCtor = tencentcloudSms.v20210111.Client
  const client = new SmsClient({
    credential: {
      secretId: cfg.secretId,
      secretKey: cfg.secretKey,
    },
    region: options.region ?? cfg.region,
    profile: {
      signMethod: 'TC3-HMAC-SHA256',
      httpProfile: {
        reqMethod: 'POST',
        reqTimeout: 30,
      },
    },
  })

  const request: TencentSendSmsRequest = {
    PhoneNumberSet: [options.phone],
    SmsSdkAppId: options.appId ?? cfg.appId,
    TemplateId: options.templateId ?? cfg.templateId,
    SignName: options.signName ?? cfg.signName,
    TemplateParamSet: options.templateParams,
  }

  const resp: TencentSendSmsResponse = await client.SendSms(request)
  return {
    requestId: resp.RequestId,
    sendStatus: mapSendStatus(resp.SendStatusSet),
  }
}

/**
 * 短信限流错误：触发冷却期或每日上限时抛出。
 */
export class SmsRateLimitError extends Error {
  readonly causeCode: 'COOLDOWN' | 'DAILY_LIMIT'
  readonly cooldownSec: number

  constructor(
    message: string,
    options: { causeCode: 'COOLDOWN' | 'DAILY_LIMIT'; cooldownSec?: number },
  ) {
    super(message)
    this.name = 'SmsRateLimitError'
    this.causeCode = options.causeCode
    this.cooldownSec = options.cooldownSec ?? 0
  }
}

let smsRedis: RedisClient | null = null

function getSmsRedis(): RedisClient {
  if (smsRedis) return smsRedis
  smsRedis = createRedisClient({
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  })
  return smsRedis
}

async function ensureRedisReady(redis: RedisClient): Promise<void> {
  if (redis.status !== 'ready') {
    await redis.connect().catch(() => undefined)
  }
}

export type SendOtpSmsInput = {
  /** 限流作用域，用于区分不同业务（如 auth / identity），避免互相挤占配额 */
  scope: string
  /** 手机号（11 位国内号码） */
  phone: string
  /** 验证码 */
  code: string
  /** 同一手机号发送冷却秒数，默认 60s */
  cooldownSec?: number
  /** 同一手机号每日发送上限，默认 10 */
  dailyLimit?: number
  /** 模板参数，默认 [code, 有效期分钟]（有效期取 COS_SMS_SIGN_MINUTE，默认 5） */
  templateParams?: string[]
} & Omit<TencentSmsOptions, 'phone' | 'templateParams'>

export type SendOtpSmsResult = TencentSmsSendResult & {
  sent: boolean
  cooldownSec: number
  dailyRemaining: number
}

/**
 * 基于 Redis 限流的验证码短信发送：冷却 + 每日上限，通过后调用腾讯云短信。
 * 限流触发时抛出 SmsRateLimitError。
 */
export async function sendOtpSmsWithRateLimit(
  input: SendOtpSmsInput,
): Promise<SendOtpSmsResult> {
  const cooldownSec = input.cooldownSec ?? 60
  const dailyLimit = input.dailyLimit ?? 10
  const cdKey = `sms:otp:cd:${input.scope}:${input.phone}`
  const dailyKey = `sms:otp:daily:${input.scope}:${input.phone}`

  const redis = getSmsRedis()
  await ensureRedisReady(redis)

  const cd = await redis.ttl(cdKey)
  if (cd > 0) {
    throw new SmsRateLimitError(`发送过于频繁，请 ${cd} 秒后重试`, {
      causeCode: 'COOLDOWN',
      cooldownSec: cd,
    })
  }

  const current = Number((await redis.get(dailyKey)) ?? '0')
  if (current >= dailyLimit) {
    throw new SmsRateLimitError('今日短信发送次数已达上限，请明日再试', {
      causeCode: 'DAILY_LIMIT',
    })
  }

  await sendTencentSms({
    phone: input.phone,
    templateParams: input.templateParams ?? [input.code, String(getSmsOtpValidityMinutes())],
    appId: input.appId,
    templateId: input.templateId,
    signName: input.signName,
    region: input.region,
  })

  await redis.setex(dailyKey, 86400, String(current + 1))
  await redis.setex(cdKey, cooldownSec, '1')

  return {
    sent: true,
    cooldownSec,
    dailyRemaining: dailyLimit - (current + 1),
  }
}