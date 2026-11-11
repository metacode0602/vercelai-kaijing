import { z } from 'zod'
import {
  approveOnboarding,
  disableTenant,
  getOnboardingReview,
  getOnboardingReviewStats,
  listOnboardingReviews,
  listTenants,
  rejectOnboarding,
} from '@/lib/server/dataaccess/onboarding-review'
import {
  getTenant,
  listPlatformAuditEvents,
  listTenantAppCredentials,
  listTenantMembers,
  resolveActorNames,
} from '@/lib/server/dataaccess/platform-details'
import {
  approveShopBindingTransfer,
  getShopBindingConflict,
  listShopBindingConflicts,
  resolveShopConflictLegacyRejected,
  reviewShopBindingAppeal,
  upholdShopBindingConflict,
} from '@workspace/db'
import { sendEmail } from '@/lib/mail'
import { db } from '@/lib/db'
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
  countryCode: z.string().max(8).optional(),
  q: z.string().max(120).optional(),
})

export const platformOnboardingRouter = createTRPCRouter({
  list: protectedProcedure.input(listInput).query(({ input }) =>
    listOnboardingReviews(input),
  ),
  stats: protectedProcedure.query(() => getOnboardingReviewStats()),
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
  listConflicts: protectedProcedure
    .input(
      listInput.omit({ status: true, countryCode: true }).extend({
        organizationId: z.string().min(1).optional(),
        shopId: z.string().min(1).optional(),
        platform: z.string().max(32).optional(),
        externalShopId: z.string().max(128).optional(),
      }),
    )
    .query(({ input }) =>
      listShopBindingConflicts(db, {
        page: input.page,
        pageSize: input.pageSize,
        organizationId: input.organizationId,
        shopId: input.shopId,
        platform: input.platform,
        externalShopId: input.externalShopId,
      }),
    ),
  getConflict: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input }) => {
      const row = await getShopBindingConflict(db, input.id)
      if (!row) throw new Error('冲突单不存在')
      const actors = await resolveActorNames([
        row.initiatorUserId,
        row.reviewedByUserId,
        row.appealedByUserId,
        row.appealReviewedByUserId,
      ])
      return {
        ...row,
        initiator: row.initiatorUserId ? actors.get(row.initiatorUserId) ?? null : null,
        reviewer: row.reviewedByUserId ? actors.get(row.reviewedByUserId) ?? null : null,
        appellant: row.appealedByUserId ? actors.get(row.appealedByUserId) ?? null : null,
        appealReviewer: row.appealReviewedByUserId
          ? actors.get(row.appealReviewedByUserId) ?? null
          : null,
      }
    }),
  resolveConflict: protectedProcedure
    .input(
      z.object({
        shopId: z.string().min(1),
        action: z.enum(['disable', 'reassign']),
        targetOrganizationId: z.string().optional(),
      }),
    )
    .mutation(() => resolveShopConflictLegacyRejected()),
  upholdConflict: protectedProcedure
    .input(
      z.object({
        conflictId: z.string().min(1),
        reason: z.string().max(1000).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      upholdShopBindingConflict(db, {
        conflictId: input.conflictId,
        reviewerId: ctx.user.id,
        reason: input.reason,
      }),
    ),
  approveTransfer: protectedProcedure
    .input(
      z.object({
        conflictId: z.string().min(1),
        reason: z.string().min(1).max(1000),
      }),
    )
    .mutation(({ ctx, input }) =>
      approveShopBindingTransfer(db, {
        conflictId: input.conflictId,
        reviewerId: ctx.user.id,
        reason: input.reason,
      }),
    ),
  reviewAppeal: protectedProcedure
    .input(
      z.object({
        conflictId: z.string().min(1),
        decision: z.enum(['accept', 'reject']),
        reason: z.string().min(1).max(1000),
      }),
    )
    .mutation(({ ctx, input }) =>
      reviewShopBindingAppeal(db, {
        conflictId: input.conflictId,
        reviewerId: ctx.user.id,
        decision: input.decision,
        reason: input.reason,
      }),
    ),

  tenants: protectedProcedure
    .input(listInput.omit({ status: true }))
    .query(({ input }) => listTenants(input)),
  getTenant: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input }) => {
      const row = await getTenant(input.id)
      if (!row) throw new Error('租户不存在')
      return row
    }),
  listTenantMembers: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().min(1),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
      }),
    )
    .query(({ input }) => listTenantMembers(input)),
  listTenantCredentials: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().min(1),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
      }),
    )
    .query(({ input }) => listTenantAppCredentials(input)),
  listAuditEvents: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().min(1).optional(),
        entityType: z.string().max(32).optional(),
        entityId: z.string().min(1).optional(),
        actorUserId: z.string().min(1).optional(),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
      }),
    )
    .query(({ input }) => listPlatformAuditEvents(input)),
  disableTenant: protectedProcedure
    .input(z.object({ organizationId: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      disableTenant({
        organizationId: input.organizationId,
        reviewerId: ctx.user.id,
      }),
    ),
})
