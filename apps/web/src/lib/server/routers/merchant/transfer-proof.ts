/**
 * 平台侧对公转账凭证核销 tRPC router（admin-only）
 *
 * 资金安全约束：这里**不暴露**任何直接写余额的 procedure。`approve` 只转发给
 * `packages/billing` 的 `approveTransferProof`，其入账路径与渠道回调完全相同
 * （`handleMerchantPrepayCallback`：`pending → paid` 条件跃迁 + 按订单 id 幂等
 * 写 cash 池流水），所以人工核销不可能绕过订单状态机。
 *
 * `amountOverride` 只能修正「商户把凭证金额填错」这一种情况：填一个与订单金额
 * 不同的值会被 dataaccess 拒掉 —— 系统不替人决定「这笔钱算不算到账」。
 */

import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { adminProcedure, router } from '../trpc'
import { db } from '@/lib/db'
import {
  notifyTransferProofApproved,
  notifyTransferProofRejected,
} from '@/lib/server/dataaccess/merchant/merchant-site-message'
import {
  TransferProofAlreadyReviewedError,
  TransferProofAmountMismatchError,
  TransferProofOrderNotPayableError,
  approveTransferProof,
  getTransferProofSummary,
  listTransferProofsForOps,
  rejectTransferProof,
} from '@workspace/billing'

const reviewStatusSchema = z.enum(['pending', 'approved', 'rejected', 'cancelled'])

/**
 * 站内信写入失败不阻断审核结果。
 *
 * 资金跃迁（`pending → paid`）与凭证 `claimProof` 此时都已提交，抛错只会让运营
 * 误以为审核失败并重试，重试必然撞上 `TransferProofAlreadyReviewedError`。
 * 商户侧另有凭证审核状态作为权威来源，所以这里降级为记录日志。
 */
async function bestEffortNotify(notify: () => Promise<void>): Promise<void> {
  try {
    await notify()
  } catch (error) {
    console.error('[transfer-proof] 写入商户站内信失败', error)
  }
}

export const transferProofRouter = router({
  /** 核销队列（DB 级分页） */
  list: adminProcedure
    .input(
      z.object({
        reviewStatus: reviewStatusSchema.default('pending'),
        merchantId: z.string().optional(),
        onlyMismatch: z.boolean().default(false),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(({ input }) => listTransferProofsForOps(db, input)),

  /** 角标统计：待核销数 / 其中金额不一致数 */
  pendingSummary: adminProcedure.query(() => getTransferProofSummary(db)),

  /** 核销通过 → 入账到商户 cash 池 */
  approve: adminProcedure
    .input(
      z.object({
        proofId: z.string().min(1),
        /** 银行流水核对后的真实到账金额；仅用于修正商户填错的凭证金额 */
        amountOverride: z.number().positive().multipleOf(0.01).optional(),
        comment: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await approveTransferProof(db, {
          proofId: input.proofId,
          reviewerId: ctx.user.id,
          amountOverride: input.amountOverride,
          comment: input.comment,
        })
        await bestEffortNotify(() =>
          notifyTransferProofApproved({
            merchantId: result.merchantId,
            orderNo: result.orderNo,
            credited: result.credited,
          }),
        )
        return result
      } catch (error) {
        if (error instanceof TransferProofAlreadyReviewedError) {
          throw new TRPCError({ code: 'CONFLICT', message: error.message })
        }
        if (error instanceof TransferProofOrderNotPayableError) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error.message })
        }
        if (error instanceof TransferProofAmountMismatchError) {
          // 422：请求本身合法，但业务上不可执行，且必须人工线下处理
          throw new TRPCError({ code: 'UNPROCESSABLE_CONTENT', message: error.message })
        }
        throw error
      }
    }),

  /** 核销驳回（钱没到 / 凭证不实）；订单保持 pending，可重新提交凭证 */
  reject: adminProcedure
    .input(
      z.object({
        proofId: z.string().min(1),
        comment: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await rejectTransferProof(db, {
          proofId: input.proofId,
          reviewerId: ctx.user.id,
          comment: input.comment,
        })
        await bestEffortNotify(() =>
          notifyTransferProofRejected({
            merchantId: result.merchantId,
            orderNo: result.orderNo,
            comment: input.comment,
          }),
        )
        return result
      } catch (error) {
        if (error instanceof TransferProofAlreadyReviewedError) {
          throw new TRPCError({ code: 'CONFLICT', message: error.message })
        }
        throw error
      }
    }),
})
