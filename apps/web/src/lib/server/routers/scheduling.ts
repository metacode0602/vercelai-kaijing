/**
 * §2.3 调度管理 tRPC Router
 * 运营平台侧（apps/web）的调度规则管理接口
 */

import { z } from "zod"
import { createTRPCRouter, protectedProcedure } from "./trpc"
import {
  listRules,
  getRuleById,
  createRule,
  updateRule,
  deleteRule,
  listRuleChangeLogs,
  listSnapshots,
  getPoolCapacitySummary,
  refreshAllSnapshots,
} from "@/lib/server/dataaccess/scheduling"

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const ruleActionSchema = z.object({
  type: z.enum(["route-to-od", "route-to-stable", "route-to-ai"]),
  priorityClass: z.enum(["od-high", "od-normal", "od-low"]),
  weight: z.number().int().min(0).max(100),
  preemptionPenalty: z.number().int().min(0).max(100),
})

const ruleCreateSchema = z.object({
  name: z.string().min(1).max(128),
  priority: z.number().int().min(0).max(9999),
  enabled: z.boolean().default(true),
  tenantTier: z.array(z.string()).nullable().optional(),
  productLine: z.array(z.string()).nullable().optional(),
  billingMode: z.array(z.string()).nullable().optional(),
  taskCategory: z.array(z.string()).nullable().optional(),
  matchExtra: z.record(z.string(), z.unknown()).optional(),
  action: ruleActionSchema,
  scope: z.enum(["global", "tenant", "region"]).default("global"),
  scopeId: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
})

const ruleUpdateSchema = ruleCreateSchema.partial().extend({ id: z.string() })

const ruleListSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  enabled: z.boolean().nullable().optional(),
})

const snapshotListSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  pool: z.string().nullable().optional(),
  dataCenterId: z.string().nullable().optional(),
  gpuCardTypeId: z.string().nullable().optional(),
})

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const schedulingRouter = createTRPCRouter({
  // ===== 规则管理 =====

  ruleList: protectedProcedure.input(ruleListSchema).query(async ({ input }) => {
    return listRules(input)
  }),

  ruleGetById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return getRuleById(input.id)
    }),

  ruleCreate: protectedProcedure
    .input(ruleCreateSchema)
    .mutation(async ({ input, ctx }) => {
      return createRule({
        ...input,
        createdBy: ctx.user?.id ?? "system",
      })
    }),

  ruleUpdate: protectedProcedure
    .input(ruleUpdateSchema)
    .mutation(async ({ input, ctx }) => {
      const { id, ...rest } = input
      return updateRule({
        id,
        ...rest,
        createdBy: ctx.user?.id ?? "system",
      })
    }),

  ruleDelete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      return deleteRule(input.id, ctx.user?.id ?? "system")
    }),

  ruleChangeLogs: protectedProcedure
    .input(z.object({ ruleId: z.string(), limit: z.number().int().min(1).max(100).default(50) }))
    .query(async ({ input }) => {
      return listRuleChangeLogs(input.ruleId, input.limit)
    }),

  // ===== 设备快照（运营看板）=====

  snapshotList: protectedProcedure
    .input(snapshotListSchema)
    .query(async ({ input }) => {
      return listSnapshots(input)
    }),

  snapshotRefreshAll: protectedProcedure.mutation(async () => {
    await refreshAllSnapshots()
    return { success: true }
  }),

  snapshotPoolSummary: protectedProcedure.query(async () => {
    return getPoolCapacitySummary()
  }),
})
