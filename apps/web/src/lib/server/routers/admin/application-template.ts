import { z } from 'zod'
import { createTRPCRouter, adminProcedure } from '../trpc'
import { applicationTemplateDataAccess } from '@/lib/server/dataaccess/admin/application-template'

export const applicationTemplateRouter = createTRPCRouter({
  list: adminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        category: z.string().optional(),
        deployType: z.string().optional(),
        tier: z.string().optional(),
        reviewStatus: z.string().optional(),
        status: z.string().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input }) => {
      return applicationTemplateDataAccess.list(input)
    }),

  getById: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return applicationTemplateDataAccess.getById(input.id)
    }),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        category: z.string().min(1).max(64),
        imageRef: z.string().min(1).max(512),
        description: z.string().max(1000).optional(),
        tags: z.array(z.string()).optional(),
        iconUrl: z.string().optional(),
        sourceType: z.string().optional(),
        minGPU: z.string().optional(),
        minGPUCount: z.number().int().optional(),
        minMemoryGB: z.number().int().optional(),
        minDiskGB: z.number().int().optional(),
        defaultPort: z.number().int().optional(),
        defaultCommand: z.string().optional(),
        defaultEnvVars: z.record(z.string(), z.string()).optional(),
        healthCheckPath: z.string().optional(),
        docsUrl: z.string().optional(),
        sourceUrl: z.string().optional(),
        deployType: z.string().optional(),
        isFeatured: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
        tier: z.string().optional(),
        status: z.string().optional(),
        createdBy: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return applicationTemplateDataAccess.create(input)
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(255).optional(),
        category: z.string().max(64).optional(),
        imageRef: z.string().min(1).max(512).optional(),
        description: z.string().max(1000).optional(),
        tags: z.array(z.string()).optional(),
        iconUrl: z.string().optional(),
        sourceType: z.string().optional(),
        minGPU: z.string().optional(),
        minGPUCount: z.number().int().optional(),
        minMemoryGB: z.number().int().optional(),
        minDiskGB: z.number().int().optional(),
        defaultPort: z.number().int().optional(),
        defaultCommand: z.string().optional(),
        defaultEnvVars: z.record(z.string(), z.string()).optional(),
        healthCheckPath: z.string().optional(),
        docsUrl: z.string().optional(),
        sourceUrl: z.string().optional(),
        deployType: z.string().optional(),
        isFeatured: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
        tier: z.string().optional(),
        status: z.string().optional(),
        createdBy: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input
      return applicationTemplateDataAccess.update(id, data)
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      return applicationTemplateDataAccess.delete(input.id)
    }),

  review: adminProcedure
    .input(
      z.object({
        id: z.string(),
        reviewStatus: z.enum(['approved', 'rejected']),
        reviewedBy: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input
      return applicationTemplateDataAccess.review(id, data)
    }),

  listCategories: adminProcedure.query(async () => {
    return applicationTemplateDataAccess.listCategories()
  }),
})
