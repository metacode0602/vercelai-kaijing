import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as candidatesDa from '@/lib/server/dataaccess/candidates'
import { UI_CANDIDATE_SOURCES, UI_CANDIDATE_STATUSES } from '@/lib/server/mappers/candidates'

const paginationInput = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  q: z.string().optional(),
  status: z.string().optional(),
  source: z.string().optional(),
})

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    const notFound = /不存在/.test(message)
    throw new TRPCError({ code: notFound ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}

export const candidatesRouter = createTRPCRouter({
  list: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return candidatesDa.listCandidates(ctx.db, ctx.organizationId, input)
  }),

  stats: tenantProcedure.query(async ({ ctx }) => {
    return candidatesDa.candidateStats(ctx.db, ctx.organizationId)
  }),

  meta: tenantProcedure.query(async () => {
    return {
      statuses: [...UI_CANDIDATE_STATUSES],
      sources: [...UI_CANDIDATE_SOURCES],
      note: '支持手工录入 / 导入落库；不提供假市场爬虫成功态',
    }
  }),

  get: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await candidatesDa.getCandidate(ctx.db, ctx.organizationId, input.id)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到候选 ${input.id}` })
      return row
    }),

  create: tenantProcedure
    .input(
      z.object({
        title: z.string().min(1),
        url: z.string().optional(),
        categoryHint: z.string().optional(),
        score: z.number().optional(),
        source: z.string().optional(),
        landedCost: z.number().optional(),
        suggestPrice: z.number().optional(),
        marginPct: z.number().optional(),
        currency: z.string().optional(),
        goNoGo: z.string().optional(),
        competition: z.string().optional(),
        marketPotential: z.string().optional(),
        risk: z.string().optional(),
        rationale: z.record(z.string(), z.unknown()).optional(),
        actor: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        candidatesDa.createCandidate(ctx.db, ctx.organizationId, {
          ...input,
          rationale: input.rationale as candidatesDa.CandidateRationale | undefined,
        }),
      ),
    ),

  update: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        title: z.string().optional(),
        url: z.string().optional(),
        categoryHint: z.string().optional(),
        score: z.number().optional(),
        landedCost: z.number().optional(),
        suggestPrice: z.number().optional(),
        marginPct: z.number().optional(),
        currency: z.string().optional(),
        goNoGo: z.string().optional(),
        rationale: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        candidatesDa.updateCandidate(ctx.db, ctx.organizationId, {
          ...input,
          rationale: input.rationale as candidatesDa.CandidateRationale | undefined,
        }),
      ),
    ),

  accept: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        mode: z.enum(['create_draft', 'link_existing']).optional(),
        productId: z.string().optional(),
        productSpu: z.string().optional(),
        brand: z.string().optional(),
        owner: z.string().optional(),
        material: z.string().optional(),
        style: z.string().optional(),
        actor: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => candidatesDa.acceptCandidate(ctx.db, ctx.organizationId, input)),
    ),

  reject: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        reason: z.string().min(1),
        actor: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => candidatesDa.rejectCandidate(ctx.db, ctx.organizationId, input)),
    ),
})
