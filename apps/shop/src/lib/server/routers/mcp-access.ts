import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { OPENSHOP_READ_SCOPE, OPENSHOP_WRITE_PENDING_SCOPE } from '@workspace/auth'
import { auth } from '@/lib/auth'
import {
  bindOAuthClientToOrganization,
  createApiKey,
  disableApiKey,
  disableOAuthClient,
  getMcpAccessStatus,
  listApiKeys,
  listOAuthClients,
  setOrganizationMcpEnabled,
} from '@/lib/server/dataaccess/mcp-access'
import { router, tenantAdminProcedure } from '@/lib/server/trpc'

const paginationInput = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
})

function wrapError(error: unknown): never {
  const statusCode =
    typeof error === 'object' && error !== null && 'statusCode' in error
      ? error.statusCode
      : undefined
  if (statusCode === 401 || statusCode === 403) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: '无权管理 MCP OAuth 客户端：请使用具备 settings.configure 权限的组织管理员账号，并先选择组织',
    })
  }
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: error instanceof Error && error.message ? error.message : '请求失败',
  })
}

export const mcpAccessRouter = router({
  status: tenantAdminProcedure.query(async ({ ctx }) =>
    getMcpAccessStatus(ctx.db, ctx.organizationId),
  ),

  setOrganizationEnabled: tenantAdminProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const organizationEnabled = await setOrganizationMcpEnabled(
        ctx.db,
        ctx.organizationId,
        input.enabled,
      )
      return getMcpAccessStatus(ctx.db, ctx.organizationId).then((status) => ({
        ...status,
        organizationEnabled,
      }))
    }),

  listApiKeys: tenantAdminProcedure.input(paginationInput.optional()).query(async ({ ctx, input }) =>
    listApiKeys(ctx.db, ctx.organizationId, input ?? {}),
  ),

  createApiKey: tenantAdminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(80),
        scopes: z.array(z.enum([OPENSHOP_READ_SCOPE, OPENSHOP_WRITE_PENDING_SCOPE])).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await createApiKey(ctx.db, {
          organizationId: ctx.organizationId,
          userId: ctx.user.id,
          name: input.name,
          scopes: input.scopes,
        })
      } catch (error) {
        wrapError(error)
      }
    }),

  disableApiKey: tenantAdminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        await disableApiKey(ctx.db, ctx.organizationId, input.id)
        return { ok: true as const }
      } catch (error) {
        wrapError(error)
      }
    }),

  listClients: tenantAdminProcedure.input(paginationInput.optional()).query(async ({ ctx, input }) =>
    listOAuthClients(ctx.db, ctx.organizationId, input ?? {}),
  ),

  createClient: tenantAdminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(80),
        redirectUris: z.array(z.string().min(1)).min(1),
        confidential: z.boolean(),
        applicationType: z.enum(['web', 'native']).default('native'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const created = await auth.api.adminCreateOAuthClient({
          headers: ctx.headers,
          body: {
            client_name: input.name.trim(),
            redirect_uris: input.redirectUris.map((uri) => uri.trim()).filter(Boolean),
            token_endpoint_auth_method: input.confidential ? 'client_secret_basic' : 'none',
            application_type: input.applicationType,
            require_pkce: true,
            scope: [OPENSHOP_READ_SCOPE, OPENSHOP_WRITE_PENDING_SCOPE, 'openid', 'profile', 'email', 'offline_access'].join(' '),
          },
        })
        const clientId =
          (created as { client_id?: string; clientId?: string }).client_id ??
          (created as { clientId?: string }).clientId
        if (!clientId) throw new Error('创建客户端未返回 client_id')
        await bindOAuthClientToOrganization(ctx.db, {
          clientId,
          organizationId: ctx.organizationId,
        })
        return {
          clientId,
          clientSecret: (created as { client_secret?: string }).client_secret ?? null,
        }
      } catch (error) {
        wrapError(error)
      }
    }),

  disableClient: tenantAdminProcedure
    .input(z.object({ clientId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        await disableOAuthClient(ctx.db, ctx.organizationId, input.clientId)
        return { ok: true as const }
      } catch (error) {
        wrapError(error)
      }
    }),
})
