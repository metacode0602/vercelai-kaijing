import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { sendEmail } from '@/lib/mail'
import {
  acceptPlatformInvitationWithPassword,
  cancelPlatformInvitation,
  createPlatformInvitation,
  DEFAULT_PLATFORM_INVITE_ROLE,
  getPlatformInvitationPublic,
  listPlatformInvitations,
  preparePlatformInvitationResend,
  resolvePlatformOrganizationId,
} from '@/lib/server/dataaccess/platform-invitations'
import { createTRPCRouter, protectedProcedure, publicProcedure } from './trpc'

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    if (/不存在|无效|过期/.test(message)) {
      throw new TRPCError({ code: 'NOT_FOUND', message })
    }
    throw new TRPCError({ code: 'BAD_REQUEST', message })
  })
}

function resolveBaseUrl(headers?: Headers | null): string {
  const fromEnv = process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_URL
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  const host = headers?.get('x-forwarded-host') || headers?.get('host')
  const proto = headers?.get('x-forwarded-proto') || 'http'
  if (host) return `${proto}://${host}`.replace(/\/$/, '')
  return 'http://localhost:30051'
}

async function sendInvitationEmail(input: {
  email: string
  inviteUrl?: string
  organizationName: string
  invitedByName: string
  invitedByEmail: string
  name?: string
  locale?: 'zh' | 'en'
}) {
  if (!input.inviteUrl) return { emailSent: false, emailError: '缺少邀请链接' }
  const locale = input.locale || 'zh'
  try {
    const emailSent = await sendEmail({
      to: input.email,
      template: 'organizationInvitation',
      context: {
        url: input.inviteUrl,
        email: input.email,
        name: input.name || input.email,
        organizationName: input.organizationName,
        invitedByName: input.invitedByName,
        invitedByEmail: input.invitedByEmail,
        subject:
          locale === 'en'
            ? `You're invited to join ${input.organizationName}`
            : `邀请你加入 ${input.organizationName}`,
      },
      locale,
    })
    return { emailSent, emailError: emailSent ? undefined : '邮件发送失败' }
  } catch (error) {
    console.error('[platformInvitations] sendEmail failed:', error)
    return {
      emailSent: false,
      emailError: error instanceof Error ? error.message : '邮件发送失败',
    }
  }
}

const inviteInput = z
  .object({
    email: z.string().optional(),
    phone: z.string().optional(),
    role: z.string().optional(),
    name: z.string().optional(),
    locale: z.enum(['zh', 'en']).optional(),
  })
  .refine((value) => Boolean((value.email || '').trim() || (value.phone || '').trim()), {
    message: '请至少填写手机号或邮箱',
  })

export const platformInvitationsRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
        q: z.string().max(120).optional(),
        status: z.enum(['all', 'pending', 'accepted', 'canceled', 'expired']).optional(),
      }),
    )
    .query(({ input }) => listPlatformInvitations(input)),

  invite: protectedProcedure.input(inviteInput).mutation(async ({ ctx, input }) => {
    const organizationId = await wrap(() => resolvePlatformOrganizationId(ctx.user.id))
    const created = await wrap(() =>
      createPlatformInvitation({
        organizationId,
        email: input.email,
        phone: input.phone,
        role: input.role || DEFAULT_PLATFORM_INVITE_ROLE,
        inviterUserId: ctx.user.id,
        name: input.name,
        baseUrl: resolveBaseUrl(),
        locale: input.locale || 'zh',
      }),
    )

    let emailSent = false
    let emailError: string | undefined
    if (created.email && created.inviteUrl) {
      const mailed = await sendInvitationEmail({
        email: created.email,
        inviteUrl: created.inviteUrl,
        organizationName: created.organizationName || organizationId,
        invitedByName: created.inviterName || '平台管理员',
        invitedByEmail: created.inviterEmail || '',
        name: input.name,
        locale: input.locale || 'zh',
      })
      emailSent = mailed.emailSent
      emailError = mailed.emailError
    }

    return {
      ...created,
      emailSent,
      note: emailError
        ? `${created.note} 邮件发送失败：${emailError}（邀请已落库，可稍后重发或线下告知链接）。`
        : emailSent
          ? created.note.replace(/将向 .* 发送邀请邮件/, `已向 ${created.email} 发送邀请邮件`)
          : created.note,
    }
  }),

  cancel: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      wrap(() => cancelPlatformInvitation({ id: input.id, actorUserId: ctx.user.id })),
    ),

  resend: protectedProcedure
    .input(z.object({ id: z.string().min(1), locale: z.enum(['zh', 'en']).optional() }))
    .mutation(async ({ input }) => {
      const prepared = await wrap(() =>
        preparePlatformInvitationResend({
          id: input.id,
          baseUrl: resolveBaseUrl(),
          locale: input.locale || 'zh',
        }),
      )
      const mailed = await sendInvitationEmail({
        email: prepared.email,
        inviteUrl: prepared.inviteUrl,
        organizationName: prepared.organizationName,
        invitedByName: prepared.inviterName,
        invitedByEmail: prepared.inviterEmail,
        locale: input.locale || 'zh',
      })
      return {
        ...prepared,
        emailSent: mailed.emailSent,
        note: mailed.emailError
          ? `${prepared.note} 邮件发送失败：${mailed.emailError}（有效期已延长，可稍后重试）。`
          : `已向 ${prepared.email} 重发邀请邮件，有效期已重新计算为 7 天。`,
      }
    }),

  getInvitationPublic: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input }) => {
      const row = await getPlatformInvitationPublic(input.id)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: '邀请不存在或链接无效' })
      return row
    }),

  acceptInvitationWithPassword: publicProcedure
    .input(
      z.object({
        id: z.string().min(1),
        password: z.string().min(8),
        name: z.string().optional(),
      }),
    )
    .mutation(({ input }) => wrap(() => acceptPlatformInvitationWithPassword(input))),
})
