/**
 * §2.3 调度引擎入口
 * 协调规则匹配、动作计算、冲突检测
 */

import { db } from "@/lib/db"
import { resourceSchedulingRule, schedulingRuleChangeLog } from "@workspace/db/schema"
import { and, eq, or, sql } from "drizzle-orm"
import { evaluateRules } from "./rule-matcher"
import type {
  RuleMatchContext,
  RuleEvaluation,
  SchedulingAction,
  RuleConflictDetection,
  IdleWindowContext,
} from "./types"

/**
 * §2.3.2 核心调度流程：
 * 1. 加载匹配规则（按优先级）
 * 2. 取第一条命中的规则动作
 * 3. 如无命中，返回默认动作（od-normal, weight=50）
 */
export async function resolveSchedulingAction(
  ctx: RuleMatchContext,
): Promise<{
  action: SchedulingAction
  matchedRule: RuleEvaluation | null
}> {
  const evaluations = await evaluateRules(db, ctx)

  const firstMatch = evaluations[0] ?? null
  if (!firstMatch) {
    return {
      action: {
        type: "route-to-od",
        priorityClass: "od-normal",
        weight: 50,
        preemptionPenalty: 0,
      },
      matchedRule: null,
    }
  }

  return {
    action: firstMatch.action,
    matchedRule: firstMatch,
  }
}

/**
 * §B.3.1 规则冲突检测
 * 检查新规则与现有规则是否存在匹配重叠
 */
export async function detectRuleConflict(
  newRule: {
    id?: string
    tenantTier: string[] | null
    productLine: string[] | null
    billingMode: string[] | null
    taskCategory: string[] | null
    scope: string
    scopeId: string | null
  },
): Promise<RuleConflictDetection> {
  const existingRules = await db
    .select()
    .from(resourceSchedulingRule)
    .where(
      and(
        eq(resourceSchedulingRule.enabled, true),
        // 排除自身（编辑场景）
        newRule.id
          ? sql`${resourceSchedulingRule.id} != ${newRule.id}`
          : sql`true`,
      ),
    )

  const conflictingIds: string[] = []

  for (const existing of existingRules) {
    if (isOverlapping(newRule, existing)) {
      conflictingIds.push(existing.id)
    }
  }

  return {
    conflict: conflictingIds.length > 0,
    conflictingRuleIds: conflictingIds,
    reason:
      conflictingIds.length > 0
        ? `与 ${conflictingIds.length} 条现有规则存在匹配重叠`
        : null,
  }
}

// ---------------------------------------------------------------------------
// 内部辅助
// ---------------------------------------------------------------------------

function isOverlapping(a: any, b: any): boolean {
  // scope 必须相同或一方为 global
  if (a.scope !== b.scope && a.scope !== "global" && b.scope !== "global") {
    return false
  }

  // tenant tier: null = 通配，两者非空时必须有交集
  if (a.tenantTier && b.tenantTier) {
    const intersection = a.tenantTier.filter((t: string) => b.tenantTier.includes(t))
    if (intersection.length === 0) return false
  }

  // product line
  if (a.productLine && b.productLine) {
    const intersection = a.productLine.filter((t: string) => b.productLine.includes(t))
    if (intersection.length === 0) return false
  }

  // billing mode
  if (a.billingMode && b.billingMode) {
    const intersection = a.billingMode.filter((t: string) => b.billingMode.includes(t))
    if (intersection.length === 0) return false
  }

  // task category
  if (a.taskCategory && b.taskCategory) {
    const intersection = a.taskCategory.filter((t: string) => b.taskCategory.includes(t))
    if (intersection.length === 0) return false
  }

  return true
}
