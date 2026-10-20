import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { protectedProcedure, router } from '../trpc'
import { staffDataAccess } from '@/lib/server/dataaccess/crm/staff'
import { deviceOnboardingPolicyDataAccess } from '@/lib/server/dataaccess/supplier/device-onboarding-policy'

export const deviceOnboardingRouter = router({
  /**
   * 策略模板列表
   */
  listPolicies: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input }) => {
      return await deviceOnboardingPolicyDataAccess.list(input)
    }),

  /**
   * 获取单个策略
   */
  getPolicy: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    return await deviceOnboardingPolicyDataAccess.getById(input.id)
  }),

  /**
   * 创建策略模板
   */
  createPolicy: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(128),
        description: z.string().optional(),
        policyJson: z.any(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      return await deviceOnboardingPolicyDataAccess.create({
        name: input.name,
        description: input.description,
        policyJson: input.policyJson,
        createdBy: await staffDataAccess.resolveStaffIdForAuthUser(ctx.user),
      })
    }),

  /**
   * 更新策略模板
   */
  updatePolicy: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(128).optional(),
        description: z.string().optional(),
        policyJson: z.any().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, ...updateData } = input
      return await deviceOnboardingPolicyDataAccess.update(id, updateData)
    }),

  /**
   * 删除策略模板
   */
  deletePolicy: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      return await deviceOnboardingPolicyDataAccess.delete(input.id)
    }),

  /**
   * 应用策略到批次（创建 Agent 任务）
   */
  applyPolicyToBatch: protectedProcedure
    .input(
      z.object({
        batchId: z.string(),
        policyId: z.string(),
        deviceOverrides: z.array(z.any()).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const staffId = await staffDataAccess.resolveStaffIdForAuthUser(ctx.user)
      if (!staffId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: '当前账号未关联员工信息' })
      }

      return await deviceOnboardingPolicyDataAccess.applyToBatch(
        input.batchId,
        input.policyId,
        staffId,
        input.deviceOverrides,
      )
    }),

  /**
   * 获取批次关联的策略
   */
  getPolicyByBatch: protectedProcedure
    .input(z.object({ batchId: z.string() }))
    .query(async ({ input }) => {
      return await deviceOnboardingPolicyDataAccess.getPolicyByBatchId(input.batchId)
    }),

  /**
   * 获取批次下的任务列表
   */
  getTasksByBatch: protectedProcedure
    .input(z.object({ batchId: z.string() }))
    .query(async ({ input }) => {
      return await deviceOnboardingPolicyDataAccess.getTasksByBatchId(input.batchId)
    }),

  /**
   * 手动重试失败任务
   */
  retryTask: protectedProcedure
    .input(z.object({ taskId: z.string() }))
    .mutation(async ({ input }) => {
      const success = await deviceOnboardingPolicyDataAccess.retryFailedTask(input.taskId)
      if (!success) {
        throw new Error('Task not found or not in failed state')
      }
      return { success: true }
    }),
})
