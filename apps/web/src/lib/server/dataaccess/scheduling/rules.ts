/**
 * §2.3.1 调度规则 CRUD 数据访问层
 */

import { db } from "@/lib/db"
import {
  resourceSchedulingRule,
  schedulingRuleChangeLog,
} from "@workspace/db/schema"
import { and, desc, eq, sql } from "drizzle-orm"
import { detectRuleConflict } from "./engine"

// ---------------------------------------------------------------------------
// 查询
// ---------------------------------------------------------------------------

export interface ListRulesParams {
  page: number
  pageSize: number
  enabled?: boolean | null
}

export async function listRules(params: ListRulesParams) {
  const page = Math.max(1, params.page)
  const pageSize = Math.min(100, Math.max(1, params.pageSize))

  const conditions: any[] = []
  if (params.enabled !== null && params.enabled !== undefined) {
    conditions.push(eq(resourceSchedulingRule.enabled, params.enabled))
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined

  const [totalRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(resourceSchedulingRule)
    .where(where)

  const total = Number(totalRow?.total ?? 0)
  const offset = (page - 1) * pageSize

  const rows = await db
    .select()
    .from(resourceSchedulingRule)
    .where(where)
    .orderBy(desc(resourceSchedulingRule.priority), desc(resourceSchedulingRule.createdAt))
    .limit(pageSize)
    .offset(offset)

  return { items: rows, total, page, pageSize }
}

export async function getRuleById(id: string) {
  const rows = await db
    .select()
    .from(resourceSchedulingRule)
    .where(eq(resourceSchedulingRule.id, id))
    .limit(1)
  return rows[0] ?? null
}

// ---------------------------------------------------------------------------
// 创建
// ---------------------------------------------------------------------------

export interface CreateRuleInput {
  name: string
  priority: number
  enabled?: boolean
  tenantTier?: string[] | null
  productLine?: string[] | null
  billingMode?: string[] | null
  taskCategory?: string[] | null
  matchExtra?: Record<string, unknown>
  action: Record<string, unknown>
  scope?: string
  scopeId?: string | null
  description?: string | null
  createdBy?: string | null
}

export async function createRule(input: CreateRuleInput) {
  // §B.3.1 冲突检测
  const conflict = await detectRuleConflict({
    tenantTier: input.tenantTier ?? null,
    productLine: input.productLine ?? null,
    billingMode: input.billingMode ?? null,
    taskCategory: input.taskCategory ?? null,
    scope: input.scope ?? "global",
    scopeId: input.scopeId ?? null,
  })

  if (conflict.conflict) {
    throw new Error(
      `规则冲突：${conflict.reason}，冲突规则 ID: ${conflict.conflictingRuleIds.join(", ")}`,
    )
  }

  const [created] = await db
    .insert(resourceSchedulingRule)
    .values({
      name: input.name,
      priority: input.priority,
      enabled: input.enabled ?? true,
      tenantTier: input.tenantTier ?? null,
      productLine: input.productLine ?? null,
      billingMode: input.billingMode ?? null,
      taskCategory: input.taskCategory ?? null,
      matchExtra: input.matchExtra ?? {},
      action: input.action,
      scope: input.scope ?? "global",
      scopeId: input.scopeId ?? null,
      description: input.description ?? null,
      createdBy: input.createdBy ?? null,
    })
    .returning()

  if (!created) throw new Error("规则创建失败")

  // 审计日志
  await db.insert(schedulingRuleChangeLog).values({
    ruleId: created.id,
    changedBy: input.createdBy ?? "system",
    changeType: "create",
    newValue: created as any,
  })

  return created
}

// ---------------------------------------------------------------------------
// 更新
// ---------------------------------------------------------------------------

export interface UpdateRuleInput extends Partial<CreateRuleInput> {
  id: string
}

export async function updateRule(input: UpdateRuleInput) {
  const existing = await getRuleById(input.id)
  if (!existing) throw new Error("规则不存在")

  // 冲突检测（排除自身）
  if (input.tenantTier !== undefined || input.productLine !== undefined) {
    const conflict = await detectRuleConflict({
      id: input.id,
      tenantTier: (input.tenantTier ?? existing.tenantTier) as string[] | null,
      productLine: (input.productLine ?? existing.productLine) as string[] | null,
      billingMode: (input.billingMode ?? existing.billingMode) as string[] | null,
      taskCategory: (input.taskCategory ?? existing.taskCategory) as string[] | null,
      scope: input.scope ?? (existing.scope as string),
      scopeId: input.scopeId ?? (existing.scopeId as string | null),
    })

    if (conflict.conflict) {
      throw new Error(
        `规则冲突：${conflict.reason}，冲突规则 ID: ${conflict.conflictingRuleIds.join(", ")}`,
      )
    }
  }

  const [updated] = await db
    .update(resourceSchedulingRule)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.priority !== undefined && { priority: input.priority }),
      ...(input.enabled !== undefined && { enabled: input.enabled }),
      ...(input.tenantTier !== undefined && { tenantTier: input.tenantTier }),
      ...(input.productLine !== undefined && { productLine: input.productLine }),
      ...(input.billingMode !== undefined && { billingMode: input.billingMode }),
      ...(input.taskCategory !== undefined && { taskCategory: input.taskCategory }),
      ...(input.matchExtra !== undefined && { matchExtra: input.matchExtra }),
      ...(input.action !== undefined && { action: input.action }),
      ...(input.scope !== undefined && { scope: input.scope }),
      ...(input.scopeId !== undefined && { scopeId: input.scopeId }),
      ...(input.description !== undefined && { description: input.description }),
    })
    .where(eq(resourceSchedulingRule.id, input.id))
    .returning()

  // 审计日志
  await db.insert(schedulingRuleChangeLog).values({
    ruleId: input.id,
    changedBy: input.createdBy ?? "system",
    changeType: "update",
    oldValue: existing as any,
    newValue: updated as any,
  })

  return updated
}

// ---------------------------------------------------------------------------
// 删除
// ---------------------------------------------------------------------------

export async function deleteRule(id: string, changedBy?: string) {
  const existing = await getRuleById(id)
  if (!existing) throw new Error("规则不存在")

  await db.delete(resourceSchedulingRule).where(eq(resourceSchedulingRule.id, id))

  await db.insert(schedulingRuleChangeLog).values({
    ruleId: id,
    changedBy: changedBy ?? "system",
    changeType: "delete",
    oldValue: existing as any,
  })

  return { success: true }
}

// ---------------------------------------------------------------------------
// 审计日志查询
// ---------------------------------------------------------------------------

export async function listRuleChangeLogs(ruleId: string, limit = 50) {
  return db
    .select()
    .from(schedulingRuleChangeLog)
    .where(eq(schedulingRuleChangeLog.ruleId, ruleId))
    .orderBy(desc(schedulingRuleChangeLog.changedAt))
    .limit(limit)
}
