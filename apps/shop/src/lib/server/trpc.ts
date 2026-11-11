import { initTRPC, TRPCError } from '@trpc/server'
import { forbiddenPermissionMessage, isOwnerIdentity } from '@workspace/auth'
import type { AccessSnapshot } from '@/lib/server/dataaccess/roles'
import { loadAccessSnapshot, ownerAccess } from '@/lib/server/dataaccess/roles'
import { toUserFacingTrpcError } from '@/lib/server/errors/user-facing-trpc-error'
import { transformer } from './routers/transformer'
import type { TRPCContext } from './context'

const t = initTRPC.context<TRPCContext>().create({
  transformer,
})

const mapUserFacingErrors = t.middleware(async ({ next }) => {
  try {
    return await next()
  } catch (error) {
    throw toUserFacingTrpcError(error)
  }
})

const procedure = t.procedure.use(mapUserFacingErrors)

export const router = t.router
export const createTRPCRouter = t.router
export const publicProcedure = procedure

function toTrpcError(error: unknown): TRPCError {
  return toUserFacingTrpcError(error)
}

/** 仅要求登录，不要求组织；用于入驻向导的 start/getState。 */
export const userProcedure = procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: '请先登录' })
  }
  return next({ ctx: { ...ctx, user: ctx.user } })
})

const requireOrg = t.middleware(({ ctx, next }) => {
  if (!ctx.organizationId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message:
        '缺少组织上下文。请登录并选择组织，或在本地设置 SHOP_DEV_ORGANIZATION_ID 后执行 seed。',
    })
  }
  return next({
    ctx: {
      ...ctx,
      organizationId: ctx.organizationId,
    },
  })
})

/**
 * 租户业务过程：要求 organizationId。
 * 开发态可用 SHOP_DEV_ORGANIZATION_ID 无登录读写；生产应配合登录会话。
 */
export const tenantProcedure = procedure.use(requireOrg)

async function resolveAccess(ctx: TRPCContext): Promise<AccessSnapshot> {
  if (!ctx.organizationId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: '请先完成入驻' })
  }
  if (!ctx.user) {
    if (process.env.SHOP_DEV_ORGANIZATION_ID?.trim()) {
      return ownerAccess(ctx.organizationId, null)
    }
    throw new TRPCError({ code: 'UNAUTHORIZED', message: '请先登录' })
  }
  try {
    return await loadAccessSnapshot(ctx.db, ctx.organizationId, {
      userId: ctx.user.id,
      organizationRole: ctx.organizationRole,
    })
  } catch (error) {
    throw toTrpcError(error)
  }
}

/** 要求组织成员并加载权限快照（侧栏、只读自身权限）。 */
export const tenantAccessProcedure = procedure.use(requireOrg).use(async ({ ctx, next }) => {
  const access = await resolveAccess(ctx)
  return next({
    ctx: {
      ...ctx,
      organizationId: ctx.organizationId,
      access,
    },
  })
})

/** 校验 module.action；owner 隐式通过。越权返回中文 FORBIDDEN。 */
export function requirePermission(permission: string) {
  return procedure.use(requireOrg).use(async ({ ctx, next }) => {
    const access = await resolveAccess(ctx)
    const allowed =
      access.isOwner ||
      access.permissionSet.has(permission)
    if (!allowed) {
      throw new TRPCError({ code: 'FORBIDDEN', message: forbiddenPermissionMessage(permission) })
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
        organizationId: ctx.organizationId,
        organizationRole: ctx.organizationRole,
        access,
      },
    })
  })
}

/** 租户写操作：owner 或具备 settings.configure。不再识别 tenant_owner/tenant_engineer 字符串。 */
export const tenantAdminProcedure = procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: '请先登录' })
  }
  if (!ctx.organizationId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: '请先完成入驻' })
  }
  const access = await resolveAccess(ctx)
  if (!access.isOwner && !access.permissionSet.has('settings.configure')) {
    throw new TRPCError({ code: 'FORBIDDEN', message: forbiddenPermissionMessage('settings.configure') })
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      organizationId: ctx.organizationId,
      organizationRole: ctx.organizationRole,
      access,
    },
  })
})

/** 入驻提交等仅组织所有者可执行的操作。兼容入驻写入的 tenant_owner。 */
export const tenantOwnerProcedure = procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: '请先登录' })
  }
  if (!ctx.organizationId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: '请先完成入驻' })
  }
  if (!isOwnerIdentity(ctx.organizationRole)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: '仅组织所有者可执行该操作' })
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      organizationId: ctx.organizationId,
      organizationRole: ctx.organizationRole,
    },
  })
})

export const protectedProcedure = procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: '请先登录' })
  }
  if (!ctx.organizationId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: '缺少组织上下文。请选择组织或设置 SHOP_DEV_ORGANIZATION_ID。',
    })
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      organizationId: ctx.organizationId,
    },
  })
})
