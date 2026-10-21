import { auth } from '@/lib/auth'
import { isDevOtpExposureEnabled, takeDevOtp } from '@/lib/auth/dev-otp'
import {
  checkAndConsumeSendRateLimit,
  checkAndConsumeVerifyRateLimit,
  getClientIpFromRequest,
  type OtpChannel,
} from '@/lib/otp-rate-limit'
import { normalizeContactPhone } from '@/lib/auth/constants'
import { toNextJsHandler } from 'better-auth/next-js'

const { GET: baseGet, POST: basePost } = toNextJsHandler(auth)

function pathOf(request: Request) {
  return new URL(request.url).pathname.replace(/\/$/, '')
}

function rateLimitedResponse(message: string, retryAfterSeconds?: number) {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (retryAfterSeconds != null) {
    headers.set('Retry-After', String(retryAfterSeconds))
  }
  return new Response(JSON.stringify({ code: 'RATE_LIMITED', message }), {
    status: 429,
    headers,
  })
}

async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    return (await request.clone().json()) as Record<string, unknown>
  } catch {
    return null
  }
}

async function enforceOtpGuards(request: Request): Promise<Response | null> {
  const path = pathOf(request)
  const body = await readJsonBody(request)
  if (!body) return null

  const ip = getClientIpFromRequest(request)

  const isPhoneSend = path.endsWith('/phone-number/send-otp')
  const isEmailSend = path.endsWith('/email-otp/send-verification-otp')
  const isPhoneVerify = path.endsWith('/phone-number/verify')
  const isEmailSignIn = path.endsWith('/sign-in/email-otp')

  if (isPhoneSend || isEmailSend) {
    const channel: OtpChannel = isPhoneSend ? 'phone' : 'email'
    const raw =
      channel === 'phone'
        ? String(body.phoneNumber ?? '')
        : String(body.email ?? '')
    const identifier =
      channel === 'phone' ? normalizeContactPhone(raw) : raw.trim().toLowerCase()
    if (!identifier) {
      return new Response(JSON.stringify({ message: '请输入有效的账号' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const decision = await checkAndConsumeSendRateLimit({ channel, identifier, ip })
    if (!decision.ok) {
      return rateLimitedResponse(decision.message, decision.retryAfterSeconds)
    }
  }

  if (isPhoneVerify || isEmailSignIn) {
    const channel: OtpChannel = isPhoneVerify ? 'phone' : 'email'
    const raw =
      channel === 'phone'
        ? String(body.phoneNumber ?? '')
        : String(body.email ?? '')
    const identifier =
      channel === 'phone' ? normalizeContactPhone(raw) : raw.trim().toLowerCase()
    if (identifier) {
      const decision = await checkAndConsumeVerifyRateLimit({ channel, identifier })
      if (!decision.ok) {
        return rateLimitedResponse(decision.message)
      }
    }
  }

  return null
}

async function maybeAttachDevCode(request: Request, response: Response): Promise<Response> {
  if (!isDevOtpExposureEnabled()) return response
  if (!response.ok) return response

  const path = pathOf(request)
  const isPhoneSend = path.endsWith('/phone-number/send-otp')
  const isEmailSend = path.endsWith('/email-otp/send-verification-otp')
  if (!isPhoneSend && !isEmailSend) return response

  const body = await readJsonBody(request)
  if (!body) return response

  const channel: OtpChannel = isPhoneSend ? 'phone' : 'email'
  const raw =
    channel === 'phone' ? String(body.phoneNumber ?? '') : String(body.email ?? '')
  const identifier =
    channel === 'phone' ? normalizeContactPhone(raw) : raw.trim().toLowerCase()
  const devCode = takeDevOtp(channel, identifier)
  if (!devCode) return response

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) return response

  try {
    const payload = (await response.clone().json()) as Record<string, unknown>
    const headers = new Headers(response.headers)
    return new Response(JSON.stringify({ ...payload, devCode }), {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  } catch {
    return response
  }
}

export async function GET(request: Request) {
  return baseGet(request)
}

export async function POST(request: Request) {
  const blocked = await enforceOtpGuards(request)
  if (blocked) return blocked
  const response = await basePost(request)
  return maybeAttachDevCode(request, response)
}
