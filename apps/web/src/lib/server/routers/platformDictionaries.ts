import { z } from 'zod'
import {
  createPlatformDictionary,
  deletePlatformDictionary,
  ensurePlatformDictionaryDefaults,
  listPlatformDictionaries,
  updatePlatformDictionary,
} from '@/lib/server/dataaccess/platform-dictionaries'
import { createTRPCRouter, protectedProcedure } from './trpc'

const dictionaryInput = z.object({
  key: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(120),
  description: z.string().max(500).optional(),
  values: z.array(z.string().trim().min(1).max(80)).max(200).optional(),
  valueTitles: z.record(z.string(), z.string()).optional(),
  inactiveValues: z.array(z.string().trim().min(1).max(80)).max(200).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
})

export const platformDictionariesRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
        status: z.enum(['active', 'inactive']).optional(),
        q: z.string().max(120).optional(),
      }),
    )
    .query(({ input }) => listPlatformDictionaries(input)),

  create: protectedProcedure.input(dictionaryInput).mutation(({ input }) => createPlatformDictionary(input)),

  update: protectedProcedure
    .input(dictionaryInput.extend({ id: z.string().trim().min(1) }))
    .mutation(({ input }) => updatePlatformDictionary(input)),

  remove: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ input }) => deletePlatformDictionary(input.id)),

  ensureDefaults: protectedProcedure.mutation(() => ensurePlatformDictionaryDefaults()),
})
