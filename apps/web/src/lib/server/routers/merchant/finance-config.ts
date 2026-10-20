import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, adminProcedure } from '../trpc'
import { merchantFinanceConfigDataAccess, RECHARGE_BLOCK_THRESHOLD_KEY } from '@/lib/server/dataaccess/merchant/merchant-finance-config'
import { staffDataAccess } from '@/lib/server/dataaccess/crm/staff'
import { db } from '@/lib/db'
import { userStaff } from '@workspace/db'
import { eq } from 'drizzle-orm'

/**
 * 商户财务配置（DEC-F7）
 *
 * 当前只有充值阻断阈值一项，但 router/dataaccess 按 config_key 通用设计，
 * 后续加配置（如自动充值默认值）无需改表结构。
 *
 * 只给 adminProcedure：阈值决定所有商户能否继续接单，误改影响面是全平台。
 */

const setThresholdSchema = z.object({
  value: z.number().min(0, '阈值不能为负'),
  remark: z.string().max(500).optional(),
  /** 运营需显式确认已看到影响面，防止手滑把全平台商户一次性阻断 */
  confirmImpact: z.literal(true, '请先确认影响面再保存'),
})

async function requireOperator(user: {
  id: string
  email?: string | null
  name?: string | null
}): Promise<{ id: string; name: string }> {
  const staffId = await staffDataAccess.resolveStaffIdForAuthUser(user)
  if (!staffId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: '当前账号未关联员工信息，无法记录操作人' })
  }
  const [staff] = await db
    .select({ id: userStaff.id, displayName: userStaff.displayName })
    .from(userStaff)
    .where(eq(userStaff.id, staffId))
    .limit(1)
  if (!staff) {
    throw new TRPCError({ code: 'FORBIDDEN', message: '员工信息不存在' })
  }
  return { id: staff.id, name: staff.displayName }
}

export const financeConfigRouter = createTRPCRouter({
  /** 全部财务配置（键值对） */
  list: adminProcedure.query(async () => {
    return merchantFinanceConfigDataAccess.listConfigs()
  }),

  /** 当前全局充值阻断阈值；null = 未配置（回退 0 = 不阻断） */
  getRechargeBlockThreshold: adminProcedure.query(async () => {
    return {
      value: (await merchantFinanceConfigDataAccess.getNumericValue(RECHARGE_BLOCK_THRESHOLD_KEY)) ?? 0,
      configured: (await merchantFinanceConfigDataAccess.getNumericValue(RECHARGE_BLOCK_THRESHOLD_KEY)) !== null,
    }
  }),

  /**
   * 预览阈值调整影响面。
   * 单独暴露是因为它可能较重（扫全部商户可用额），前端在用户点「预览」时才调，
   * 不阻塞列表渲染。
   */
  previewRechargeBlockThreshold: adminProcedure
    .input(z.object({ value: z.number().min(0) }))
    .query(async ({ input }) => {
      return merchantFinanceConfigDataAccess.previewThresholdChange(input.value)
    }),

  /** 写入全局充值阻断阈值（写审计） */
  setRechargeBlockThreshold: adminProcedure
    .input(setThresholdSchema)
    .mutation(async ({ input, ctx }) => {
      const operator = await requireOperator(ctx.user)
      const result = await merchantFinanceConfigDataAccess.setNumericValue(
        RECHARGE_BLOCK_THRESHOLD_KEY,
        input.value,
        operator,
        input.remark,
      )
      return result
    }),

  /** 配置变更审计（DB 级分页） */
  auditLog: adminProcedure
    .input(
      z.object({
        configKey: z.string().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input }) => {
      return merchantFinanceConfigDataAccess.listConfigAudit(
        input.configKey,
        input.page,
        input.pageSize,
      )
    }),
})
