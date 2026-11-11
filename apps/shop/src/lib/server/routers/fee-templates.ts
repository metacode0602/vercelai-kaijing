import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, requirePermission, tenantProcedure } from '@/lib/server/trpc'
import { appendAuditEvent } from '@/lib/server/dataaccess/audit'
import * as feeDa from '@/lib/server/dataaccess/fee-templates'

const paginationInput = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  q: z.string().optional(),
  platform: z.string().optional(),
  country: z.string().optional(),
  fulfillmentPool: z.string().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
})

const componentSchema = z.object({
  code: z.string(),
  labelZh: z.string(),
  rate: z.number(),
  unit: z.enum(['pct', 'usd']),
  baseHint: z.string().optional(),
  note: z.string().optional(),
})

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    const notFound = /不存在/.test(message)
    throw new TRPCError({ code: notFound ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}

export const feeTemplatesRouter = createTRPCRouter({
  list: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return feeDa.listFeeTemplates(ctx.db, ctx.organizationId, input)
  }),

  stats: tenantProcedure.query(async ({ ctx }) => {
    return feeDa.feeTemplateStats(ctx.db, ctx.organizationId)
  }),

  meta: tenantProcedure.query(async () => feeDa.feeTemplateMeta()),

  get: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await feeDa.getFeeTemplate(ctx.db, ctx.organizationId, input.id)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到费用模板 ${input.id}` })
      return row
    }),

  create: tenantProcedure
    .input(
      z.object({
        code: z.string().min(1),
        name: z.string().min(1),
        platform: z.string().min(1),
        country: z.string().min(1),
        fulfillmentPool: z.string().optional(),
        fulfillmentLogistics: z.string().optional(),
        type: z.string().min(1),
        status: z.string().optional(),
        note: z.string().optional(),
        withDraftVersion: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => feeDa.createFeeTemplate(ctx.db, ctx.organizationId, input)),
    ),

  update: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        name: z.string().optional(),
        platform: z.string().optional(),
        country: z.string().optional(),
        fulfillmentPool: z.string().optional(),
        fulfillmentLogistics: z.string().optional(),
        status: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => {
        const { id, ...patch } = input
        return feeDa.updateFeeTemplate(ctx.db, ctx.organizationId, id, patch)
      }),
    ),

  createVersion: tenantProcedure
    .input(
      z.object({
        templateId: z.string().min(1),
        baseVersionId: z.string().optional(),
        effectiveFrom: z.string().optional(),
        effectiveTo: z.string().optional(),
        priority: z.number().int().optional(),
        formulaProfile: z.string().optional(),
        components: z.array(componentSchema).optional(),
        note: z.string().optional(),
        reviewNeeded: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => feeDa.createFeeTemplateVersion(ctx.db, ctx.organizationId, input)),
    ),

  updateVersion: tenantProcedure
    .input(
      z.object({
        versionId: z.string().min(1),
        effectiveFrom: z.string().optional(),
        effectiveTo: z.string().nullable().optional(),
        priority: z.number().int().optional(),
        formulaProfile: z.string().optional(),
        components: z.array(componentSchema).optional(),
        note: z.string().optional(),
        reviewNeeded: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => {
        const { versionId, ...patch } = input
        return feeDa.updateFeeTemplateVersion(ctx.db, ctx.organizationId, versionId, patch)
      }),
    ),

  submit: tenantProcedure
    .input(z.object({ versionId: z.string().min(1), actor: z.string().optional() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        feeDa.submitFeeTemplateVersion(
          ctx.db,
          ctx.organizationId,
          input.versionId,
          input.actor,
        ),
      ),
    ),

  publish: requirePermission('finance.approve')
    .input(
      z.object({
        versionId: z.string().min(1),
        actor: z.string().optional(),
        reviewNote: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await wrap(() =>
        feeDa.publishFeeTemplateVersion(
          ctx.db,
          ctx.organizationId,
          input.versionId,
          input.actor || ctx.user?.name || ctx.user?.email || undefined,
          input.reviewNote,
        ),
      )
      await appendAuditEvent(ctx.db, ctx.organizationId, {
        actorUserId: ctx.user?.id,
        actorLabel: ctx.user?.name || ctx.user?.email || ctx.user?.id,
        action: 'fee_template.publish',
        entityType: 'fee_template_version',
        entityId: input.versionId,
        result: 'ok',
        detail: '发布费用模板版本',
        after: { versionId: input.versionId, reviewNote: input.reviewNote },
      })
      return result
    }),

  reject: tenantProcedure
    .input(
      z.object({
        versionId: z.string().min(1),
        reviewNote: z.string().min(1),
        actor: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        feeDa.rejectFeeTemplateVersion(
          ctx.db,
          ctx.organizationId,
          input.versionId,
          input.reviewNote,
          input.actor,
        ),
      ),
    ),

  disableVersion: tenantProcedure
    .input(z.object({ versionId: z.string().min(1), actor: z.string().optional() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        feeDa.disableFeeTemplateVersion(
          ctx.db,
          ctx.organizationId,
          input.versionId,
          input.actor,
        ),
      ),
    ),

  disable: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      wrap(() => feeDa.disableFeeTemplate(ctx.db, ctx.organizationId, input.id)),
    ),

  duplicate: tenantProcedure
    .input(z.object({ id: z.string().min(1), newCode: z.string().optional() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        feeDa.duplicateFeeTemplate(ctx.db, ctx.organizationId, input.id, input.newCode),
      ),
    ),

  /** 按 platform+country+type(+pool/logistics/asOf) 解析 priority 最高且有效期内已发布版本 */
  resolve: tenantProcedure
    .input(
      z.object({
        platform: z.string().min(1),
        country: z.string().min(1),
        type: z.string().min(1),
        fulfillmentPool: z.string().optional(),
        fulfillmentLogistics: z.string().optional(),
        asOf: z.string().optional(),
        formulaProfile: z.string().optional(),
        templateCodeOrId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return feeDa.resolveFeeTemplateVersion(ctx.db, ctx.organizationId, input)
    }),
})
