import { NextResponse } from 'next/server'
import { createPasswordResetRequest } from '@workspace/auth'
import { db } from '@/lib/db'
import { sendEmail } from '@/lib/mail'
import { routing } from '@/lib/i18n/routing'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: Request) {
  try {
    const { email } = await request.json()
    const normalizedEmail = String(email ?? '').trim().toLowerCase()

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return NextResponse.json({ error: '请输入有效的邮箱地址' }, { status: 400 })
    }

    const requestUrl = new URL(request.url)
    const origin = request.headers.get('origin') ?? requestUrl.origin

    const localeCookie = request.headers
      .get('cookie')
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('NEXT_LOCALE='))
    const locale = localeCookie?.split('=')[1] ?? routing.defaultLocale

    const resetRequest = await createPasswordResetRequest(
      db,
      normalizedEmail,
      origin,
      'gpus'
    )

    // 无论邮箱是否存在都返回成功，避免账号探测
    if (resetRequest) {
      await sendEmail({
        to: normalizedEmail,
        template: 'forgotPassword',
        context: {
          url: resetRequest.resetUrl,
          name: resetRequest.name,
        },
        locale,
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('realm-forgot-password error:', error)
    return NextResponse.json({ error: '服务器错误，请稍后重试' }, { status: 500 })
  }
}