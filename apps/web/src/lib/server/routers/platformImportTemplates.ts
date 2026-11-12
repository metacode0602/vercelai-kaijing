import { z } from 'zod'
import {
  createPlatformImportTemplate,
  deletePlatformImportTemplate,
  ensurePlatformImportTemplateDefaults,
  listPlatformImportTemplates,
  updatePlatformImportTemplate,
} from '@/lib/server/dataaccess/platform-import-templates'
import { createTRPCRouter, protectedProcedure } from './trpc'

const templateInput = z.object({
  kind: z.string().trim().min(1).max(64),
  version: z.string().trim().min(1).max(32).optional(),
  fields: z.string().max(2000).optional(),
  duplicateStrategy: z.string().max(200).optional(),
  rollbackStrategy: z.string().max(200).optional(),
  note: z.string().max(500).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
})

export const platformImportTemplatesRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
        status: z.enum(['active', 'inactive']).optional(),
        q: z.string().max(120).optional(),
      }),
    )
    .query(({ input }) => listPlatformImportTemplates(input)),

  create: protectedProcedure.input(templateInput).mutation(({ input }) => createPlatformImportTemplate(input)),

  update: protectedProcedure
    .input(templateInput.extend({ id: z.string().trim().min(1) }))
    .mutation(({ input }) => updatePlatformImportTemplate(input)),

  remove: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ input }) => deletePlatformImportTemplate(input.id)),

  ensureDefaults: protectedProcedure.mutation(() => ensurePlatformImportTemplateDefaults()),
})
