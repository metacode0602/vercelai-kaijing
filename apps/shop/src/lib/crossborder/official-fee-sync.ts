/**
 * 官方费率同步规划：把可调用的官方费率表映射为费用模板草稿，绝不自动发布。
 * 生产环境在平台暂无官方费率接口时走 unsupported，不发起模拟拉取。
 */
import {
  getOfficialFeeCapability,
  type OfficialFeeCapability,
} from '@workspace/marketplace'

export type OfficialFeeComponent = {
  code: string
  labelZh: string
  rate: number
  unit: 'pct' | 'usd' | 'amount' | 'lkr' | 'per_kg' | 'per_unit'
  baseHint?: string
  note?: string
  currency?: string
}

export type OfficialFeeScheduleItem = {
  platform: string
  site: string
  categoryId?: string | null
  categoryName?: string | null
  hsCodePattern?: string | null
  fulfillmentPool?: string | null
  components: OfficialFeeComponent[]
  raw?: unknown
}

export type ExistingFeeVersionSnapshot = {
  id: string
  status: string
  published: boolean
  source: 'manual' | 'official_sync' | string
  components: OfficialFeeComponent[]
  note?: string | null
}

export type ExistingFeeTemplateSnapshot = {
  id: string
  code: string
  name: string
  platform: string
  country: string
  type: string
  versions: ExistingFeeVersionSnapshot[]
  matchRules?: { categoryId?: string | null; hsCodePattern?: string | null }[]
}

export type OfficialFeeSyncAction =
  | {
      type: 'create_template_with_draft'
      templateCode: string
      name: string
      platform: string
      country: string
      fulfillmentPool?: string | null
      components: OfficialFeeComponent[]
      matchRule?: { categoryId?: string | null; hsCodePattern?: string | null }
      raw?: unknown
    }
  | {
      type: 'create_draft_version'
      templateId: string
      templateCode: string
      components: OfficialFeeComponent[]
      note: string
      raw?: unknown
      preservePublished: true
    }
  | {
      type: 'update_official_draft'
      templateId: string
      versionId: string
      templateCode: string
      components: OfficialFeeComponent[]
      raw?: unknown
    }
  | {
      type: 'skip'
      templateId?: string
      templateCode?: string
      reasonZh: string
    }

export type OfficialFeeSyncStatus = 'success' | 'partial' | 'failed' | 'unsupported'

export type OfficialFeeSyncPlan = {
  status: OfficialFeeSyncStatus
  reasonZh: string
  actions: OfficialFeeSyncAction[]
  capability: OfficialFeeCapability
}

export function officialFeeDraftLabel(): string {
  return '来自官方费率同步草稿（待审核）'
}

export function orgFeeTemplateLabel(): string {
  return '来自本组织费用模板'
}

export function feeVersionSourceLabel(input: {
  source?: string | null
  status?: string | null
  published?: boolean
}): string {
  const official = input.source === 'official_sync'
  const fromCatalog = input.source === 'platform_catalog'
  const published = Boolean(input.published || input.status === 'published')
  if (official && !published) return officialFeeDraftLabel()
  if (fromCatalog && !published) return '来自平台默认费用模板（待复核发布）'
  if (fromCatalog) return '来自平台默认费用模板（本组织已发布）'
  return orgFeeTemplateLabel()
}

export function officialTemplateCode(input: {
  platform: string
  site: string
  categoryId?: string | null
  hsCodePattern?: string | null
}): string {
  const platform = input.platform.trim().toLowerCase()
  const site = input.site.trim().toUpperCase()
  const cat = (input.categoryId || '').trim() || 'default'
  const hs = (input.hsCodePattern || '').trim()
  const suffix = hs ? `${cat}_hs_${hs}` : cat
  return `official_${platform}_${site}_${suffix}`.replace(/[^a-zA-Z0-9_]+/g, '_').slice(0, 64)
}

function sameComponents(a: OfficialFeeComponent[], b: OfficialFeeComponent[]): boolean {
  if (a.length !== b.length) return false
  const key = (c: OfficialFeeComponent) => `${c.code}:${c.unit}:${c.rate}`
  const left = [...a].map(key).sort()
  const right = [...b].map(key).sort()
  return left.every((v, i) => v === right[i])
}

function matchTemplate(
  existing: ExistingFeeTemplateSnapshot[],
  item: OfficialFeeScheduleItem,
  code: string,
): ExistingFeeTemplateSnapshot | undefined {
  const platform = item.platform.toLowerCase()
  const country = item.site.toUpperCase()
  const byCode = existing.find((t) => t.code === code)
  if (byCode) return byCode
  return existing.find((t) => {
    if (t.platform.toLowerCase() !== platform || t.country.toUpperCase() !== country) return false
    if (t.type !== 'platform_fee') return false
    const rules = t.matchRules ?? []
    if (item.categoryId || item.hsCodePattern) {
      return rules.some(
        (r) =>
          (item.categoryId ? r.categoryId === item.categoryId : true) &&
          (item.hsCodePattern ? (r.hsCodePattern || '') === item.hsCodePattern : true),
      )
    }
    return rules.length === 0
  })
}

export function planOfficialFeeSync(input: {
  platform: string
  site?: string
  capability?: OfficialFeeCapability
  schedules?: OfficialFeeScheduleItem[] | null
  existing?: ExistingFeeTemplateSnapshot[]
  pullError?: string | null
}): OfficialFeeSyncPlan {
  const capability = input.capability ?? getOfficialFeeCapability(input.platform)
  if (!capability.supported) {
    return {
      status: 'unsupported',
      reasonZh: capability.reasonZh,
      actions: [],
      capability,
    }
  }
  if (input.pullError && !input.schedules?.length) {
    return {
      status: 'failed',
      reasonZh: input.pullError,
      actions: [],
      capability,
    }
  }
  const schedules = input.schedules ?? []
  if (!schedules.length) {
    return {
      status: 'failed',
      reasonZh: '官方费率接口未返回任何可写入的费率表。',
      actions: [],
      capability,
    }
  }

  const actions: OfficialFeeSyncAction[] = []
  let skippedInvalid = 0
  for (const item of schedules) {
    if (!item.components.length) {
      skippedInvalid += 1
      actions.push({ type: 'skip', reasonZh: '该条官方费率缺少可识别的费用组件，已跳过，不会编造费率。' })
      continue
    }
    const code = officialTemplateCode({
      platform: item.platform,
      site: item.site,
      categoryId: item.categoryId,
      hsCodePattern: item.hsCodePattern,
    })
    const template = matchTemplate(input.existing ?? [], item, code)
    if (!template) {
      actions.push({
        type: 'create_template_with_draft',
        templateCode: code,
        name: item.categoryName
          ? `官方同步 ${item.platform} ${item.site} ${item.categoryName}`
          : `官方同步 ${item.platform} ${item.site}`,
        platform: item.platform.toLowerCase(),
        country: item.site.toUpperCase(),
        fulfillmentPool: item.fulfillmentPool,
        components: item.components,
        matchRule:
          item.categoryId || item.hsCodePattern
            ? { categoryId: item.categoryId ?? null, hsCodePattern: item.hsCodePattern ?? null }
            : undefined,
        raw: item.raw,
      })
      continue
    }
    const openOfficialDraft = template.versions.find(
      (v) => v.source === 'official_sync' && v.status === 'draft' && !v.published,
    )
    const published = template.versions.find((v) => v.published || v.status === 'published')
    if (openOfficialDraft && sameComponents(openOfficialDraft.components, item.components)) {
      actions.push({
        type: 'skip',
        templateId: template.id,
        templateCode: template.code,
        reasonZh: '已有内容相同的官方同步草稿，无需覆盖。',
      })
      continue
    }
    if (openOfficialDraft) {
      actions.push({
        type: 'update_official_draft',
        templateId: template.id,
        versionId: openOfficialDraft.id,
        templateCode: template.code,
        components: item.components,
        raw: item.raw,
      })
      continue
    }
    if (published && sameComponents(published.components, item.components)) {
      actions.push({
        type: 'skip',
        templateId: template.id,
        templateCode: template.code,
        reasonZh: '已发布版本与官方费率一致，不覆盖已发布内容，也不另开无差异草稿。',
      })
      continue
    }
    actions.push({
      type: 'create_draft_version',
      templateId: template.id,
      templateCode: template.code,
      components: item.components,
      note: published
        ? '官方费率同步草稿；不覆盖运营已发布的版本，需审核后才会被计算器使用。'
        : officialFeeDraftLabel(),
      raw: item.raw,
      preservePublished: true,
    })
  }

  const writes = actions.filter((a) => a.type !== 'skip')
  const skipped = actions.filter((a) => a.type === 'skip')
  let status: OfficialFeeSyncStatus = 'success'
  let reasonZh = `已规划 ${writes.length} 条官方费率草稿，均不会自动发布。`
  if (!writes.length && skippedInvalid === schedules.length) {
    status = 'failed'
    reasonZh = '官方返回的费率条目都缺少可识别组件，未写入模板。'
  } else if (skippedInvalid > 0 || (input.pullError && writes.length)) {
    status = 'partial'
    reasonZh = input.pullError
      ? `部分成功：${input.pullError}；已规划 ${writes.length} 条草稿，失败或跳过 ${skipped.length} 条。`
      : `部分成功：已规划 ${writes.length} 条草稿，另有 ${skippedInvalid} 条因缺少组件被跳过。`
  }
  return { status, reasonZh, actions, capability }
}
