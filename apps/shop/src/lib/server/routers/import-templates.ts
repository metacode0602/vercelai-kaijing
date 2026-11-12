import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import { initializeImportTemplatesForOrganization } from '@workspace/db/platform-catalogs'
import * as importTemplatesDa from '@/lib/server/dataaccess/import-templates'
import { UI_ACTIVE_STATUSES } from '@/lib/server/mappers/ops-master'

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    throw new TRPCError({ code: /不存在/.test(message) ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}

export const importTemplatesRouter = createTRPCRouter({
  list: tenantProcedure
    .input(z.object({ page: z.number().optional(), pageSize: z.number().optional(), q: z.string().optional() }))
    .query(async ({ ctx, input }) => importTemplatesDa.listImportTemplates(ctx.db, ctx.organizationId, input)),
  meta: tenantProcedure.query(async () => ({
    statuses: [...UI_ACTIVE_STATUSES],
    note: '模板配置已落库；批量导入作业执行仍待导入流水',
    kinds: ['仓库 / 库位', '商品 / SKU', 'Seller SKU 映射', '期初库存', '历史订单'],
  })),
  get: tenantProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ ctx, input }) => {
    const row = await importTemplatesDa.getImportTemplate(ctx.db, ctx.organizationId, input.id)
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到模板 ${input.id}` })
    return row
  }),
  create: tenantProcedure
    .input(
      z.object({
        kind: z.string().min(1),
        version: z.string().optional(),
        fields: z.string().optional(),
        duplicateStrategy: z.string().optional(),
        rollbackStrategy: z.string().optional(),
        status: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        importTemplatesDa.createImportTemplate(ctx.db, ctx.organizationId, {
          ...input,
          actorUserId: ctx.user?.id,
          actorLabel: ctx.user?.name || ctx.user?.email || undefined,
        }),
      ),
    ),
  update: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        kind: z.string().optional(),
        version: z.string().optional(),
        fields: z.string().optional(),
        duplicateStrategy: z.string().optional(),
        rollbackStrategy: z.string().optional(),
        status: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        importTemplatesDa.updateImportTemplate(ctx.db, ctx.organizationId, {
          ...input,
          actorUserId: ctx.user?.id,
          actorLabel: ctx.user?.name || ctx.user?.email || undefined,
        }),
      ),
    ),
  initFromCatalog: tenantProcedure.mutation(({ ctx }) =>
    wrap(() => initializeImportTemplatesForOrganization(ctx.db, ctx.organizationId)),
  ),
})
