import { z } from 'zod'
import { createTRPCRouter, adminProcedure } from '../trpc'
import { baseImageVersionDataAccess } from '@/lib/server/dataaccess/admin/base-image-version'

export const baseImageVersionRouter = createTRPCRouter({
  listByBaseImage: adminProcedure
    .input(z.object({ baseImageId: z.string() }))
    .query(async ({ input }) => {
      return baseImageVersionDataAccess.listByBaseImage(input.baseImageId)
    }),

  getById: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return baseImageVersionDataAccess.getById(input.id)
    }),

  create: adminProcedure
    .input(
      z.object({
        baseImageId: z.string().min(1),
        versionTag: z.string().min(1).max(128),
        displayLabel: z.string().min(1).max(255),
        fullImageRef: z.string().min(1).max(512),
        cudaVersion: z.string().optional(),
        osVersion: z.string().optional(),
        pythonVersion: z.string().optional(),
        sizeBytes: z.number().int().optional(),
        digestSha256: z.string().optional(),
        requiresGPU: z.boolean().optional(),
        minGpuMemory: z.number().int().optional(),
        isLatest: z.boolean().optional(),
        releaseDate: z.string().optional(),
        deprecationDate: z.string().optional(),
        deprecationMessage: z.string().optional(),
        status: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return baseImageVersionDataAccess.create(input)
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        versionTag: z.string().min(1).max(128).optional(),
        displayLabel: z.string().min(1).max(255).optional(),
        fullImageRef: z.string().min(1).max(512).optional(),
        cudaVersion: z.string().optional(),
        osVersion: z.string().optional(),
        pythonVersion: z.string().optional(),
        sizeBytes: z.number().int().optional(),
        digestSha256: z.string().optional(),
        requiresGPU: z.boolean().optional(),
        minGpuMemory: z.number().int().optional(),
        isLatest: z.boolean().optional(),
        releaseDate: z.string().optional(),
        deprecationDate: z.string().optional(),
        deprecationMessage: z.string().optional(),
        status: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input
      return baseImageVersionDataAccess.update(id, data)
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      return baseImageVersionDataAccess.delete(input.id)
    }),
})
