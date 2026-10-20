import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import {
  payoutAccountReviewDataAccess,
  PAYOUT_ACCOUNT_OWNER_TYPES,
  type PayoutAccountStatus,
} from '@/lib/server/dataaccess/merchant/merchant-payout-account-review'
import { createTRPCRouter, merchantScopedProcedure, merchantWriteProcedure } from '../trpc'

const statusSchema = z.enum(['pending_review', 'active', 'rejected', 'disabled'])
const ownerTypeSchema = z.enum(PAYOUT_ACCOUNT_OWNER_TYPES)

/**
 * 收款账户审核（DEC-F3 / DEC-F12）
 *
 * 商户提交在 apps/merchant，审核与停用只在平台运营侧（apps/web）。
 * 读用 merchantScopedProcedure（member 可看列表，无害）；
 * 写一律 merchantWriteProcedure —— 审核通过等同于「允许平台把钱打给这个账户」，
 * 是资金动作，不能落到只读角色上。
 */
export const payoutAccountRouter = createTRPCRouter({
  list: merchantScopedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
        status: statusSchema.optional(),
        ownerType: ownerTypeSchema.optional(),
        ownerId: z.string().min(1).optional(),
        search: z.string().max(128).optional(),
      }),
    )
    .query(async ({ input }) => {
      return payoutAccountReviewDataAccess.listPage({
        page: input.page,
        pageSize: input.pageSize,
        status: input.status as PayoutAccountStatus | undefined,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        search: input.search,
      })
    }),

  /** 待审数量，给运营工作台角标用 */
  pendingCount: merchantScopedProcedure.query(async () => {
    const { total } = await payoutAccountReviewDataAccess.listPage({
      status: 'pending_review',
      pageSize: 1,
    })
    return { total }
  }),

  auditLog: merchantScopedProcedure
    .input(z.object({ payoutAccountId: z.string().min(1), limit: z.number().int().min(1).max(200).default(50) }))
    .query(async ({ input }) => {
      return payoutAccountReviewDataAccess.listAudit(input.payoutAccountId, input.limit)
    }),

  approve: merchantWriteProcedure
    .input(z.object({ payoutAccountId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await payoutAccountReviewDataAccess.approve(input.payoutAccountId, ctx.user)
      } catch (error) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: error instanceof Error ? error.message : '审核失败',
        })
      }
    }),

  reject: merchantWriteProcedure
    .input(z.object({ payoutAccountId: z.string().min(1), reason: z.string().min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await payoutAccountReviewDataAccess.reject(
          input.payoutAccountId,
          { reason: input.reason },
          ctx.user,
        )
      } catch (error) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: error instanceof Error ? error.message : '驳回失败',
        })
      }
    }),

  disable: merchantWriteProcedure
    .input(z.object({ payoutAccountId: z.string().min(1), reason: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await payoutAccountReviewDataAccess.disable(
          input.payoutAccountId,
          { reason: input.reason },
          ctx.user,
        )
      } catch (error) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: error instanceof Error ? error.message : '停用失败',
        })
      }
    }),

  /**
   * 某商户是否已有生效默认收款账户。
   * 供「把商户切成佣金模式」前置检查 —— 佣金户没有生效账户就永远打不了款。
   */
  hasActiveDefault: merchantScopedProcedure
    .input(
      z.object({
        ownerType: ownerTypeSchema.default('merchant'),
        ownerId: z.string().min(1),
      }),
    )
    .query(async ({ input }) => {
      return {
        has: await payoutAccountReviewDataAccess.hasActiveDefault(input.ownerType, input.ownerId),
      }
    }),
})
