import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as complianceDa from '@/lib/server/dataaccess/compliance'

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    if (error instanceof TRPCError) throw error
    const message = error instanceof Error ? error.message : '操作失败'
    throw new TRPCError({
      code: /不存在/.test(message) ? 'NOT_FOUND' : 'BAD_REQUEST',
      message,
    })
  })
}

const statusSchema = z.enum(['enabled', 'disabled'])

const ruleFields = {
  hsCode: z.string().min(1),
  description: z.string().optional(),
  slsiRequired: z.boolean().optional(),
  certName: z.string().optional(),
  blockCreate: z.boolean().optional(),
  validFrom: z.string().nullable().optional(),
  validTo: z.string().nullable().optional(),
  status: statusSchema.optional(),
  notes: z.string().optional(),
}

export const complianceRouter = createTRPCRouter({
  listRules: tenantProcedure
    .input(
      z.object({
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(200).optional(),
        q: z.string().optional(),
        slsiRequired: z.boolean().optional(),
        blockCreate: z.boolean().optional(),
        status: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => complianceDa.listHsRules(ctx.db, ctx.organizationId, input)),

  createRule: tenantProcedure
    .input(z.object(ruleFields))
    .mutation(async ({ ctx, input }) => wrap(() => complianceDa.createHsRule(ctx.db, ctx.organizationId, input))),

  updateRule: tenantProcedure
    .input(z.object({ id: z.string().min(1), ...ruleFields, hsCode: z.string().min(1).optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input
      return wrap(() => complianceDa.updateHsRule(ctx.db, ctx.organizationId, id, patch))
    }),

  setStatus: tenantProcedure
    .input(z.object({ id: z.string().min(1), status: statusSchema }))
    .mutation(async ({ ctx, input }) =>
      wrap(() => complianceDa.setHsRuleStatus(ctx.db, ctx.organizationId, input.id, input.status)),
    ),

  importRules: tenantProcedure
    .input(
      z.object({
        rows: z
          .array(
            z.object({
              hsCode: z.string().optional(),
              description: z.string().optional(),
              slsiRequired: z.union([z.boolean(), z.string()]).optional(),
              certName: z.string().optional(),
              blockCreate: z.union([z.boolean(), z.string()]).optional(),
              validFrom: z.string().optional(),
              validTo: z.string().optional(),
              status: z.string().optional(),
              notes: z.string().optional(),
            }),
          )
          .max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => wrap(() => complianceDa.importHsRules(ctx.db, ctx.organizationId, input.rows))),

  lookup: tenantProcedure
    .input(z.object({ hsCode: z.string().min(1) }))
    .query(async ({ ctx, input }) => complianceDa.lookupHs(ctx.db, ctx.organizationId, input.hsCode)),

  listCerts: tenantProcedure
    .input(z.object({ productId: z.string().optional(), q: z.string().optional() }))
    .query(async ({ ctx, input }) => complianceDa.listCerts(ctx.db, ctx.organizationId, input)),

  upsertCert: tenantProcedure
    .input(
      z.object({
        id: z.string().optional(),
        productId: z.string().min(1),
        variantId: z.string().nullable().optional(),
        certNumber: z.string().min(1),
        certName: z.string().optional(),
        hsCode: z.string().optional(),
        fileName: z.string().optional(),
        fileUrl: z.string().optional(),
        expiresAt: z.string().nullable().optional(),
        status: statusSchema.optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => wrap(() => complianceDa.upsertCert(ctx.db, ctx.organizationId, input))),

  setCertStatus: tenantProcedure
    .input(z.object({ id: z.string().min(1), status: statusSchema }))
    .mutation(async ({ ctx, input }) =>
      wrap(() => complianceDa.setCertStatus(ctx.db, ctx.organizationId, input.id, input.status)),
    ),
})
