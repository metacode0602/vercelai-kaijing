import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as dictionariesDa from '@/lib/server/dataaccess/dictionaries'

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    throw new TRPCError({ code: /不存在/.test(message) ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}

export const dictionariesRouter = createTRPCRouter({
  list: tenantProcedure.query(async ({ ctx }) => dictionariesDa.listDictionaries(ctx.db, ctx.organizationId)),
  get: tenantProcedure.input(z.object({ key: z.string().min(1) })).query(async ({ ctx, input }) => {
    const row = await dictionariesDa.getDictionary(ctx.db, ctx.organizationId, input.key)
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到字典 ${input.key}` })
    return row
  }),
  upsert: tenantProcedure
    .input(
      z.object({
        key: z.string().min(1),
        label: z.string().min(1),
        description: z.string().optional(),
        shared: z.boolean().optional(),
        values: z.array(z.string()).optional(),
        valueTitles: z.record(z.string(), z.string()).optional(),
        inactiveValues: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => wrap(() => dictionariesDa.upsertDictionary(ctx.db, ctx.organizationId, input))),
  addValue: tenantProcedure
    .input(
      z.object({
        key: z.string().min(1),
        value: z.string().min(1),
        title: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => dictionariesDa.addDictionaryValue(ctx.db, ctx.organizationId, input.key, input)),
    ),
  updateValue: tenantProcedure
    .input(
      z.object({
        key: z.string().min(1),
        from: z.string().min(1),
        to: z.string().min(1),
        title: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => dictionariesDa.updateDictionaryValue(ctx.db, ctx.organizationId, input.key, input)),
    ),
  setValueActive: tenantProcedure
    .input(z.object({ key: z.string().min(1), value: z.string().min(1), active: z.boolean() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        dictionariesDa.setDictionaryValueActive(ctx.db, ctx.organizationId, input.key, input.value, input.active),
      ),
    ),
})
