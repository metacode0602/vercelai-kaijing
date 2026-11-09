import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as auditDa from '@/lib/server/dataaccess/audit'

export const auditRouter = createTRPCRouter({
  list: tenantProcedure
    .input(z.object({ page: z.number().optional(), pageSize: z.number().optional(), q: z.string().optional() }))
    .query(async ({ ctx, input }) => auditDa.listAuditEvents(ctx.db, ctx.organizationId, input)),
})
