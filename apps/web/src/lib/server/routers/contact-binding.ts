import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { user } from '@workspace/db/schema'
import {
  bindEmailToUser,
  bindPhoneToUser,
  generateContactCode,
  hasBoundEmail,
  hasBoundPhone,
  isChannelBound,
  issueContactCode,
  normalizeContactPhone,
  verifyContactCode,
} from '@workspace/auth'
import { sendOtpSmsWithRateLimit } from '@workspace/redis'
import { consumeAndValidateToken } from '@/lib/captcha/sms-captcha-server'
import { db } from '@/lib/db'
import { sendEmail } from '@/lib/mail'
import { resolveLocaleFromCookieHeader } from '@workspace/auth'
import { LOCALE_COOKIE_NAME, LOCALES, routing } from '@/lib/i18n/routing'
import { createTRPCRouter, protectedProcedure } from './trpc'

const SMS_SCOPE = 'web-bind-phone'
const CODE_INPUT = z.string().trim().regex(/^\d{6}$/, '验证码为 6 位数字')

async function requireUnboundChannel(
  userId: string,
  channel: 'email' | 'phone',
  label: string
): Promise<void> {
  const [row] = await db
    .select({ email: user.email, phoneNumber: user.phoneNumber })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)

  if (!row) {
    throw new TRPCError({ code: 'NOT_FOUND', message: '账号不存在' })
  }
  if (isChannelBound(channel, row)) {
    throw new TRPCError({ code: 'CONFLICT', message: `已绑定${label}，无需重复绑定` })
  }
}

export const contactBindingRouter = createTRPCRouter({
  /** 当前账号的邮箱 / 手机号绑定状态（前端据此决定是否展示绑定入口）。 */
  status: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await db
      .select({ email: user.email, phoneNumber: user.phoneNumber })
      .from(user)
      .where(eq(user.id, ctx.user.id))
      .limit(1)

    return {
      email: row?.email ?? null,
      phoneNumber: row?.phoneNumber ?? null,
      emailBound: hasBoundEmail(row ?? {}),
      phoneBound: hasBoundPhone(row ?? {}),
    }
  }),

  sendEmailCode: protectedProcedure
    .input(z.object({ email: z.string().trim().email() }))
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase()
      await requireUnboundChannel(ctx.user.id, 'email', '邮箱')

      const code = generateContactCode()
      await issueContactCode(db, {
        channel: 'email',
        userId: ctx.user.id,
        target: email,
        code,
      })

      const locale = resolveLocaleFromCookieHeader(ctx.headers.get('cookie'), {
        cookieName: LOCALE_COOKIE_NAME,
        locales: LOCALES,
        fallback: routing.defaultLocale,
      })
      await sendEmail({
        to: email,
        template: 'emailOtp',
        context: { code, purpose: 'email-verification' },
        locale,
      })

      return { success: true }
    }),

  bindEmail: protectedProcedure
    .input(z.object({ email: z.string().trim().email(), code: CODE_INPUT }))
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase()
      await requireUnboundChannel(ctx.user.id, 'email', '邮箱')

      const verified = await verifyContactCode(db, {
        channel: 'email',
        userId: ctx.user.id,
        target: email,
        code: input.code,
      })
      if (verified !== 'ok') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '验证码错误或已过期' })
      }

      const result = await bindEmailToUser(db, { userId: ctx.user.id, email })
      if (result === 'taken') {
        throw new TRPCError({ code: 'CONFLICT', message: '该邮箱已被其他账号绑定' })
      }
      if (result !== 'ok') {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '绑定失败，请稍后重试' })
      }

      return { success: true }
    }),

  sendPhoneCode: protectedProcedure
    .input(
      z.object({
        phone: z.string().trim().min(6).max(20),
        captchaToken: z.string().trim().min(1, '请先完成图形验证'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const phone = normalizeContactPhone(input.phone)
      if (phone.length < 6) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '手机号格式不正确' })
      }

      // 先消费图形验证码，避免被刷短信
      const captchaValid = await consumeAndValidateToken(input.captchaToken)
      if (!captchaValid) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '图形验证已失效，请重试' })
      }

      await requireUnboundChannel(ctx.user.id, 'phone', '手机号')

      const code = generateContactCode()
      await issueContactCode(db, {
        channel: 'phone',
        userId: ctx.user.id,
        target: phone,
        code,
      })

      await sendOtpSmsWithRateLimit({ scope: SMS_SCOPE, phone, code })

      return { success: true, phone }
    }),

  bindPhone: protectedProcedure
    .input(z.object({ phone: z.string().trim().min(6).max(20), code: CODE_INPUT }))
    .mutation(async ({ ctx, input }) => {
      const phone = normalizeContactPhone(input.phone)
      await requireUnboundChannel(ctx.user.id, 'phone', '手机号')

      const verified = await verifyContactCode(db, {
        channel: 'phone',
        userId: ctx.user.id,
        target: phone,
        code: input.code,
      })
      if (verified !== 'ok') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '验证码错误或已过期' })
      }

      const result = await bindPhoneToUser(db, { userId: ctx.user.id, phone })
      if (result === 'taken') {
        throw new TRPCError({ code: 'CONFLICT', message: '该手机号已被其他账号绑定' })
      }
      if (result !== 'ok') {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '绑定失败，请稍后重试' })
      }

      return { success: true }
    }),
})
