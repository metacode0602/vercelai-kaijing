/**
 * 规则匹配引擎 §2.3.4
 * 从数据库加载规则，按优先级评估，返回最佳调度动作
 */

import { resourceSchedulingRule } from "@workspace/db/schema"
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import type { RuleMatchContext, RuleEvaluation } from "./types"
import { buildIdleWindowCondition } from "./rule-condition-builder"

/**
 * 评估规则对当前请求的匹配度，返回按优先级排序的评估结果列表
 *
 * 匹配规则：
 * 1. enabled = true
 * 2. scope = 'global' OR scope = 'tenant' AND scopeId = tenantId
 * 3. match_extra JSONB 包含的字段必须全部匹配
 * 4. tenantTier / productLine / billingMode / taskCategory 为 null 表示通配
 *
 * @returns 按 priority.desc 排序的匹配规则列表
 */
export async function evaluateRules(
  db: any,
  ctx: RuleMatchContext,
): Promise<RuleEvaluation[]> {
  const rules = await db
    .select()
    .from(resourceSchedulingRule)
    .where(
      and(
        eq(resourceSchedulingRule.enabled, true),
        buildScopeCondition(ctx.tenantId),
      ),
    )
    .orderBy(desc(resourceSchedulingRule.priority))

  const results: RuleEvaluation[] = []

  for (const rule of rules) {
    const match = matchRule(rule, ctx)
    if (match) {
      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        action: rule.action as any,
        priorityScore: rule.priority,
        matched: true,
      })
    }
  }

  return results
}

// ---------------------------------------------------------------------------
// 内部辅助
// ---------------------------------------------------------------------------

function buildScopeCondition(tenantId: string) {
  return sql`(${resourceSchedulingRule.scope} = 'global' OR (${resourceSchedulingRule.scope} = 'tenant' AND ${resourceSchedulingRule.scopeId} = ${tenantId}))`
}

function matchRule(rule: any, ctx: RuleMatchContext): boolean {
  // §B.3.1 规则匹配：tenant_tier 数组通配或匹配
  if (rule.tenantTier && rule.tenantTier.length > 0) {
    if (!ctx.tenantTier || !rule.tenantTier.includes(ctx.tenantTier)) return false
  }

  // product_line 通配或匹配
  if (rule.productLine && rule.productLine.length > 0) {
    if (!ctx.productLine || !rule.productLine.includes(ctx.productLine)) return false
  }

  // billing_mode 通配或匹配
  if (rule.billingMode && rule.billingMode.length > 0) {
    if (!ctx.billingMode || !rule.billingMode.includes(ctx.billingMode)) return false
  }

  // task_category 通配或匹配
  if (rule.taskCategory && rule.taskCategory.length > 0) {
    if (!ctx.taskCategory || !rule.taskCategory.includes(ctx.taskCategory)) return false
  }

  // JSONB extra 匹配
  const extra = (rule.matchExtra as Record<string, unknown>) ?? {}
  for (const [key, value] of Object.entries(extra)) {
    if (value === null || value === undefined) continue // null = 通配
    // ctx 上不存在对应字段，尝试从 idleWindow 或 ctx 直接读取
    const ctxValue = (ctx as any)[key]
    if (ctxValue !== undefined && ctxValue !== value) return false
  }

  // idleWindow 通配条件
  if (rule.matchExtra && typeof rule.matchExtra === 'object') {
    if (!buildIdleWindowCondition(rule.matchExtra, ctx.idleWindow)) return false
  }

  return true
}
