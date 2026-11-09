import { z } from 'zod'
import {
  approveOnboarding,
  disableTenant,
  getOnboardingReview,
  listOnboardingReviews,
  listShopConflicts,
  listTenants,
  rejectOnboarding,
  resolveShopConflict,
} from '@/lib/server/dataaccess/onboarding-review'
import { sendEmail } from '@/lib/mail'
import { createTRPCRouter, protectedProcedure } from './trpc'

async function notifyReviewByEmail(input: {
  email: string | null
  approved: boolean
  companyName: string
  note?: string
}) {
  if (!input.email) return
  try {
    const title = input.approved ? '入驻审核已通过' : '入驻审核被驳回'
    const summary = input.approved
      ? '资料审核通过，现在可以登录 Open Shop 绑定店铺。'
      : input.note || '请登录 Open Shop 修改入驻资料后重新提交。'
    await sendEmail({
      to: input.email,
      subject: `【Open Shop】${title}`,
      html: `<p>${input.companyName}：</p><p>${title}。</p><p>${summary}</p>`,
      text: `${input.companyName}：\n${title}。\n${summary}`,
    })
  } catch (error) {
    console.error('[platform-onboarding] 审核邮件发送失败', error)
  }
}

const listInput = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  status: z.string().optional(),
  q: z.string().max(120).optional(),
})

export const platformOnboardingRouter = createTRPCRouter({
  list: protectedProcedure.input(listInput).query(({ input }) =>
    listOnboardingReviews(input),
  ),
  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input }) => {
      const row = await getOnboardingReview(input.id)
      if (!row) throw new Error('入驻申请不存在')
      return row
    }),
  approve: protectedProcedure
    .input(z.object({ id: z.string().min(1), note: z.string().max(1000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const result = await approveOnboarding({
        id: input.id,
        reviewerId: ctx.user.id,
        note: input.note,
      })
      await notifyReviewByEmail({
        email: result.contactEmail,
        approved: true,
        companyName: result.companyName,
        note: input.note,
      })
      return result
    }),
  reject: protectedProcedure
    .input(z.object({ id: z.string().min(1), note: z.string().min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      const result = await rejectOnboarding({
        id: input.id,
        reviewerId: ctx.user.id,
        note: input.note,
      })
      await notifyReviewByEmail({
        email: result.contactEmail,
        approved: false,
        companyName: result.companyName,
        note: input.note,
      })
      return result
    }),
  listConflicts: protectedProcedure.query(() => listShopConflicts()),
  resolveConflict: protectedProcedure
    .input(
      z.object({
        shopId: z.string().min(1),
        action: z.enum(['disable', 'reassign']),
        targetOrganizationId: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      resolveShopConflict({
        shopId: input.shopId,
        action: input.action,
        targetOrganizationId: input.targetOrganizationId,
        reviewerId: ctx.user.id,
      }),
    ),
  tenants: protectedProcedure
    .input(listInput.omit({ status: true }))
    .query(({ input }) => listTenants(input)),
  disableTenant: protectedProcedure
    .input(z.object({ organizationId: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      disableTenant({
        organizationId: input.organizationId,
        reviewerId: ctx.user.id,
      }),
    ),
})
