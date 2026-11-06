import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as reviewsDa from '@/lib/server/dataaccess/reviews'
import { UI_REPLY_STATUSES, UI_REVIEW_SENTIMENTS } from '@/lib/server/mappers/reviews'

const paginationInput = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  q: z.string().optional(),
  sentiment: z.string().optional(),
  replyStatus: z.string().optional(),
})

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    const notFound = /不存在/.test(message)
    throw new TRPCError({ code: notFound ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}

export const reviewsRouter = createTRPCRouter({
  list: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return reviewsDa.listReviews(ctx.db, ctx.organizationId, input)
  }),

  stats: tenantProcedure.query(async ({ ctx }) => {
    return reviewsDa.reviewStats(ctx.db, ctx.organizationId)
  }),

  meta: tenantProcedure.query(async () => ({
    sentiments: [...UI_REVIEW_SENTIMENTS],
    replyStatuses: [...UI_REPLY_STATUSES],
    note: '列表读 product_reviews；平台回复 OpenAPI 为 stub，禁止假成功',
  })),

  get: tenantProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ ctx, input }) => {
    const row = await reviewsDa.getReview(ctx.db, ctx.organizationId, input.id)
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到评论 ${input.id}` })
    return row
  }),

  saveManualReply: tenantProcedure
    .input(z.object({ id: z.string().min(1), content: z.string().min(1), actor: z.string().optional() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() => reviewsDa.saveManualReply(ctx.db, ctx.organizationId, input)),
    ),

  queuePlatformReplyStub: tenantProcedure
    .input(z.object({ id: z.string().min(1), content: z.string().optional() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() => reviewsDa.queuePlatformReplyStub(ctx.db, ctx.organizationId, input)),
    ),
})
