import { z } from "zod"
import { createTRPCRouter, publicProcedure } from "../trpc"
import { listApplicationTemplates, getApplicationTemplateDetail } from "@/lib/server/dataaccess/compute/application-template"

export const applicationTemplateRouter = createTRPCRouter({
  list: publicProcedure
    .input(z.object({
      category: z.string().optional(),
      search: z.string().optional(),
      deployType: z.string().optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }).optional())
    .query(async ({ input }) => {
      return listApplicationTemplates(input)
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return getApplicationTemplateDetail(input.id)
    }),
})
