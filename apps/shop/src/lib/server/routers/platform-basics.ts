import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { platformBasicKinds } from '@workspace/db/schema'
import {
  initializePlatformBasicsForOrganization,
  platformBasicCreateSchema,
  platformBasicUpdateSchema,
} from '@workspace/db/platform-basics'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as platformBasicsDa from '@/lib/server/dataaccess/platform-basics'

/**
 * 平台基础资料（组织副本）：平台目录初始化到组织后，由租户自行 CRUD，只影响本组织。
 * @see docs/design/haoshiyun-platform-basics-ued.md §7
 */

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    throw new TRPCError({ code: /不存在/.test(message) ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}

const listInput = z.object({
  kind: z.enum(platformBasicKinds),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  q: z.string().max(120).optional(),
})

export const platformBasicsRouter = createTRPCRouter({
  list: tenantProcedure.input(listInput).query(({ ctx, input }) =>
    platformBasicsDa.listPlatformBasics(ctx.db, ctx.organizationId, input),
  ),

  create: tenantProcedure
    .input(platformBasicCreateSchema)
    .mutation(({ ctx, input }) =>
      wrap(() => platformBasicsDa.createPlatformBasics(ctx.db, ctx.organizationId, input)),
    ),

  update: tenantProcedure.input(platformBasicUpdateSchema).mutation(({ ctx, input }) => {
    const { id, ...values } = input
    return wrap(() => platformBasicsDa.updatePlatformBasics(ctx.db, ctx.organizationId, { id, values }))
  }),

  remove: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      wrap(() => platformBasicsDa.deletePlatformBasics(ctx.db, ctx.organizationId, input.id)),
    ),

  /** 从平台目录补齐本组织缺失项（幂等，不覆盖组织已维护内容）。 */
  initFromCatalog: tenantProcedure.mutation(({ ctx }) =>
    wrap(() => initializePlatformBasicsForOrganization(ctx.db, ctx.organizationId)),
  ),
})
