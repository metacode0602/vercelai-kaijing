import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, adminProcedure } from '../trpc'
import {
  DuplicateAccountSortOrderError,
  merchantReceivingAccountDataAccess,
  maskAccountNo,
} from '@/lib/server/dataaccess/merchant/merchant-receiving-account'

/**
 * 平台 → 商户 的**专用收款账户**配置（商户预付 / 对公转账）
 *
 * 与 `payoutAccount`（商户 → 平台，商户填、平台审核）方向相反：
 *   - payoutAccountRouter：平台打款给商户，商户提交、平台审核
 *   - receivingAccountRouter：商户付款给平台，**平台配置、商户只读**
 *
 * 为什么必须 adminProcedure：本模块决定了某个商户能否自助预付、以及钱打到哪里。
 * 配错账户 = 商户的钱打进别人家，故权限与字段校验都要收紧。
 *
 * 「严格专用」：这里创建的账户一律带 merchantId，不下发 `merchant_id IS NULL`
 * 的平台通用账户（商户端只查 `merchant_id = 自己`）。
 */

const createSchema = z.object({
  merchantId: z.string().min(1, '必须指定商户'),
  accountName: z.string().min(1, '户名不能为空').max(255),
  accountNo: z.string().min(4, '账号至少 4 位').max(64),
  bankName: z.string().min(1, '开户行不能为空').max(255),
  bankBranch: z.string().max(255).optional().nullable(),
  bankCode: z.string().max(32).optional().nullable(),
  accountType: z.enum(['enterprise', 'personal']).default('enterprise'),
  minAmount: z.number().min(0, '最低汇款额不能为负').default(0),
  /** 缺省时由 dataaccess 取「该商户当前最大值 + 1」 */
  sortOrder: z.number().int().min(0).optional(),
  remark: z.string().max(500).optional().nullable(),
})

export const receivingAccountRouter = createTRPCRouter({
  /** DB 级分页 */
  list: adminProcedure
    .input(
      z.object({
        merchantId: z.string().optional(),
        isActive: z.boolean().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(({ input }) => merchantReceivingAccountDataAccess.list(input)),

  byId: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const row = await merchantReceivingAccountDataAccess.getById(input.id)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: '收款账户不存在' })
      return row
    }),

  /** 为商户开设专用账户 */
  create: adminProcedure.input(createSchema).mutation(async ({ input, ctx }) => {
    try {
      return await merchantReceivingAccountDataAccess.create({
        ...input,
        operatorId: ctx.user.id,
      })
    } catch (err) {
      if (err instanceof DuplicateAccountSortOrderError) {
        throw new TRPCError({ code: 'CONFLICT', message: err.message })
      }
      throw err
    }
  }),

  /**
   * 停用 / 启用。
   *
   * 停用而非删除：已有预付单可能仍在等这笔账户到账，删掉会让运营核对历史单据时
   * 看不到汇款目标。停用后商户端立即不再下发。
   */
  setActive: adminProcedure
    .input(z.object({ id: z.string(), isActive: z.boolean() }))
    .mutation(async ({ input }) => {
      try {
        return await merchantReceivingAccountDataAccess.setActive(input.id, input.isActive)
      } catch (err) {
        throw new TRPCError({ code: 'NOT_FOUND', message: (err as Error).message })
      }
    }),

  /** 某商户是否已具备可用的专用账户（商户列表页打标用） */
  hasActiveAccount: adminProcedure
    .input(z.object({ merchantId: z.string() }))
    .query(async ({ input }) =>
      merchantReceivingAccountDataAccess.hasActiveAccount(input.merchantId),
    ),

  /** 开通账户时选商户用的候选列表（DB 级分页） */
  merchantOptions: adminProcedure
    .input(
      z.object({
        search: z.string().max(200).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(({ input }) => merchantReceivingAccountDataAccess.listMerchantOptions(input)),

  /** 账号掩码工具（前端预览「开通后商户看到的样子」用） */
  previewMask: adminProcedure
    .input(z.object({ accountNo: z.string() }))
    .query(({ input }) => maskAccountNo(input.accountNo)),
})
