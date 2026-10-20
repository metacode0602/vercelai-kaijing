import { db } from '@/lib/db'
import { staffDataAccess } from '@/lib/server/dataaccess/crm/staff'
import {
  mapMerchantDatacenterRegionRow,
  mapMerchantPlatformDatacenter,
} from '@/lib/server/mappers/merchant'
import type {
  MerchantCardTypeRef,
  MerchantDatacenterRegion,
  MerchantPlatformDatacenter,
  MerchantRegionCardType,
  MerchantRegionStatus,
} from '@/lib/types/merchant'
import {
  dataCenter,
  gpuCardType,
  merchant,
  merchantActivity,
  merchantDatacenterCardType,
  merchantDatacenterRegion,
  supplierGpuInventory,
  userStaff,
} from '@workspace/db/schema'
import { and, asc, count, eq, gt, inArray, isNull, sql } from 'drizzle-orm'

function newId() {
  return crypto.randomUUID()
}

function normalizeDatacenterStatus(
  status: string,
): MerchantPlatformDatacenter['status'] {
  if (status === 'online' || status === 'offline' || status === 'maintenance') {
    return status
  }
  return 'offline'
}

function resolveRegionCode(row: {
  containerInstanceRegion: string | null
  code: string
}): string {
  return row.containerInstanceRegion?.trim() || row.code
}

async function resolveStaff(user: {
  id: string
  email?: string | null
  name?: string | null
}) {
  const staffId = await staffDataAccess.resolveStaffIdForAuthUser(user)
  if (!staffId) throw new Error('当前账号未关联员工信息')
  const staff = await db.query.userStaff.findFirst({
    where: eq(userStaff.id, staffId),
    columns: { id: true, displayName: true },
  })
  if (!staff) throw new Error('员工信息不存在')
  return { staffId, displayName: staff.displayName }
}

async function assertMerchantExists(merchantId: string) {
  const row = await db.query.merchant.findFirst({
    where: eq(merchant.id, merchantId),
    columns: { id: true },
  })
  if (!row) throw new Error('商户不存在')
}

async function loadConfiguredDataCenterIds(merchantId: string): Promise<Set<string>> {
  const rows = await db
    .select({ dataCenterId: merchantDatacenterRegion.dataCenterId })
    .from(merchantDatacenterRegion)
    .where(
      and(
        eq(merchantDatacenterRegion.merchantId, merchantId),
        isNull(merchantDatacenterRegion.effectiveTo),
      ),
    )
  return new Set(rows.map((r) => r.dataCenterId))
}

async function loadDefaultCardTypesForDataCenter(
  dataCenterId: string,
): Promise<MerchantCardTypeRef[]> {
  const rows = await db
    .select({
      id: gpuCardType.id,
      name: gpuCardType.name,
      manufacturer: gpuCardType.manufacturer,
      memoryGB: gpuCardType.memoryGb,
    })
    .from(supplierGpuInventory)
    .innerJoin(gpuCardType, eq(supplierGpuInventory.gpuCardTypeId, gpuCardType.id))
    .where(
      and(
        eq(supplierGpuInventory.dataCenterId, dataCenterId),
        gt(supplierGpuInventory.quantity, 0),
      ),
    )
    .orderBy(asc(gpuCardType.name))

  const seen = new Set<string>()
  const result: MerchantCardTypeRef[] = []
  for (const row of rows) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    result.push({
      id: row.id,
      name: row.name,
      manufacturer: row.manufacturer ?? '',
      memoryGB: row.memoryGB ?? 0,
    })
  }
  return result
}

async function loadConfiguredCardTypeStatusesForRegions(
  regionIds: string[],
): Promise<Map<string, Map<string, 'enabled' | 'disabled'>>> {
  const map = new Map<string, Map<string, 'enabled' | 'disabled'>>()
  if (regionIds.length === 0) return map

  const rows = await db
    .select({
      regionId: merchantDatacenterCardType.merchantDatacenterRegionId,
      gpuCardTypeId: merchantDatacenterCardType.gpuCardTypeId,
      status: merchantDatacenterCardType.status,
    })
    .from(merchantDatacenterCardType)
    .where(inArray(merchantDatacenterCardType.merchantDatacenterRegionId, regionIds))

  for (const row of rows) {
    const status = row.status === 'enabled' ? 'enabled' : 'disabled'
    const regionMap = map.get(row.regionId) ?? new Map<string, 'enabled' | 'disabled'>()
    regionMap.set(row.gpuCardTypeId, status)
    map.set(row.regionId, regionMap)
  }
  return map
}

function buildRegionCardTypes(
  available: MerchantCardTypeRef[],
  configured: Map<string, 'enabled' | 'disabled'> | undefined,
): MerchantRegionCardType[] {
  const hasConfigured = configured !== undefined && configured.size > 0
  return available.map((card) => ({
    ...card,
    enabled: hasConfigured ? configured.get(card.id) === 'enabled' : true,
  }))
}

function enabledCardTypesFromAvailable(
  availableCardTypes: MerchantRegionCardType[],
): MerchantCardTypeRef[] {
  return availableCardTypes.filter((card) => card.enabled)
}

export type MerchantRegionCreateInput = {
  dataCenterId: string
  effectiveFrom: string
  displayName?: string
  status: MerchantRegionStatus
  /** null = 不限（写入 -1） */
  availableGpuQuota: number | null
}

export type MerchantRegionUpdateInput = {
  effectiveFrom: string
  displayName?: string
  status: MerchantRegionStatus
  /** null = 不限（写入 -1） */
  availableGpuQuota: number | null
}

export const merchantRegionDataAccess = {
  async listByMerchantId(merchantId: string): Promise<MerchantDatacenterRegion[]> {
    await assertMerchantExists(merchantId)

    const rows = await db
      .select({
        region: merchantDatacenterRegion,
        dataCenterName: dataCenter.name,
        location: dataCenter.location,
      })
      .from(merchantDatacenterRegion)
      .innerJoin(dataCenter, eq(merchantDatacenterRegion.dataCenterId, dataCenter.id))
      .where(
        and(
          eq(merchantDatacenterRegion.merchantId, merchantId),
          isNull(merchantDatacenterRegion.effectiveTo),
        ),
      )
      .orderBy(asc(merchantDatacenterRegion.sortOrder), asc(dataCenter.name))

    const regionIds = rows.map((r) => r.region.id)
    const configuredStatuses = await loadConfiguredCardTypeStatusesForRegions(regionIds)

    const result: MerchantDatacenterRegion[] = []
    for (const row of rows) {
      const defaultAvailable = await loadDefaultCardTypesForDataCenter(row.region.dataCenterId)
      const availableCardTypes = buildRegionCardTypes(
        defaultAvailable,
        configuredStatuses.get(row.region.id),
      )
      const enabledCardTypes = enabledCardTypesFromAvailable(availableCardTypes)
      result.push(
        mapMerchantDatacenterRegionRow(row.region, {
          dataCenterName: row.dataCenterName,
          location: row.location ?? '',
          enabledCardTypes,
          availableCardTypes,
          usedGpuCount: 0,
        }),
      )
    }
    return result
  },

  async listAvailableDatacenters(merchantId: string): Promise<MerchantPlatformDatacenter[]> {
    await assertMerchantExists(merchantId)

    const configuredIds = await loadConfiguredDataCenterIds(merchantId)
    const rows = await db
      .select({
        id: dataCenter.id,
        name: dataCenter.name,
        code: dataCenter.code,
        location: dataCenter.location,
        containerInstanceRegion: dataCenter.containerInstanceRegion,
        status: dataCenter.status,
      })
      .from(dataCenter)
      .orderBy(asc(dataCenter.name))

    return rows
      .filter((row) => !configuredIds.has(row.id))
      .map((row) =>
        mapMerchantPlatformDatacenter({
          id: row.id,
          name: row.name,
          code: row.code,
          location: row.location ?? '',
          regionCode: resolveRegionCode(row),
          status: normalizeDatacenterStatus(row.status),
        }),
      )
  },

  async create(
    merchantId: string,
    input: MerchantRegionCreateInput,
    user: { id: string; email?: string | null; name?: string | null },
  ): Promise<MerchantDatacenterRegion> {
    await assertMerchantExists(merchantId)

    const [dc] = await db
      .select({
        id: dataCenter.id,
        name: dataCenter.name,
        code: dataCenter.code,
        location: dataCenter.location,
        containerInstanceRegion: dataCenter.containerInstanceRegion,
      })
      .from(dataCenter)
      .where(eq(dataCenter.id, input.dataCenterId))
      .limit(1)

    if (!dc) throw new Error('所选机房不存在')

    const configuredIds = await loadConfiguredDataCenterIds(merchantId)
    if (configuredIds.has(input.dataCenterId)) {
      throw new Error('该机房已配置给本商户')
    }

    const { staffId, displayName } = await resolveStaff(user)
    const regionId = newId()
    const availableGpuQuota = input.availableGpuQuota === null ? -1 : input.availableGpuQuota
    const defaultCardTypes = await loadDefaultCardTypesForDataCenter(input.dataCenterId)

    await db.transaction(async (tx) => {
      await tx.insert(merchantDatacenterRegion).values({
        id: regionId,
        merchantId,
        dataCenterId: input.dataCenterId,
        displayName: input.displayName?.trim() || null,
        regionCode: resolveRegionCode(dc),
        status: input.status,
        availableGpuQuota,
        sortOrder: 0,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: null,
        updatedByStaffId: staffId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      if (defaultCardTypes.length > 0) {
        await tx.insert(merchantDatacenterCardType).values(
          defaultCardTypes.map((card) => ({
            id: newId(),
            merchantDatacenterRegionId: regionId,
            gpuCardTypeId: card.id,
            status: 'enabled',
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        )
      }

      await tx.insert(merchantActivity).values({
        id: newId(),
        merchantId,
        type: 'region_added',
        title: '添加机房区域',
        description: `已添加机房区域：${input.displayName?.trim() || dc.name}`,
        authorStaffId: staffId,
        authorName: displayName,
        authorRole: 'staff',
        refDomain: 'merchant_datacenter_region',
        refId: regionId,
        occurredAt: new Date(),
        createdAt: new Date(),
      })
    })

    const [created] = await db
      .select({
        region: merchantDatacenterRegion,
        dataCenterName: dataCenter.name,
        location: dataCenter.location,
      })
      .from(merchantDatacenterRegion)
      .innerJoin(dataCenter, eq(merchantDatacenterRegion.dataCenterId, dataCenter.id))
      .where(eq(merchantDatacenterRegion.id, regionId))
      .limit(1)

    if (!created) throw new Error('创建区域失败')

    return mapMerchantDatacenterRegionRow(created.region, {
      dataCenterName: created.dataCenterName,
      location: created.location ?? '',
      enabledCardTypes: defaultCardTypes,
      availableCardTypes: defaultCardTypes.map((card) => ({ ...card, enabled: true })),
      usedGpuCount: 0,
    })
  },

  async batchCreate(
    merchantId: string,
    rows: MerchantRegionCreateInput[],
    user: { id: string; email?: string | null; name?: string | null },
  ): Promise<MerchantDatacenterRegion[]> {
    if (rows.length === 0) throw new Error('请至少导入一条区域')

    await assertMerchantExists(merchantId)

    const dataCenterIds = rows.map((row) => row.dataCenterId)
    if (new Set(dataCenterIds).size !== dataCenterIds.length) {
      throw new Error('导入列表中存在重复机房')
    }

    const configuredIds = await loadConfiguredDataCenterIds(merchantId)
    const { staffId, displayName: staffDisplayName } = await resolveStaff(user)

    const dcRows = await db
      .select({
        id: dataCenter.id,
        name: dataCenter.name,
        code: dataCenter.code,
        location: dataCenter.location,
        containerInstanceRegion: dataCenter.containerInstanceRegion,
      })
      .from(dataCenter)
      .where(inArray(dataCenter.id, dataCenterIds))

    const dcMap = new Map(dcRows.map((row) => [row.id, row]))

    for (const row of rows) {
      const dc = dcMap.get(row.dataCenterId)
      if (!dc) throw new Error('所选机房不存在')
      if (configuredIds.has(row.dataCenterId)) {
        throw new Error(`机房「${dc.name}」已配置给本商户`)
      }
    }

    const cardTypesByDataCenter = new Map<string, MerchantCardTypeRef[]>()
    for (const row of rows) {
      cardTypesByDataCenter.set(
        row.dataCenterId,
        await loadDefaultCardTypesForDataCenter(row.dataCenterId),
      )
    }

    const regionIds: string[] = []

    await db.transaction(async (tx) => {
      for (const input of rows) {
        const dc = dcMap.get(input.dataCenterId)!
        const regionId = newId()
        regionIds.push(regionId)
        configuredIds.add(input.dataCenterId)

        const availableGpuQuota = input.availableGpuQuota === null ? -1 : input.availableGpuQuota
        const defaultCardTypes = cardTypesByDataCenter.get(input.dataCenterId) ?? []
        const regionDisplayName = input.displayName?.trim() || null

        await tx.insert(merchantDatacenterRegion).values({
          id: regionId,
          merchantId,
          dataCenterId: input.dataCenterId,
          displayName: regionDisplayName,
          regionCode: resolveRegionCode(dc),
          status: input.status,
          availableGpuQuota,
          sortOrder: 0,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: null,
          updatedByStaffId: staffId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })

        if (defaultCardTypes.length > 0) {
          await tx.insert(merchantDatacenterCardType).values(
            defaultCardTypes.map((card) => ({
              id: newId(),
              merchantDatacenterRegionId: regionId,
              gpuCardTypeId: card.id,
              status: 'enabled',
              createdAt: new Date(),
              updatedAt: new Date(),
            })),
          )
        }

        await tx.insert(merchantActivity).values({
          id: newId(),
          merchantId,
          type: 'region_added',
          title: '导入机房区域',
          description: `已导入机房区域：${regionDisplayName || dc.name}`,
          authorStaffId: staffId,
          authorName: staffDisplayName,
          authorRole: 'staff',
          refDomain: 'merchant_datacenter_region',
          refId: regionId,
          occurredAt: new Date(),
          createdAt: new Date(),
        })
      }
    })

    const createdRows = await db
      .select({
        region: merchantDatacenterRegion,
        dataCenterName: dataCenter.name,
        location: dataCenter.location,
      })
      .from(merchantDatacenterRegion)
      .innerJoin(dataCenter, eq(merchantDatacenterRegion.dataCenterId, dataCenter.id))
      .where(inArray(merchantDatacenterRegion.id, regionIds))

    const createdById = new Map(createdRows.map((row) => [row.region.id, row]))

    return regionIds.map((regionId) => {
      const created = createdById.get(regionId)
      if (!created) throw new Error('创建区域失败')

      const dataCenterId = created.region.dataCenterId
      const defaultCardTypes = cardTypesByDataCenter.get(dataCenterId) ?? []

      return mapMerchantDatacenterRegionRow(created.region, {
        dataCenterName: created.dataCenterName,
        location: created.location ?? '',
        enabledCardTypes: defaultCardTypes,
        availableCardTypes: defaultCardTypes.map((card) => ({ ...card, enabled: true })),
        usedGpuCount: 0,
      })
    })
  },

  async update(
    merchantId: string,
    regionId: string,
    input: MerchantRegionUpdateInput,
    user: { id: string; email?: string | null; name?: string | null },
  ): Promise<MerchantDatacenterRegion> {
    await assertMerchantExists(merchantId)

    const [regionRow] = await db
      .select({
        region: merchantDatacenterRegion,
        dataCenterName: dataCenter.name,
        location: dataCenter.location,
      })
      .from(merchantDatacenterRegion)
      .innerJoin(dataCenter, eq(merchantDatacenterRegion.dataCenterId, dataCenter.id))
      .where(
        and(
          eq(merchantDatacenterRegion.id, regionId),
          eq(merchantDatacenterRegion.merchantId, merchantId),
          isNull(merchantDatacenterRegion.effectiveTo),
        ),
      )
      .limit(1)

    if (!regionRow) throw new Error('区域不存在或已失效')

    const availableGpuQuota = input.availableGpuQuota === null ? -1 : input.availableGpuQuota
    const { staffId, displayName: staffDisplayName } = await resolveStaff(user)
    const now = new Date()
    const regionLabel =
      input.displayName?.trim() || regionRow.region.displayName?.trim() || regionRow.dataCenterName

    await db.transaction(async (tx) => {
      await tx
        .update(merchantDatacenterRegion)
        .set({
          displayName: input.displayName?.trim() || null,
          status: input.status,
          availableGpuQuota,
          effectiveFrom: input.effectiveFrom,
          updatedByStaffId: staffId,
          updatedAt: now,
        })
        .where(eq(merchantDatacenterRegion.id, regionId))

      await tx.insert(merchantActivity).values({
        id: newId(),
        merchantId,
        type: 'info_updated',
        title: '更新机房区域',
        description: `已更新机房区域：${regionLabel}`,
        authorStaffId: staffId,
        authorName: staffDisplayName,
        authorRole: 'staff',
        refDomain: 'merchant_datacenter_region',
        refId: regionId,
        occurredAt: now,
        createdAt: now,
      })
    })

    const configuredStatuses = await loadConfiguredCardTypeStatusesForRegions([regionId])
    const defaultAvailable = await loadDefaultCardTypesForDataCenter(regionRow.region.dataCenterId)
    const availableCardTypes = buildRegionCardTypes(
      defaultAvailable,
      configuredStatuses.get(regionId),
    )
    const enabledCardTypes = enabledCardTypesFromAvailable(availableCardTypes)

    const [updated] = await db
      .select({ region: merchantDatacenterRegion })
      .from(merchantDatacenterRegion)
      .where(eq(merchantDatacenterRegion.id, regionId))
      .limit(1)

    if (!updated) throw new Error('更新区域失败')

    return mapMerchantDatacenterRegionRow(updated.region, {
      dataCenterName: regionRow.dataCenterName,
      location: regionRow.location ?? '',
      enabledCardTypes,
      availableCardTypes,
      usedGpuCount: 0,
    })
  },

  async updateEnabledCardTypes(
    merchantId: string,
    regionId: string,
    enabledCardTypeIds: string[],
    user: { id: string; email?: string | null; name?: string | null },
  ): Promise<MerchantDatacenterRegion> {
    await assertMerchantExists(merchantId)

    const enabledIds = [...new Set(enabledCardTypeIds.filter(Boolean))]
    if (enabledIds.length === 0) {
      throw new Error('至少须保留一种启用卡型')
    }

    const [regionRow] = await db
      .select({
        region: merchantDatacenterRegion,
        dataCenterName: dataCenter.name,
        location: dataCenter.location,
      })
      .from(merchantDatacenterRegion)
      .innerJoin(dataCenter, eq(merchantDatacenterRegion.dataCenterId, dataCenter.id))
      .where(
        and(
          eq(merchantDatacenterRegion.id, regionId),
          eq(merchantDatacenterRegion.merchantId, merchantId),
          isNull(merchantDatacenterRegion.effectiveTo),
        ),
      )
      .limit(1)

    if (!regionRow) throw new Error('区域不存在或已失效')

    const available = await loadDefaultCardTypesForDataCenter(regionRow.region.dataCenterId)
    const availableIdSet = new Set(available.map((card) => card.id))
    if (available.length === 0) {
      throw new Error('该机房暂无可售卡型')
    }

    for (const id of enabledIds) {
      if (!availableIdSet.has(id)) {
        throw new Error('包含无效的卡型')
      }
    }

    const { staffId } = await resolveStaff(user)
    const now = new Date()

    await db.transaction(async (tx) => {
      const existing = await tx
        .select({
          id: merchantDatacenterCardType.id,
          gpuCardTypeId: merchantDatacenterCardType.gpuCardTypeId,
        })
        .from(merchantDatacenterCardType)
        .where(eq(merchantDatacenterCardType.merchantDatacenterRegionId, regionId))

      const existingByCardId = new Map(existing.map((row) => [row.gpuCardTypeId, row.id]))

      for (const card of available) {
        const status = enabledIds.includes(card.id) ? 'enabled' : 'disabled'
        const existingId = existingByCardId.get(card.id)
        if (existingId) {
          await tx
            .update(merchantDatacenterCardType)
            .set({ status, updatedAt: now })
            .where(eq(merchantDatacenterCardType.id, existingId))
        } else {
          await tx.insert(merchantDatacenterCardType).values({
            id: newId(),
            merchantDatacenterRegionId: regionId,
            gpuCardTypeId: card.id,
            status,
            createdAt: now,
            updatedAt: now,
          })
        }
      }

      await tx
        .update(merchantDatacenterRegion)
        .set({ updatedByStaffId: staffId, updatedAt: now })
        .where(eq(merchantDatacenterRegion.id, regionId))
    })

    const availableCardTypes = buildRegionCardTypes(
      available,
      new Map(available.map((card) => [card.id, enabledIds.includes(card.id) ? 'enabled' : 'disabled'])),
    )
    const enabledCardTypes = enabledCardTypesFromAvailable(availableCardTypes)

    return mapMerchantDatacenterRegionRow(regionRow.region, {
      dataCenterName: regionRow.dataCenterName,
      location: regionRow.location ?? '',
      enabledCardTypes,
      availableCardTypes,
      usedGpuCount: 0,
    })
  },

  async delete(
    merchantId: string,
    regionId: string,
    user: { id: string; email?: string | null; name?: string | null },
  ): Promise<void> {
    await assertMerchantExists(merchantId)

    const [regionRow] = await db
      .select({
        region: merchantDatacenterRegion,
        dataCenterName: dataCenter.name,
      })
      .from(merchantDatacenterRegion)
      .innerJoin(dataCenter, eq(merchantDatacenterRegion.dataCenterId, dataCenter.id))
      .where(
        and(
          eq(merchantDatacenterRegion.id, regionId),
          eq(merchantDatacenterRegion.merchantId, merchantId),
          isNull(merchantDatacenterRegion.effectiveTo),
        ),
      )
      .limit(1)

    if (!regionRow) throw new Error('区域不存在或已删除')

    const { staffId, displayName } = await resolveStaff(user)
    const now = new Date()
    const effectiveTo = now.toISOString().slice(0, 10)
    const regionLabel =
      regionRow.region.displayName?.trim() || regionRow.dataCenterName

    await db.transaction(async (tx) => {
      await tx
        .update(merchantDatacenterRegion)
        .set({
          effectiveTo,
          updatedByStaffId: staffId,
          updatedAt: now,
        })
        .where(eq(merchantDatacenterRegion.id, regionId))

      await tx.insert(merchantActivity).values({
        id: newId(),
        merchantId,
        type: 'region_removed',
        title: '移除机房区域',
        description: `已移除机房区域：${regionLabel}`,
        authorStaffId: staffId,
        authorName: displayName,
        authorRole: 'staff',
        refDomain: 'merchant_datacenter_region',
        refId: regionId,
        occurredAt: now,
        createdAt: now,
      })
    })
  },

  async countOpenRegionsByMerchantId(merchantId: string): Promise<number> {
    const [row] = await db
      .select({ count: count() })
      .from(merchantDatacenterRegion)
      .where(
        and(
          eq(merchantDatacenterRegion.merchantId, merchantId),
          eq(merchantDatacenterRegion.status, 'open'),
          isNull(merchantDatacenterRegion.effectiveTo),
        ),
      )
    return row?.count ?? 0
  },

  async countRegionsByMerchantId(
    merchantId: string,
  ): Promise<{ totalCount: number; openCount: number }> {
    const [row] = await db
      .select({
        totalCount: count(),
        openCount: sql<number>`count(*) filter (where ${merchantDatacenterRegion.status} = 'open')`,
      })
      .from(merchantDatacenterRegion)
      .where(
        and(
          eq(merchantDatacenterRegion.merchantId, merchantId),
          isNull(merchantDatacenterRegion.effectiveTo),
        ),
      )
    return {
      totalCount: Number(row?.totalCount ?? 0),
      openCount: Number(row?.openCount ?? 0),
    }
  },
}
