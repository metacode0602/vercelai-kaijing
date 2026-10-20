import { db } from '@/lib/db'
import {
  fetchPlatformTenantsByIds,
  parsePlatformOverdueAt,
  parsePlatformRegisteredAt,
  platformCoinToYuan,
  resolveTenantName,
  SuanliOpenApiError,
} from '@/lib/server/integrations/suanli-tenant-api'
import {
  fetchPlatformMerchantByPlatformId,
  SuanliMerchantOpenApiError,
} from '@/lib/server/integrations/suanli-merchant-api'
import { balanceSnapshotDataAccess } from '@/lib/server/dataaccess/crm/balance-snapshot'
import { writeCustomerPlatformRegisteredAtIfEmpty } from '@/lib/server/dataaccess/crm/customer-platform-registered-at'
import { crmLog, crmWarn } from '@/lib/server/dataaccess/crm/logger'
import {
  getTenantImportExcludedPlatformMerchantIds,
  isPlatformMerchantTenantImportExcluded,
} from '@/lib/server/dataaccess/merchant/merchant-tenant-import-config'
import type {
  MerchantTenantSyncAutoResult,
  MerchantTenantSyncCommitItem,
  MerchantTenantSyncCommitResult,
  MerchantTenantSyncPreviewResult,
  MerchantTenantSyncPreviewRow,
} from '@/lib/types/merchant-tenant-sync'
import type { PlatformTenantApiRecord } from '@/lib/types/platform-tenant-import'
import { billingTenant, customer, merchant, merchantActivity } from '@workspace/db/schema'
import { eq, inArray } from 'drizzle-orm'

const PREVIEW_TTL_MS = 15 * 60 * 1000
const MERCHANT_TENANT_SYNC_MAX_IDS = 200

type CachedPreview = {
  expiresAt: number
  merchantId: string
  platformMerchantId: number
  rows: MerchantTenantSyncPreviewRow[]
  platformRecords: PlatformTenantApiRecord[]
}

const previewCache = new Map<string, CachedPreview>()

function newId() {
  return crypto.randomUUID()
}

function assertMerchantTenantImportAllowed(platformMerchantId: number): void {
  if (!isPlatformMerchantTenantImportExcluded(platformMerchantId)) return

  const excluded = getTenantImportExcludedPlatformMerchantIds().join(', ')
  throw new Error(
    `平台商户 ID ${platformMerchantId} 已配置为不导入租户（排除列表：${excluded}）`,
  )
}

function moneyString(yuan: number): string {
  return yuan.toFixed(4)
}

function purgeExpiredPreviews() {
  const now = Date.now()
  for (const [id, entry] of previewCache) {
    if (entry.expiresAt <= now) previewCache.delete(id)
  }
}

function mapRecordToTenantFields(record: PlatformTenantApiRecord) {
  return {
    name: resolveTenantName(record),
    phone: record.admin_phone?.trim() || null,
    balance: moneyString(platformCoinToYuan(record.coin)),
    credit_limit:
      record.limit_coin != null
        ? moneyString(platformCoinToYuan(record.limit_coin))
        : null,
    overdue_at: parsePlatformOverdueAt(record.insufficient_balance),
    platformRegisteredAt: parsePlatformRegisteredAt(record.create_time),
  }
}

type LocalTenantRow = {
  tenantId: string
  platformTenantId: string
  name: string
  phone: string | null
  balance: string
  creditLimit: string | null
  customerId: string
  customerName: string
  merchantId: string
  merchantName: string
}

async function loadLocalTenantsByPlatformIds(platformIds: string[]) {
  if (platformIds.length === 0) {
    return new Map<string, LocalTenantRow>()
  }

  const rows = await db
    .select({
      tenantId: billingTenant.id,
      platformTenantId: billingTenant.platformTenantId,
      name: billingTenant.name,
      phone: billingTenant.phone,
      balance: billingTenant.balance,
      creditLimit: billingTenant.credit_limit,
      customerId: billingTenant.customerId,
      customerName: customer.name,
      merchantId: billingTenant.merchantId,
      merchantName: merchant.name,
    })
    .from(billingTenant)
    .innerJoin(customer, eq(customer.id, billingTenant.customerId))
    .innerJoin(merchant, eq(merchant.id, billingTenant.merchantId))
    .where(inArray(billingTenant.platformTenantId, platformIds))

  const map = new Map<string, LocalTenantRow>()
  for (const row of rows) {
    if (!row.platformTenantId) continue
    map.set(row.platformTenantId, {
      tenantId: row.tenantId,
      platformTenantId: row.platformTenantId,
      name: row.name,
      phone: row.phone,
      balance: row.balance,
      creditLimit: row.creditLimit,
      customerId: row.customerId!,
      customerName: row.customerName,
      merchantId: row.merchantId,
      merchantName: row.merchantName,
    })
  }
  return map
}

async function loadLocalTenantsByMerchantId(merchantId: string) {
  const rows = await db
    .select({
      tenantId: billingTenant.id,
      platformTenantId: billingTenant.platformTenantId,
      name: billingTenant.name,
      phone: billingTenant.phone,
      balance: billingTenant.balance,
      creditLimit: billingTenant.credit_limit,
      customerId: billingTenant.customerId,
      customerName: customer.name,
      merchantId: billingTenant.merchantId,
      merchantName: merchant.name,
    })
    .from(billingTenant)
    .innerJoin(customer, eq(customer.id, billingTenant.customerId))
    .innerJoin(merchant, eq(merchant.id, billingTenant.merchantId))
    .where(eq(billingTenant.merchantId, merchantId))

  return rows
    .filter((row): row is typeof row & { platformTenantId: string } =>
      Boolean(row.platformTenantId),
    )
    .map((row) => ({
      tenantId: row.tenantId,
      platformTenantId: row.platformTenantId,
      name: row.name,
      phone: row.phone,
      balance: row.balance,
      creditLimit: row.creditLimit,
      customerId: row.customerId!,
      customerName: row.customerName,
      merchantId: row.merchantId,
      merchantName: row.merchantName,
    }))
}

function computeFieldChanges(
  local: LocalTenantRow,
  fields: ReturnType<typeof mapRecordToTenantFields>,
): string[] {
  const changes: string[] = []
  if (local.name !== fields.name) changes.push('名称')
  if ((local.phone ?? '') !== (fields.phone ?? '')) changes.push('手机')
  if (Number(local.balance) !== Number(fields.balance)) changes.push('余额')
  if (Number(local.creditLimit ?? 0) !== Number(fields.credit_limit ?? 0)) {
    changes.push('信用额度')
  }
  return changes
}

function buildPlatformPreviewRow(input: {
  record: PlatformTenantApiRecord
  local: LocalTenantRow | undefined
  targetMerchantId: string
  targetMerchantName: string
  expectedPlatformMerchantId: number
}): MerchantTenantSyncPreviewRow {
  const { record, local, targetMerchantId, targetMerchantName, expectedPlatformMerchantId } =
    input
  const platformTenantId = String(record.id)
  const platformMerchantId =
    record.merchant_id == null || Number.isNaN(Number(record.merchant_id))
      ? 0
      : Number(record.merchant_id)
  const fields = mapRecordToTenantFields(record)
  const warnings: string[] = []

  if (platformMerchantId !== expectedPlatformMerchantId) {
    warnings.push(
      `平台租户 merchant_id=${platformMerchantId}，与当前商户平台 ID ${expectedPlatformMerchantId} 不一致`,
    )
  }

  if (!local) {
    return {
      platformTenantId,
      platformName: fields.name,
      platformMerchantId,
      coin: platformCoinToYuan(record.coin),
      action: 'create',
      changes: ['新建租户'],
      warnings,
    }
  }

  const fieldChanges = computeFieldChanges(local, fields)
  const needsRebind = local.merchantId !== targetMerchantId

  if (needsRebind) {
    return {
      platformTenantId,
      platformName: fields.name,
      platformMerchantId,
      coin: platformCoinToYuan(record.coin),
      action: 'rebind',
      localTenantId: local.tenantId,
      localName: local.name,
      localCustomerId: local.customerId,
      localCustomerName: local.customerName,
      localMerchantId: local.merchantId,
      localMerchantName: local.merchantName,
      changes: [
        `归属：${local.merchantName} → ${targetMerchantName}`,
        ...fieldChanges,
      ],
      warnings: [
        ...warnings,
        `该租户已绑定商户「${local.merchantName}」，默认不改绑；勾选后才会改绑到「${targetMerchantName}」`,
      ],
    }
  }

  if (fieldChanges.length > 0) {
    return {
      platformTenantId,
      platformName: fields.name,
      platformMerchantId,
      coin: platformCoinToYuan(record.coin),
      action: 'update',
      localTenantId: local.tenantId,
      localName: local.name,
      localCustomerId: local.customerId,
      localCustomerName: local.customerName,
      localMerchantId: local.merchantId,
      localMerchantName: local.merchantName,
      changes: fieldChanges,
      warnings,
    }
  }

  return {
    platformTenantId,
    platformName: fields.name,
    platformMerchantId,
    coin: platformCoinToYuan(record.coin),
    action: 'unchanged',
    localTenantId: local.tenantId,
    localName: local.name,
    localCustomerId: local.customerId,
    localCustomerName: local.customerName,
    localMerchantId: local.merchantId,
    localMerchantName: local.merchantName,
    changes: [],
    warnings,
  }
}

async function writeBalanceSnapshotAfterImport(input: {
  tenantId: string
  customerId: string
  platformTenantId: string
  balance: string
  creditLimit: string | null
  traceId: string
}) {
  try {
    await balanceSnapshotDataAccess.writeManualSnapshot({
      tenantId: input.tenantId,
      customerId: input.customerId,
      platformTenantId: input.platformTenantId,
      balance: input.balance,
      creditLimit: input.creditLimit,
      source: 'platform_import',
    })
  } catch (e) {
    crmWarn('merchant-tenant-sync', 'balance snapshot failed', {
      traceId: input.traceId,
      tenantId: input.tenantId,
      err: e instanceof Error ? e.message : String(e),
    })
  }
}

async function appendSyncActivity(merchantId: string, title: string, description?: string) {
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

export const merchantTenantSyncDataAccess = {
  async preview(merchantId: string): Promise<MerchantTenantSyncPreviewResult> {
    purgeExpiredPreviews()

    const localMerchant = await db.query.merchant.findFirst({
      where: eq(merchant.id, merchantId),
      columns: {
        id: true,
        name: true,
        platformMerchantId: true,
      },
    })
    if (!localMerchant) {
      throw new Error('商户不存在')
    }
    if (localMerchant.platformMerchantId == null) {
      throw new Error('商户未绑定平台商户')
    }

    assertMerchantTenantImportAllowed(localMerchant.platformMerchantId)

    let platformMerchant
    try {
      platformMerchant = await fetchPlatformMerchantByPlatformId(
        localMerchant.platformMerchantId,
      )
    } catch (e) {
      if (e instanceof SuanliMerchantOpenApiError) throw e
      throw new Error(e instanceof Error ? e.message : '拉取平台商户失败')
    }

    if (!platformMerchant) {
      throw new Error(
        `平台未找到商户（platform_merchant_id=${localMerchant.platformMerchantId}），请先同步商户主数据`,
      )
    }

    const platformTenantIds = [
      ...new Set((platformMerchant.tenant_ids ?? []).map((id) => String(id))),
    ]

    if (platformTenantIds.length > MERCHANT_TENANT_SYNC_MAX_IDS) {
      throw new Error(
        `该商户平台关联租户 ${platformTenantIds.length} 个，超过单次同步上限 ${MERCHANT_TENANT_SYNC_MAX_IDS}，请联系管理员分批处理`,
      )
    }

    let platformMap = new Map<string, PlatformTenantApiRecord>()
    if (platformTenantIds.length > 0) {
      try {
        platformMap = await fetchPlatformTenantsByIds(platformTenantIds)
      } catch (e) {
        if (e instanceof SuanliOpenApiError) throw e
        throw new Error(e instanceof Error ? e.message : '拉取平台租户失败')
      }
    }

    const localByPlatformId = await loadLocalTenantsByPlatformIds(platformTenantIds)
    const localUnderMerchant = await loadLocalTenantsByMerchantId(merchantId)

    const rows: MerchantTenantSyncPreviewRow[] = []
    const seenPlatformIds = new Set<string>()

    for (const platformTenantId of platformTenantIds) {
      seenPlatformIds.add(platformTenantId)
      const record = platformMap.get(platformTenantId)
      if (!record) {
        rows.push({
          platformTenantId,
          platformName: '—',
          platformMerchantId: localMerchant.platformMerchantId,
          coin: 0,
          action: 'unchanged',
          changes: [],
          warnings: ['平台未返回该租户详情，已跳过'],
        })
        continue
      }
      rows.push(
        buildPlatformPreviewRow({
          record,
          local: localByPlatformId.get(platformTenantId),
          targetMerchantId: merchantId,
          targetMerchantName: localMerchant.name,
          expectedPlatformMerchantId: localMerchant.platformMerchantId,
        }),
      )
    }

    for (const local of localUnderMerchant) {
      if (seenPlatformIds.has(local.platformTenantId)) continue
      rows.push({
        platformTenantId: local.platformTenantId,
        platformName: local.name,
        platformMerchantId: localMerchant.platformMerchantId,
        coin: Number(local.balance),
        action: 'local_only',
        localTenantId: local.tenantId,
        localName: local.name,
        localCustomerId: local.customerId,
        localCustomerName: local.customerName,
        localMerchantId: local.merchantId,
        localMerchantName: local.merchantName,
        changes: [],
        warnings: ['本地有绑定，但平台商户 tenant_ids 未包含该租户（不会删除）'],
      })
    }

    const summary = {
      create: rows.filter((r) => r.action === 'create').length,
      update: rows.filter((r) => r.action === 'update').length,
      rebind: rows.filter((r) => r.action === 'rebind').length,
      unchanged: rows.filter((r) => r.action === 'unchanged').length,
      localOnly: rows.filter((r) => r.action === 'local_only').length,
    }

    const previewId = newId()
    previewCache.set(previewId, {
      expiresAt: Date.now() + PREVIEW_TTL_MS,
      merchantId,
      platformMerchantId: localMerchant.platformMerchantId,
      rows,
      platformRecords: [...platformMap.values()],
    })

    crmLog('merchant-tenant-sync', 'preview done', {
      merchantId,
      platformTotal: platformTenantIds.length,
      ...summary,
    })

    return {
      previewId,
      merchantId,
      platformMerchantId: localMerchant.platformMerchantId,
      platformTotal: platformTenantIds.length,
      rows,
      summary,
    }
  },

  async commit(
    previewId: string,
    items: MerchantTenantSyncCommitItem[],
  ): Promise<MerchantTenantSyncCommitResult> {
    purgeExpiredPreviews()

    const cached = previewCache.get(previewId)
    if (!cached || cached.expiresAt <= Date.now()) {
      previewCache.delete(previewId)
      throw new Error('预览已过期，请重新拉取')
    }

    const { merchantId, platformMerchantId, rows, platformRecords } = cached
    const localMerchant = await db.query.merchant.findFirst({
      where: eq(merchant.id, merchantId),
      columns: { id: true, name: true },
    })
    if (!localMerchant) {
      throw new Error('商户不存在')
    }

    const actionableById = new Map(
      rows
        .filter((r) => r.action === 'create' || r.action === 'update' || r.action === 'rebind')
        .map((r) => [r.platformTenantId, r]),
    )

    // 仅处理客户端提交的 items：改绑行需用户显式勾选后才会出现在 items 中
    const assignmentMap = new Map(items.map((item) => [item.platformTenantId, item.customer]))
    const platformMap = new Map(platformRecords.map((r) => [String(r.id), r]))
    const allIds = items
      .map((item) => item.platformTenantId)
      .filter((id) => actionableById.has(id))

    if (allIds.length === 0) {
      throw new Error('没有可写入的变更（已绑定其他商户的租户需勾选「确认改绑」后才会改绑）')
    }

    const localMap = await loadLocalTenantsByPlatformIds(allIds)

    const traceId = crypto.randomUUID().slice(0, 8)
    let createdTenants = 0
    let updatedTenants = 0
    let reboundTenants = 0
    let createdCustomers = 0
    const errors: MerchantTenantSyncCommitResult['errors'] = []
    const importedTenants: MerchantTenantSyncCommitResult['importedTenants'] = []

    for (const platformTenantId of allIds) {
      try {
        const api = platformMap.get(platformTenantId)
        if (!api) {
          errors.push({ platformTenantId, message: '平台未返回该租户，请重新预览' })
          continue
        }

        const previewRow = rows.find((r) => r.platformTenantId === platformTenantId)
        if (previewRow?.warnings.some((w) => w.includes('不一致'))) {
          // still allow commit but merchantId is forced to current merchant
        }

        const fields = mapRecordToTenantFields(api)
        const local = localMap.get(platformTenantId)

        if (local) {
          const needsRebind = local.merchantId !== merchantId
          await db
            .update(billingTenant)
            .set({
              name: fields.name,
              phone: fields.phone,
              balance: fields.balance,
              credit_limit: fields.credit_limit,
              overdue_at: fields.overdue_at,
              platformRegisteredAt: fields.platformRegisteredAt,
              merchantId,
            })
            .where(eq(billingTenant.id, local.tenantId))

          if (needsRebind) reboundTenants++
          else updatedTenants++

          importedTenants.push({
            platformTenantId,
            tenantId: local.tenantId,
            tenantName: fields.name,
          })
          await writeBalanceSnapshotAfterImport({
            tenantId: local.tenantId,
            customerId: local.customerId,
            platformTenantId,
            balance: fields.balance,
            creditLimit: fields.credit_limit,
            traceId,
          })
          continue
        }

        const customerAssignment = assignmentMap.get(platformTenantId)
        if (!customerAssignment) {
          errors.push({ platformTenantId, message: '缺少客户关联配置' })
          continue
        }

        let createdTenantId: string | undefined
        let createdCustomerId: string | undefined

        await db.transaction(async (tx) => {
          let customerId: string

          if (customerAssignment.mode === 'existing') {
            const cust = await tx.query.customer.findFirst({
              where: eq(customer.id, customerAssignment.customerId),
              columns: { id: true },
            })
            if (!cust) throw new Error('所选客户不存在')
            customerId = cust.id
          } else {
            const name = customerAssignment.name.trim()
            if (!name) throw new Error('客户名称不能为空')
            customerId = newId()
            await tx.insert(customer).values({
              id: customerId,
              name,
              shortName: name,
              type: customerAssignment.type,
              status: 'active',
              contactPerson: customerAssignment.contactPerson?.trim() ?? '',
              contactPhone: customerAssignment.contactPhone?.trim() ?? '',
              contactEmail: '',
              industry: '',
              address: '',
            })
            createdCustomers++
          }

          const hasTenants = await tx.query.billingTenant.findFirst({
            where: eq(billingTenant.customerId, customerId),
            columns: { id: true },
          })

          const tenantId = newId()
          await tx.insert(billingTenant).values({
            id: tenantId,
            customerId,
            name: fields.name,
            platformTenantId,
            merchantId,
            phone: fields.phone,
            isDefault: !hasTenants,
            status: 'active',
            balance: fields.balance,
            overdue_at: fields.overdue_at,
            credit_limit: fields.credit_limit,
            platformRegisteredAt: fields.platformRegisteredAt,
          })
          if (!hasTenants) {
            await writeCustomerPlatformRegisteredAtIfEmpty(
              tx,
              customerId,
              fields.platformRegisteredAt,
            )
          }
          createdTenants++
          createdTenantId = tenantId
          createdCustomerId = customerId
          importedTenants.push({
            platformTenantId,
            tenantId,
            tenantName: fields.name,
          })
        })

        if (createdTenantId && createdCustomerId) {
          await writeBalanceSnapshotAfterImport({
            tenantId: createdTenantId,
            customerId: createdCustomerId,
            platformTenantId,
            balance: fields.balance,
            creditLimit: fields.credit_limit,
            traceId,
          })
        }
      } catch (e) {
        crmWarn('merchant-tenant-sync', 'commit row failed', {
          traceId,
          platformTenantId,
          err: e instanceof Error ? e.message : String(e),
        })
        errors.push({
          platformTenantId,
          message: e instanceof Error ? e.message : '同步失败',
        })
      }
    }

    previewCache.delete(previewId)

    await appendSyncActivity(
      merchantId,
      '同步平台租户',
      `平台商户 ${platformMerchantId}：新建 ${createdTenants}、更新 ${updatedTenants}、改绑 ${reboundTenants}`,
    )

    crmLog('merchant-tenant-sync', 'commit done', {
      traceId,
      merchantId,
      createdTenants,
      updatedTenants,
      reboundTenants,
      createdCustomers,
      errors: errors.length,
    })

    return {
      createdTenants,
      updatedTenants,
      reboundTenants,
      createdCustomers,
      importedTenants,
      errors,
    }
  },

  /**
   * 定时任务用：按平台商户 tenant_ids 自动建档/更新租户。
   * 新建租户时自动创建客户（与裸金属自动建档口径一致），无需人工确认。
   */
  async autoSyncFromPlatformTenantIds(input: {
    merchantId: string
    platformMerchantId: number
    platformTenantIds: string[]
  }): Promise<MerchantTenantSyncAutoResult> {
    const { merchantId, platformMerchantId } = input
    const platformTenantIds = [
      ...new Set(input.platformTenantIds.map((id) => id.trim()).filter(Boolean)),
    ]

    const localUnderMerchantEarly = await loadLocalTenantsByMerchantId(merchantId)
    const localTenantIdSetEarly = new Set(localUnderMerchantEarly.map((row) => row.tenantId))

    if (isPlatformMerchantTenantImportExcluded(platformMerchantId)) {
      crmLog('merchant-tenant-sync', 'auto sync skipped excluded merchant', {
        merchantId,
        platformMerchantId,
      })
      return {
        merchantId,
        platformMerchantId,
        createdTenants: 0,
        updatedTenants: 0,
        reboundTenants: 0,
        skippedRebinds: 0,
        createdCustomers: 0,
        localTenantIds: [...localTenantIdSetEarly],
        errors: [],
      }
    }

    const localMerchant = await db.query.merchant.findFirst({
      where: eq(merchant.id, merchantId),
      columns: { id: true, name: true },
    })
    if (!localMerchant) {
      throw new Error('商户不存在')
    }

    let createdTenants = 0
    let updatedTenants = 0
    let reboundTenants = 0
    let skippedRebinds = 0
    let createdCustomers = 0
    const errors: MerchantTenantSyncAutoResult['errors'] = []
    const localTenantIdSet = new Set<string>()

    const localUnderMerchant = await loadLocalTenantsByMerchantId(merchantId)
    for (const row of localUnderMerchant) {
      localTenantIdSet.add(row.tenantId)
    }

    if (platformTenantIds.length === 0) {
      return {
        merchantId,
        platformMerchantId,
        createdTenants,
        updatedTenants,
        reboundTenants,
        skippedRebinds,
        createdCustomers,
        localTenantIds: [...localTenantIdSet],
        errors,
      }
    }

    let platformMap: Map<string, PlatformTenantApiRecord>
    try {
      platformMap = await fetchPlatformTenantsByIds(platformTenantIds)
    } catch (e) {
      if (e instanceof SuanliOpenApiError) throw e
      throw new Error(e instanceof Error ? e.message : '拉取平台租户失败')
    }

    const localMap = await loadLocalTenantsByPlatformIds(platformTenantIds)
    const traceId = crypto.randomUUID().slice(0, 8)

    for (const platformTenantId of platformTenantIds) {
      try {
        const api = platformMap.get(platformTenantId)
        if (!api) {
          errors.push({ platformTenantId, message: '平台未返回该租户' })
          continue
        }

        const fields = mapRecordToTenantFields(api)
        const local = localMap.get(platformTenantId)

        if (local) {
          // 定时任务不改绑：已归属其他商户的租户跳过，留给人工在界面确认
          if (local.merchantId !== merchantId) {
            skippedRebinds++
            crmLog('merchant-tenant-sync', 'auto sync skip rebind', {
              traceId,
              merchantId,
              platformTenantId,
              currentMerchantId: local.merchantId,
              currentMerchantName: local.merchantName,
            })
            continue
          }

          await db
            .update(billingTenant)
            .set({
              name: fields.name,
              phone: fields.phone,
              balance: fields.balance,
              credit_limit: fields.credit_limit,
              overdue_at: fields.overdue_at,
              platformRegisteredAt: fields.platformRegisteredAt,
            })
            .where(eq(billingTenant.id, local.tenantId))

          updatedTenants++
          localTenantIdSet.add(local.tenantId)
          await writeBalanceSnapshotAfterImport({
            tenantId: local.tenantId,
            customerId: local.customerId,
            platformTenantId,
            balance: fields.balance,
            creditLimit: fields.credit_limit,
            traceId,
          })
          continue
        }

        const customerName =
          api.company_name?.trim() ||
          resolveTenantName(api) ||
          `租户-${platformTenantId}`

        let createdTenantId: string | undefined
        let createdCustomerId: string | undefined

        await db.transaction(async (tx) => {
          const customerId = newId()
          await tx.insert(customer).values({
            id: customerId,
            name: customerName,
            shortName: customerName.slice(0, 64),
            type: 'B',
            status: 'active',
            contactPerson: api.contact_user?.trim() ?? '',
            contactPhone: api.contact_phone?.trim() || api.admin_phone?.trim() || '',
            contactEmail: '',
            industry: '',
            address: '',
          })
          createdCustomers++

          const tenantId = newId()
          await tx.insert(billingTenant).values({
            id: tenantId,
            customerId,
            name: fields.name,
            platformTenantId,
            merchantId,
            phone: fields.phone,
            isDefault: true,
            status: 'active',
            balance: fields.balance,
            overdue_at: fields.overdue_at,
            credit_limit: fields.credit_limit,
            platformRegisteredAt: fields.platformRegisteredAt,
          })
          await writeCustomerPlatformRegisteredAtIfEmpty(
            tx,
            customerId,
            fields.platformRegisteredAt,
          )
          createdTenants++
          createdTenantId = tenantId
          createdCustomerId = customerId
        })

        if (createdTenantId && createdCustomerId) {
          localTenantIdSet.add(createdTenantId)
          await writeBalanceSnapshotAfterImport({
            tenantId: createdTenantId,
            customerId: createdCustomerId,
            platformTenantId,
            balance: fields.balance,
            creditLimit: fields.credit_limit,
            traceId,
          })
        }
      } catch (e) {
        crmWarn('merchant-tenant-sync', 'auto sync row failed', {
          traceId,
          merchantId,
          platformTenantId,
          err: e instanceof Error ? e.message : String(e),
        })
        errors.push({
          platformTenantId,
          message: e instanceof Error ? e.message : '自动同步失败',
        })
      }
    }

    await appendSyncActivity(
      merchantId,
      '定时同步平台租户',
      `平台商户 ${platformMerchantId}：新建 ${createdTenants}、更新 ${updatedTenants}、跳过改绑 ${skippedRebinds}`,
    )

    crmLog('merchant-tenant-sync', 'auto sync done', {
      traceId,
      merchantId,
      platformMerchantId,
      createdTenants,
      updatedTenants,
      reboundTenants,
      skippedRebinds,
      createdCustomers,
      errors: errors.length,
    })

    return {
      merchantId,
      platformMerchantId,
      createdTenants,
      updatedTenants,
      reboundTenants,
      skippedRebinds,
      createdCustomers,
      localTenantIds: [...localTenantIdSet],
      errors,
    }
  },
}
