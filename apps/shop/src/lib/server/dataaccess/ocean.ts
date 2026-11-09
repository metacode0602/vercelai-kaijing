/**
 * 海运柜次 / 在途库存 dataaccess（模块7 / F22）。
 * ocean_shipments + lines + boxes → inventory_balances 在途/清关桶 → 到仓转 on_hand/damaged。
 * 幂等键前缀：ledger:ocean_*
 */
import { and, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import {
  commerceWarehouses,
  feeTemplateVersions,
  feeTemplates,
  fxRates,
  inventoryBalances,
  inventoryMovements,
  oceanShipmentBoxes,
  oceanShipmentLines,
  oceanShipments,
  productVariants,
  products,
  skuCosts,
} from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import {
  canCancelOceanStatus,
  isCustomsBucket,
  isInTransitBucket,
  nextOceanStatus,
  normalizeOceanStatus,
  OCEAN_DEFAULT_WAREHOUSE,
  OCEAN_STAGING_BIN,
  toDbOceanStatus,
  toUiOceanStatus,
  type UiOceanStatus,
} from '@/lib/server/mappers/ocean'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

export type OceanLineDto = {
  id: string
  variantId: string
  sku: string
  name: string
  qtyShipped: number
  qtyReceived: number
  qtyDamaged: number
  skuCostId: string | null
}

export type OceanBoxDto = {
  id: string
  boxNo: string
  cartonSpecCode: string
  leadRef: string
  cbm: number | null
  weightKg: number | null
  sealNo: string
  notes: string
}

export type OceanLotCostDto = {
  id: string
  variantId: string
  sku: string
  kind: string
  amount: number
  currency: string
  versionNo: number
  landedUnitCost: number | null
  feeTemplateVersionId: string | null
  taxTemplateCode: string | null
  note: string
  effectiveFrom: string
  createdAt: string
}

export type OceanLotDto = {
  id: string
  lotCode: string
  containerNo: string
  containerType: string
  freightMode: string
  carrierId: string
  platform: string
  originPort: string
  destPort: string
  warehouseId: string
  warehouse: string
  status: UiOceanStatus
  statusCode: string
  etd: string
  etaPort: string
  etaWarehouse: string
  notes: string
  packingDetails: Record<string, unknown>
  lineCount: number
  boxCount: number
  qtyShippedTotal: number
  createdAt: string
  updatedAt: string
  lines?: OceanLineDto[]
  boxes?: OceanBoxDto[]
  costs?: OceanLotCostDto[]
}

export type OceanInventoryBucketDto = {
  id: string
  sku: string
  name: string
  warehouse: string
  inTransit: number
  customsClearing: number
  available: number
  damaged: number
}

export type OceanStatsDto = {
  total: number
  draft: number
  booked: number
  inTransit: number
  arrived: number
  clearing: number
  received: number
  cancelled: number
  skuLines: number
}

function buildSearch(
  q: string | undefined,
  columns: Parameters<typeof ilike>[0][],
): SQL | undefined {
  const term = q?.trim()
  if (!term) return undefined
  const pattern = `%${term}%`
  return or(...columns.map((col) => ilike(col, pattern)))
}

async function resolveVariant(
  db: DbLike,
  organizationId: string,
  skuOrId: string,
): Promise<{ id: string; skuCode: string; name: string }> {
  const key = skuOrId.trim()
  const [row] = await db
    .select({
      id: productVariants.id,
      skuCode: productVariants.skuCode,
      sku: productVariants.sku,
      title: products.title,
    })
    .from(productVariants)
    .leftJoin(products, eq(products.id, productVariants.productId))
    .where(
      and(
        eq(productVariants.organizationId, organizationId),
        or(
          eq(productVariants.id, key),
          eq(productVariants.skuCode, key),
          eq(productVariants.sku, key),
        ),
      ),
    )
    .limit(1)
  if (!row) throw new Error(`SKU 不存在：${key}`)
  return {
    id: row.id,
    skuCode: row.skuCode || row.sku || key,
    name: row.title || row.skuCode || row.sku || key,
  }
}

async function resolveDestinationWarehouse(
  db: DbLike,
  organizationId: string,
  codeOrId: string,
): Promise<{ id: string; code: string }> {
  const key = codeOrId.trim() || OCEAN_DEFAULT_WAREHOUSE
  const [row] = await db
    .select({ id: commerceWarehouses.id, code: commerceWarehouses.code })
    .from(commerceWarehouses)
    .where(
      and(
        eq(commerceWarehouses.organizationId, organizationId),
        or(eq(commerceWarehouses.id, key), eq(commerceWarehouses.code, key)),
      ),
    )
    .limit(1)
  if (!row) throw new Error(`目的仓 ${key} 不存在`)
  return row
}

async function loadLines(db: DbLike, organizationId: string, shipmentId: string): Promise<OceanLineDto[]> {
  const rows = await db
    .select({
      id: oceanShipmentLines.id,
      variantId: oceanShipmentLines.variantId,
      skuCode: oceanShipmentLines.skuCode,
      qtyShipped: oceanShipmentLines.qtyShipped,
      qtyReceived: oceanShipmentLines.qtyReceived,
      qtyDamaged: oceanShipmentLines.qtyDamaged,
      skuCostId: oceanShipmentLines.skuCostId,
      variantSku: productVariants.skuCode,
      variantSkuAlt: productVariants.sku,
      title: products.title,
    })
    .from(oceanShipmentLines)
    .leftJoin(productVariants, eq(productVariants.id, oceanShipmentLines.variantId))
    .leftJoin(products, eq(products.id, productVariants.productId))
    .where(
      and(
        eq(oceanShipmentLines.organizationId, organizationId),
        eq(oceanShipmentLines.shipmentId, shipmentId),
      ),
    )
  return rows.map((r) => ({
    id: r.id,
    variantId: r.variantId,
    sku: r.skuCode || r.variantSku || r.variantSkuAlt || '',
    name: r.title || r.skuCode || '',
    qtyShipped: r.qtyShipped,
    qtyReceived: r.qtyReceived,
    qtyDamaged: r.qtyDamaged,
    skuCostId: r.skuCostId,
  }))
}

async function loadBoxes(db: DbLike, organizationId: string, shipmentId: string): Promise<OceanBoxDto[]> {
  const rows = await db
    .select()
    .from(oceanShipmentBoxes)
    .where(
      and(
        eq(oceanShipmentBoxes.organizationId, organizationId),
        eq(oceanShipmentBoxes.shipmentId, shipmentId),
      ),
    )
    .orderBy(oceanShipmentBoxes.boxNo)
  return rows.map((r) => ({
    id: r.id,
    boxNo: r.boxNo,
    cartonSpecCode: r.cartonSpecCode || '',
    leadRef: r.leadRef || '',
    cbm: r.cbm != null ? Number(r.cbm) : null,
    weightKg: r.weightKg != null ? Number(r.weightKg) : null,
    sealNo: r.sealNo || '',
    notes: r.notes || '',
  }))
}

async function loadCosts(db: DbLike, organizationId: string, shipmentId: string): Promise<OceanLotCostDto[]> {
  const rows = await db
    .select({
      id: skuCosts.id,
      variantId: skuCosts.variantId,
      kind: skuCosts.kind,
      amount: skuCosts.amount,
      currency: skuCosts.currency,
      versionNo: skuCosts.versionNo,
      landedUnitCost: skuCosts.landedUnitCost,
      feeTemplateVersionId: skuCosts.feeTemplateVersionId,
      taxTemplateCode: skuCosts.taxTemplateCode,
      note: skuCosts.note,
      effectiveFrom: skuCosts.effectiveFrom,
      createdAt: skuCosts.createdAt,
      skuCode: productVariants.skuCode,
      sku: productVariants.sku,
    })
    .from(skuCosts)
    .leftJoin(productVariants, eq(productVariants.id, skuCosts.variantId))
    .where(and(eq(skuCosts.organizationId, organizationId), eq(skuCosts.containerLotId, shipmentId)))
    .orderBy(desc(skuCosts.createdAt))
  return rows.map((r) => ({
    id: r.id,
    variantId: r.variantId,
    sku: r.skuCode || r.sku || '',
    kind: r.kind,
    amount: Number(r.amount),
    currency: r.currency,
    versionNo: r.versionNo,
    landedUnitCost: r.landedUnitCost != null ? Number(r.landedUnitCost) : null,
    feeTemplateVersionId: r.feeTemplateVersionId,
    taxTemplateCode: r.taxTemplateCode,
    note: r.note || '',
    effectiveFrom: r.effectiveFrom ? r.effectiveFrom.toISOString().slice(0, 10) : '',
    createdAt: r.createdAt.toISOString(),
  }))
}

function mapHeader(
  row: typeof oceanShipments.$inferSelect,
  extras?: { lineCount?: number; boxCount?: number; qtyShippedTotal?: number },
): OceanLotDto {
  const statusCode = normalizeOceanStatus(row.status)
  return {
    id: row.id,
    lotCode: row.lotCode,
    containerNo: row.containerNo || '',
    containerType: row.containerType || '',
    freightMode: row.freightMode || '',
    carrierId: row.carrierId || '',
    platform: row.platform || 'daraz',
    originPort: row.originPort || '',
    destPort: row.destPort || '',
    warehouseId: row.destinationWarehouseId || '',
    warehouse: row.destinationWarehouseCode || OCEAN_DEFAULT_WAREHOUSE,
    status: toUiOceanStatus(row.status),
    statusCode,
    etd: row.etd || '',
    etaPort: row.etaPort || '',
    etaWarehouse: row.etaWarehouse || '',
    notes: row.notes || '',
    packingDetails: (row.packingDetails as Record<string, unknown>) || {},
    lineCount: extras?.lineCount ?? 0,
    boxCount: extras?.boxCount ?? 0,
    qtyShippedTotal: extras?.qtyShippedTotal ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function listOceanShipments(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string; status?: string } = {},
): Promise<PaginatedResult<OceanLotDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const filters: SQL[] = [eq(oceanShipments.organizationId, organizationId)]
  if (input.status && input.status !== '全部') {
    const code = toDbOceanStatus(input.status)
    if (code === 'departed') {
      filters.push(inArray(oceanShipments.status, ['departed', 'in_transit']))
    } else if (code === 'customs') {
      filters.push(inArray(oceanShipments.status, ['customs', 'customs_clearing']))
    } else if (code === 'received') {
      filters.push(inArray(oceanShipments.status, ['received', 'received_local']))
    } else {
      filters.push(eq(oceanShipments.status, code))
    }
  }
  const search = buildSearch(input.q, [
    oceanShipments.lotCode,
    oceanShipments.containerNo,
    oceanShipments.originPort,
    oceanShipments.destPort,
    oceanShipments.destinationWarehouseCode,
    oceanShipments.status,
  ])
  if (search) filters.push(search)
  const where = and(...filters)
  const [totalRow] = await db.select({ value: count() }).from(oceanShipments).where(where)
  const rows = await db
    .select()
    .from(oceanShipments)
    .where(where)
    .orderBy(desc(oceanShipments.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const ids = rows.map((r) => r.id)
  const lineAgg = new Map<string, { lineCount: number; qtyShippedTotal: number }>()
  const boxAgg = new Map<string, number>()
  if (ids.length) {
    const lineRows = await db
      .select({
        shipmentId: oceanShipmentLines.shipmentId,
        lineCount: count(),
        qtyShippedTotal: sql<number>`coalesce(sum(${oceanShipmentLines.qtyShipped}), 0)`,
      })
      .from(oceanShipmentLines)
      .where(
        and(
          eq(oceanShipmentLines.organizationId, organizationId),
          inArray(oceanShipmentLines.shipmentId, ids),
        ),
      )
      .groupBy(oceanShipmentLines.shipmentId)
    for (const r of lineRows) {
      lineAgg.set(r.shipmentId, {
        lineCount: Number(r.lineCount),
        qtyShippedTotal: Number(r.qtyShippedTotal),
      })
    }
    const boxRows = await db
      .select({
        shipmentId: oceanShipmentBoxes.shipmentId,
        boxCount: count(),
      })
      .from(oceanShipmentBoxes)
      .where(
        and(
          eq(oceanShipmentBoxes.organizationId, organizationId),
          inArray(oceanShipmentBoxes.shipmentId, ids),
        ),
      )
      .groupBy(oceanShipmentBoxes.shipmentId)
    for (const r of boxRows) boxAgg.set(r.shipmentId, Number(r.boxCount))
  }

  return {
    items: rows.map((row) => {
      const la = lineAgg.get(row.id)
      return mapHeader(row, {
        lineCount: la?.lineCount ?? 0,
        qtyShippedTotal: la?.qtyShippedTotal ?? 0,
        boxCount: boxAgg.get(row.id) ?? 0,
      })
    }),
    total: totalRow?.value ?? 0,
    page,
    pageSize,
  }
}

export async function oceanStats(db: AppDatabase, organizationId: string): Promise<OceanStatsDto> {
  const rows = await db
    .select({ status: oceanShipments.status, value: count() })
    .from(oceanShipments)
    .where(eq(oceanShipments.organizationId, organizationId))
    .groupBy(oceanShipments.status)
  const bucket: Record<string, number> = {}
  let total = 0
  for (const r of rows) {
    const n = normalizeOceanStatus(r.status)
    bucket[n] = (bucket[n] || 0) + Number(r.value)
    total += Number(r.value)
  }
  const [lineRow] = await db
    .select({ value: count() })
    .from(oceanShipmentLines)
    .where(eq(oceanShipmentLines.organizationId, organizationId))
  return {
    total,
    draft: bucket.draft || 0,
    booked: bucket.booked || 0,
    inTransit: (bucket.departed || 0),
    arrived: bucket.arrived || 0,
    clearing: bucket.customs || 0,
    received: bucket.received || 0,
    cancelled: bucket.cancelled || 0,
    skuLines: lineRow?.value ?? 0,
  }
}

export async function getOceanShipment(
  db: DbLike,
  organizationId: string,
  idOrLot: string,
): Promise<OceanLotDto | null> {
  const [row] = await db
    .select()
    .from(oceanShipments)
    .where(
      and(
        eq(oceanShipments.organizationId, organizationId),
        or(eq(oceanShipments.id, idOrLot), eq(oceanShipments.lotCode, idOrLot)),
      ),
    )
    .limit(1)
  if (!row) return null
  const lines = await loadLines(db, organizationId, row.id)
  const boxes = await loadBoxes(db, organizationId, row.id)
  const costs = await loadCosts(db, organizationId, row.id)
  const dto = mapHeader(row, {
    lineCount: lines.length,
    boxCount: boxes.length,
    qtyShippedTotal: lines.reduce((s, l) => s + l.qtyShipped, 0),
  })
  dto.lines = lines
  dto.boxes = boxes
  dto.costs = costs
  return dto
}

export async function createOceanShipment(
  db: AppDatabase,
  organizationId: string,
  input: {
    lotCode?: string
    containerNo?: string
    containerType?: string
    freightMode?: string
    carrierId?: string | null
    platform?: string
    originPort?: string
    destPort?: string
    warehouse?: string
    etd?: string
    etaPort?: string
    etaWarehouse?: string
    notes?: string
    packingDetails?: Record<string, unknown>
    lines?: Array<{ sku: string; qtyShipped: number }>
  },
): Promise<OceanLotDto> {
  const lotCode =
    input.lotCode?.trim() ||
    `LOT-CMB-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${createId().slice(0, 4).toUpperCase()}`
  const [dup] = await db
    .select({ id: oceanShipments.id })
    .from(oceanShipments)
    .where(and(eq(oceanShipments.organizationId, organizationId), eq(oceanShipments.lotCode, lotCode)))
    .limit(1)
  if (dup) throw new Error(`柜次号已存在：${lotCode}`)
  const warehouse = await resolveDestinationWarehouse(
    db,
    organizationId,
    input.warehouse?.trim() || OCEAN_DEFAULT_WAREHOUSE,
  )

  const id = createId()
  await db.transaction(async (tx) => {
    await tx.insert(oceanShipments).values({
      id,
      organizationId,
      lotCode,
      containerNo: input.containerNo?.trim() || null,
      containerType: input.containerType?.trim() || '40HQ',
      freightMode: input.freightMode?.trim() || 'FCL40',
      carrierId: input.carrierId?.trim() || null,
      platform: (input.platform?.trim() || 'daraz').toLowerCase(),
      originPort: input.originPort?.trim() || 'CNXMN',
      destPort: input.destPort?.trim() || 'LKCMB',
      destinationWarehouseId: warehouse.id,
      destinationWarehouseCode: warehouse.code,
      status: 'draft',
      etd: input.etd?.trim() || null,
      etaPort: input.etaPort?.trim() || null,
      etaWarehouse: input.etaWarehouse?.trim() || null,
      notes: input.notes?.trim() || null,
      packingDetails: input.packingDetails || {},
    })
    for (const line of input.lines || []) {
      if (!line.sku?.trim() || !(line.qtyShipped > 0)) continue
      const variant = await resolveVariant(tx, organizationId, line.sku)
      await tx.insert(oceanShipmentLines).values({
        id: createId(),
        organizationId,
        shipmentId: id,
        variantId: variant.id,
        skuCode: variant.skuCode,
        qtyShipped: Math.floor(line.qtyShipped),
        qtyReceived: 0,
        qtyDamaged: 0,
      })
    }
  })
  return (await getOceanShipment(db, organizationId, id))!
}

export async function updateOceanShipment(
  db: AppDatabase,
  organizationId: string,
  idOrLot: string,
  patch: {
    containerNo?: string
    containerType?: string
    freightMode?: string
    carrierId?: string | null
    platform?: string
    originPort?: string
    destPort?: string
    warehouse?: string
    etd?: string
    etaPort?: string
    etaWarehouse?: string
    notes?: string
    packingDetails?: Record<string, unknown>
  },
): Promise<OceanLotDto> {
  const current = await getOceanShipment(db, organizationId, idOrLot)
  if (!current) throw new Error('柜次不存在')
  const status = normalizeOceanStatus(current.statusCode)
  if (status === 'received' || status === 'cancelled') {
    throw new Error('已入本地仓或已取消的柜次不可编辑头信息')
  }
  const warehouse =
    patch.warehouse !== undefined
      ? await resolveDestinationWarehouse(
          db,
          organizationId,
          patch.warehouse.trim() || OCEAN_DEFAULT_WAREHOUSE,
        )
      : null
  const setValues: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.containerNo !== undefined) setValues.containerNo = patch.containerNo.trim() || null
  if (patch.containerType !== undefined) setValues.containerType = patch.containerType.trim() || null
  if (patch.freightMode !== undefined) setValues.freightMode = patch.freightMode.trim() || null
  if (patch.carrierId !== undefined) setValues.carrierId = patch.carrierId?.trim() || null
  if (patch.platform !== undefined) setValues.platform = patch.platform.trim().toLowerCase()
  if (patch.originPort !== undefined) setValues.originPort = patch.originPort.trim() || null
  if (patch.destPort !== undefined) setValues.destPort = patch.destPort.trim() || null
  if (warehouse) {
    setValues.destinationWarehouseId = warehouse.id
    setValues.destinationWarehouseCode = warehouse.code
  }
  if (patch.etd !== undefined) setValues.etd = patch.etd.trim() || null
  if (patch.etaPort !== undefined) setValues.etaPort = patch.etaPort.trim() || null
  if (patch.etaWarehouse !== undefined) setValues.etaWarehouse = patch.etaWarehouse.trim() || null
  if (patch.notes !== undefined) setValues.notes = patch.notes.trim() || null
  if (patch.packingDetails !== undefined) setValues.packingDetails = patch.packingDetails
  await db.update(oceanShipments).set(setValues).where(eq(oceanShipments.id, current.id))
  return (await getOceanShipment(db, organizationId, current.id))!
}

export async function upsertOceanLine(
  db: AppDatabase,
  organizationId: string,
  shipmentId: string,
  input: { sku: string; qtyShipped: number; qtyReceived?: number; qtyDamaged?: number },
): Promise<OceanLotDto> {
  const current = await getOceanShipment(db, organizationId, shipmentId)
  if (!current) throw new Error('柜次不存在')
  const status = normalizeOceanStatus(current.statusCode)
  if (status === 'cancelled') throw new Error('已取消柜次不可改行')
  if (status === 'received') throw new Error('已入本地仓不可改发运行；请走库存调整')
  if (!(input.qtyShipped > 0)) throw new Error('发运数量必须大于 0')
  const variant = await resolveVariant(db, organizationId, input.sku)
  const [existing] = await db
    .select()
    .from(oceanShipmentLines)
    .where(
      and(
        eq(oceanShipmentLines.shipmentId, current.id),
        eq(oceanShipmentLines.variantId, variant.id),
      ),
    )
    .limit(1)
  if (existing) {
    if (isInTransitBucket(status) || isCustomsBucket(status)) {
      if (input.qtyShipped !== existing.qtyShipped) {
        throw new Error('在途/清关中不可变更发运数量；可先维护实收/残次后再推进到仓')
      }
    }
    await db
      .update(oceanShipmentLines)
      .set({
        skuCode: variant.skuCode,
        qtyShipped: Math.floor(input.qtyShipped),
        qtyReceived:
          input.qtyReceived !== undefined ? Math.max(0, Math.floor(input.qtyReceived)) : existing.qtyReceived,
        qtyDamaged:
          input.qtyDamaged !== undefined ? Math.max(0, Math.floor(input.qtyDamaged)) : existing.qtyDamaged,
      })
      .where(eq(oceanShipmentLines.id, existing.id))
  } else {
    if (isInTransitBucket(status) || isCustomsBucket(status) || status === 'arrived') {
      throw new Error('开船后不可新增柜次行')
    }
    await db.insert(oceanShipmentLines).values({
      id: createId(),
      organizationId,
      shipmentId: current.id,
      variantId: variant.id,
      skuCode: variant.skuCode,
      qtyShipped: Math.floor(input.qtyShipped),
      qtyReceived: input.qtyReceived !== undefined ? Math.max(0, Math.floor(input.qtyReceived)) : 0,
      qtyDamaged: input.qtyDamaged !== undefined ? Math.max(0, Math.floor(input.qtyDamaged)) : 0,
    })
  }
  await db.update(oceanShipments).set({ updatedAt: new Date() }).where(eq(oceanShipments.id, current.id))
  return (await getOceanShipment(db, organizationId, current.id))!
}

export async function removeOceanLine(
  db: AppDatabase,
  organizationId: string,
  shipmentId: string,
  lineId: string,
): Promise<OceanLotDto> {
  const current = await getOceanShipment(db, organizationId, shipmentId)
  if (!current) throw new Error('柜次不存在')
  const status = normalizeOceanStatus(current.statusCode)
  if (!(status === 'draft' || status === 'booked')) {
    throw new Error('仅草稿/已订舱可删除柜次行')
  }
  await db
    .delete(oceanShipmentLines)
    .where(
      and(
        eq(oceanShipmentLines.organizationId, organizationId),
        eq(oceanShipmentLines.shipmentId, current.id),
        eq(oceanShipmentLines.id, lineId),
      ),
    )
  return (await getOceanShipment(db, organizationId, current.id))!
}

export async function upsertOceanBox(
  db: AppDatabase,
  organizationId: string,
  shipmentId: string,
  input: {
    id?: string
    boxNo: string
    cartonSpecCode?: string
    leadRef?: string
    cbm?: number | null
    weightKg?: number | null
    sealNo?: string
    notes?: string
  },
): Promise<OceanLotDto> {
  const current = await getOceanShipment(db, organizationId, shipmentId)
  if (!current) throw new Error('柜次不存在')
  const status = normalizeOceanStatus(current.statusCode)
  if (status === 'received' || status === 'cancelled') throw new Error('终态柜次不可改装箱')
  const boxNo = input.boxNo.trim()
  if (!boxNo) throw new Error('箱号不能为空')

  if (input.id) {
    await db
      .update(oceanShipmentBoxes)
      .set({
        boxNo,
        cartonSpecCode: input.cartonSpecCode?.trim() || null,
        leadRef: input.leadRef?.trim() || null,
        cbm: input.cbm != null ? String(input.cbm) : null,
        weightKg: input.weightKg != null ? String(input.weightKg) : null,
        sealNo: input.sealNo?.trim() || null,
        notes: input.notes?.trim() || null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(oceanShipmentBoxes.organizationId, organizationId),
          eq(oceanShipmentBoxes.shipmentId, current.id),
          eq(oceanShipmentBoxes.id, input.id),
        ),
      )
  } else {
    await db.insert(oceanShipmentBoxes).values({
      id: createId(),
      organizationId,
      shipmentId: current.id,
      boxNo,
      cartonSpecCode: input.cartonSpecCode?.trim() || null,
      leadRef: input.leadRef?.trim() || null,
      cbm: input.cbm != null ? String(input.cbm) : null,
      weightKg: input.weightKg != null ? String(input.weightKg) : null,
      sealNo: input.sealNo?.trim() || null,
      notes: input.notes?.trim() || null,
    })
  }

  const boxes = await loadBoxes(db, organizationId, current.id)
  const totalCbm = boxes.reduce((s, b) => s + (b.cbm || 0), 0)
  const totalWeight = boxes.reduce((s, b) => s + (b.weightKg || 0), 0)
  await db
    .update(oceanShipments)
    .set({
      packingDetails: {
        ...(current.packingDetails || {}),
        boxCount: boxes.length,
        totalCbm,
        totalWeightKg: totalWeight,
        leadRefs: [...new Set(boxes.map((b) => b.leadRef).filter(Boolean))],
      },
      updatedAt: new Date(),
    })
    .where(eq(oceanShipments.id, current.id))
  return (await getOceanShipment(db, organizationId, current.id))!
}

export async function removeOceanBox(
  db: AppDatabase,
  organizationId: string,
  shipmentId: string,
  boxId: string,
): Promise<OceanLotDto> {
  const current = await getOceanShipment(db, organizationId, shipmentId)
  if (!current) throw new Error('柜次不存在')
  const status = normalizeOceanStatus(current.statusCode)
  if (status === 'received' || status === 'cancelled') throw new Error('终态柜次不可改装箱')
  await db
    .delete(oceanShipmentBoxes)
    .where(
      and(
        eq(oceanShipmentBoxes.organizationId, organizationId),
        eq(oceanShipmentBoxes.shipmentId, current.id),
        eq(oceanShipmentBoxes.id, boxId),
      ),
    )
  return (await getOceanShipment(db, organizationId, current.id))!
}

/* ───────── 库存余额 + 流水 ───────── */

async function getBalance(
  db: DbLike,
  organizationId: string,
  warehouseCode: string,
  binCodeInput: string,
  variantId: string,
) {
  const binCode = binCodeInput.trim() || 'UNASSIGNED'
  const [row] = await db
    .select()
    .from(inventoryBalances)
    .where(
      and(
        eq(inventoryBalances.organizationId, organizationId),
        eq(inventoryBalances.warehouseCode, warehouseCode),
        eq(inventoryBalances.binCode, binCode),
        eq(inventoryBalances.variantId, variantId),
      ),
    )
    .limit(1)
  return row ?? null
}

async function upsertOceanBalance(
  db: DbLike,
  input: {
    organizationId: string
    warehouseCode: string
    binCode: string
    variantId: string
    inTransitDelta?: number
    customsDelta?: number
    onHandDelta?: number
    damagedDelta?: number
  },
) {
  const binCode = input.binCode.trim() || 'UNASSIGNED'
  const existing = await getBalance(
    db,
    input.organizationId,
    input.warehouseCode,
    binCode,
    input.variantId,
  )
  if (!existing) {
    await db.insert(inventoryBalances).values({
      id: createId(),
      organizationId: input.organizationId,
      warehouseCode: input.warehouseCode,
      binCode,
      variantId: input.variantId,
      onHand: Math.max(0, input.onHandDelta || 0),
      damaged: Math.max(0, input.damagedDelta || 0),
      inTransit: Math.max(0, input.inTransitDelta || 0),
      customsClearing: Math.max(0, input.customsDelta || 0),
    })
    return
  }
  await db
    .update(inventoryBalances)
    .set({
      onHand: Math.max(0, existing.onHand + (input.onHandDelta || 0)),
      damaged: Math.max(0, existing.damaged + (input.damagedDelta || 0)),
      inTransit: Math.max(0, existing.inTransit + (input.inTransitDelta || 0)),
      customsClearing: Math.max(0, existing.customsClearing + (input.customsDelta || 0)),
      version: existing.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(inventoryBalances.id, existing.id))
}

async function findMovementByIdem(
  db: DbLike,
  organizationId: string,
  idempotencyKey: string,
) {
  const [row] = await db
    .select({ id: inventoryMovements.id })
    .from(inventoryMovements)
    .where(
      and(
        eq(inventoryMovements.organizationId, organizationId),
        eq(inventoryMovements.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1)
  return row ?? null
}

async function writeOceanMovement(
  db: DbLike,
  input: {
    organizationId: string
    warehouseCode: string
    binCode: string
    variantId: string
    movementType: string
    qtyDelta: number
    sourceId: string
    idempotencyKey: string
    operator?: string
    raw?: Record<string, unknown>
    after: {
      onHand: number
      reserved: number
      qcHold: number
      damaged: number
      inTransit: number
      customsClearing: number
    }
  },
) {
  const dup = await findMovementByIdem(db, input.organizationId, input.idempotencyKey)
  if (dup) return { skipped: true as const }
  await db.insert(inventoryMovements).values({
    id: createId(),
    organizationId: input.organizationId,
    warehouseCode: input.warehouseCode,
    binCode: input.binCode,
    variantId: input.variantId,
    movementType: input.movementType,
    qtyDelta: input.qtyDelta,
    onHandAfter: input.after.onHand,
    reservedAfter: input.after.reserved,
    qcHoldAfter: input.after.qcHold,
    damagedAfter: input.after.damaged,
    sourceType: 'ocean_shipment',
    sourceId: input.sourceId,
    operator: input.operator || null,
    idempotencyKey: input.idempotencyKey,
    occurredAt: new Date(),
    raw: {
      ...(input.raw || {}),
      inTransitAfter: input.after.inTransit,
      customsClearingAfter: input.after.customsClearing,
    },
  })
  return { skipped: false as const }
}

async function applyDepartInventory(
  tx: DbLike,
  organizationId: string,
  lot: OceanLotDto,
  operator?: string,
) {
  const warehouse = lot.warehouse || OCEAN_DEFAULT_WAREHOUSE
  const bin = OCEAN_STAGING_BIN
  for (const line of lot.lines || []) {
    if (line.qtyShipped <= 0) continue
    const idem = `ledger:ocean_depart:${lot.id}:${line.id}`
    if (await findMovementByIdem(tx, organizationId, idem)) continue
    await upsertOceanBalance(tx, {
      organizationId,
      warehouseCode: warehouse,
      binCode: bin,
      variantId: line.variantId,
      inTransitDelta: line.qtyShipped,
    })
    const bal = await getBalance(tx, organizationId, warehouse, bin, line.variantId)
    await writeOceanMovement(tx, {
      organizationId,
      warehouseCode: warehouse,
      binCode: bin,
      variantId: line.variantId,
      movementType: 'ocean_depart',
      qtyDelta: line.qtyShipped,
      sourceId: lot.id,
      idempotencyKey: idem,
      operator,
      raw: { lotCode: lot.lotCode, sku: line.sku, phase: 'depart' },
      after: {
        onHand: bal?.onHand ?? 0,
        reserved: bal?.reserved ?? 0,
        qcHold: bal?.qcHold ?? 0,
        damaged: bal?.damaged ?? 0,
        inTransit: bal?.inTransit ?? line.qtyShipped,
        customsClearing: bal?.customsClearing ?? 0,
      },
    })
  }
}

async function applyArriveAudit(
  tx: DbLike,
  organizationId: string,
  lot: OceanLotDto,
  operator?: string,
) {
  const warehouse = lot.warehouse || OCEAN_DEFAULT_WAREHOUSE
  const bin = OCEAN_STAGING_BIN
  for (const line of lot.lines || []) {
    if (line.qtyShipped <= 0) continue
    const idem = `ledger:ocean_arrive:${lot.id}:${line.id}`
    if (await findMovementByIdem(tx, organizationId, idem)) continue
    const bal = await getBalance(tx, organizationId, warehouse, bin, line.variantId)
    await writeOceanMovement(tx, {
      organizationId,
      warehouseCode: warehouse,
      binCode: bin,
      variantId: line.variantId,
      movementType: 'ocean_arrive',
      qtyDelta: 0,
      sourceId: lot.id,
      idempotencyKey: idem,
      operator,
      raw: { lotCode: lot.lotCode, sku: line.sku, phase: 'arrive', note: '到港审计，在途桶不变' },
      after: {
        onHand: bal?.onHand ?? 0,
        reserved: bal?.reserved ?? 0,
        qcHold: bal?.qcHold ?? 0,
        damaged: bal?.damaged ?? 0,
        inTransit: bal?.inTransit ?? 0,
        customsClearing: bal?.customsClearing ?? 0,
      },
    })
  }
}

async function applyCustomsInventory(
  tx: DbLike,
  organizationId: string,
  lot: OceanLotDto,
  operator?: string,
) {
  const warehouse = lot.warehouse || OCEAN_DEFAULT_WAREHOUSE
  const bin = OCEAN_STAGING_BIN
  for (const line of lot.lines || []) {
    if (line.qtyShipped <= 0) continue
    const idem = `ledger:ocean_customs:${lot.id}:${line.id}`
    if (await findMovementByIdem(tx, organizationId, idem)) continue
    await upsertOceanBalance(tx, {
      organizationId,
      warehouseCode: warehouse,
      binCode: bin,
      variantId: line.variantId,
      inTransitDelta: -line.qtyShipped,
      customsDelta: line.qtyShipped,
    })
    const bal = await getBalance(tx, organizationId, warehouse, bin, line.variantId)
    await writeOceanMovement(tx, {
      organizationId,
      warehouseCode: warehouse,
      binCode: bin,
      variantId: line.variantId,
      movementType: 'ocean_customs',
      qtyDelta: line.qtyShipped,
      sourceId: lot.id,
      idempotencyKey: idem,
      operator,
      raw: { lotCode: lot.lotCode, sku: line.sku, phase: 'customs' },
      after: {
        onHand: bal?.onHand ?? 0,
        reserved: bal?.reserved ?? 0,
        qcHold: bal?.qcHold ?? 0,
        damaged: bal?.damaged ?? 0,
        inTransit: bal?.inTransit ?? 0,
        customsClearing: bal?.customsClearing ?? line.qtyShipped,
      },
    })
  }
}

async function applyReceiveInventory(
  tx: DbLike,
  organizationId: string,
  lot: OceanLotDto,
  operator?: string,
) {
  const warehouse = lot.warehouse || OCEAN_DEFAULT_WAREHOUSE
  const bin = OCEAN_STAGING_BIN
  for (const line of lot.lines || []) {
    const qtyShipped = line.qtyShipped
    if (qtyShipped <= 0) continue
    let qtyReceived = line.qtyReceived
    let qtyDamaged = line.qtyDamaged
    if (qtyReceived <= 0 && qtyDamaged <= 0) {
      qtyReceived = qtyShipped
      qtyDamaged = 0
      await tx
        .update(oceanShipmentLines)
        .set({ qtyReceived, qtyDamaged })
        .where(eq(oceanShipmentLines.id, line.id))
    }
    if (qtyReceived + qtyDamaged > qtyShipped) {
      throw new Error(`行 ${line.sku} 实收+残次不能超过发运量`)
    }
    const idem = `ledger:ocean_receive:${lot.id}:${line.id}`
    if (await findMovementByIdem(tx, organizationId, idem)) continue

    // 清关桶减少发运量；本地可用 + 残次；不直改 on_hand 当在途
    await upsertOceanBalance(tx, {
      organizationId,
      warehouseCode: warehouse,
      binCode: bin,
      variantId: line.variantId,
      customsDelta: -qtyShipped,
      onHandDelta: qtyReceived,
      damagedDelta: qtyDamaged,
    })
    const bal = await getBalance(tx, organizationId, warehouse, bin, line.variantId)
    await writeOceanMovement(tx, {
      organizationId,
      warehouseCode: warehouse,
      binCode: bin,
      variantId: line.variantId,
      movementType: 'ocean_receive',
      qtyDelta: qtyReceived,
      sourceId: lot.id,
      idempotencyKey: idem,
      operator,
      raw: {
        lotCode: lot.lotCode,
        sku: line.sku,
        phase: 'receive',
        qtyReceived,
        qtyDamaged,
        qtyShipped,
      },
      after: {
        onHand: bal?.onHand ?? qtyReceived,
        reserved: bal?.reserved ?? 0,
        qcHold: bal?.qcHold ?? 0,
        damaged: bal?.damaged ?? qtyDamaged,
        inTransit: bal?.inTransit ?? 0,
        customsClearing: bal?.customsClearing ?? 0,
      },
    })
  }
}

export async function advanceOceanShipment(
  db: AppDatabase,
  organizationId: string,
  idOrLot: string,
  opts: {
    toStatus?: string
    operator?: string
    lineReceipts?: Array<{ lineId?: string; sku?: string; qtyReceived: number; qtyDamaged?: number }>
  } = {},
): Promise<OceanLotDto> {
  return db.transaction(async (tx) => {
    const current = await getOceanShipment(tx, organizationId, idOrLot)
    if (!current) throw new Error('柜次不存在')
    const from = normalizeOceanStatus(current.statusCode)
    if (from === 'cancelled') throw new Error('已取消柜次不可推进')
    if (from === 'received') throw new Error('已入本地仓，无需推进')

    const expected = nextOceanStatus(from)
    if (!expected) throw new Error('无下一状态')
    const target = opts.toStatus ? toDbOceanStatus(opts.toStatus) : expected
    const to = normalizeOceanStatus(target)
    if (to !== expected) {
      throw new Error(
        `状态只能按序推进：当前 ${toUiOceanStatus(from)}，下一态应为 ${toUiOceanStatus(expected)}`,
      )
    }

    if ((current.lines || []).length === 0 && to === 'departed') {
      throw new Error('柜次无装箱 SKU 行，无法开船计入在途')
    }

    if (opts.lineReceipts?.length) {
      for (const rec of opts.lineReceipts) {
        const line = (current.lines || []).find(
          (l) => l.id === rec.lineId || (rec.sku && l.sku === rec.sku),
        )
        if (!line) continue
        await tx
          .update(oceanShipmentLines)
          .set({
            qtyReceived: Math.max(0, Math.floor(rec.qtyReceived)),
            qtyDamaged: Math.max(0, Math.floor(rec.qtyDamaged || 0)),
          })
          .where(eq(oceanShipmentLines.id, line.id))
      }
      // reload lines for receive
      current.lines = await loadLines(tx, organizationId, current.id)
    }

    if (to === 'departed') {
      await applyDepartInventory(tx, organizationId, current, opts.operator)
    } else if (to === 'arrived') {
      // 若直接从 booked 误入不会发生；若历史数据缺 depart 流水则补
      await applyDepartInventory(tx, organizationId, current, opts.operator)
      await applyArriveAudit(tx, organizationId, current, opts.operator)
    } else if (to === 'customs') {
      await applyDepartInventory(tx, organizationId, current, opts.operator)
      await applyCustomsInventory(tx, organizationId, current, opts.operator)
    } else if (to === 'received') {
      await applyDepartInventory(tx, organizationId, current, opts.operator)
      await applyCustomsInventory(tx, organizationId, current, opts.operator)
      await applyReceiveInventory(tx, organizationId, current, opts.operator)
    }

    await tx
      .update(oceanShipments)
      .set({ status: to, updatedAt: new Date() })
      .where(eq(oceanShipments.id, current.id))

    return (await getOceanShipment(tx, organizationId, current.id))!
  })
}

export async function cancelOceanShipment(
  db: AppDatabase,
  organizationId: string,
  idOrLot: string,
  reason?: string,
): Promise<OceanLotDto> {
  const current = await getOceanShipment(db, organizationId, idOrLot)
  if (!current) throw new Error('柜次不存在')
  if (!canCancelOceanStatus(current.statusCode)) {
    throw new Error('仅草稿/已订舱可取消；已开船请走到仓差异或库存调整')
  }
  await db
    .update(oceanShipments)
    .set({
      status: 'cancelled',
      notes: reason?.trim()
        ? `${current.notes ? current.notes + '；' : ''}取消：${reason.trim()}`
        : current.notes || null,
      updatedAt: new Date(),
    })
    .where(eq(oceanShipments.id, current.id))
  return (await getOceanShipment(db, organizationId, current.id))!
}

export async function saveOceanLotCost(
  db: AppDatabase,
  organizationId: string,
  input: {
    shipmentId: string
    sku: string
    kind?: string
    amount: number
    currency?: string
    landedUnitCost?: number
    feeTemplateVersionId?: string | null
    taxTemplateCode?: string | null
    taxBreakdown?: Record<string, unknown>
    calculatorSnapshot?: Record<string, unknown>
    note?: string
    fxRateId?: string | null
  },
): Promise<OceanLotCostDto> {
  const lot = await getOceanShipment(db, organizationId, input.shipmentId)
  if (!lot) throw new Error('柜次不存在')
  const variant = await resolveVariant(db, organizationId, input.sku)

  // 正式成本三要素服务端强制校验（不可绕过 UI）：汇率 + 进口税费用模板版本。
  if (!input.fxRateId?.trim()) {
    throw new Error('缺少汇率引用（fxRateId），不可保存正式成本')
  }
  const [fxRow] = await db
    .select({ id: fxRates.id })
    .from(fxRates)
    .where(
      and(
        eq(fxRates.id, input.fxRateId.trim()),
        eq(fxRates.organizationId, organizationId),
        eq(fxRates.status, 'active'),
      ),
    )
    .limit(1)
  if (!fxRow) throw new Error('汇率不存在、已停用或不属于本组织，不可保存正式成本')

  if (!input.feeTemplateVersionId?.trim()) {
    throw new Error('缺少费用模板版本（feeTemplateVersionId），不可保存正式成本')
  }
  const [versionRow] = await db
    .select({ id: feeTemplateVersions.id, type: feeTemplates.type, status: feeTemplateVersions.status })
    .from(feeTemplateVersions)
    .innerJoin(feeTemplates, eq(feeTemplateVersions.templateId, feeTemplates.id))
    .where(
      and(
        eq(feeTemplateVersions.id, input.feeTemplateVersionId.trim()),
        eq(feeTemplateVersions.organizationId, organizationId),
      ),
    )
    .limit(1)
  if (!versionRow) throw new Error('费用模板版本不存在或不属于本组织，不可保存正式成本')
  if (versionRow.type !== 'import_tax') {
    throw new Error('正式成本必须引用进口税（import_tax）费用模板版本')
  }
  if (versionRow.status !== 'published') {
    throw new Error('费用模板版本未发布，不可保存正式成本')
  }

  const existing = await db
    .select({ versionNo: skuCosts.versionNo })
    .from(skuCosts)
    .where(
      and(
        eq(skuCosts.organizationId, organizationId),
        eq(skuCosts.variantId, variant.id),
        eq(skuCosts.containerLotId, lot.id),
      ),
    )
  const versionNo = existing.reduce((m, r) => Math.max(m, r.versionNo), 0) + 1
  const id = createId()
  const amount = input.landedUnitCost ?? input.amount
  await db.insert(skuCosts).values({
    id,
    organizationId,
    variantId: variant.id,
    kind: input.kind?.trim() || 'landed_unit',
    amount: String(amount),
    currency: (input.currency || 'USD').toUpperCase(),
    note: input.note?.trim() || `柜次 ${lot.lotCode}`,
    versionNo,
    containerLotId: lot.id,
    taxTemplateCode: input.taxTemplateCode || null,
    feeTemplateVersionId: input.feeTemplateVersionId || null,
    taxBreakdown: input.taxBreakdown || null,
    calculatorSnapshot: input.calculatorSnapshot || null,
    landedUnitCost: input.landedUnitCost != null ? String(input.landedUnitCost) : String(amount),
    fxRateId: input.fxRateId || null,
    effectiveFrom: new Date(),
  })
  // 回写最新成本到柜次行
  await db
    .update(oceanShipmentLines)
    .set({ skuCostId: id })
    .where(
      and(
        eq(oceanShipmentLines.shipmentId, lot.id),
        eq(oceanShipmentLines.variantId, variant.id),
      ),
    )
  const costs = await loadCosts(db, organizationId, lot.id)
  const saved = costs.find((c) => c.id === id)
  if (!saved) throw new Error('保存柜次成本失败')
  return saved
}

export async function listOceanInventoryBuckets(
  db: AppDatabase,
  organizationId: string,
  warehouse?: string,
): Promise<OceanInventoryBucketDto[]> {
  const wh = warehouse?.trim()
  const filters: SQL[] = [eq(inventoryBalances.organizationId, organizationId)]
  if (wh) filters.push(eq(inventoryBalances.warehouseCode, wh))
  else {
    // 默认展示 Colombo 本地仓 + 有在途/清关的余额
    filters.push(
      or(
        eq(inventoryBalances.warehouseCode, OCEAN_DEFAULT_WAREHOUSE),
        sql`(${inventoryBalances.inTransit} > 0 or ${inventoryBalances.customsClearing} > 0)`,
      )!,
    )
  }
  const rows = await db
    .select({
      id: inventoryBalances.id,
      warehouseCode: inventoryBalances.warehouseCode,
      variantId: inventoryBalances.variantId,
      onHand: inventoryBalances.onHand,
      reserved: inventoryBalances.reserved,
      qcHold: inventoryBalances.qcHold,
      damaged: inventoryBalances.damaged,
      inTransit: inventoryBalances.inTransit,
      customsClearing: inventoryBalances.customsClearing,
      skuCode: productVariants.skuCode,
      sku: productVariants.sku,
      title: products.title,
    })
    .from(inventoryBalances)
    .leftJoin(productVariants, eq(productVariants.id, inventoryBalances.variantId))
    .leftJoin(products, eq(products.id, productVariants.productId))
    .where(and(...filters))
    .orderBy(desc(inventoryBalances.updatedAt))
    .limit(200)

  return rows
    .filter((r) => r.inTransit > 0 || r.customsClearing > 0 || r.onHand > 0 || r.damaged > 0)
    .map((r) => ({
      id: r.id,
      sku: r.skuCode || r.sku || r.variantId,
      name: r.title || r.skuCode || '',
      warehouse: r.warehouseCode,
      inTransit: r.inTransit,
      customsClearing: r.customsClearing,
      available: Math.max(0, r.onHand - r.reserved - r.qcHold - r.damaged),
      damaged: r.damaged,
    }))
}

export function oceanMeta() {
  return {
    statuses: [
      { value: 'draft', label: '草稿' },
      { value: 'booked', label: '已订舱' },
      { value: 'departed', label: '在途' },
      { value: 'arrived', label: '已到港' },
      { value: 'customs', label: '清关中' },
      { value: 'received', label: '已入本地仓' },
      { value: 'cancelled', label: '已取消' },
    ],
    freightModes: ['FCL', 'FCL20', 'FCL40', 'LCL'],
    defaultWarehouse: OCEAN_DEFAULT_WAREHOUSE,
    stagingBin: OCEAN_STAGING_BIN,
    idempotencyPrefixes: [
      'ledger:ocean_depart:',
      'ledger:ocean_arrive:',
      'ledger:ocean_customs:',
      'ledger:ocean_receive:',
    ],
  }
}
