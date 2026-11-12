/**
 * 费用模板匹配纯函数：品类祖先回溯、HS 前缀/章节回退、更清晰的优先级。
 * 平台 + 国家过滤在此一并校验，避免把 A 平台规则套到 B 平台模板。
 * @see docs/design/multi-platform-pricing-calculator-ux-2026-11-11.md §10
 */

export type FeeTemplateMatchRuleInput = {
  templateId: string
  categoryId: string | null
  hsCodePattern: string | null
  priority: number
}

export type FeeTemplateMatchCandidate = {
  id: string
  platform: string
  country: string
}

export type FeeTemplateMatchArgs = {
  platform: string
  country: string
  categoryId?: string | null
  /** [自身, 父级, 祖父, ...] */
  categoryAncestorIds?: string[]
  hsCode?: string | null
}

export type FeeTemplateMatchScore = {
  ok: boolean
  /** 越大越具体：HS 位数权重大于品类，精确品类高于祖先 */
  specificity: number
  rulePriority: number
  reason: string
}

export function normalizeHsPattern(raw: string | null | undefined): string {
  return (raw || '').replace(/[.\s]/g, '').toUpperCase()
}

/**
 * HS 命中：全码 > 更长前缀 > 章（2 位）/ 目（4 位）回退。
 * 模式末尾补零（如 3900 表示第 39 章）会先去掉再比较，修复 phase1 `startsWith('3900')` 无法命中 392410 的问题。
 */
export function hsPatternMatch(
  hsCode: string | null | undefined,
  pattern: string | null | undefined,
): { ok: boolean; depth: number } {
  const hs = normalizeHsPattern(hsCode)
  const pat = normalizeHsPattern(pattern)
  if (!hs || !pat) return { ok: false, depth: 0 }
  if (hs === pat) return { ok: true, depth: Math.max(pat.length, 10) }
  if (hs.startsWith(pat)) return { ok: true, depth: pat.length }
  const trimmed = pat.replace(/0+$/, '')
  if (trimmed.length >= 2 && hs.startsWith(trimmed)) return { ok: true, depth: trimmed.length }
  return { ok: false, depth: 0 }
}

export function scoreFeeTemplateRule(
  rule: FeeTemplateMatchRuleInput,
  args: FeeTemplateMatchArgs,
): FeeTemplateMatchScore {
  const needCat = Boolean(rule.categoryId)
  const needHs = Boolean(rule.hsCodePattern)
  const ancestors = args.categoryAncestorIds ?? (args.categoryId ? [args.categoryId] : [])
  let catScore = 0
  let catOk = !needCat
  if (needCat && rule.categoryId) {
    const idx = ancestors.indexOf(rule.categoryId)
    if (idx === 0) {
      catOk = true
      catScore = 8
    } else if (idx > 0) {
      catOk = true
      catScore = Math.max(1, 8 - idx * 2)
    }
  }

  const hs = hsPatternMatch(args.hsCode, rule.hsCodePattern)
  const hsOk = !needHs || hs.ok
  if (!catOk || !hsOk) {
    const reasons: string[] = []
    if (!catOk) reasons.push('品类未命中（含祖先）')
    if (!hsOk) reasons.push('HS 未命中（含章节回退）')
    return { ok: false, specificity: 0, rulePriority: rule.priority, reason: reasons.join('；') }
  }
  const hsScore = needHs ? hs.depth * 10 : 0
  const specificity = hsScore + catScore
  const bits: string[] = []
  if (needHs) bits.push(hs.depth >= 10 || normalizeHsPattern(args.hsCode) === normalizeHsPattern(rule.hsCodePattern) ? 'HS 全码' : `HS 前缀/章 ${hs.depth} 位`)
  if (needCat) bits.push(catScore === 8 ? '品类精确' : '品类祖先')
  if (!needHs && !needCat) bits.push('无限制规则')
  return {
    ok: true,
    specificity,
    rulePriority: rule.priority,
    reason: bits.join(' + ') || '命中',
  }
}

export function scoreFeeTemplateRules(
  rules: FeeTemplateMatchRuleInput[],
  args: FeeTemplateMatchArgs,
): FeeTemplateMatchScore {
  if (rules.length === 0) {
    return { ok: true, specificity: 0, rulePriority: 0, reason: '无匹配规则，按平台+站点兜底' }
  }
  let best: FeeTemplateMatchScore | null = null
  for (const rule of rules) {
    const score = scoreFeeTemplateRule(rule, args)
    if (!score.ok) continue
    if (
      !best ||
      score.specificity > best.specificity ||
      (score.specificity === best.specificity && score.rulePriority > best.rulePriority)
    ) {
      best = score
    }
  }
  return best ?? { ok: false, specificity: 0, rulePriority: 0, reason: '已有规则但未命中品类或 HS' }
}

function normPlatform(value: string) {
  return value.trim().toLowerCase()
}

function normCountry(value: string) {
  return value.trim().toUpperCase()
}

/**
 * 在同平台+同国家的模板中按规则打分，互不跨平台。
 */
export function selectTemplatesByMatchRules<T extends FeeTemplateMatchCandidate>(
  templates: T[],
  rules: FeeTemplateMatchRuleInput[],
  args: FeeTemplateMatchArgs,
): Array<{ template: T; score: FeeTemplateMatchScore }> {
  const platform = normPlatform(args.platform)
  const country = normCountry(args.country)
  const scoped = templates.filter(
    (row) => normPlatform(row.platform) === platform && normCountry(row.country) === country,
  )
  const rulesByTpl = new Map<string, FeeTemplateMatchRuleInput[]>()
  for (const rule of rules) {
    const list = rulesByTpl.get(rule.templateId) ?? []
    list.push(rule)
    rulesByTpl.set(rule.templateId, list)
  }
  const scored = scoped
    .map((template) => ({
      template,
      score: scoreFeeTemplateRules(rulesByTpl.get(template.id) ?? [], args),
    }))
    .filter((item) => item.score.ok)
  scored.sort((a, b) => {
    if (b.score.specificity !== a.score.specificity) return b.score.specificity - a.score.specificity
    if (b.score.rulePriority !== a.score.rulePriority) return b.score.rulePriority - a.score.rulePriority
    return 0
  })
  if (scored.length === 0) return []
  const best = scored[0]!.score.specificity
  return scored.filter((item) => item.score.specificity === best)
}

/** 便于测试记录：第一期精确品类+startsWith 是否会错过 */
export function phase1WouldMiss(args: {
  ruleCategoryId?: string | null
  skuCategoryId?: string | null
  categoryAncestorIds?: string[]
  hsCode?: string | null
  hsCodePattern?: string | null
}): boolean {
  const catOk = !args.ruleCategoryId || args.ruleCategoryId === args.skuCategoryId
  const pattern = normalizeHsPattern(args.hsCodePattern)
  const hs = normalizeHsPattern(args.hsCode)
  const hsOk = !pattern || (Boolean(hs) && (hs === pattern || hs.startsWith(pattern)))
  return !(catOk && hsOk)
}
