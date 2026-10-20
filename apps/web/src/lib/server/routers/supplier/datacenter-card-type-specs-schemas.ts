import { z } from 'zod'

export const datacenterCardTypeSpecGetSchema = z.object({
  dataCenterId: z.string().min(1),
  gpuCardTypeId: z.string().min(1),
})

export const datacenterCardTypeSpecUpsertSchema = z.object({
  dataCenterId: z.string().min(1),
  gpuCardTypeId: z.string().min(1),
  deviceSpec: z.string().max(8000).nullish(),
  remark: z.string().max(2000).nullish(),
})
