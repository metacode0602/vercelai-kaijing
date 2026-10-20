import { db } from '@/lib/db'
import { platformPricingLog } from '@/lib/server/dataaccess/platform-pricing/logger'
import {
  normalizePlatformDateTime,
  secondBeforePlatformDateTime,
} from '@/lib/platform-pricing/datetime'
import type {
  PlatformBillingUnit,
  PlatformProductLine,
  SupplierDatacenterSellPrice,
  SupplierDatacenterSellPriceHistory,
} from '@/lib/types/platform-pricing'
import {
  dataCenter,
  gpuCardType,
  platformCardListPrice,
  platformCardPriceRecord,
  supplier,
  supplierDatacenterSellPrice,
  supplierDatacenterSellPriceHistory,
  userStaff,
} from '@workspace/db/schema'
import { and, count, desc, eq, isNull } from 'drizzle-orm'

function newId() {
  return crypto.randomUUID()
}

function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0
  return typeof value === 'number' ? value : Number(value)
}

export type DatacenterSellPriceUpsertInput = {
  supplierId: string
  dataCenterId: string
  gpuCardTypeId: string
  productLine: PlatformProductLine
  billingUnit: PlatformBillingUnit
  sellPrice: number
  inheritPlatformPrice: boolean
  effectiveFrom: string
  remark?: string
  changedByStaffId?: string | null
}

export type DatacenterSellPriceUpdateInput = DatacenterSellPriceUpsertInput & {
  recordId: string
}

async function resolvePlatformListPriceId(
  gpuCardTypeId: string,
  productLine: PlatformProductLine,
  billingUnit: PlatformBillingUnit,
): Promise<{ listPriceId: string | null; platformSellPrice: number | null }> {
  const [row] = await db
    .select({
      listPriceId: platformCardPriceRecord.platformCardListPriceId,
      sellPrice: platformCardPriceRecord.sellPrice,
    })
    .from(platformCardPriceRecord)
    .where(
      and(
        eq(platformCardPriceRecord.gpuCardTypeId, gpuCardTypeId),
        eq(platformCardPriceRecord.productLine, productLine),
        eq(platformCardPriceRecord.billingUnit, billingUnit),
      ),
    )
    .limit(1)

  if (row) {
    return {
      listPriceId: row.listPriceId,
      platformSellPrice: toNumber(row.sellPrice),
    }
  }

  const [listRow] = await db
    .select({
      id: platformCardListPrice.id,
      sellPrice: platformCardListPrice.sellPrice,
    })
    .from(platformCardListPrice)
    .where(
      and(
        eq(platformCardListPrice.gpuCardTypeId, gpuCardTypeId),
        eq(platformCardListPrice.productLine, productLine),
        eq(platformCardListPrice.billingUnit, billingUnit),
        eq(platformCardListPrice.status, 'active'),
        isNull(platformCardListPrice.effectiveTo),
      ),
    )
    .limit(1)

  if (!listRow) return { listPriceId: null, platformSellPrice: null }
  return {
    listPriceId: listRow.id,
    platformSellPrice: toNumber(listRow.sellPrice),
  }
}

function mapSellRow(
  row: typeof supplierDatacenterSellPrice.$inferSelect,
  names: {
    supplierName: string
    dataCenterName: string
    cardTypeName: string
    updatedByName?: string | null
    platformSellPrice?: number | null
  },
): SupplierDatacenterSellPrice {
  const source = (row.source ?? 'manual') as SupplierDatacenterSellPrice['source']
  return {
    id: row.id,
    supplierId: row.supplierId,
    supplierName: names.supplierName,
    dataCenterId: row.dataCenterId,
    dataCenterName: names.dataCenterName,
    gpuCardTypeId: row.gpuCardTypeId,
    cardTypeName: names.cardTypeName,
    productLine: row.productLine as PlatformProductLine,
    billingUnit: row.billingUnit as PlatformBillingUnit,
    sellPrice: toNumber(row.sellPrice),
    platformSellPrice: names.platformSellPrice ?? undefined,
    inheritPlatformPrice: row.inheritPlatformPrice,
    currency: row.currency,
    effectiveFrom: row.effectiveFrom,
    source,
    remark: row.remark ?? undefined,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: names.updatedByName ?? undefined,
  }
}

export const datacenterSellPriceDataAccess = {
  async countCurrent(): Promise<number> {
    const [row] = await db
      .select({ total: count() })
      .from(supplierDatacenterSellPrice)
      .where(isNull(supplierDatacenterSellPrice.effectiveTo))
    return Number(row?.total ?? 0)
  },

  async listForCardType(gpuCardTypeId: string): Promise<SupplierDatacenterSellPrice[]> {
    const rows = await db
      .select({
        price: supplierDatacenterSellPrice,
        supplierName: supplier.shortName,
        dataCenterName: dataCenter.name,
        cardTypeName: gpuCardType.name,
        updatedByName: userStaff.displayName,
      })
      .from(supplierDatacenterSellPrice)
      .innerJoin(supplier, eq(supplierDatacenterSellPrice.supplierId, supplier.id))
      .innerJoin(dataCenter, eq(supplierDatacenterSellPrice.dataCenterId, dataCenter.id))
      .innerJoin(gpuCardType, eq(supplierDatacenterSellPrice.gpuCardTypeId, gpuCardType.id))
      .leftJoin(userStaff, eq(supplierDatacenterSellPrice.updatedByStaffId, userStaff.id))
      .where(
        and(
          eq(supplierDatacenterSellPrice.gpuCardTypeId, gpuCardTypeId),
          isNull(supplierDatacenterSellPrice.effectiveTo),
        ),
      )
      .orderBy(dataCenter.name, supplierDatacenterSellPrice.productLine)

    const result: SupplierDatacenterSellPrice[] = []
    for (const row of rows) {
      const platform = await resolvePlatformListPriceId(
        row.price.gpuCardTypeId,
        row.price.productLine as PlatformProductLine,
        row.price.billingUnit as PlatformBillingUnit,
      )
      result.push(
        mapSellRow(row.price, {
          supplierName: row.supplierName,
          dataCenterName: row.dataCenterName,
          cardTypeName: row.cardTypeName,
          updatedByName: row.updatedByName,
          platformSellPrice: platform.platformSellPrice,
        }),
      )
    }
    return result
  },

  async listHistory(
    gpuCardTypeId: string,
    dataCenterId?: string,
  ): Promise<SupplierDatacenterSellPriceHistory[]> {
    const conditions = [eq(supplierDatacenterSellPriceHistory.gpuCardTypeId, gpuCardTypeId)]
    if (dataCenterId) {
      conditions.push(eq(supplierDatacenterSellPriceHistory.dataCenterId, dataCenterId))
    }

    const rows = await db
      .select({
        history: supplierDatacenterSellPriceHistory,
        supplierName: supplier.shortName,
        dataCenterName: dataCenter.name,
        cardTypeName: gpuCardType.name,
        changedByName: userStaff.displayName,
      })
      .from(supplierDatacenterSellPriceHistory)
      .innerJoin(supplier, eq(supplierDatacenterSellPriceHistory.supplierId, supplier.id))
      .innerJoin(dataCenter, eq(supplierDatacenterSellPriceHistory.dataCenterId, dataCenter.id))
      .innerJoin(gpuCardType, eq(supplierDatacenterSellPriceHistory.gpuCardTypeId, gpuCardType.id))
      .leftJoin(userStaff, eq(supplierDatacenterSellPriceHistory.changedByStaffId, userStaff.id))
      .where(and(...conditions))
      .orderBy(desc(supplierDatacenterSellPriceHistory.changedAt))

    return rows.map(({ history, supplierName, dataCenterName, cardTypeName, changedByName }) => ({
      id: history.id,
      sellPriceId: history.sellPriceId,
      supplierId: history.supplierId,
      supplierName,
      dataCenterId: history.dataCenterId,
      dataCenterName,
      gpuCardTypeId: history.gpuCardTypeId,
      cardTypeName,
      productLine: history.productLine as PlatformProductLine,
      billingUnit: history.billingUnit as PlatformBillingUnit,
      previousSellPrice:
        history.previousSellPrice != null ? toNumber(history.previousSellPrice) : undefined,
      newSellPrice: toNumber(history.newSellPrice),
      changedAt: history.changedAt.toISOString(),
      changedBy: changedByName ?? '系统',
      reason: history.reason ?? undefined,
    }))
  },

  async create(input: DatacenterSellPriceUpsertInput): Promise<SupplierDatacenterSellPrice> {
    const dc = await db.query.dataCenter.findFirst({
      where: eq(dataCenter.id, input.dataCenterId),
      columns: { id: true, name: true, supplierId: true },
    })
    if (!dc) throw new Error('机房不存在')
    if (dc.supplierId !== input.supplierId) {
      throw new Error('机房与供应商不匹配')
    }

    const card = await db.query.gpuCardType.findFirst({
      where: eq(gpuCardType.id, input.gpuCardTypeId),
      columns: { id: true, name: true, status: true },
    })
    if (!card) throw new Error('卡型不存在')

    const supplierRow = await db.query.supplier.findFirst({
      where: eq(supplier.id, input.supplierId),
      columns: { shortName: true },
    })
    if (!supplierRow) throw new Error('供应商不存在')

    const existing = await db.query.supplierDatacenterSellPrice.findFirst({
      where: and(
        eq(supplierDatacenterSellPrice.supplierId, input.supplierId),
        eq(supplierDatacenterSellPrice.dataCenterId, input.dataCenterId),
        eq(supplierDatacenterSellPrice.gpuCardTypeId, input.gpuCardTypeId),
        eq(supplierDatacenterSellPrice.productLine, input.productLine),
        eq(supplierDatacenterSellPrice.billingUnit, input.billingUnit),
        isNull(supplierDatacenterSellPrice.effectiveTo),
      ),
      columns: { id: true },
    })
    if (existing) {
      throw new Error('该机房该产品线租期已有销售价，请编辑现有记录')
    }

    const platform = await resolvePlatformListPriceId(
      input.gpuCardTypeId,
      input.productLine,
      input.billingUnit,
    )
    const sellPrice =
      input.inheritPlatformPrice && platform.platformSellPrice != null
        ? platform.platformSellPrice
        : input.sellPrice
    const source = input.inheritPlatformPrice ? 'platform_inherit' : 'manual'
    const id = newId()
    const effectiveFrom = normalizePlatformDateTime(input.effectiveFrom)

    await db.transaction(async (tx) => {
      await tx.insert(supplierDatacenterSellPrice).values({
        id,
        supplierId: input.supplierId,
        dataCenterId: input.dataCenterId,
        gpuCardTypeId: input.gpuCardTypeId,
        productLine: input.productLine,
        billingUnit: input.billingUnit,
        sellPrice: sellPrice.toFixed(4),
        platformCardListPriceId: platform.listPriceId,
        inheritPlatformPrice: input.inheritPlatformPrice,
        currency: 'CNY',
        effectiveFrom,
        effectiveTo: null,
        source,
        remark: input.remark?.trim() || null,
        updatedByStaffId: input.changedByStaffId ?? null,
      })

      await tx.insert(supplierDatacenterSellPriceHistory).values({
        id: newId(),
        sellPriceId: id,
        supplierId: input.supplierId,
        dataCenterId: input.dataCenterId,
        gpuCardTypeId: input.gpuCardTypeId,
        productLine: input.productLine,
        billingUnit: input.billingUnit,
        previousSellPrice: null,
        newSellPrice: sellPrice.toFixed(4),
        changedAt: new Date(),
        changedByStaffId: input.changedByStaffId ?? null,
        reason: input.remark?.trim() || null,
      })
    })

    platformPricingLog('createDatacenterSellPrice', 'success', {
      id,
      dataCenterId: input.dataCenterId,
      gpuCardTypeId: input.gpuCardTypeId,
      productLine: input.productLine,
    })

    const [row] = await db
      .select()
      .from(supplierDatacenterSellPrice)
      .where(eq(supplierDatacenterSellPrice.id, id))
      .limit(1)
    if (!row) throw new Error('创建机房销售价后读取失败')

    return mapSellRow(row, {
      supplierName: supplierRow.shortName,
      dataCenterName: dc.name,
      cardTypeName: card.name,
      platformSellPrice: platform.platformSellPrice,
    })
  },

  async update(input: DatacenterSellPriceUpdateInput): Promise<SupplierDatacenterSellPrice> {
    const existing = await db.query.supplierDatacenterSellPrice.findFirst({
      where: eq(supplierDatacenterSellPrice.id, input.recordId),
    })
    if (!existing || existing.effectiveTo != null) {
      throw new Error('机房销售价记录不存在或已失效')
    }

    if (
      existing.supplierId !== input.supplierId ||
      existing.dataCenterId !== input.dataCenterId ||
      existing.gpuCardTypeId !== input.gpuCardTypeId ||
      existing.productLine !== input.productLine ||
      existing.billingUnit !== input.billingUnit
    ) {
      throw new Error('机房销售价维度不可变更')
    }

    const platform = await resolvePlatformListPriceId(
      input.gpuCardTypeId,
      input.productLine,
      input.billingUnit,
    )
    const sellPrice =
      input.inheritPlatformPrice && platform.platformSellPrice != null
        ? platform.platformSellPrice
        : input.sellPrice
    const source = input.inheritPlatformPrice ? 'platform_inherit' : 'manual'
    const effectiveFrom = normalizePlatformDateTime(input.effectiveFrom)
    const closeDate = secondBeforePlatformDateTime(effectiveFrom)
    const newIdValue = newId()
    const previousSellPrice = existing.sellPrice

    await db.transaction(async (tx) => {
      await tx
        .update(supplierDatacenterSellPrice)
        .set({ effectiveTo: closeDate })
        .where(eq(supplierDatacenterSellPrice.id, existing.id))

      await tx.insert(supplierDatacenterSellPrice).values({
        id: newIdValue,
        supplierId: input.supplierId,
        dataCenterId: input.dataCenterId,
        gpuCardTypeId: input.gpuCardTypeId,
        productLine: input.productLine,
        billingUnit: input.billingUnit,
        sellPrice: sellPrice.toFixed(4),
        platformCardListPriceId: platform.listPriceId,
        inheritPlatformPrice: input.inheritPlatformPrice,
        currency: 'CNY',
        effectiveFrom,
        effectiveTo: null,
        source,
        remark: input.remark?.trim() || null,
        updatedByStaffId: input.changedByStaffId ?? null,
      })

      await tx.insert(supplierDatacenterSellPriceHistory).values({
        id: newId(),
        sellPriceId: newIdValue,
        supplierId: input.supplierId,
        dataCenterId: input.dataCenterId,
        gpuCardTypeId: input.gpuCardTypeId,
        productLine: input.productLine,
        billingUnit: input.billingUnit,
        previousSellPrice,
        newSellPrice: sellPrice.toFixed(4),
        changedAt: new Date(),
        changedByStaffId: input.changedByStaffId ?? null,
        reason: input.remark?.trim() || null,
      })
    })

    platformPricingLog('updateDatacenterSellPrice', 'success', {
      previousId: existing.id,
      id: newIdValue,
    })

    const dc = await db.query.dataCenter.findFirst({
      where: eq(dataCenter.id, input.dataCenterId),
      columns: { name: true },
    })
    const card = await db.query.gpuCardType.findFirst({
      where: eq(gpuCardType.id, input.gpuCardTypeId),
      columns: { name: true },
    })
    const supplierRow = await db.query.supplier.findFirst({
      where: eq(supplier.id, input.supplierId),
      columns: { shortName: true },
    })
    const [row] = await db
      .select()
      .from(supplierDatacenterSellPrice)
      .where(eq(supplierDatacenterSellPrice.id, newIdValue))
      .limit(1)
    if (!row || !dc || !card || !supplierRow) {
      throw new Error('更新机房销售价后读取失败')
    }

    return mapSellRow(row, {
      supplierName: supplierRow.shortName,
      dataCenterName: dc.name,
      cardTypeName: card.name,
      platformSellPrice: platform.platformSellPrice,
    })
  },
}
