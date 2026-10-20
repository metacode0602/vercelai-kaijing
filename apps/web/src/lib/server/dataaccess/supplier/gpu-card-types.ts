import { db } from '@/lib/db'
import { resolveGpuCardTypeRole } from '@/lib/supplier/gpu-card-type-metrics'
import type { GPUCardType } from '@/lib/data/types'
import { mapGpuCardTypeRow } from '@/lib/server/mappers/supply'
import { supplierLog } from '@/lib/server/dataaccess/supplier/logger'
import type {
  GpuCardTypeUpdateInput,
  GpuCardTypeUpsertInput,
} from '@/lib/server/dataaccess/supplier/gpu-card-types-types'
import { datacenterCardTypeSpecsDataAccess } from '@/lib/server/dataaccess/supplier/datacenter-card-type-specs'
import { datacenterInfrastructureDataAccess } from '@/lib/server/dataaccess/supplier/datacenter-infrastructure'
import { deviceSpecPreviewLines } from '@/lib/supplier/device-spec-utils'
import { platformPricingDataAccess } from '@/lib/server/dataaccess/platform-pricing'
import {
  PLATFORM_PRICE_SLOTS,
} from '@/lib/platform-pricing/transforms'
import {
  getCurrentPlatformRecords,
} from '@/lib/platform-pricing/periods'
import {
  platformBillingUnitNames,
  platformProductLineNames,
  type PlatformBillingUnit,
  type PlatformCardPriceRecord,
  type PlatformProductLine,
} from '@/lib/types/platform-pricing'
import {
  dataCenter,
  gpuCardType,
  platformCardListPrice,
  platformCardPriceRecord,
  supplier,
  supplierDatacenterSellPrice,
  supplierGpuInventory,
  supplierPricingRecord,
} from '@workspace/db/schema'
import { and, count, eq, gt, ilike, isNull, ne, or } from 'drizzle-orm'

const BARE_METAL_UNITS: PlatformBillingUnit[] = ['hour', 'day', 'week', 'month']

const CARD_HOUR_PRODUCT_LINES: PlatformProductLine[] = [
  'elastic_service',
  'cloud_vm',
  'job',
  'spot',
]

export type CardTypeListPriceRow = {
  productLine: PlatformProductLine
  productLineLabel: string
  billingUnit: PlatformBillingUnit
  billingUnitLabel: string
  sellPrice: number | null
  currency: string
  status: string | null
  periodId: string | null
  effectiveFrom: string | null
  effectiveTo: string | null
  recordId: string | null
}

export type CardTypeDatacenterSummaryRow = {
  dataCenterId: string
  dataCenterName: string
  supplierId: string
  supplierName: string
  location: string | null
  dcStatus: string
  deviceCount: number
  availableCount: number
  inventoryId: string | null
  unitLabel: '卡' | '台'
}

export type BareMetalPriceSource = 'datacenter' | 'platform_fallback' | 'unset'

export type BareMetalPriceRow = {
  billingUnit: PlatformBillingUnit
  billingUnitLabel: string
  sellPrice: number | null
  currency: string
  source: BareMetalPriceSource
  sourceLabel: string
}

export type CardHourPriceRow = {
  productLine: PlatformProductLine
  productLineLabel: string
  sellPrice: number | null
  currency: string
  source: BareMetalPriceSource
  sourceLabel: string
}

export type GpuCardTypeDetailPageData = {
  card: GPUCardType & { usageCount: number }
  listPrices: CardTypeListPriceRow[]
  datacenters: CardTypeDatacenterSummaryRow[]
}

export type GpuCardTypeDatacenterDetailData = {
  dataCenterId: string
  dataCenterName: string
  supplierId: string
  supplierName: string
  cardTypeId: string
  cardTypeName: string
  unitLabel: '卡' | '台'
  deviceSpec: {
    text: string | null
    lines: string[]
    remark: string | null
    hasAny: boolean
  }
  infrastructure: {
    bandwidthLines: string[]
    networkLines: string[]
    storageLines: string[]
    hasAny: boolean
  }
  bareMetalPrices: BareMetalPriceRow[]
  cardHourPrices: CardHourPriceRow[]
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function unitLabelForRole(deviceRole: string | null | undefined): '卡' | '台' {
  return deviceRole === 'infra' ? '台' : '卡'
}

function bareMetalSourceLabel(source: BareMetalPriceSource): string {
  if (source === 'datacenter') return '机房定价'
  if (source === 'platform_fallback') return '平台刊例（回退）'
  return '未配置'
}

function buildCurrentListPrices(
  records: PlatformCardPriceRecord[],
  cardTypeId: string,
): CardTypeListPriceRow[] {
  const current = getCurrentPlatformRecords(records, cardTypeId)
  const byKey = new Map(current.map((r) => [`${r.productLine}:${r.billingUnit}`, r]))

  return PLATFORM_PRICE_SLOTS.map(({ productLine, billingUnit }) => {
    const record = byKey.get(`${productLine}:${billingUnit}`)
    return {
      productLine,
      productLineLabel: platformProductLineNames[productLine],
      billingUnit,
      billingUnitLabel:
        productLine === 'bare_metal'
          ? platformBillingUnitNames[billingUnit]
          : '卡时',
      sellPrice: record?.sellPrice ?? null,
      currency: record?.currency ?? 'CNY',
      status: record?.status ?? null,
      periodId: record?.periodId ?? null,
      effectiveFrom: record?.effectiveFrom ?? null,
      effectiveTo: record?.effectiveTo ?? null,
      recordId: record?.id ?? null,
    }
  })
}
function newId() {
  return crypto.randomUUID()
}

export type GpuCardTypeListFilters = {
  search?: string
  status?: 'all' | 'active' | 'disabled'
  deviceRoleFilter?: 'all' | 'gpu' | 'cpu'
}

async function countPricingUsage(gpuCardTypeId: string): Promise<number> {
  const [pricingRow] = await db
    .select({ total: count() })
    .from(supplierPricingRecord)
    .where(eq(supplierPricingRecord.gpuCardTypeId, gpuCardTypeId))

  const [platformRow] = await db
    .select({ total: count() })
    .from(platformCardPriceRecord)
    .where(eq(platformCardPriceRecord.gpuCardTypeId, gpuCardTypeId))

  const [listPriceRow] = await db
    .select({ total: count() })
    .from(platformCardListPrice)
    .where(eq(platformCardListPrice.gpuCardTypeId, gpuCardTypeId))

  return Number(pricingRow?.total ?? 0) + Number(platformRow?.total ?? 0) + Number(listPriceRow?.total ?? 0)
}

export const gpuCardTypesDataAccess = {
  async list(filters: GpuCardTypeListFilters = {}): Promise<(GPUCardType & { usageCount: number })[]> {
    const conditions = []

    if (filters.status && filters.status !== 'all') {
      conditions.push(eq(gpuCardType.status, filters.status))
    }

    if (filters.deviceRoleFilter === 'gpu') {
      conditions.push(eq(gpuCardType.deviceRole, 'compute'))
    } else if (filters.deviceRoleFilter === 'cpu') {
      conditions.push(eq(gpuCardType.deviceRole, 'infra'))
    }

    const search = filters.search?.trim()
    if (search) {
      const pattern = `%${search}%`
      conditions.push(
        or(
          ilike(gpuCardType.name, pattern),
          ilike(gpuCardType.code, pattern),
          ilike(gpuCardType.manufacturer, pattern),
        )!,
      )
    }

    const rows = await db
      .select()
      .from(gpuCardType)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(gpuCardType.name)

    const usageCounts = await Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        usageCount: await countPricingUsage(row.id),
      })),
    )
    const usageMap = new Map(usageCounts.map((item) => [item.id, item.usageCount]))

    supplierLog('gpu-card-types', 'list', { count: rows.length, filters })
    return rows.map((row) => ({
      ...mapGpuCardTypeRow(row),
      usageCount: usageMap.get(row.id) ?? 0,
    }))
  },

  async listActive(): Promise<GPUCardType[]> {
    const rows = await db
      .select()
      .from(gpuCardType)
      .where(eq(gpuCardType.status, 'active'))
      .orderBy(gpuCardType.name)

    return rows.map(mapGpuCardTypeRow)
  },

  async getById(id: string): Promise<(GPUCardType & { usageCount: number }) | null> {
    const row = await db.query.gpuCardType.findFirst({
      where: eq(gpuCardType.id, id),
    })
    if (!row) return null

    const usageCount = await countPricingUsage(row.id)
    return { ...mapGpuCardTypeRow(row), usageCount }
  },

  async create(input: GpuCardTypeUpsertInput): Promise<GPUCardType> {
    const code = input.code.trim()
    const name = input.name.trim()

    const existingCode = await db.query.gpuCardType.findFirst({
      where: eq(gpuCardType.code, code),
      columns: { id: true },
    })
    if (existingCode) {
      throw new Error('卡型编码已存在')
    }

    const existingName = await db.query.gpuCardType.findFirst({
      where: eq(gpuCardType.name, name),
      columns: { id: true },
    })
    if (existingName) {
      throw new Error('卡型名称已存在')
    }

    const id = newId()
    const deviceRole =
      input.deviceRole ??
      resolveGpuCardTypeRole({ name, code })
    const [row] = await db
      .insert(gpuCardType)
      .values({
        id,
        code,
        name,
        manufacturer: input.manufacturer,
        memoryGb: input.memoryGB,
        tdpWatts: input.tdpWatts ?? null,
        computeCapability: input.computeCapability?.trim() || null,
        deviceRole,
        status: 'active',
      })
      .returning()

    if (!row) {
      throw new Error('创建卡型失败')
    }

    supplierLog('gpu-card-types', 'create', { id: row.id, code: row.code })
    return mapGpuCardTypeRow(row)
  },

  async update(id: string, input: GpuCardTypeUpdateInput): Promise<GPUCardType> {
    const existing = await db.query.gpuCardType.findFirst({
      where: eq(gpuCardType.id, id),
    })
    if (!existing) {
      throw new Error('卡型不存在')
    }

    const name = input.name.trim()
    const existingName = await db.query.gpuCardType.findFirst({
      where: and(eq(gpuCardType.name, name), ne(gpuCardType.id, id)),
      columns: { id: true },
    })
    if (existingName) {
      throw new Error('卡型名称已存在')
    }

    const deviceRole =
      input.deviceRole ??
      resolveGpuCardTypeRole({ name, code: existing.code, deviceRole: existing.deviceRole })
    const [row] = await db
      .update(gpuCardType)
      .set({
        name,
        manufacturer: input.manufacturer,
        memoryGb: input.memoryGB,
        tdpWatts: input.tdpWatts ?? null,
        computeCapability: input.computeCapability?.trim() || null,
        deviceRole,
      })
      .where(eq(gpuCardType.id, id))
      .returning()

    if (!row) {
      throw new Error('更新卡型失败')
    }

    supplierLog('gpu-card-types', 'update', { id: row.id })
    return mapGpuCardTypeRow(row)
  },

  async setStatus(id: string, status: 'active' | 'disabled'): Promise<GPUCardType> {
    const existing = await db.query.gpuCardType.findFirst({
      where: eq(gpuCardType.id, id),
    })
    if (!existing) {
      throw new Error('卡型不存在')
    }

    if (status === 'disabled') {
      const usageCount = await countPricingUsage(id)
      if (usageCount > 0) {
        throw new Error(`卡型已被 ${usageCount} 条定价配置引用，无法禁用`)
      }
    }

    const [row] = await db
      .update(gpuCardType)
      .set({ status })
      .where(eq(gpuCardType.id, id))
      .returning()

    if (!row) {
      throw new Error('更新卡型状态失败')
    }

    supplierLog('gpu-card-types', 'setStatus', { id, status })
    return mapGpuCardTypeRow(row)
  },

  async getDetailPage(id: string): Promise<GpuCardTypeDetailPageData | null> {
    const card = await this.getById(id)
    if (!card) return null

    const platformRecords = await platformPricingDataAccess.listRecordsForCardType(id)
    const listPrices = buildCurrentListPrices(platformRecords, id)

    const inventoryRows = await db
      .select({
        inventoryId: supplierGpuInventory.id,
        dataCenterId: dataCenter.id,
        dataCenterName: dataCenter.name,
        supplierId: supplier.id,
        supplierName: supplier.shortName,
        location: dataCenter.location,
        dcStatus: dataCenter.status,
        deviceCount: supplierGpuInventory.quantity,
        availableCount: supplierGpuInventory.onlineQuantity,
      })
      .from(supplierGpuInventory)
      .innerJoin(dataCenter, eq(supplierGpuInventory.dataCenterId, dataCenter.id))
      .innerJoin(supplier, eq(supplierGpuInventory.supplierId, supplier.id))
      .where(
        and(eq(supplierGpuInventory.gpuCardTypeId, id), gt(supplierGpuInventory.quantity, 0)),
      )
      .orderBy(dataCenter.name)

    const unitLabel = unitLabelForRole(card.deviceRole)
    const datacenters: CardTypeDatacenterSummaryRow[] = inventoryRows.map((row) => ({
      dataCenterId: row.dataCenterId,
      dataCenterName: row.dataCenterName,
      supplierId: row.supplierId,
      supplierName: row.supplierName,
      location: row.location ?? null,
      dcStatus: row.dcStatus,
      deviceCount: row.deviceCount,
      availableCount: row.availableCount,
      inventoryId: row.inventoryId,
      unitLabel,
    }))

    supplierLog('gpu-card-types', 'getDetailPage', {
      id,
      listPriceCount: listPrices.filter((p) => p.sellPrice != null).length,
      datacenterCount: datacenters.length,
    })

    return { card, listPrices, datacenters }
  },

  async getDatacenterDetail(input: {
    cardTypeId: string
    dataCenterId: string
  }): Promise<GpuCardTypeDatacenterDetailData | null> {
    const card = await db.query.gpuCardType.findFirst({
      where: eq(gpuCardType.id, input.cardTypeId),
    })
    if (!card) return null

    const [dcRow] = await db
      .select({
        dataCenterId: dataCenter.id,
        dataCenterName: dataCenter.name,
        supplierId: supplier.id,
        supplierName: supplier.shortName,
      })
      .from(dataCenter)
      .innerJoin(supplier, eq(dataCenter.supplierId, supplier.id))
      .where(eq(dataCenter.id, input.dataCenterId))
      .limit(1)

    if (!dcRow) return null

    const specRow = await datacenterCardTypeSpecsDataAccess.get(
      input.dataCenterId,
      input.cardTypeId,
    )

    const deviceSpecText = specRow?.deviceSpec ?? null
    const deviceSpecLines = deviceSpecPreviewLines(deviceSpecText)
    const deviceRemark = specRow?.remark ?? null
    const hasDeviceSpec = deviceSpecLines.length > 0 || Boolean(deviceRemark?.trim())

    const infra = await datacenterInfrastructureDataAccess.get(input.dataCenterId)
    const bandwidthLines = infra?.bandwidthLines ?? []
    const networkLines = infra?.networkLines ?? []
    const storageLines = infra?.storageLines ?? []
    const hasInfrastructure =
      bandwidthLines.length > 0 || networkLines.length > 0 || storageLines.length > 0

    const l2Rows = await db
      .select()
      .from(supplierDatacenterSellPrice)
      .where(
        and(
          eq(supplierDatacenterSellPrice.dataCenterId, input.dataCenterId),
          eq(supplierDatacenterSellPrice.gpuCardTypeId, input.cardTypeId),
          isNull(supplierDatacenterSellPrice.effectiveTo),
        ),
      )

    const l2ByKey = new Map(
      l2Rows.map((row) => [`${row.productLine}:${row.billingUnit}`, row]),
    )

    const platformRecords = await platformPricingDataAccess.listRecordsForCardType(
      input.cardTypeId,
    )
    const currentPlatform = getCurrentPlatformRecords(platformRecords, input.cardTypeId)
    const l1ByKey = new Map(
      currentPlatform.map((r) => [`${r.productLine}:${r.billingUnit}`, r]),
    )

    const bareMetalPrices: BareMetalPriceRow[] = BARE_METAL_UNITS.map((billingUnit) => {
      const key = `bare_metal:${billingUnit}`
      const l2 = l2ByKey.get(key)
      if (l2) {
        return {
          billingUnit,
          billingUnitLabel: platformBillingUnitNames[billingUnit],
          sellPrice: toNumber(l2.sellPrice),
          currency: l2.currency,
          source: 'datacenter' as const,
          sourceLabel: bareMetalSourceLabel('datacenter'),
        }
      }
      const l1 = l1ByKey.get(key)
      if (l1) {
        return {
          billingUnit,
          billingUnitLabel: platformBillingUnitNames[billingUnit],
          sellPrice: l1.sellPrice,
          currency: l1.currency,
          source: 'platform_fallback' as const,
          sourceLabel: bareMetalSourceLabel('platform_fallback'),
        }
      }
      return {
        billingUnit,
        billingUnitLabel: platformBillingUnitNames[billingUnit],
        sellPrice: null,
        currency: 'CNY',
        source: 'unset' as const,
        sourceLabel: bareMetalSourceLabel('unset'),
      }
    })

    const cardHourPrices: CardHourPriceRow[] = CARD_HOUR_PRODUCT_LINES.map((productLine) => {
      const key = `${productLine}:hour`
      const l2 = l2ByKey.get(key)
      if (l2) {
        return {
          productLine,
          productLineLabel: platformProductLineNames[productLine],
          sellPrice: toNumber(l2.sellPrice),
          currency: l2.currency,
          source: 'datacenter' as const,
          sourceLabel: bareMetalSourceLabel('datacenter'),
        }
      }
      const l1 = l1ByKey.get(key)
      if (l1) {
        return {
          productLine,
          productLineLabel: platformProductLineNames[productLine],
          sellPrice: l1.sellPrice,
          currency: l1.currency,
          source: 'platform_fallback' as const,
          sourceLabel: bareMetalSourceLabel('platform_fallback'),
        }
      }
      return {
        productLine,
        productLineLabel: platformProductLineNames[productLine],
        sellPrice: null,
        currency: 'CNY',
        source: 'unset' as const,
        sourceLabel: bareMetalSourceLabel('unset'),
      }
    })

    supplierLog('gpu-card-types', 'getDatacenterDetail', {
      cardTypeId: input.cardTypeId,
      dataCenterId: input.dataCenterId,
      hasDeviceSpec,
      hasInfrastructure,
    })

    return {
      dataCenterId: dcRow.dataCenterId,
      dataCenterName: dcRow.dataCenterName,
      supplierId: dcRow.supplierId,
      supplierName: dcRow.supplierName,
      cardTypeId: card.id,
      cardTypeName: card.name,
      unitLabel: unitLabelForRole(card.deviceRole),
      deviceSpec: {
        text: deviceSpecText,
        lines: deviceSpecLines,
        remark: deviceRemark,
        hasAny: hasDeviceSpec,
      },
      infrastructure: {
        bandwidthLines,
        networkLines,
        storageLines,
        hasAny: hasInfrastructure,
      },
      bareMetalPrices,
      cardHourPrices,
    }
  },
}
