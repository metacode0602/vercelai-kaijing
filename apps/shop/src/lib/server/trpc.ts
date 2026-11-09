import { initTRPC, TRPCError } from '@trpc/server'
import { transformer } from './routers/transformer'
import type { TRPCContext } from './context'

const t = initTRPC.context<TRPCContext>().create({
  transformer,
})

export const router = t.router
export const createTRPCRouter = t.router
export const publicProcedure = t.procedure

/** 仅要求登录，不要求组织；用于入驻向导的 start/getState。 */
export const userProcedure = t.procedure.use(({ ctx, next }) => {
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
export const tenantProcedure = t.procedure.use(requireOrg)

/** 租户写操作：必须登录 + 属于租户组织 + owner/engineer 角色。 */
export const tenantAdminProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: '请先登录' })
  }
  if (!ctx.organizationId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: '请先完成入驻' })
  }
  if (
    ctx.organizationRole !== 'tenant_owner' &&
    ctx.organizationRole !== 'tenant_engineer'
  ) {
    throw new TRPCError({ code: 'FORBIDDEN', message: '当前角色无权执行该操作' })
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

/** 入驻提交等仅 owner 可执行的操作。 */
export const tenantOwnerProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: '请先登录' })
  }
  if (!ctx.organizationId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: '请先完成入驻' })
  }
  if (ctx.organizationRole !== 'tenant_owner') {
    throw new TRPCError({ code: 'FORBIDDEN', message: '仅租户所有者可执行该操作' })
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

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
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
