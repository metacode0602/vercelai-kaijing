import { TRPCError } from '@trpc/server'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as organizationDa from '@/lib/server/dataaccess/organization'

/** 设置 · 企业信息（只读）。 */
export const organizationRouter = createTRPCRouter({
  get: tenantProcedure.query(async ({ ctx }) => {
    const profile = await organizationDa.getOrganizationProfile(ctx.db, ctx.organizationId)
    if (!profile) {
      throw new TRPCError({ code: 'NOT_FOUND', message: '当前组织不存在或已被删除' })
    }
    return profile
  }),
})
