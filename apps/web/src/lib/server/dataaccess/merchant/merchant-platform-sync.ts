import { db } from '@/lib/db'
import { GONGJI_MERCHANT_ID_FALLBACK } from '@/lib/server/dataaccess/merchant/merchant-resolve'
import {
  derivePlatformMerchantName,
  fetchAllPlatformMerchants,
  SuanliMerchantOpenApiError,
  type PlatformMerchantApiRecord,
} from '@/lib/server/integrations/suanli-merchant-api'
import { merchantContactsDataAccess } from '@/lib/server/dataaccess/merchant/merchant-contacts'
import type {
  MerchantSyncAction,
  MerchantSyncAutoResult,
  MerchantSyncCommitResult,
  MerchantSyncPreviewResult,
  MerchantSyncPreviewRow,
} from '@/lib/types/platform-merchant-sync'
import { crmLog, crmWarn } from '@/lib/server/dataaccess/crm/logger'
import { accessFlagsForFundingMode, deriveAccessMode } from '@/lib/merchant-access-mode'
import { merchant, merchantActivity } from '@workspace/db/schema'
import { eq, inArray } from 'drizzle-orm'

const PREVIEW_TTL_MS = 15 * 60 * 1000

/**
 * 平台同步建单时的部署形态（D3-5=A）：不再硬编码 `'oem'`。
 * 平台侧记录不带资金模式，新建商户按 `funding_mode` 列默认值（prepay）推导；
 * 同步只在**建单**时写一次，后续 `computeUpdatePatch` 不改写 `access_mode`（D3-2=A）。
 */
function buildCreateAccess() {
  const flags = accessFlagsForFundingMode('prepay')
  return {
    oemEnabled: Boolean(flags.oemEnabled),
    promoEnabled: Boolean(flags.promoEnabled),
    iframeEnabled: Boolean(flags.iframeEnabled),
    accessMode: deriveAccessMode(flags),
  }
}

const GONGJI_DEFAULTS = {
  code: 'gongji',
  name: '共绩科技',
  companyFullName: '共绩（上海）科技有限公司',
  unifiedSocialCreditCode: '91310000MA1FL2AB3C',
  type: 'platform_direct' as const,
  isDefault: true,
}

type CachedPreview = {
  expiresAt: number
  rows: MerchantSyncPreviewRow[]
  platformRecords: PlatformMerchantApiRecord[]
}

const previewCache = new Map<string, CachedPreview>()

function newId() {
  return crypto.randomUUID()
}

function purgeExpiredPreviews() {
  const now = Date.now()
  for (const [id, entry] of previewCache) {
    if (entry.expiresAt <= now) previewCache.delete(id)
  }
}

function tempUscc(platformMerchantId: number): string {
  const padded = String(Math.abs(platformMerchantId)).padStart(14, '0')
  return `SYNC${padded}`.slice(0, 18)
}

function buildMerchantCode(mark: string | null | undefined, platformId: number): string {
  const sanitized = mark
    ?.trim()
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
  if (sanitized && sanitized.length >= 2) return sanitized.slice(0, 64)
  return `m-${platformId}`
}

function nullableStr(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function buildCreateValues(record: PlatformMerchantApiRecord, now: Date) {
  const platformMerchantId = record.id
  const isGongji = platformMerchantId === 0
  const platformName = derivePlatformMerchantName(record)

  if (isGongji) {
    return {
      id: GONGJI_MERCHANT_ID_FALLBACK,
      platformMerchantId,
      code: GONGJI_DEFAULTS.code,
      name: GONGJI_DEFAULTS.name,
      companyFullName: GONGJI_DEFAULTS.companyFullName,
      unifiedSocialCreditCode: GONGJI_DEFAULTS.unifiedSocialCreditCode,
      merchantMark: nullableStr(record.merchant_mark) ?? 'gongji',
      ...buildCreateAccess(),
      type: GONGJI_DEFAULTS.type,
      isDefault: GONGJI_DEFAULTS.isDefault,
      status: 'active' as const,
      contactUser: nullableStr(record.contact_user),
      contactPhone: nullableStr(record.contact_phone),
      remark: nullableStr(record.remark),
      platformSyncedAt: now,
      createdAt: now,
      updatedAt: now,
    }
  }

  return {
    id: newId(),
    platformMerchantId,
    code: buildMerchantCode(record.merchant_mark, platformMerchantId),
    name: platformName,
    companyFullName: nullableStr(record.company_name) ?? `${platformName}（待补全）`,
    unifiedSocialCreditCode: tempUscc(platformMerchantId),
    merchantMark: nullableStr(record.merchant_mark),
    ...buildCreateAccess(),
    type: 'partner' as const,
    isDefault: false,
    status: 'active' as const,
    contactUser: nullableStr(record.contact_user),
    contactPhone: nullableStr(record.contact_phone),
    remark: nullableStr(record.remark),
    platformSyncedAt: now,
    createdAt: now,
    updatedAt: now,
  }
}

function computeUpdatePatch(
  local: typeof merchant.$inferSelect,
  record: PlatformMerchantApiRecord,
): { patch: Partial<typeof merchant.$inferInsert>; changes: string[] } {
  const changes: string[] = []
  const patch: Partial<typeof merchant.$inferInsert> = {}
  const now = new Date()

  const platformName = derivePlatformMerchantName(record)
  const hasPlatformName =
    Boolean(record.company_name?.trim()) || Boolean(record.merchant_mark?.trim())

  const platformMark = nullableStr(record.merchant_mark)
  if (platformMark !== (local.merchantMark ?? null)) {
    patch.merchantMark = platformMark
    changes.push('Merchant Mark')
  }

  if (hasPlatformName && platformName !== local.name) {
    patch.name = platformName
    changes.push('展示简称')
  }

  const contactUser = nullableStr(record.contact_user)
  if (contactUser !== (local.contactUser ?? null)) {
    patch.contactUser = contactUser
    changes.push('联系人')
  }

  const contactPhone = nullableStr(record.contact_phone)
  if (contactPhone !== (local.contactPhone ?? null)) {
    patch.contactPhone = contactPhone
    changes.push('联系电话')
  }

  const remark = nullableStr(record.remark)
  if (remark !== (local.remark ?? null)) {
    patch.remark = remark
    changes.push('备注')
  }

  patch.platformSyncedAt = now
  patch.updatedAt = now

  return { patch, changes }
}

function buildPreviewRow(
  record: PlatformMerchantApiRecord,
  local: typeof merchant.$inferSelect | undefined,
): MerchantSyncPreviewRow {
  const platformName = derivePlatformMerchantName(record)
  const tenantCount = record.tenant_ids?.length ?? 0
  const warnings: string[] = []

  if (!local) {
    if (record.id !== 0) {
      warnings.push('新建商户需后续补全公司全称与统一社会信用代码')
    }
    return {
      platformMerchantId: record.id,
      merchantMark: nullableStr(record.merchant_mark),
      platformName,
      tenantCount,
      action: 'create',
      changes: ['新建商户'],
      warnings,
    }
  }

  const { changes } = computeUpdatePatch(local, record)
  const syncChanges = changes.filter((c) => c !== 'platform_synced_at')
  const action: MerchantSyncAction = syncChanges.length > 0 ? 'update' : 'unchanged'

  if (
    (local.unifiedSocialCreditCode?.startsWith('SYNC') ?? false) &&
    !record.company_name?.trim()
  ) {
    warnings.push('统一社会信用代码仍为占位，请人工补全')
  }

  return {
    platformMerchantId: record.id,
    merchantMark: nullableStr(record.merchant_mark),
    platformName,
    tenantCount,
    action,
    localMerchantId: local.id,
    localName: local.name,
    changes: action === 'unchanged' ? [] : syncChanges,
    warnings,
  }
}

async function loadLocalMerchantsByPlatformIds(platformIds: number[]) {
  if (platformIds.length === 0) return new Map<number, typeof merchant.$inferSelect>()
  const rows = await db
    .select()
    .from(merchant)
    .where(inArray(merchant.platformMerchantId, platformIds))
  return new Map(rows.map((row) => [row.platformMerchantId, row]))
}

async function appendPlatformSyncActivity(merchantId: string, title: string, description?: string) {
  await db.insert(merchantActivity).values({
    id: newId(),
    merchantId,
    type: 'platform_sync',
    title,
    description,
    authorName: '系统',
    authorRole: 'system',
    occurredAt: new Date(),
    createdAt: new Date(),
  })
}

export const merchantPlatformSyncDataAccess = {
  async preview(): Promise<MerchantSyncPreviewResult> {
    purgeExpiredPreviews()

    let platformRecords: PlatformMerchantApiRecord[]
    try {
      platformRecords = await fetchAllPlatformMerchants()
    } catch (e) {
      if (e instanceof SuanliMerchantOpenApiError) throw e
      throw new Error(e instanceof Error ? e.message : '拉取平台商户失败')
    }

    const localMap = await loadLocalMerchantsByPlatformIds(
      platformRecords.map((r) => r.id),
    )

    const rows = platformRecords.map((record) =>
      buildPreviewRow(record, localMap.get(record.id)),
    )

    const summary = {
      create: rows.filter((r) => r.action === 'create').length,
      update: rows.filter((r) => r.action === 'update').length,
      unchanged: rows.filter((r) => r.action === 'unchanged').length,
    }

    const previewId = newId()
    previewCache.set(previewId, {
      expiresAt: Date.now() + PREVIEW_TTL_MS,
      rows,
      platformRecords,
    })

    return {
      previewId,
      platformTotal: platformRecords.length,
      rows,
      summary,
    }
  },

  async commit(previewId: string): Promise<MerchantSyncCommitResult> {
    purgeExpiredPreviews()

    const cached = previewCache.get(previewId)
    if (!cached || cached.expiresAt <= Date.now()) {
      previewCache.delete(previewId)
      throw new Error('预览已过期，请重新拉取')
    }

    const { platformRecords, rows } = cached
    const localMap = await loadLocalMerchantsByPlatformIds(
      platformRecords.map((r) => r.id),
    )

    let created = 0
    let updated = 0
    let unchanged = 0
    const errors: MerchantSyncCommitResult['errors'] = []
    const now = new Date()

    for (const record of platformRecords) {
      const previewRow = rows.find((r) => r.platformMerchantId === record.id)
      if (!previewRow || previewRow.action === 'unchanged') {
        unchanged++
        continue
      }

      const local = localMap.get(record.id)

      try {
        if (!local) {
          const values = buildCreateValues(record, now)
          await db.transaction(async (tx) => {
            await tx.insert(merchant).values(values)
            await merchantContactsDataAccess.upsertPrimaryFromPlatform(
              tx,
              values.id,
              values.contactUser ?? null,
              values.contactPhone ?? null,
            )
          })
          await appendPlatformSyncActivity(
            values.id,
            '平台同步新建商户',
            `平台 ID ${record.id}${values.merchantMark ? ` · ${values.merchantMark}` : ''}`,
          )
          localMap.set(record.id, values as typeof merchant.$inferSelect)
          created++
          continue
        }

        const { patch, changes } = computeUpdatePatch(local, record)
        const syncChanges = changes.filter((c) => c !== 'platform_synced_at')
        if (syncChanges.length === 0) {
          unchanged++
          continue
        }

        await db.transaction(async (tx) => {
          await tx.update(merchant).set(patch).where(eq(merchant.id, local.id))
          if (syncChanges.includes('联系人') || syncChanges.includes('联系电话')) {
            await merchantContactsDataAccess.upsertPrimaryFromPlatform(
              tx,
              local.id,
              (patch.contactUser ?? local.contactUser) ?? null,
              (patch.contactPhone ?? local.contactPhone) ?? null,
            )
          }
        })
        await appendPlatformSyncActivity(
          local.id,
          '平台同步更新商户',
          syncChanges.length ? `变更：${syncChanges.join('、')}` : undefined,
        )
        updated++
      } catch (e) {
        errors.push({
          platformMerchantId: record.id,
          message: e instanceof Error ? e.message : '写入失败',
        })
      }
    }

    previewCache.delete(previewId)

    return { created, updated, unchanged, errors }
  },

  /**
   * 定时任务用：拉取平台全部商户并 upsert，无需预览确认。
   * 返回本地商户 ID 与平台 tenant_ids，供后续租户自动同步。
   */
  async syncAllFromPlatform(): Promise<MerchantSyncAutoResult> {
    let platformRecords: PlatformMerchantApiRecord[]
    try {
      platformRecords = await fetchAllPlatformMerchants()
    } catch (e) {
      if (e instanceof SuanliMerchantOpenApiError) throw e
      throw new Error(e instanceof Error ? e.message : '拉取平台商户失败')
    }

    const localMap = await loadLocalMerchantsByPlatformIds(
      platformRecords.map((r) => r.id),
    )

    let created = 0
    let updated = 0
    let unchanged = 0
    const errors: MerchantSyncAutoResult['errors'] = []
    const merchants: MerchantSyncAutoResult['merchants'] = []
    const now = new Date()

    for (const record of platformRecords) {
      const tenantIds = [
        ...new Set((record.tenant_ids ?? []).map((id) => String(id)).filter(Boolean)),
      ]
      const local = localMap.get(record.id)

      try {
        if (!local) {
          const values = buildCreateValues(record, now)
          await db.transaction(async (tx) => {
            await tx.insert(merchant).values(values)
            await merchantContactsDataAccess.upsertPrimaryFromPlatform(
              tx,
              values.id,
              values.contactUser ?? null,
              values.contactPhone ?? null,
            )
          })
          await appendPlatformSyncActivity(
            values.id,
            '定时同步新建商户',
            `平台 ID ${record.id}${values.merchantMark ? ` · ${values.merchantMark}` : ''}`,
          )
          localMap.set(record.id, values as typeof merchant.$inferSelect)
          created++
          merchants.push({
            localMerchantId: values.id,
            platformMerchantId: record.id,
            tenantIds,
          })
          continue
        }

        const { patch, changes } = computeUpdatePatch(local, record)
        const syncChanges = changes.filter((c) => c !== 'platform_synced_at')
        if (syncChanges.length === 0) {
          // 无字段变更仍刷新 platformSyncedAt，保证定时任务可观测
          await db
            .update(merchant)
            .set({ platformSyncedAt: now, updatedAt: now })
            .where(eq(merchant.id, local.id))
          unchanged++
          merchants.push({
            localMerchantId: local.id,
            platformMerchantId: record.id,
            tenantIds,
          })
          continue
        }

        await db.transaction(async (tx) => {
          await tx.update(merchant).set(patch).where(eq(merchant.id, local.id))
          if (syncChanges.includes('联系人') || syncChanges.includes('联系电话')) {
            await merchantContactsDataAccess.upsertPrimaryFromPlatform(
              tx,
              local.id,
              (patch.contactUser ?? local.contactUser) ?? null,
              (patch.contactPhone ?? local.contactPhone) ?? null,
            )
          }
        })
        await appendPlatformSyncActivity(
          local.id,
          '定时同步更新商户',
          syncChanges.length ? `变更：${syncChanges.join('、')}` : undefined,
        )
        updated++
        merchants.push({
          localMerchantId: local.id,
          platformMerchantId: record.id,
          tenantIds,
        })
      } catch (e) {
        const message = e instanceof Error ? e.message : '写入失败'
        crmWarn('merchant-platform-sync', 'auto sync row failed', {
          platformMerchantId: record.id,
          err: message,
        })
        errors.push({ platformMerchantId: record.id, message })
      }
    }

    crmLog('merchant-platform-sync', 'auto sync done', {
      platformTotal: platformRecords.length,
      created,
      updated,
      unchanged,
      errors: errors.length,
    })

    return { created, updated, unchanged, errors, merchants }
  },
}
