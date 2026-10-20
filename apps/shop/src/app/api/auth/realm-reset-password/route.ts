import { NextResponse } from 'next/server'
import { resetPasswordWithToken } from '@workspace/auth'
import { db } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const { token, password } = await request.json()

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: '重置链接无效或已过期' }, { status: 400 })
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: '密码至少8位' }, { status: 400 })
    }

    const ok = await resetPasswordWithToken(db, token, password, 'gpus')
    if (!ok) {
      return NextResponse.json({ error: '重置链接无效或已过期' }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('realm-reset-password error:', error)
    return NextResponse.json({ error: '服务器错误，请稍后重试' }, { status: 500 })
  }
}