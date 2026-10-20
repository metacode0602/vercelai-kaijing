/**
 * 设备审核 tRPC router
 * Phase 2 - 运营审核设备清单
 */

import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { deviceReviewDataAccess } from '../../dataaccess/supplier/device-review'

export const deviceReviewRouter = router({
  /**
   * 获取待审核设备列表
   */
  getPendingDevices: protectedProcedure
    .input(
      z.object({
        batchId: z.string().optional(),
        reviewStatus: z.enum(['pending', 'approved', 'rejected']).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input }) => {
      return await deviceReviewDataAccess.getPendingDevices(input)
    }),

  /**
   * 批量审核设备
   */
  batchReview: protectedProcedure
    .input(
      z.object({
        deviceIds: z.array(z.string().min(1)).min(1, '至少选择一台设备'),
        action: z.enum(['approve', 'reject']),
        remark: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const staffId = ctx.user.id

      return await deviceReviewDataAccess.batchReview({
        deviceIds: input.deviceIds,
        action: input.action,
        remark: input.remark,
        staffId,
      })
    }),

  /**
   * 校验设备
   */
  validateDevice: protectedProcedure
    .input(
      z.object({
        id: z.string().optional(),
        sn: z.string().min(1),
        gpuCardTypeId: z.string().min(1),
        onboardingBatchId: z.string().optional(),
        internalIp: z.string().optional(),
        externalIp: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      return await deviceReviewDataAccess.validateDevice(input)
    }),

  /**
   * 获取批次审核统计
   */
  getBatchReviewStats: protectedProcedure
    .input(z.object({ batchId: z.string().min(1) }))
    .query(async ({ input }) => {
      return await deviceReviewDataAccess.getBatchReviewStats(input.batchId)
    }),
})
