import { z } from 'zod'
import {
  createPlatformFeeRule,
  createPlatformFeeTemplate,
  createPlatformFeeVersion,
  deletePlatformFeeRule,
  deletePlatformFeeTemplate,
  deletePlatformFeeVersion,
  listPlatformFeeRules,
  listPlatformFeeTemplates,
  listPlatformFeeVersions,
  updatePlatformFeeRule,
  updatePlatformFeeTemplate,
  updatePlatformFeeVersion,
} from '@/lib/server/dataaccess/platform-fee-templates'
import { createTRPCRouter, protectedProcedure } from './trpc'

const headerInput = z.object({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  platform: z.string().trim().min(1).max(32),
  country: z.string().trim().min(2).max(8),
  fulfillmentPool: z.string().max(64).optional(),
  fulfillmentLogistics: z.string().max(32).optional(),
  type: z.enum(['import_tax', 'platform_fee', 'ocean_freight']),
  status: z.enum(['active', 'inactive']).optional(),
  note: z.string().max(500).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
})

const componentSchema = z.object({
  code: z.string().trim().min(1).max(64),
  labelZh: z.string().trim().min(1).max(120),
  rate: z.number().nullable().optional(),
  unit: z.enum(['pct', 'usd', 'amount', 'lkr', 'per_kg', 'per_unit']).optional(),
  baseHint: z.string().max(200).optional(),
  note: z.string().max(200).optional(),
  currency: z.string().max(8).optional(),
})

const versionInput = z.object({
  effectiveFrom: z.string().trim().min(1),
  effectiveTo: z.string().trim().optional(),
  priority: z.number().int().min(0).max(9999).optional(),
  formulaProfile: z.string().max(64).optional(),
  components: z.array(componentSchema).max(200).optional(),
  note: z.string().max(500).optional(),
  status: z.enum(['active', 'inactive']).optional(),
})

const ruleInput = z.object({
  categoryCode: z.string().max(64).optional(),
  hsCodePattern: z.string().max(32).optional(),
  priority: z.number().int().min(0).max(9999).optional(),
  note: z.string().max(500).optional(),
})

export const platformFeeTemplatesRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
        status: z.enum(['active', 'inactive']).optional(),
        type: z.enum(['import_tax', 'platform_fee', 'ocean_freight']).optional(),
        q: z.string().max(120).optional(),
      }),
    )
    .query(({ input }) => listPlatformFeeTemplates(input)),

  create: protectedProcedure.input(headerInput).mutation(({ input }) => createPlatformFeeTemplate(input)),

  update: protectedProcedure
    .input(headerInput.extend({ id: z.string().trim().min(1) }))
    .mutation(({ input }) => updatePlatformFeeTemplate(input)),

  remove: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ input }) => deletePlatformFeeTemplate(input.id)),

  listVersions: protectedProcedure
    .input(z.object({ templateId: z.string().min(1) }))
    .query(({ input }) => listPlatformFeeVersions(input.templateId)),

  createVersion: protectedProcedure
    .input(versionInput.extend({ templateId: z.string().min(1) }))
    .mutation(({ input }) => createPlatformFeeVersion(input)),

  updateVersion: protectedProcedure
    .input(versionInput.extend({ id: z.string().min(1) }))
    .mutation(({ input }) => updatePlatformFeeVersion(input)),

  removeVersion: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ input }) => deletePlatformFeeVersion(input.id)),

  listRules: protectedProcedure
    .input(z.object({ templateId: z.string().min(1) }))
    .query(({ input }) => listPlatformFeeRules(input.templateId)),

  createRule: protectedProcedure
    .input(ruleInput.extend({ templateId: z.string().min(1) }))
    .mutation(({ input }) => createPlatformFeeRule(input)),

  updateRule: protectedProcedure
    .input(ruleInput.extend({ id: z.string().min(1) }))
    .mutation(({ input }) => updatePlatformFeeRule(input)),

  removeRule: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ input }) => deletePlatformFeeRule(input.id)),
})
