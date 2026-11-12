import { z } from 'zod'
import {
  createPlatformHsTariff,
  deletePlatformHsTariff,
  listPlatformHsTariffs,
  setPlatformHsTariffStatus,
  updatePlatformHsTariff,
} from '@/lib/server/dataaccess/platform-hs-tariffs'
import { createTRPCRouter, protectedProcedure } from './trpc'

const tariffInput = z.object({
  countryCode: z.string().trim().min(2).max(2),
  code: z.string().trim().max(20).optional(),
  description: z.string().max(500).optional(),
  hsCode: z.string().trim().min(1).max(20),
  effectiveFrom: z.string().trim().min(1),
  effectiveTo: z.string().trim().optional(),
  currency: z.string().trim().max(3).optional(),
  formulaProfile: z.string().trim().max(64).optional(),
  components: z.record(z.string(), z.unknown()).optional(),
  gdRate: z.number().nullable().optional(),
  surchargeRate: z.number().nullable().optional(),
  palRate: z.number().nullable().optional(),
  cessRate: z.number().nullable().optional(),
  exciseRate: z.number().nullable().optional(),
  vatRate: z.number().nullable().optional(),
  ssclRate: z.number().nullable().optional(),
  gdSpecificAmount: z.number().nullable().optional(),
  gdSpecificUnit: z.string().optional(),
  gdSpecificRule: z.string().optional(),
  cessSpecificAmount: z.number().nullable().optional(),
  cessSpecificUnit: z.string().optional(),
  isExact: z.boolean().optional(),
  notes: z.string().max(500).optional(),
})

export const platformHsTariffsRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
        status: z.enum(['draft', 'active', 'archived']).optional(),
        countryCode: z.string().max(2).optional(),
        q: z.string().max(120).optional(),
      }),
    )
    .query(({ input }) => listPlatformHsTariffs(input)),

  create: protectedProcedure.input(tariffInput).mutation(({ input }) => createPlatformHsTariff(input)),

  update: protectedProcedure
    .input(tariffInput.extend({ id: z.string().trim().min(1) }))
    .mutation(({ input }) => updatePlatformHsTariff(input)),

  setStatus: protectedProcedure
    .input(z.object({ id: z.string().min(1), status: z.enum(['draft', 'active', 'archived']) }))
    .mutation(({ input }) => setPlatformHsTariffStatus(input)),

  remove: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ input }) => deletePlatformHsTariff(input.id)),
})
