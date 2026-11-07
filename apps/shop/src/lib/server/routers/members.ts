import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, publicProcedure, tenantProcedure } from '@/lib/server/trpc'
import * as membersDa from '@/lib/server/dataaccess/members'
import { sendEmail } from '@/lib/mail'
import { normalizeContactPhone } from '@/lib/auth/constants'

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    throw new TRPCError({ code: /不存在|无效|过期/.test(message) ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}

function requireUserId(ctx: { user?: { id?: string } | null }): string {
  if (!ctx.user?.id) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: '请先登录' })
  }
  return ctx.user.id
}

function resolveBaseUrl(headers?: Headers | null): string {
  const fromEnv = process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_URL
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  const host = headers?.get('x-forwarded-host') || headers?.get('host')
  const proto = headers?.get('x-forwarded-proto') || 'http'
  if (host) return `${proto}://${host}`.replace(/\/$/, '')
  return 'http://localhost:30036'
}

export const membersRouter = createTRPCRouter({
  list: tenantProcedure
    .input(z.object({ q: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => membersDa.listMembers(ctx.db, ctx.organizationId, input?.q)),

  /** 写入 invitation pending；有邮箱则真实发信。 */
  invite: tenantProcedure
    .input(
      z
        .object({
          email: z.string().optional(),
          phone: z.string().optional(),
          role: z.string().optional(),
          name: z.string().optional(),
          locale: z.enum(['zh', 'en']).optional(),
        })
        .refine((v) => Boolean((v.email || '').trim() || (v.phone || '').trim()), {
          message: '请至少填写手机号或邮箱',
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const inviterUserId = requireUserId(ctx)
      if (input.role === 'owner') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '不可通过邀请设为 owner' })
      }
      const phone = (input.phone || '').trim() ? normalizeContactPhone(input.phone || '') : undefined
      const email = (input.email || '').trim().toLowerCase() || undefined
      const created = await wrap(() =>
        membersDa.createInvitation(ctx.db, ctx.organizationId, {
          email,
          phone,
          role: input.role,
          name: input.name,
          inviterUserId,
          baseUrl: resolveBaseUrl(ctx.headers),
          locale: input.locale || 'zh',
        }),
      )

      let emailSent = false
      let emailError: string | undefined
      if (created.email && created.inviteUrl) {
        try {
          const orgName = created.organizationName || ctx.organizationId
          emailSent = await sendEmail({
            to: created.email,
            template: 'organizationInvitation',
            context: {
              url: created.inviteUrl,
              email: created.email,
              name: input.name || created.email,
              organizationName: orgName,
              invitedByName: created.inviterName || ctx.user?.name || '组织管理员',
              invitedByEmail: created.inviterEmail || ctx.user?.email || '',
              subject:
                (input.locale || 'zh') === 'en'
                  ? `You're invited to join ${orgName}`
                  : `邀请你加入 ${orgName}`,
            },
            locale: input.locale || 'zh',
          })
          if (!emailSent) emailError = '邮件发送失败'
        } catch (error) {
          console.error('[members.invite] sendEmail failed:', error)
          emailError = error instanceof Error ? error.message : '邮件发送失败'
        }
      }

      return {
        ...created,
        emailSent,
        note: emailError
          ? `${created.note} 邮件发送失败：${emailError}（邀请已落库，可稍后重发或线下告知链接）。`
          : emailSent
            ? `${created.note.replace(/将向 .* 发送邀请邮件/, `已向 ${created.email} 发送邀请邮件`)}`
            : created.note,
      }
    }),

  updateRole: tenantProcedure
    .input(z.object({ id: z.string().min(1), role: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      requireUserId(ctx)
      if (input.role === 'owner') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '不可通过此接口设为 owner' })
      }
      return wrap(() => membersDa.updateMemberRole(ctx.db, ctx.organizationId, input))
    }),

  /** 仅 owner：pending → canceled */
  cancelInvitation: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const actorUserId = requireUserId(ctx)
      return wrap(() =>
        membersDa.cancelInvitation(ctx.db, ctx.organizationId, { id: input.id, actorUserId }),
      )
    }),

  /** 公开：查看邀请详情（接受页） */
  getInvitationPublic: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await membersDa.getInvitationPublic(ctx.db, input.id)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: '邀请不存在或链接无效' })
      return row
    }),

  /** 公开：接受邮箱邀请并设置密码；不建会话，需重新登录 */
  acceptInvitationWithPassword: publicProcedure
    .input(
      z.object({
        id: z.string().min(1),
        password: z.string().min(8),
        name: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => membersDa.acceptInvitationWithPassword(ctx.db, input)),
    ),
})
