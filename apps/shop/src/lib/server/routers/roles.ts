import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import {
  PERMISSION_ACTION_LABELS,
  PERMISSION_ACTIONS,
  PERMISSION_MODULE_LABELS,
  PERMISSION_MODULES,
  SCOPE_TYPE_LABELS,
  SCOPE_TYPES,
  SYSTEM_ROLE_DEFS,
} from '@workspace/auth'
import { createTRPCRouter, requirePermission, tenantAccessProcedure } from '@/lib/server/trpc'
import * as rolesDa from '@/lib/server/dataaccess/roles'

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    if (error instanceof TRPCError) throw error
    const message = error instanceof Error ? error.message : '操作失败'
    const forbidden = /无权|不能授予|不能停用|不能移除|不可通过邀请/.test(message)
    throw new TRPCError({
      code: forbidden ? 'FORBIDDEN' : /不存在|无效|过期/.test(message) ? 'NOT_FOUND' : 'BAD_REQUEST',
      message,
    })
  })
}

function actorOf(ctx: { user?: { id?: string; name?: string | null; email?: string | null } | null }) {
  return {
    userId: ctx.user?.id ?? null,
    label: ctx.user?.name || ctx.user?.email || ctx.user?.id || 'console',
  }
}

const readProcedure = requirePermission('settings.read')
const configureProcedure = requirePermission('settings.configure')

export const rolesRouter = createTRPCRouter({
  myAccess: tenantAccessProcedure.query(({ ctx }) => ({
    isOwner: ctx.access.isOwner,
    permissions: ctx.access.permissions,
    roleCodes: ctx.access.roleCodes,
    scopes: ctx.access.scopes,
  })),

  catalog: tenantAccessProcedure.query(() => ({
    modules: PERMISSION_MODULES.map((module) => ({
      code: module,
      name: PERMISSION_MODULE_LABELS[module],
    })),
    actions: PERMISSION_ACTIONS.map((action) => ({
      code: action,
      name: PERMISSION_ACTION_LABELS[action],
    })),
    scopeTypes: SCOPE_TYPES.map((type) => ({
      code: type,
      name: SCOPE_TYPE_LABELS[type],
    })),
    systemRoles: SYSTEM_ROLE_DEFS,
  })),

  list: readProcedure.query(async ({ ctx }) =>
    wrap(() => rolesDa.listRoles(ctx.db, ctx.organizationId)),
  ),

  get: readProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => wrap(() => rolesDa.getRole(ctx.db, ctx.organizationId, input.id))),

  meta: readProcedure.query(async ({ ctx }) => {
    const targets = await rolesDa.listScopeTargets(ctx.db, ctx.organizationId)
    const assignableMembers = await rolesDa.listAssignableMembers(ctx.db, ctx.organizationId)
    return { ...targets, assignableMembers }
  }),

  create: configureProcedure
    .input(
      z.object({
        name: z.string().min(1),
        code: z.string().optional(),
        description: z.string().optional(),
        permissions: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => rolesDa.createRole(ctx.db, ctx.organizationId, ctx.access, input, actorOf(ctx))),
    ),

  update: configureProcedure
    .input(
      z.object({
        id: z.string().min(1),
        name: z.string().optional(),
        code: z.string().optional(),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => rolesDa.updateRoleInfo(ctx.db, ctx.organizationId, ctx.access, input, actorOf(ctx))),
    ),

  copy: configureProcedure
    .input(z.object({ id: z.string().min(1), name: z.string().optional(), code: z.string().optional() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() => rolesDa.copyRole(ctx.db, ctx.organizationId, ctx.access, input, actorOf(ctx))),
    ),

  setStatus: configureProcedure
    .input(z.object({ id: z.string().min(1), status: z.enum(['enabled', 'disabled']) }))
    .mutation(async ({ ctx, input }) =>
      wrap(() => rolesDa.setRoleStatus(ctx.db, ctx.organizationId, ctx.access, input, actorOf(ctx))),
    ),

  savePermissions: configureProcedure
    .input(z.object({ id: z.string().min(1), permissions: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        rolesDa.saveRolePermissions(ctx.db, ctx.organizationId, ctx.access, input, actorOf(ctx)),
      ),
    ),

  addScope: configureProcedure
    .input(
      z.object({
        roleId: z.string().min(1),
        scopeType: z.string().min(1),
        scopeRefId: z.string().optional().nullable(),
        actions: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => rolesDa.addRoleScope(ctx.db, ctx.organizationId, input, actorOf(ctx))),
    ),

  removeScope: configureProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      wrap(() => rolesDa.removeRoleScope(ctx.db, ctx.organizationId, input, actorOf(ctx))),
    ),

  bindMembers: configureProcedure
    .input(z.object({ roleId: z.string().min(1), userIds: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) =>
      wrap(() => rolesDa.bindMembersToRole(ctx.db, ctx.organizationId, ctx.access, input, actorOf(ctx))),
    ),

  unbindMembers: configureProcedure
    .input(z.object({ roleId: z.string().min(1), userIds: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        rolesDa.unbindMembersFromRole(ctx.db, ctx.organizationId, ctx.access, input, actorOf(ctx)),
      ),
    ),
})
