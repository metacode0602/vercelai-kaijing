import { z } from 'zod'
import {
  createPlatformCarrier,
  deletePlatformCarrier,
  ensurePlatformCarrierDefaults,
  listPlatformCarriers,
  updatePlatformCarrier,
} from '@/lib/server/dataaccess/platform-carriers'
import { createTRPCRouter, protectedProcedure } from './trpc'

const carrierInput = z.object({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  type: z.enum(['platform', 'express', 'ocean', 'last_mile']).optional(),
  coverage: z.string().max(200).optional(),
  note: z.string().max(500).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
})

export const platformCarriersRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
        status: z.enum(['active', 'inactive']).optional(),
        q: z.string().max(120).optional(),
      }),
    )
    .query(({ input }) => listPlatformCarriers(input)),

  create: protectedProcedure.input(carrierInput).mutation(({ input }) => createPlatformCarrier(input)),

  update: protectedProcedure
    .input(carrierInput.extend({ id: z.string().trim().min(1) }))
    .mutation(({ input }) => updatePlatformCarrier(input)),

  remove: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ input }) => deletePlatformCarrier(input.id)),

  ensureDefaults: protectedProcedure.mutation(() => ensurePlatformCarrierDefaults()),
})
