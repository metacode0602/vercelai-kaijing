import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as hsDa from '@/lib/server/dataaccess/hs-tariffs'

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    throw new TRPCError({ code: /不存在|未找到/.test(message) ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}

const actor = (ctx: { user?: { id?: string } | null }) => ({ actorUserId: ctx.user?.id })

const upsertInput = z.object({
  countryCode: z.string().min(1),
  hsCode: z.string().min(1),
  codeDisplay: z.string().optional(),
  description: z.string().optional(),
  effectiveFrom: z.string().min(1),
  effectiveTo: z.string().optional(),
  currency: z.string().optional(),
  formulaProfile: z.string().optional(),
  components: z.record(z.string(), z.unknown()).optional(),
  gdRate: z.number().nullable().optional(),
  surchargeRate: z.number().nullable().optional(),
  palRate: z.number().nullable().optional(),
  cessRate: z.number().nullable().optional(),
  exciseRate: z.number().nullable().optional(),
  vatRate: z.number().nullable().optional(),
  ssclRate: z.number().nullable().optional(),
  gdSpecificAmount: z.number().nullable().optional(),
  gdSpecificUnit: z.string().optional(),
  gdSpecificRule: z.string().optional(),
  cessSpecificAmount: z.number().nullable().optional(),
  cessSpecificUnit: z.string().optional(),
  isExact: z.boolean().optional(),
  notes: z.string().optional(),
})

export const hsTariffsRouter = createTRPCRouter({
  list: tenantProcedure
    .input(
      z
        .object({
          page: z.number().optional(),
          pageSize: z.number().optional(),
          q: z.string().optional(),
          countryCode: z.string().optional(),
          status: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => hsDa.listHsTariffs(ctx.db, ctx.organizationId, input ?? {})),

  createDraft: tenantProcedure
    .input(upsertInput)
    .mutation(async ({ ctx, input }) =>
      wrap(() => hsDa.createHsTariffDraft(ctx.db, ctx.organizationId, { ...input, ...actor(ctx) })),
    ),

  updateDraft: tenantProcedure
    .input(upsertInput.extend({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      wrap(() => hsDa.updateHsTariffDraft(ctx.db, ctx.organizationId, { ...input, ...actor(ctx) })),
    ),

  setStatus: tenantProcedure
    .input(z.object({ id: z.string().min(1), status: z.enum(['draft', 'active', 'archived']) }))
    .mutation(async ({ ctx, input }) =>
      wrap(() => hsDa.setHsTariffStatus(ctx.db, ctx.organizationId, { ...input, ...actor(ctx) })),
    ),
})
