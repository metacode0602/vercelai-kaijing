import { createRedisClient, sendTencentSms, type RedisClient } from "@workspace/redis"

let redis: RedisClient | null = null

function getRedis(): RedisClient {
  if (redis) return redis
  redis = createRedisClient({
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  })
  return redis
}

const OTP_TTL_SEC = 300
const SEND_COOLDOWN_SEC = 60

function otpKey(mobile: string) {
  return `identity:otp:${mobile}`
}
function cooldownKey(mobile: string) {
  return `identity:otp:cd:${mobile}`
}

export async function sendIdentitySmsOtp(mobile: string): Promise<{ cooldownSec: number }> {
  const r = getRedis()
  if (r.status !== "ready") await r.connect().catch(() => undefined)

  const cd = await r.ttl(cooldownKey(mobile))
  if (cd > 0) {
    const err = new Error(`发送过于频繁，请 ${cd} 秒后重试`)
    ;(err as Error & { code?: string }).code = "COOLDOWN"
    throw err
  }

  const code = String(Math.floor(100000 + Math.random() * 900000))
  await r.set(otpKey(mobile), code, "EX", OTP_TTL_SEC)
  await r.set(cooldownKey(mobile), "1", "EX", SEND_COOLDOWN_SEC)

  // 生产环境对接腾讯云短信通道；开发环境模拟发送（不产生真实短信），验证码仍写入日志
  try {
    const result = await sendTencentSms({ phone: mobile, templateParams: [code, "5"] })
    console.log(
      result.simulated
        ? `[identity] OTP ${code} -> ${mobile} (dev simulated, not actually sent)`
        : `[identity] OTP ${code} -> ${mobile} (sent via Tencent Sms)`,
    )
  } catch (e) {
    console.warn(`[identity] 短信发送失败 ${mobile}:`, e)
    console.log(`[identity] OTP ${code} -> ${mobile} (fallback to log only)`)
  }
  return { cooldownSec: SEND_COOLDOWN_SEC }
}

export async function verifyIdentitySmsOtp(mobile: string, code: string): Promise<boolean> {
  const r = getRedis()
  if (r.status !== "ready") await r.connect().catch(() => undefined)
  const saved = await r.get(otpKey(mobile))
  if (!saved || saved !== code.trim()) return false
  await r.del(otpKey(mobile))
  return true
}
