import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantOwnerProcedure, tenantProcedure } from '@/lib/server/trpc'
import * as marketplaceAppsDa from '@/lib/server/dataaccess/marketplace-app-credentials'
import { marketplaceBaseUrl } from '@/lib/marketplace/env'

const platformSchema = z.enum(['daraz', 'lazada', 'tiktok_shop'])
const callbackKeySchema = z
  .string()
  .trim()
  .max(64)
  .regex(/^[a-zA-Z0-9_-]*$/, '回调标识只能包含字母、数字、下划线和短横线')

function actor(ctx: { user?: { id: string; name?: string | null; email?: string | null } | null }) {
  return {
    actorUserId: ctx.user?.id,
    actorLabel: ctx.user?.name || ctx.user?.email || undefined,
  }
}

async function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    throw new TRPCError({
      code: /不存在/.test(message) ? 'NOT_FOUND' : 'BAD_REQUEST',
      message,
    })
  })
}

export const marketplaceAppsRouter = createTRPCRouter({
  list: tenantProcedure
    .input(
      z
        .object({
          page: z.number().int().positive().optional(),
          pageSize: z.number().int().positive().max(100).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const result = await marketplaceAppsDa.listMarketplaceAppCredentials(
        ctx.db,
        ctx.organizationId,
        input ?? {},
      )
      return { ...result, callbackBaseUrl: marketplaceBaseUrl() }
    }),

  create: tenantOwnerProcedure
    .input(
      z.object({
        platform: platformSchema,
        region: z.string().trim().max(16).optional(),
        appKey: z.string().trim().min(1).max(128),
        appSecret: z.string().trim().min(1).max(512),
        callbackKey: callbackKeySchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        marketplaceAppsDa.createMarketplaceAppCredential(ctx.db, ctx.organizationId, {
          ...input,
          ...actor(ctx),
        }),
      ),
    ),

  update: tenantOwnerProcedure
    .input(
      z.object({
        id: z.string().min(1),
        platform: platformSchema.optional(),
        region: z.string().trim().max(16).optional(),
        appKey: z.string().trim().min(1).max(128).optional(),
        appSecret: z.string().trim().max(512).optional(),
        callbackKey: callbackKeySchema.nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        marketplaceAppsDa.updateMarketplaceAppCredential(ctx.db, ctx.organizationId, {
          ...input,
          ...actor(ctx),
        }),
      ),
    ),

  setStatus: tenantOwnerProcedure
    .input(
      z.object({
        id: z.string().min(1),
        status: z.enum(['active', 'disabled']),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        marketplaceAppsDa.setMarketplaceAppCredentialStatus(ctx.db, ctx.organizationId, {
          id: input.id,
          status: input.status,
          ...actor(ctx),
        }),
      ),
    ),

  remove: tenantOwnerProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        marketplaceAppsDa.removeMarketplaceAppCredential(ctx.db, ctx.organizationId, {
          id: input.id,
          ...actor(ctx),
        }),
      ),
    ),
})
