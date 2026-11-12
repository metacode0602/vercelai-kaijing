/**
 * 官方费率同步写入：结果只落 draft 版本，不自动发布，不覆盖已发布版本。
 * 计算器继续只读已发布模板。当前已接入平台均无官方费率表接口，同步会如实记录 unsupported。
 */
import { and, desc, eq, inArray } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { feeOfficialSyncRuns, feeTemplateVersions, feeTemplates } from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import { getOfficialFeeCapability } from '@workspace/marketplace'
import {
  officialFeeDraftLabel,
  planOfficialFeeSync,
  type ExistingFeeTemplateSnapshot,
  type OfficialFeeScheduleItem,
  type OfficialFeeSyncPlan,
} from '@/lib/crossborder/official-fee-sync'
import {
  addFeeTemplateMatchRule,
  createFeeTemplate,
  createFeeTemplateVersion,
  listFeeTemplates,
  updateFeeTemplateVersion,
  type FeeComponentDto,
} from '@/lib/server/dataaccess/fee-templates'

type DbLike = AppDatabase

export type OfficialFeeSyncRunDto = {
  id: string
  platform: string
  country: string
  shopId: string | null
  status: string
  reason: string
  draftVersionIds: string[]
  startedAt: string
  finishedAt: string | null
  requestedBy: string | null
}

function mapRun(row: typeof feeOfficialSyncRuns.$inferSelect): OfficialFeeSyncRunDto {
  return {
    id: row.id,
    platform: row.platform,
    country: row.country ?? '',
    shopId: row.shopId,
    status: row.status,
    reason: row.reason ?? '',
    draftVersionIds: Array.isArray(row.draftVersionIds) ? row.draftVersionIds : [],
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    requestedBy: row.requestedBy,
  }
}

export function listOfficialFeeCapabilities() {
  const platforms = ['daraz', 'lazada', 'tiktok_shop', 'shopee']
  return platforms.map((platform) => getOfficialFeeCapability(platform))
}

export async function latestOfficialFeeSync(
  db: DbLike,
  organizationId: string,
  input?: { platform?: string; country?: string },
): Promise<OfficialFeeSyncRunDto | null> {
  const filters = [eq(feeOfficialSyncRuns.organizationId, organizationId)]
  if (input?.platform) filters.push(eq(feeOfficialSyncRuns.platform, input.platform.toLowerCase()))
  if (input?.country) filters.push(eq(feeOfficialSyncRuns.country, input.country.toUpperCase()))
  const [row] = await db
    .select()
    .from(feeOfficialSyncRuns)
    .where(and(...filters))
    .orderBy(desc(feeOfficialSyncRuns.startedAt))
    .limit(1)
  return row ? mapRun(row) : null
}

export async function listPendingOfficialFeeDrafts(
  db: DbLike,
  organizationId: string,
  input: { platform: string; country: string },
) {
  const platform = input.platform.toLowerCase()
  const country = input.country.toUpperCase()
  const rows = await db
    .select({
      versionId: feeTemplateVersions.id,
      versionNo: feeTemplateVersions.versionNo,
      status: feeTemplateVersions.status,
      source: feeTemplateVersions.source,
      syncedAt: feeTemplateVersions.syncedAt,
      templateId: feeTemplates.id,
      templateCode: feeTemplates.code,
      platform: feeTemplates.platform,
      country: feeTemplates.country,
    })
    .from(feeTemplateVersions)
    .innerJoin(feeTemplates, eq(feeTemplates.id, feeTemplateVersions.templateId))
    .where(
      and(
        eq(feeTemplateVersions.organizationId, organizationId),
        eq(feeTemplateVersions.source, 'official_sync'),
        inArray(feeTemplateVersions.status, ['draft', 'in_review']),
        eq(feeTemplates.platform, platform),
        eq(feeTemplates.country, country),
        eq(feeTemplates.type, 'platform_fee'),
      ),
    )
    .orderBy(desc(feeTemplateVersions.updatedAt))
  return rows.map((row) => ({
    templateId: row.templateId,
    templateCode: row.templateCode,
    versionId: row.versionId,
    versionNo: row.versionNo,
    status: row.status,
    sourceLabel: officialFeeDraftLabel(),
    syncedAt: row.syncedAt ? row.syncedAt.toISOString() : null,
  }))
}

async function loadExistingSnapshots(
  db: DbLike,
  organizationId: string,
  platform: string,
  country?: string,
): Promise<ExistingFeeTemplateSnapshot[]> {
  const page = await listFeeTemplates(db, organizationId, {
    page: 1,
    pageSize: 200,
    platform,
    country,
    type: 'platform_fee',
  })
  const { getFeeTemplate, listFeeTemplateMatchRules } = await import(
    '@/lib/server/dataaccess/fee-templates'
  )
  const result: ExistingFeeTemplateSnapshot[] = []
  for (const tpl of page.items) {
    const full = await getFeeTemplate(db, organizationId, tpl.id)
    if (!full) continue
    const rules = await listFeeTemplateMatchRules(db, organizationId, full.id)
    result.push({
      id: full.id,
      code: full.code,
      name: full.name,
      platform: full.platform,
      country: full.country,
      type: full.type,
      versions: (full.versions ?? []).map((v) => ({
        id: v.id,
        status: v.status,
        published: v.published,
        source: v.source || 'manual',
        components: v.components,
        note: v.note,
      })),
      matchRules: rules.map((r) => ({ categoryId: r.categoryId, hsCodePattern: r.hsCodePattern || null })),
    })
  }
  return result
}

export async function applyOfficialFeeSyncPlan(
  db: DbLike,
  organizationId: string,
  input: {
    plan: OfficialFeeSyncPlan
    platform: string
    country?: string
    shopId?: string
    syncRunId: string
    syncedAt: Date
  },
): Promise<string[]> {
  const draftIds: string[] = []
  const meta = {
    source: 'official_sync' as const,
    sourcePlatform: input.platform.toLowerCase(),
    sourceSite: input.country?.toUpperCase(),
    sourceShopId: input.shopId,
    syncedAt: input.syncedAt,
    syncRunId: input.syncRunId,
  }
  for (const action of input.plan.actions) {
    if (action.type === 'skip') continue
    if (action.type === 'create_template_with_draft') {
      const created = await createFeeTemplate(db, organizationId, {
        code: action.templateCode,
        name: action.name,
        platform: action.platform,
        country: action.country,
        fulfillmentPool: action.fulfillmentPool ?? undefined,
        type: 'platform_fee',
        status: '草稿',
        note: officialFeeDraftLabel(),
        withDraftVersion: false,
      })
      const version = await createFeeTemplateVersion(db, organizationId, {
        templateId: created.id,
        components: action.components as FeeComponentDto[],
        note: officialFeeDraftLabel(),
        reviewNeeded: true,
        rawSnapshot: action.raw && typeof action.raw === 'object' ? (action.raw as Record<string, unknown>) : undefined,
        ...meta,
      })
      if (action.matchRule) {
        await addFeeTemplateMatchRule(db, organizationId, {
          templateId: created.id,
          categoryId: action.matchRule.categoryId,
          hsCodePattern: action.matchRule.hsCodePattern ?? undefined,
        })
      }
      draftIds.push(version.id)
      continue
    }
    if (action.type === 'create_draft_version') {
      const version = await createFeeTemplateVersion(db, organizationId, {
        templateId: action.templateId,
        components: action.components as FeeComponentDto[],
        note: action.note,
        reviewNeeded: true,
        rawSnapshot: action.raw && typeof action.raw === 'object' ? (action.raw as Record<string, unknown>) : undefined,
        ...meta,
      })
      draftIds.push(version.id)
      continue
    }
    if (action.type === 'update_official_draft') {
      await updateFeeTemplateVersion(db, organizationId, action.versionId, {
        components: action.components as FeeComponentDto[],
        note: officialFeeDraftLabel(),
        reviewNeeded: true,
      })
      await db
        .update(feeTemplateVersions)
        .set({
          source: 'official_sync',
          sourcePlatform: meta.sourcePlatform,
          sourceSite: meta.sourceSite ?? null,
          sourceShopId: meta.sourceShopId ?? null,
          syncedAt: meta.syncedAt,
          syncRunId: meta.syncRunId,
          rawSnapshot:
            action.raw && typeof action.raw === 'object' ? (action.raw as Record<string, unknown>) : null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(feeTemplateVersions.organizationId, organizationId),
            eq(feeTemplateVersions.id, action.versionId),
            eq(feeTemplateVersions.status, 'draft'),
          ),
        )
      draftIds.push(action.versionId)
    }
  }
  return draftIds
}

/**
 * 发起一次同步。当前生产路径：无官方费率表接口时记录 unsupported，不写模板、不假装成功。
 * `schedules` 仅供内部在未来接通真实接口或测试夹具时写入草稿，不会由 tRPC 传入伪造数据。
 */
export async function syncOfficialFees(
  db: DbLike,
  organizationId: string,
  input: {
    platform: string
    country?: string
    shopId?: string
    actor?: string
    schedules?: OfficialFeeScheduleItem[] | null
    pullError?: string | null
    /** 测试或未来接通接口后传入 true；生产 tRPC 不得把未核验平台标为 ready */
    treatAsReady?: boolean
  },
): Promise<{ run: OfficialFeeSyncRunDto; plan: OfficialFeeSyncPlan }> {
  const platform = input.platform.trim().toLowerCase()
  const country = input.country?.trim().toUpperCase()
  const capability = getOfficialFeeCapability(platform)
  const startedAt = new Date()
  const runId = createId()

  const effectiveCapability = input.treatAsReady
    ? { ...capability, supported: true, status: 'ready' as const }
    : capability

  const existing =
    effectiveCapability.supported
      ? await loadExistingSnapshots(db, organizationId, platform, country)
      : []
  const plan = planOfficialFeeSync({
    platform,
    site: country,
    capability: effectiveCapability,
    schedules: effectiveCapability.supported ? input.schedules : [],
    existing,
    pullError: effectiveCapability.supported ? input.pullError : null,
  })

  let draftVersionIds: string[] = []
  if (effectiveCapability.supported && plan.actions.some((a) => a.type !== 'skip')) {
    draftVersionIds = await applyOfficialFeeSyncPlan(db, organizationId, {
      plan,
      platform,
      country,
      shopId: input.shopId,
      syncRunId: runId,
      syncedAt: startedAt,
    })
  }

  const finishedAt = new Date()
  await db.insert(feeOfficialSyncRuns).values({
    id: runId,
    organizationId,
    platform,
    country: country ?? null,
    shopId: input.shopId ?? null,
    status: plan.status,
    reason: plan.reasonZh,
    source: 'official_api',
    draftVersionIds,
    rawSnapshot: {
      capabilitySupported: effectiveCapability.supported,
      documentedEndpoints: effectiveCapability.documentedEndpoints,
      whyNotUsableZh: effectiveCapability.whyNotUsableZh,
      scheduleCount: input.schedules?.length ?? 0,
    },
    startedAt,
    finishedAt,
    requestedBy: input.actor ?? null,
    createdAt: startedAt,
    updatedAt: finishedAt,
  })
  const [row] = await db.select().from(feeOfficialSyncRuns).where(eq(feeOfficialSyncRuns.id, runId)).limit(1)
  if (!row) throw new Error('记录同步结果失败')
  return { run: mapRun(row), plan }
}
