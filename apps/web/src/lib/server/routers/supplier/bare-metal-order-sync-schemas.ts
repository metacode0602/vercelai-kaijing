import { z } from 'zod'

export const bareMetalSyncFailedItemsListSchema = z.object({
  jobRunId: z.string().optional(),
  resolved: z.enum(['open', 'all']).optional().default('open'),
  errorCodes: z.array(z.string()).optional(),
  search: z.string().optional(),
  page: z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(20),
})

export const bareMetalSyncFailedItemIdSchema = z.object({
  itemId: z.string().min(1),
})

export const bareMetalSyncJobRunIdSchema = z.object({
  jobRunId: z.string().min(1),
})
