import { z } from "zod"
import { createTRPCRouter, publicProcedure } from "../trpc"
import { listBaseImages } from "@/lib/server/dataaccess/image/base-image"

export const baseImageRouter = createTRPCRouter({
  list: publicProcedure
    .input(z.object({
      category: z.string().optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return listBaseImages(input)
    }),
})
