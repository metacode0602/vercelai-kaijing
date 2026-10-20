/**
 * 平台侧算力券管理 tRPC router（admin-only）
 *
 * 资金安全约束：这里**只**暴露「发放」与「回收」两类动作，且都经由
 * `packages/billing` 的领域函数执行 —— 发放必冻结券池额度、回收只释放剩余额度，
 * 人工操作不可能绕过冻结/释放与账本。**不暴露**任何直接改 `coupon.surplus_amount`
 * 或直接写 `merchant_account_ledger` 的 procedure。
 *
 * 发放前必须先 `purchaseMerchantVoucher` 采购券额度（或此前已采购）：
 * `grantMerchantCoupon` 走 `freezeMerchantBalance`，券池可用额不足会整笔失败，
 * 不会出现「发了券但商户没有对应额度」的空头承诺。
 */

import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { adminProcedure, createTRPCRouter } from '../trpc'
import { db } from '@/lib/db'
import {
  COUPON_STATUSES,
  CouponExpiredError,
  CouponMinAmountNotMetError,
  CouponNotFoundError,
  CouponNotUsableError,
  CouponOverdrawError,
  InsufficientMerchantBalanceError,
  IdempotencyConflictError,
  assertMerchantExists,
  getCouponOpsSummary,
  grantMerchantCoupon,
  listCouponRedemptions,
  listCouponsForOps,
  expireMerchantCoupon,
} from '@workspace/billing'
import { merchantDataAccess } from '@/lib/server/dataaccess/merchant/merchant'

const statusSchema = z.enum(COUPON_STATUSES)

const amountSchema = z
  .number()
  .positive('券面额必须为正数')
  .max(10_000_000, '单张券面额上限 ¥10,000,000')
  .multipleOf(0.01, '金额最多 2 位小数')

function mapVoucherError(error: unknown): never {
  if (error instanceof InsufficientMerchantBalanceError) {
    // 券池可用额不足：这是「要先采购再发放」的前置条件问题，运营需要知道怎么办
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error.message })
  }
  if (error instanceof IdempotencyConflictError) {
    throw new TRPCError({ code: 'CONFLICT', message: error.message })
  }
  if (
    error instanceof CouponOverdrawError ||
    error instanceof CouponNotUsableError ||
    error instanceof CouponExpiredError ||
    error instanceof CouponMinAmountNotMetError
  ) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: error.message })
  }
  if (error instanceof CouponNotFoundError) {
    throw new TRPCError({ code: 'NOT_FOUND', message: error.message })
  }
  throw error
}

export const voucherRouter = createTRPCRouter({
  /** 全平台券列表（跨商户，DB 级分页） */
  list: adminProcedure
    .input(
      z.object({
        merchantId: z.string().optional(),
        tenantId: z.string().optional(),
        status: statusSchema.optional(),
        search: z.string().max(200).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(({ input }) => listCouponsForOps(db, input)),

  /** 角标统计：券总数 / 生效中 / 7 天内到期 / 未核销余额 / 累计核销 */
  summary: adminProcedure.query(() => getCouponOpsSummary(db)),

  /**
   * 发放算力券给终端租户。
   *
   * 券额度来自该商户的券池可用额（同事务冻结），所以：
   *   - 券池没额度 → 整笔失败，不会发出空头券
   *   - 网络重试（同 requestId）→ 返回同一张券，不会重复发放
   *
   * `requestId` 必填且由调用方按业务单据派生：没有它就无法在重试时认出
   * 「这是同一笔发放」，而券是钱，重发一次就是多欠用户一次。
   */
  grant: adminProcedure
    .input(
      z.object({
        merchantId: z.string().min(1, '必须指定商户'),
        tenantId: z.string().min(1, '必须指定租户'),
        amount: amountSchema,
        name: z.string().min(1, '券名不能为空').max(128),
        /** 面额门槛：订单金额达到该值才允许抵扣 */
        minAmount: amountSchema.optional(),
        type: z.enum(['cash', 'discount']).default('cash'),
        /** 有效天数；不传用领域默认 90 天 */
        validityDay: z.number().int().min(1).max(3650).optional(),
        /** 自定义券码；不传由服务端生成 */
        code: z
          .string()
          .min(4, '券码至少 4 位')
          .max(32)
          .regex(/^[A-Za-z0-9_-]+$/, '券码只允许字母、数字、下划线与连字符')
          .optional(),
        requestId: z.string().min(8, 'requestId 至少 8 位').max(64),
        remark: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await assertMerchantExists(db, input.merchantId)
      // 租户必须属于该商户：给别的商户的租户发券 = 凭空消耗别人券池。
      // 用单行判定而不是「取前 100 个租户再 some()」—— 后者在商户租户数
      // 超过 100 时会把合法租户误判成越权，直接把正常发券堵死。
      if (!(await merchantDataAccess.tenantBelongsToMerchant(input.merchantId, input.tenantId))) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: '租户不属于该商户，无法发放',
        })
      }
      try {
        return await grantMerchantCoupon(db, {
          merchantId: input.merchantId,
          tenantId: input.tenantId,
          amount: input.amount,
          name: input.name,
          minAmount: input.minAmount,
          type: input.type,
          validityDay: input.validityDay,
          code: input.code,
          requestId: input.requestId,
          remark: input.remark,
          operatorId: ctx.user.id,
        })
      } catch (error) {
        mapVoucherError(error)
      }
    }),

  /**
   * 回收券（过期 / 商户主动作废）。
   *
   * 只释放**剩余**额度，已核销部分不动 —— 释放全额会让商户多拿回钱。
   * 券状态被抢占后清零剩余，避免「面值 − 剩余」口径把已退款算成已消费。
   */
  recover: adminProcedure
    .input(
      z.object({
        couponId: z.string().min(1),
        reason: z.string().min(1, '请填写回收原因').max(200),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await expireMerchantCoupon(db, {
          couponId: input.couponId,
          reason: input.reason,
          operatorId: ctx.user.id,
        })
      } catch (error) {
        mapVoucherError(error)
      }
    }),

  /** 券核销明细（回答「这张券抵了哪几次消费」） */
  redemptions: adminProcedure
    .input(
      z.object({
        couponId: z.string().min(1),
        limit: z.number().int().min(1).max(200).optional(),
      }),
    )
    .query(({ input }) => listCouponRedemptions(db, input)),

  /** 发放时选租户用：某商户下的租户候选 */
  /**
   * 发放时选租户用：某商户下的租户候选。
   *
   * 返回 `hasMore` 而非静默截断：租户超过一页时，前端要能提示「还有更多」，
   * 并允许按名称/平台租户号搜索定位到后面的租户 —— 否则大商户的租户
   * 永远选不到，等于发不出券。
   */
  tenantOptions: adminProcedure
    .input(
      z.object({
        merchantId: z.string().min(1),
        search: z.string().max(200).optional(),
      }),
    )
    .query(async ({ input }) => {
      const search = input.search?.trim()
      const rows = await merchantDataAccess.listTenantsByMerchantId(input.merchantId, {
        page: 1,
        pageSize: 100,
        ...(search ? { search } : {}),
      })
      return {
        items: rows.items.map((t) => ({
          id: t.id,
          name: t.tenantName,
          platformTenantId: t.platformTenantId,
          status: t.tenantStatus,
        })),
        total: rows.total,
        hasMore: rows.total > rows.items.length,
      }
    }),
})
