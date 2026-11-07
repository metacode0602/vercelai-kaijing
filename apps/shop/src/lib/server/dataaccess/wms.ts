/**
 * WMS 库存余额 / 台账 / 非订单出库 / 调整单 dataaccess（模块8）。
 * tenant → 本层事务 → Drizzle。禁止直改余额无流水；非订单出库不碰销售占库。
 * 幂等：ledger:wms_outbound:* / ledger:stock_adjust:*
 */
import { and, asc, count, desc, eq, ilike, inArray, ne, or, sql, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import {
  binBindingHistory,
  commerceBinBindings,
  commerceBins,
  commerceWarehouseZones,
  commerceWarehouses,
  inventoryBalances,
  inventoryMovements,
  productVariants,
  products,
  stockAdjustmentLines,
  stockAdjustments,
  stockOutboundLines,
  stockOutbounds,
} from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import {
  availableQty,
  DEFAULT_WMS_BIN,
  DEFAULT_WMS_WAREHOUSE,
  formatStamp,
  isNonOrderOutboundType,
  toDbAdjustmentKind,
  toDbAdjustmentStatus,
  toDbBinStatus,
  toDbOutboundStatus,
  toDbOutboundType,
  toDbWarehouseStatus,
  toDbWarehouseType,
  toUiAdjustmentKind,
  toUiAdjustmentStatus,
  toUiBinStatus,
  toUiMovementType,
  toUiOutboundStatus,
  toUiOutboundType,
  toUiWarehouseStatus,
  toUiWarehouseType,
  type UiAdjustmentKind,
  type UiAdjustmentStatus,
  type UiBinStatus,
  type UiOutboundStatus,
  type UiOutboundType,
  type UiWarehouseStatus,
  type UiWarehouseType,
} from '@/lib/server/mappers/wms'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export type WarehouseDto = {
  id: string
  code: string
  name: string
  type: UiWarehouseType
  country: string
  timezone: string
  currency: string
  status: UiWarehouseStatus
  address: string
  note: string
  binCount: number
  updatedAt: string
}

export type BinDto = {
  id: string
  warehouseId: string
  warehouseCode: string
  zoneCode: string
  code: string
  name: string
  boundSku: string
  status: UiBinStatus
  note: string
  updatedAt: string
}

export type BinBindingDto = {
  id: string
  binId: string
  variantId: string
  sku: string
  name: string
  state: 'active' | 'released' | 'disabled'
  boundAt: string
  boundBy: string
  releasedAt: string
  releasedBy: string
  releaseReason: string
}

export type BinBindingHistoryDto = {
  id: string
  action: 'bind' | 'unbind' | 'disable' | 'correct'
  actionLabel: string
  variantId: string
  sku: string
  name: string
  reason: string
  operatorId: string
  occurredAt: string
  bindingId: string
}

/** 库区：commerce_warehouse_zones 真实表；id 兼容旧 warehouse:code 合成值。 */
export type ZoneDto = {
  id: string
  warehouseId: string
  warehouseCode: string
  code: string
  name: string
  purpose: string
  status: '启用' | '停用'
  note: string
  binCount: number
  updatedAt: string
}

export type BalanceDto = {
  id: string
  warehouse: string
  bin: string
  sku: string
  name: string
  variantId: string
  onHand: number
  reserved: number
  qcHold: number
  damaged: number
  inTransit: number
  pendingInbound: number
  customsClearing: number
  available: number
  version: number
  updatedAt: string
  status: '正常' | '低库存'
  threshold: number
}

export type MovementDto = {
  id: string
  warehouse: string
  bin: string
  sku: string
  variantId: string
  movementType: string
  type: string
  qtyDelta: number
  onHandAfter: number
  reservedAfter: number
  qcHoldAfter: number
  damagedAfter: number
  sourceType: string
  sourceId: string
  operator: string
  idempotencyKey: string
  occurredAt: string
  direction: 'in' | 'out' | 'adjust' | 'move'
  status: '已记账'
}

export type WmsOutboundLineDto = {
  id: string
  lineNo: number
  sku: string
  variantId: string
  quantity: number
  bin: string
  note: string
}

export type WmsOutboundDto = {
  id: string
  outboundNo: string
  outboundType: UiOutboundType
  warehouse: string
  order: string
  orderId: string | null
  packageId: string
  picker: string
  status: UiOutboundStatus
  createdAt: string
  pickedAt: string
  checkedAt: string
  shippedAt: string
  reason: string
  remark: string
  idempotencyKey: string
  lineCount: number
  firstSku: string
  totalQty: number
  bin: string
  sku: string
  quantity: number
  lines: WmsOutboundLineDto[]
}

export type WmsOutboundListRow = Omit<WmsOutboundDto, 'lines'>

export type AdjustmentLineDto = {
  id: string
  lineNo: number
  sku: string
  variantId: string
  bin: string
  qtySystem: number
  qtyCounted: number
  qtyDiff: number
  note: string
}

export type AdjustmentDto = {
  id: string
  adjustmentNo: string
  kind: UiAdjustmentKind
  warehouse: string
  status: UiAdjustmentStatus
  reason: string
  applicant: string
  approver: string
  createdAt: string
  approvedAt: string
  postedAt: string
  rejectReason: string
  remark: string
  idempotencyKey: string
  lineCount: number
  firstSku: string
  totalDiff: number
  lines: AdjustmentLineDto[]
}

export type AdjustmentListRow = Omit<AdjustmentDto, 'lines'>

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function resolveVariantBySku(db: DbLike, organizationId: string, sku: string) {
  const code = sku.trim()
  const [row] = await db
    .select({
      id: productVariants.id,
      skuCode: productVariants.skuCode,
      sku: productVariants.sku,
      name: products.title,
    })
    .from(productVariants)
    .leftJoin(products, eq(products.id, productVariants.productId))
    .where(
      and(
        eq(productVariants.organizationId, organizationId),
        or(eq(productVariants.skuCode, code), eq(productVariants.sku, code)),
      ),
    )
    .limit(1)
  if (!row) throw new Error(`SKU ${code} 不存在`)
  return {
    id: row.id,
    skuCode: row.skuCode || row.sku || code,
    name: row.name || code,
  }
}

async function findMovementByIdem(db: DbLike, organizationId: string, key: string) {
  const [row] = await db
    .select({ id: inventoryMovements.id })
    .from(inventoryMovements)
    .where(
      and(
        eq(inventoryMovements.organizationId, organizationId),
        eq(inventoryMovements.idempotencyKey, key),
      ),
    )
    .limit(1)
  return row ?? null
}

async function getOrCreateBalance(
  db: DbLike,
  input: {
    organizationId: string
    warehouseCode: string
    binCode: string
    variantId: string
  },
) {
  const binCode = input.binCode.trim() || 'UNASSIGNED'
  const [existing] = await db
    .select()
    .from(inventoryBalances)
    .where(
      and(
        eq(inventoryBalances.organizationId, input.organizationId),
        eq(inventoryBalances.warehouseCode, input.warehouseCode),
        eq(inventoryBalances.binCode, binCode),
        eq(inventoryBalances.variantId, input.variantId),
      ),
    )
    .limit(1)
  if (existing) return existing
  const id = createId()
  await db.insert(inventoryBalances).values({
    id,
    organizationId: input.organizationId,
    warehouseCode: input.warehouseCode,
    binCode,
    variantId: input.variantId,
    onHand: 0,
    reserved: 0,
    qcHold: 0,
    damaged: 0,
    inTransit: 0,
    pendingInbound: 0,
    customsClearing: 0,
    version: 1,
  })
  const [created] = await db.select().from(inventoryBalances).where(eq(inventoryBalances.id, id)).limit(1)
  return created!
}

type BinBindingActionCode = 'bind' | 'unbind' | 'disable' | 'correct'

const binBindingActionLabels: Record<BinBindingActionCode, string> = {
  bind: '绑定',
  unbind: '解绑',
  disable: '停用',
  correct: '更正',
}

async function getActiveBinBinding(
  db: DbLike,
  organizationId: string,
  binId: string,
): Promise<typeof commerceBinBindings.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(commerceBinBindings)
    .where(
      and(
        eq(commerceBinBindings.organizationId, organizationId),
        eq(commerceBinBindings.binId, binId),
        eq(commerceBinBindings.state, 'active'),
      ),
    )
    .limit(1)
  return row ?? null
}

async function writeBinBindingHistory(
  db: DbLike,
  input: {
    organizationId: string
    warehouseId: string
    binId: string
    variantId?: string | null
    bindingId?: string | null
    action: BinBindingActionCode
    reason?: string | null
    operatorId?: string | null
  },
) {
  await db.insert(binBindingHistory).values({
    id: createId(),
    organizationId: input.organizationId,
    warehouseId: input.warehouseId,
    binId: input.binId,
    variantId: input.variantId || null,
    bindingId: input.bindingId || null,
    action: input.action,
    reason: input.reason?.trim() || null,
    operatorId: input.operatorId || null,
    operatorType: 'user',
    occurredAt: new Date(),
  })
}

async function assertBinInventoryZero(
  db: DbLike,
  organizationId: string,
  warehouseCode: string,
  binCode: string,
  actionLabel: string,
) {
  const [row] = await db
    .select({
      onHand: sql<number>`coalesce(sum(${inventoryBalances.onHand}), 0)`,
      reserved: sql<number>`coalesce(sum(${inventoryBalances.reserved}), 0)`,
      qcHold: sql<number>`coalesce(sum(${inventoryBalances.qcHold}), 0)`,
      damaged: sql<number>`coalesce(sum(${inventoryBalances.damaged}), 0)`,
      inTransit: sql<number>`coalesce(sum(${inventoryBalances.inTransit}), 0)`,
      pendingInbound: sql<number>`coalesce(sum(${inventoryBalances.pendingInbound}), 0)`,
      customsClearing: sql<number>`coalesce(sum(${inventoryBalances.customsClearing}), 0)`,
    })
    .from(inventoryBalances)
    .where(
      and(
        eq(inventoryBalances.organizationId, organizationId),
        eq(inventoryBalances.warehouseCode, warehouseCode),
        eq(inventoryBalances.binCode, binCode),
      ),
    )
  const total =
    Number(row?.onHand ?? 0) +
    Number(row?.reserved ?? 0) +
    Number(row?.qcHold ?? 0) +
    Number(row?.damaged ?? 0) +
    Number(row?.inTransit ?? 0) +
    Number(row?.pendingInbound ?? 0) +
    Number(row?.customsClearing ?? 0)
  if (total !== 0) {
    throw new Error(`${actionLabel}前需库存为 0（当前 ${total}），请先走库存转移单`)
  }
}

async function closeBinBinding(
  db: DbLike,
  input: {
    binding: typeof commerceBinBindings.$inferSelect
    state: 'released' | 'disabled'
    action: 'unbind' | 'disable'
    reason: string
    operatorId?: string | null
  },
) {
  const at = new Date()
  await db
    .update(commerceBinBindings)
    .set({
      state: input.state,
      releasedAt: at,
      releasedBy: input.operatorId || null,
      releaseReason: input.reason,
      updatedAt: at,
    })
    .where(eq(commerceBinBindings.id, input.binding.id))
  await writeBinBindingHistory(db, {
    organizationId: input.binding.organizationId,
    warehouseId: input.binding.warehouseId,
    binId: input.binding.binId,
    variantId: input.binding.variantId,
    bindingId: input.binding.id,
    action: input.action,
    reason: input.reason,
    operatorId: input.operatorId,
  })
}

async function bindSkuToBin(
  db: DbLike,
  input: {
    organizationId: string
    warehouseId: string
    binId: string
    variant: { id: string; skuCode: string }
    operatorId?: string | null
    reason?: string | null
  },
) {
  const [active] = await db
    .select({ id: commerceBinBindings.id })
    .from(commerceBinBindings)
    .where(
      and(
        eq(commerceBinBindings.organizationId, input.organizationId),
        eq(commerceBinBindings.binId, input.binId),
        eq(commerceBinBindings.state, 'active'),
      ),
    )
    .limit(1)
  if (active) throw new Error('库位已有有效绑定，请先解绑')
  const [busy] = await db
    .select({ code: commerceBins.code })
    .from(commerceBinBindings)
    .innerJoin(commerceBins, eq(commerceBins.id, commerceBinBindings.binId))
    .where(
      and(
        eq(commerceBinBindings.organizationId, input.organizationId),
        eq(commerceBinBindings.warehouseId, input.warehouseId),
        eq(commerceBinBindings.variantId, input.variant.id),
        eq(commerceBinBindings.state, 'active'),
        ne(commerceBinBindings.binId, input.binId),
      ),
    )
    .limit(1)
  if (busy) throw new Error(`SKU ${input.variant.skuCode} 已绑定库位 ${busy.code}`)

  const id = createId()
  const at = new Date()
  await db.insert(commerceBinBindings).values({
    id,
    organizationId: input.organizationId,
    warehouseId: input.warehouseId,
    binId: input.binId,
    variantId: input.variant.id,
    state: 'active',
    boundAt: at,
    boundBy: input.operatorId || null,
  })
  await writeBinBindingHistory(db, {
    organizationId: input.organizationId,
    warehouseId: input.warehouseId,
    binId: input.binId,
    variantId: input.variant.id,
    bindingId: id,
    action: 'bind',
    reason: input.reason || null,
    operatorId: input.operatorId,
  })
  return id
}

function movementDirection(qtyDelta: number, movementType: string): MovementDto['direction'] {
  if (movementType === 'stock_adjust' || movementType === 'adjustment') return 'adjust'
  if (qtyDelta > 0) return 'in'
  if (qtyDelta < 0) return 'out'
  return 'move'
}

async function nextOutboundNo(db: DbLike, organizationId: string): Promise<string> {
  const [row] = await db
    .select({ c: count() })
    .from(stockOutbounds)
    .where(eq(stockOutbounds.organizationId, organizationId))
  const n = Number(row?.c ?? 0) + 1
  return `SO-WMS-${String(n).padStart(6, '0')}`
}

async function nextAdjustmentNo(db: DbLike, organizationId: string): Promise<string> {
  const [row] = await db
    .select({ c: count() })
    .from(stockAdjustments)
    .where(eq(stockAdjustments.organizationId, organizationId))
  const n = Number(row?.c ?? 0) + 1
  return `ADJ-${String(n).padStart(6, '0')}`
}

// ---------------------------------------------------------------------------
// meta / warehouses / bins
// ---------------------------------------------------------------------------

export function wmsMeta() {
  return {
    warehouseTypes: ['自营仓', 'LGS', 'JSB', '第三方仓'],
    warehouseStatuses: ['启用', '停用'],
    binStatuses: ['空闲', '占用', '锁定', '停用'],
    zoneStatuses: ['启用', '停用'],
    outboundTypes: ['调拨出库', '采购退货', '盘亏出库', '样品出库', '其他出库'],
    outboundStatuses: ['待拣货', '拣货中', '已复核', '已出库', '已取消'],
    adjustmentKinds: ['盘点', '报损', '手工入库', '手工出库', '复盘'],
    adjustmentStatuses: ['草稿', '待审批', '已通过', '已过账', '已驳回', '已取消'],
    availableFormula: 'on_hand - reserved - qc_hold - damaged',
    idempotencyPrefixes: ['ledger:wms_outbound:', 'ledger:stock_adjust:'],
    defaultWarehouse: DEFAULT_WMS_WAREHOUSE,
    defaultBin: DEFAULT_WMS_BIN,
  }
}

export async function listWarehouses(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string; status?: string } = {},
): Promise<PaginatedResult<WarehouseDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const filters: SQL[] = [eq(commerceWarehouses.organizationId, organizationId)]
  if (input.status) {
    filters.push(eq(commerceWarehouses.status, toDbWarehouseStatus(input.status)))
  }
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(or(ilike(commerceWarehouses.code, q), ilike(commerceWarehouses.name, q))!)
  }
  const where = and(...filters)
  const [totalRow] = await db.select({ c: count() }).from(commerceWarehouses).where(where)
  const rows = await db
    .select()
    .from(commerceWarehouses)
    .where(where)
    .orderBy(desc(commerceWarehouses.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const items: WarehouseDto[] = []
  for (const row of rows) {
    const [binCount] = await db
      .select({ c: count() })
      .from(commerceBins)
      .where(and(eq(commerceBins.organizationId, organizationId), eq(commerceBins.warehouseId, row.id)))
    items.push({
      id: row.id,
      code: row.code,
      name: row.name,
      type: toUiWarehouseType(row.type),
      country: row.country,
      timezone: row.timezone,
      currency: row.operatingCurrency,
      status: toUiWarehouseStatus(row.status),
      address: row.address || '',
      note: row.note || '',
      binCount: Number(binCount?.c ?? 0),
      updatedAt: formatStamp(row.updatedAt),
    })
  }
  return { items, total: Number(totalRow?.c ?? 0), page, pageSize }
}

export async function warehouseStats(db: AppDatabase, organizationId: string) {
  const [total] = await db
    .select({ c: count() })
    .from(commerceWarehouses)
    .where(eq(commerceWarehouses.organizationId, organizationId))
  const [active] = await db
    .select({ c: count() })
    .from(commerceWarehouses)
    .where(
      and(eq(commerceWarehouses.organizationId, organizationId), eq(commerceWarehouses.status, 'active')),
    )
  const [bins] = await db
    .select({ c: count() })
    .from(commerceBins)
    .where(eq(commerceBins.organizationId, organizationId))
  const [occupied] = await db
    .select({ c: count() })
    .from(commerceBins)
    .where(and(eq(commerceBins.organizationId, organizationId), eq(commerceBins.status, 'occupied')))
  const [empty] = await db
    .select({ c: count() })
    .from(commerceBins)
    .where(and(eq(commerceBins.organizationId, organizationId), eq(commerceBins.status, 'empty')))
  return {
    warehouses: Number(total?.c ?? 0),
    activeWarehouses: Number(active?.c ?? 0),
    bins: Number(bins?.c ?? 0),
    occupiedBins: Number(occupied?.c ?? 0),
    emptyBins: Number(empty?.c ?? 0),
  }
}

export async function getWarehouse(db: AppDatabase | DbLike, organizationId: string, idOrCode: string) {
  const [row] = await db
    .select()
    .from(commerceWarehouses)
    .where(
      and(
        eq(commerceWarehouses.organizationId, organizationId),
        or(eq(commerceWarehouses.id, idOrCode), eq(commerceWarehouses.code, idOrCode)),
      ),
    )
    .limit(1)
  if (!row) return null
  const [binCount] = await db
    .select({ c: count() })
    .from(commerceBins)
    .where(and(eq(commerceBins.organizationId, organizationId), eq(commerceBins.warehouseId, row.id)))
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: toUiWarehouseType(row.type),
    country: row.country,
    timezone: row.timezone,
    currency: row.operatingCurrency,
    status: toUiWarehouseStatus(row.status),
    address: row.address || '',
    note: row.note || '',
    binCount: Number(binCount?.c ?? 0),
    updatedAt: formatStamp(row.updatedAt),
  } satisfies WarehouseDto
}

export async function createWarehouse(
  db: AppDatabase,
  organizationId: string,
  input: {
    code: string
    name: string
    type?: string
    country?: string
    timezone?: string
    currency?: string
    address?: string
    note?: string
  },
): Promise<WarehouseDto> {
  const code = input.code.trim().toUpperCase()
  if (!code) throw new Error('仓库编码必填')
  if (!input.name.trim()) throw new Error('仓库名称必填')
  return db.transaction(async (tx) => {
    const [dup] = await tx
      .select({ id: commerceWarehouses.id })
      .from(commerceWarehouses)
      .where(and(eq(commerceWarehouses.organizationId, organizationId), eq(commerceWarehouses.code, code)))
      .limit(1)
    if (dup) throw new Error(`仓库编码 ${code} 已存在`)
    const id = createId()
    await tx.insert(commerceWarehouses).values({
      id,
      organizationId,
      code,
      name: input.name.trim(),
      type: toDbWarehouseType(input.type || '自营仓'),
      country: (input.country || 'CN').trim(),
      timezone: input.timezone || 'Asia/Shanghai',
      operatingCurrency: (input.currency || 'CNY').trim().toUpperCase(),
      address: input.address?.trim() || null,
      note: input.note?.trim() || null,
      status: 'active',
    })
    return (await getWarehouse(tx, organizationId, id))!
  })
}

export async function updateWarehouse(
  db: AppDatabase,
  organizationId: string,
  id: string,
  patch: Partial<{
    name: string
    type: string
    country: string
    timezone: string
    currency: string
    address: string
    note: string
    status: string
  }>,
): Promise<WarehouseDto> {
  return db.transaction(async (tx) => {
    const current = await getWarehouse(tx, organizationId, id)
    if (!current) throw new Error('仓库不存在')
    await tx
      .update(commerceWarehouses)
      .set({
        name: patch.name?.trim() || current.name,
        type: patch.type ? toDbWarehouseType(patch.type) : toDbWarehouseType(current.type),
        country: patch.country?.trim() || current.country,
        timezone: patch.timezone || current.timezone,
        operatingCurrency: patch.currency?.trim().toUpperCase() || current.currency,
        address: patch.address !== undefined ? patch.address.trim() : current.address,
        note: patch.note !== undefined ? patch.note.trim() : current.note,
        status: patch.status ? toDbWarehouseStatus(patch.status) : toDbWarehouseStatus(current.status),
        updatedAt: new Date(),
      })
      .where(eq(commerceWarehouses.id, current.id))
    return (await getWarehouse(tx, organizationId, current.id))!
  })
}

export async function listBins(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string; warehouse?: string; status?: string } = {},
): Promise<PaginatedResult<BinDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const filters: SQL[] = [eq(commerceBins.organizationId, organizationId)]
  if (input.warehouse?.trim()) {
    filters.push(eq(commerceBins.warehouseCode, input.warehouse.trim()))
  }
  if (input.status) filters.push(eq(commerceBins.status, toDbBinStatus(input.status)))
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(
      or(ilike(commerceBins.code, q), ilike(commerceBins.boundSku, q), ilike(commerceBins.zoneCode, q))!,
    )
  }
  const where = and(...filters)
  const [totalRow] = await db.select({ c: count() }).from(commerceBins).where(where)
  const rows = await db
    .select()
    .from(commerceBins)
    .where(where)
    .orderBy(desc(commerceBins.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  return {
    items: rows.map((row) => ({
      id: row.id,
      warehouseId: row.warehouseId,
      warehouseCode: row.warehouseCode,
      zoneCode: row.zoneCode || '',
      code: row.code,
      name: row.name || row.code,
      boundSku: row.boundSku || '',
      status: toUiBinStatus(row.status),
      note: row.note || '',
      updatedAt: formatStamp(row.updatedAt),
    })),
    total: Number(totalRow?.c ?? 0),
    page,
    pageSize,
  }
}

export async function createBin(
  db: AppDatabase,
  organizationId: string,
  input: {
    warehouseCode: string
    code: string
    zoneCode?: string
    name?: string
    boundSku?: string
    note?: string
  },
  operatorId?: string | null,
): Promise<BinDto> {
  const warehouseCode = input.warehouseCode.trim()
  const code = input.code.trim()
  if (!warehouseCode || !code) throw new Error('仓库与库位编码必填')
  return db.transaction(async (tx) => {
    const [wh] = await tx
      .select()
      .from(commerceWarehouses)
      .where(
        and(
          eq(commerceWarehouses.organizationId, organizationId),
          eq(commerceWarehouses.code, warehouseCode),
        ),
      )
      .limit(1)
    if (!wh) throw new Error(`仓库 ${warehouseCode} 不存在`)
    if (wh.status !== 'active') throw new Error('停用仓库不可新增库位')
    const [dup] = await tx
      .select({ id: commerceBins.id })
      .from(commerceBins)
      .where(
        and(
          eq(commerceBins.organizationId, organizationId),
          eq(commerceBins.warehouseId, wh.id),
          eq(commerceBins.code, code),
        ),
      )
      .limit(1)
    if (dup) throw new Error(`库位 ${code} 已存在`)
    const variant = input.boundSku?.trim()
      ? await resolveVariantBySku(tx, organizationId, input.boundSku)
      : null
    const boundSku = variant?.skuCode || null
    const id = createId()
    await tx.insert(commerceBins).values({
      id,
      organizationId,
      warehouseId: wh.id,
      warehouseCode: wh.code,
      zoneCode: input.zoneCode?.trim() || null,
      code,
      name: input.name?.trim() || code,
      boundSku,
      status: boundSku ? 'occupied' : 'empty',
      note: input.note?.trim() || null,
    })
    if (variant) {
      await bindSkuToBin(tx, {
        organizationId,
        warehouseId: wh.id,
        binId: id,
        variant,
        operatorId,
      })
    }
    const [row] = await tx.select().from(commerceBins).where(eq(commerceBins.id, id)).limit(1)
    return {
      id: row!.id,
      warehouseId: row!.warehouseId,
      warehouseCode: row!.warehouseCode,
      zoneCode: row!.zoneCode || '',
      code: row!.code,
      name: row!.name || row!.code,
      boundSku: row!.boundSku || '',
      status: toUiBinStatus(row!.status),
      note: row!.note || '',
      updatedAt: formatStamp(row!.updatedAt),
    }
  })
}

export async function updateBin(
  db: AppDatabase,
  organizationId: string,
  id: string,
  patch: Partial<{
    zoneCode: string
    name: string
    boundSku: string
    status: string
    note: string
    reason: string
  }>,
  operatorId?: string | null,
): Promise<BinDto> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(commerceBins)
      .where(and(eq(commerceBins.organizationId, organizationId), eq(commerceBins.id, id)))
      .limit(1)
    if (!row) throw new Error('库位不存在')
    const requestedVariant =
      patch.boundSku !== undefined && patch.boundSku.trim()
        ? await resolveVariantBySku(tx, organizationId, patch.boundSku)
        : null
    const requestedBound =
      patch.boundSku !== undefined ? requestedVariant?.skuCode || null : row.boundSku
    const bindingChange = requestedBound !== row.boundSku
    const nextStatus = patch.status ? toDbBinStatus(patch.status) : null
    const willDisable = nextStatus === 'disabled' && row.status !== 'disabled'
    const reason = patch.reason?.trim() || ''
    if (bindingChange && row.status === 'disabled') {
      throw new Error('停用库位不可换绑或解绑，请先启用')
    }
    const legacyVariant =
      (bindingChange || willDisable) &&
      row.boundSku &&
      requestedVariant?.skuCode !== row.boundSku
        ? await resolveVariantBySku(tx, organizationId, row.boundSku).catch(() => null)
        : null

    if (willDisable && bindingChange) {
      throw new Error('停用库位时不可同时换绑或解绑')
    }

    if (bindingChange) {
      if (!reason) throw new Error('解绑/换绑必须填写原因')
      const active = await getActiveBinBinding(tx, organizationId, row.id)
      await assertBinInventoryZero(
        tx,
        organizationId,
        row.warehouseCode,
        row.code,
        requestedBound ? '换绑' : '解绑',
      )
      if (active) {
        if (!requestedVariant || active.variantId !== requestedVariant.id) {
          await closeBinBinding(tx, {
            binding: active,
            state: 'released',
            action: 'unbind',
            reason,
            operatorId,
          })
        }
      } else if (row.boundSku) {
        // 旧 bound_sku 未迁移：首次操作时补一条无 binding_id 的履历，不批量回填。
        await writeBinBindingHistory(tx, {
          organizationId,
          warehouseId: row.warehouseId,
          binId: row.id,
          variantId: legacyVariant?.id ?? null,
          action: 'unbind',
          reason,
          operatorId,
        })
      }
      if (
        requestedVariant &&
        (!active || active.variantId !== requestedVariant.id)
      ) {
        await bindSkuToBin(tx, {
          organizationId,
          warehouseId: row.warehouseId,
          binId: row.id,
          variant: requestedVariant,
          operatorId,
          reason,
        })
      }
    }

    if (willDisable) {
      if (!reason) throw new Error('停用库位必须填写原因')
      const active = await getActiveBinBinding(tx, organizationId, row.id)
      if (active) {
        await closeBinBinding(tx, {
          binding: active,
          state: 'disabled',
          action: 'disable',
          reason,
          operatorId,
        })
      } else {
        await writeBinBindingHistory(tx, {
          organizationId,
          warehouseId: row.warehouseId,
          binId: row.id,
          variantId: legacyVariant?.id ?? null,
          action: 'disable',
          reason,
          operatorId,
        })
      }
    }

    const nextBound = willDisable ? null : bindingChange ? requestedBound : row.boundSku
    const nextStatusFinal =
      nextStatus ??
      (bindingChange
        ? requestedBound
          ? 'occupied'
          : row.status === 'occupied'
            ? 'empty'
            : row.status
        : row.status)
    await tx
      .update(commerceBins)
      .set({
        zoneCode: patch.zoneCode !== undefined ? patch.zoneCode.trim() || null : row.zoneCode,
        name: patch.name !== undefined ? patch.name.trim() || row.code : row.name,
        boundSku: nextBound,
        status: nextStatusFinal,
        note: patch.note !== undefined ? patch.note.trim() || null : row.note,
        updatedAt: new Date(),
      })
      .where(eq(commerceBins.id, row.id))
    const [updated] = await tx.select().from(commerceBins).where(eq(commerceBins.id, row.id)).limit(1)
    return {
      id: updated!.id,
      warehouseId: updated!.warehouseId,
      warehouseCode: updated!.warehouseCode,
      zoneCode: updated!.zoneCode || '',
      code: updated!.code,
      name: updated!.name || updated!.code,
      boundSku: updated!.boundSku || '',
      status: toUiBinStatus(updated!.status),
      note: updated!.note || '',
      updatedAt: formatStamp(updated!.updatedAt),
    }
  })
}

export async function getBin(db: AppDatabase | DbLike, organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(commerceBins)
    .where(and(eq(commerceBins.organizationId, organizationId), eq(commerceBins.id, id)))
    .limit(1)
  return row ?? null
}

export async function listBinBindings(
  db: AppDatabase,
  organizationId: string,
  input: { binId: string; page?: number; pageSize?: number },
): Promise<PaginatedResult<BinBindingHistoryDto> & { active: BinBindingDto | null }> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const [bin] = await db
    .select({ id: commerceBins.id })
    .from(commerceBins)
    .where(
      and(
        eq(commerceBins.organizationId, organizationId),
        eq(commerceBins.id, input.binId),
      ),
    )
    .limit(1)
  if (!bin) throw new Error('库位不存在')

  const activeRow = await getActiveBinBinding(db, organizationId, input.binId)
  let active: BinBindingDto | null = null
  if (activeRow) {
    const [variant] = await db
      .select({
        skuCode: productVariants.skuCode,
        sku: productVariants.sku,
        name: products.title,
      })
      .from(productVariants)
      .leftJoin(products, eq(products.id, productVariants.productId))
      .where(eq(productVariants.id, activeRow.variantId))
      .limit(1)
    active = {
      id: activeRow.id,
      binId: activeRow.binId,
      variantId: activeRow.variantId,
      sku: variant?.skuCode || variant?.sku || '',
      name: variant?.name || variant?.skuCode || variant?.sku || '',
      state: activeRow.state as BinBindingDto['state'],
      boundAt: formatStamp(activeRow.boundAt),
      boundBy: activeRow.boundBy || '',
      releasedAt: activeRow.releasedAt ? formatStamp(activeRow.releasedAt) : '',
      releasedBy: activeRow.releasedBy || '',
      releaseReason: activeRow.releaseReason || '',
    }
  }

  const where = and(
    eq(binBindingHistory.organizationId, organizationId),
    eq(binBindingHistory.binId, input.binId),
  )
  const [totalRow] = await db.select({ c: count() }).from(binBindingHistory).where(where)
  const rows = await db
    .select({
      history: binBindingHistory,
      skuCode: productVariants.skuCode,
      sku: productVariants.sku,
      name: products.title,
    })
    .from(binBindingHistory)
    .leftJoin(productVariants, eq(productVariants.id, binBindingHistory.variantId))
    .leftJoin(products, eq(products.id, productVariants.productId))
    .where(where)
    .orderBy(desc(binBindingHistory.occurredAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  return {
    active,
    items: rows.map(({ history, skuCode, sku, name }) => {
      const action = history.action as BinBindingHistoryDto['action']
      return {
        id: history.id,
        action,
        actionLabel: binBindingActionLabels[action] || history.action,
        variantId: history.variantId || '',
        sku: skuCode || sku || '',
        name: name || skuCode || sku || '',
        reason: history.reason || '',
        operatorId: history.operatorId || '',
        occurredAt: formatStamp(history.occurredAt),
        bindingId: history.bindingId || '',
      }
    }),
    total: Number(totalRow?.c ?? 0),
    page,
    pageSize,
  }
}

// ---------------------------------------------------------------------------
// balances / movements
// ---------------------------------------------------------------------------

export async function listBalances(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string; warehouse?: string; sku?: string } = {},
): Promise<PaginatedResult<BalanceDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const filters: SQL[] = [eq(inventoryBalances.organizationId, organizationId)]
  if (input.warehouse?.trim()) filters.push(eq(inventoryBalances.warehouseCode, input.warehouse.trim()))
  if (input.sku?.trim()) {
    const variants = await db
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.organizationId, organizationId),
          or(
            ilike(productVariants.skuCode, `%${input.sku.trim()}%`),
            ilike(productVariants.sku, `%${input.sku.trim()}%`),
          ),
        ),
      )
    const ids = variants.map((v) => v.id)
    if (ids.length === 0) return { items: [], total: 0, page, pageSize }
    filters.push(inArray(inventoryBalances.variantId, ids))
  }
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(or(ilike(inventoryBalances.warehouseCode, q), ilike(inventoryBalances.binCode, q))!)
  }
  const where = and(...filters)
  const [totalRow] = await db.select({ c: count() }).from(inventoryBalances).where(where)
  const rows = await db
    .select({
      bal: inventoryBalances,
      skuCode: productVariants.skuCode,
      sku: productVariants.sku,
      title: products.title,
    })
    .from(inventoryBalances)
    .innerJoin(productVariants, eq(productVariants.id, inventoryBalances.variantId))
    .leftJoin(products, eq(products.id, productVariants.productId))
    .where(where)
    .orderBy(desc(inventoryBalances.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const items: BalanceDto[] = rows.map(({ bal, skuCode, sku, title }) => {
    const available = availableQty(bal)
    const threshold = 20
    return {
      id: bal.id,
      warehouse: bal.warehouseCode,
      bin: bal.binCode || '',
      sku: skuCode || sku,
      name: title || skuCode || sku,
      variantId: bal.variantId,
      onHand: bal.onHand,
      reserved: bal.reserved,
      qcHold: bal.qcHold,
      damaged: bal.damaged,
      inTransit: bal.inTransit,
      pendingInbound: bal.pendingInbound,
      customsClearing: bal.customsClearing,
      available,
      version: bal.version,
      updatedAt: formatStamp(bal.updatedAt),
      status: available < threshold ? '低库存' : '正常',
      threshold,
    }
  })
  return { items, total: Number(totalRow?.c ?? 0), page, pageSize }
}

export async function balanceStats(db: AppDatabase, organizationId: string) {
  const rows = await db
    .select({
      onHand: inventoryBalances.onHand,
      reserved: inventoryBalances.reserved,
      qcHold: inventoryBalances.qcHold,
      damaged: inventoryBalances.damaged,
      inTransit: inventoryBalances.inTransit,
      customsClearing: inventoryBalances.customsClearing,
      variantId: inventoryBalances.variantId,
    })
    .from(inventoryBalances)
    .where(eq(inventoryBalances.organizationId, organizationId))
  const skuSet = new Set(rows.map((r) => r.variantId))
  let availableTotal = 0
  let onHandTotal = 0
  let reservedTotal = 0
  let damagedTotal = 0
  let inTransitTotal = 0
  let customsTotal = 0
  let lowStock = 0
  for (const r of rows) {
    const a = availableQty(r)
    availableTotal += a
    onHandTotal += r.onHand
    reservedTotal += r.reserved
    damagedTotal += r.damaged
    inTransitTotal += r.inTransit
    customsTotal += r.customsClearing
    if (a < 20) lowStock += 1
  }
  return {
    skuCount: skuSet.size,
    rowCount: rows.length,
    availableTotal,
    onHandTotal,
    reservedTotal,
    damagedTotal,
    inTransitTotal,
    customsClearingTotal: customsTotal,
    lowStock,
  }
}

export async function getBalance(db: AppDatabase, organizationId: string, id: string) {
  const [row] = await db
    .select({
      bal: inventoryBalances,
      skuCode: productVariants.skuCode,
      sku: productVariants.sku,
      title: products.title,
    })
    .from(inventoryBalances)
    .innerJoin(productVariants, eq(productVariants.id, inventoryBalances.variantId))
    .leftJoin(products, eq(products.id, productVariants.productId))
    .where(and(eq(inventoryBalances.organizationId, organizationId), eq(inventoryBalances.id, id)))
    .limit(1)
  if (!row) return null
  const available = availableQty(row.bal)
  return {
    id: row.bal.id,
    warehouse: row.bal.warehouseCode,
    bin: row.bal.binCode || '',
    sku: row.skuCode || row.sku,
    name: row.title || row.skuCode || row.sku,
    variantId: row.bal.variantId,
    onHand: row.bal.onHand,
    reserved: row.bal.reserved,
    qcHold: row.bal.qcHold,
    damaged: row.bal.damaged,
    inTransit: row.bal.inTransit,
    pendingInbound: row.bal.pendingInbound,
    customsClearing: row.bal.customsClearing,
    available,
    version: row.bal.version,
    updatedAt: formatStamp(row.bal.updatedAt),
    status: available < 20 ? ('低库存' as const) : ('正常' as const),
    threshold: 20,
  } satisfies BalanceDto
}

export async function listMovements(
  db: AppDatabase,
  organizationId: string,
  input: {
    page?: number
    pageSize?: number
    q?: string
    warehouse?: string
    sku?: string
    movementType?: string
  } = {},
): Promise<PaginatedResult<MovementDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const filters: SQL[] = [eq(inventoryMovements.organizationId, organizationId)]
  if (input.warehouse?.trim()) filters.push(eq(inventoryMovements.warehouseCode, input.warehouse.trim()))
  if (input.movementType?.trim()) {
    const ui = input.movementType.trim()
    // accept UI label or raw
    const reverse: Record<string, string> = {
      订单锁定: 'order_reserve',
      订单释放: 'order_release',
      订单出库: 'order_ship',
      采购入库: 'purchase_stock_in',
      售后回库: 'return_restock',
      质检报损: 'qc_fail_damage',
      手工调整: 'adjustment',
      库存调整: 'stock_adjust',
      非订单出库: 'wms_outbound',
      海运开船: 'ocean_depart',
      海运到港: 'ocean_arrive',
      海运清关: 'ocean_customs',
      海运到仓: 'ocean_receive',
    }
    filters.push(eq(inventoryMovements.movementType, reverse[ui] || ui))
  }
  if (input.sku?.trim()) {
    const variants = await db
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.organizationId, organizationId),
          or(
            ilike(productVariants.skuCode, `%${input.sku.trim()}%`),
            ilike(productVariants.sku, `%${input.sku.trim()}%`),
          ),
        ),
      )
    const ids = variants.map((v) => v.id)
    if (ids.length === 0) return { items: [], total: 0, page, pageSize }
    filters.push(inArray(inventoryMovements.variantId, ids))
  }
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(
      or(
        ilike(inventoryMovements.idempotencyKey, q),
        ilike(inventoryMovements.sourceId, q),
        ilike(inventoryMovements.warehouseCode, q),
        ilike(inventoryMovements.binCode, q),
      )!,
    )
  }
  const where = and(...filters)
  const [totalRow] = await db.select({ c: count() }).from(inventoryMovements).where(where)
  const rows = await db
    .select({
      mov: inventoryMovements,
      skuCode: productVariants.skuCode,
      sku: productVariants.sku,
    })
    .from(inventoryMovements)
    .innerJoin(productVariants, eq(productVariants.id, inventoryMovements.variantId))
    .where(where)
    .orderBy(desc(inventoryMovements.occurredAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return {
    items: rows.map(({ mov, skuCode, sku }) => ({
      id: mov.id,
      warehouse: mov.warehouseCode,
      bin: mov.binCode || '',
      sku: skuCode || sku,
      variantId: mov.variantId,
      movementType: mov.movementType,
      type: toUiMovementType(mov.movementType),
      qtyDelta: mov.qtyDelta,
      onHandAfter: mov.onHandAfter,
      reservedAfter: mov.reservedAfter,
      qcHoldAfter: mov.qcHoldAfter,
      damagedAfter: mov.damagedAfter,
      sourceType: mov.sourceType || '',
      sourceId: mov.sourceId || '',
      operator: mov.operator || '',
      idempotencyKey: mov.idempotencyKey || '',
      occurredAt: formatStamp(mov.occurredAt),
      direction: movementDirection(mov.qtyDelta, mov.movementType),
      status: '已记账' as const,
    })),
    total: Number(totalRow?.c ?? 0),
    page,
    pageSize,
  }
}

export async function getMovement(db: AppDatabase, organizationId: string, id: string) {
  const [row] = await db
    .select({
      mov: inventoryMovements,
      skuCode: productVariants.skuCode,
      sku: productVariants.sku,
    })
    .from(inventoryMovements)
    .innerJoin(productVariants, eq(productVariants.id, inventoryMovements.variantId))
    .where(and(eq(inventoryMovements.organizationId, organizationId), eq(inventoryMovements.id, id)))
    .limit(1)
  if (!row) return null
  const mov = row.mov
  return {
    id: mov.id,
    warehouse: mov.warehouseCode,
    bin: mov.binCode || '',
    sku: row.skuCode || row.sku,
    variantId: mov.variantId,
    movementType: mov.movementType,
    type: toUiMovementType(mov.movementType),
    qtyDelta: mov.qtyDelta,
    onHandAfter: mov.onHandAfter,
    reservedAfter: mov.reservedAfter,
    qcHoldAfter: mov.qcHoldAfter,
    damagedAfter: mov.damagedAfter,
    sourceType: mov.sourceType || '',
    sourceId: mov.sourceId || '',
    operator: mov.operator || '',
    idempotencyKey: mov.idempotencyKey || '',
    occurredAt: formatStamp(mov.occurredAt),
    direction: movementDirection(mov.qtyDelta, mov.movementType),
    status: '已记账' as const,
  } satisfies MovementDto
}

export async function movementStats(db: AppDatabase, organizationId: string) {
  const [total] = await db
    .select({ c: count() })
    .from(inventoryMovements)
    .where(eq(inventoryMovements.organizationId, organizationId))
  const [inbound] = await db
    .select({ c: count() })
    .from(inventoryMovements)
    .where(
      and(eq(inventoryMovements.organizationId, organizationId), sql`${inventoryMovements.qtyDelta} > 0`),
    )
  const [outbound] = await db
    .select({ c: count() })
    .from(inventoryMovements)
    .where(
      and(eq(inventoryMovements.organizationId, organizationId), sql`${inventoryMovements.qtyDelta} < 0`),
    )
  return {
    total: Number(total?.c ?? 0),
    inbound: Number(inbound?.c ?? 0),
    outbound: Number(outbound?.c ?? 0),
  }
}

// ---------------------------------------------------------------------------
// non-order outbound
// ---------------------------------------------------------------------------

async function mapOutbound(
  db: DbLike,
  organizationId: string,
  row: typeof stockOutbounds.$inferSelect,
): Promise<WmsOutboundDto> {
  const lines = await db
    .select()
    .from(stockOutboundLines)
    .where(
      and(
        eq(stockOutboundLines.organizationId, organizationId),
        eq(stockOutboundLines.stockOutboundId, row.id),
      ),
    )
    .orderBy(asc(stockOutboundLines.lineNo))
  const totalQty = lines.reduce((s, l) => s + l.qty, 0)
  const first = lines[0]
  return {
    id: row.id,
    outboundNo: row.outboundNo,
    outboundType: toUiOutboundType(row.outboundType),
    warehouse: row.warehouseCode,
    order: row.externalOrderId || '',
    orderId: row.orderId,
    packageId: row.packageId || '',
    picker: row.picker || '',
    status: toUiOutboundStatus(row.status),
    createdAt: formatStamp(row.createdAt),
    pickedAt: formatStamp(row.pickedAt),
    checkedAt: formatStamp(row.reviewedAt),
    shippedAt: formatStamp(row.postedAt),
    reason: row.reason || '',
    remark: row.remark || '',
    idempotencyKey: row.idempotencyKey,
    lineCount: lines.length,
    firstSku: first?.skuCode || '',
    totalQty,
    bin: first?.binCode || '',
    sku: first?.skuCode || '',
    quantity: first?.qty || 0,
    lines: lines.map((l) => ({
      id: l.id,
      lineNo: l.lineNo,
      sku: l.skuCode,
      variantId: l.variantId,
      quantity: l.qty,
      bin: l.binCode,
      note: l.note || '',
    })),
  }
}

export async function listWmsOutbounds(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string; status?: string; outboundType?: string } = {},
): Promise<PaginatedResult<WmsOutboundListRow>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const filters: SQL[] = [
    eq(stockOutbounds.organizationId, organizationId),
    ne(stockOutbounds.outboundType, 'order'),
  ]
  if (input.status) filters.push(eq(stockOutbounds.status, toDbOutboundStatus(input.status)))
  if (input.outboundType) filters.push(eq(stockOutbounds.outboundType, toDbOutboundType(input.outboundType)))
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(
      or(ilike(stockOutbounds.outboundNo, q), ilike(stockOutbounds.packageId, q), ilike(stockOutbounds.reason, q))!,
    )
  }
  const where = and(...filters)
  const [totalRow] = await db.select({ c: count() }).from(stockOutbounds).where(where)
  const rows = await db
    .select()
    .from(stockOutbounds)
    .where(where)
    .orderBy(desc(stockOutbounds.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  const items: WmsOutboundListRow[] = []
  for (const row of rows) {
    const { lines: _l, ...rest } = await mapOutbound(db, organizationId, row)
    items.push(rest)
  }
  return { items, total: Number(totalRow?.c ?? 0), page, pageSize }
}

export async function wmsOutboundStats(db: AppDatabase, organizationId: string) {
  const rows = await db
    .select({ status: stockOutbounds.status })
    .from(stockOutbounds)
    .where(and(eq(stockOutbounds.organizationId, organizationId), ne(stockOutbounds.outboundType, 'order')))
  const byStatus: Record<string, number> = {}
  for (const r of rows) {
    const ui = toUiOutboundStatus(r.status)
    byStatus[ui] = (byStatus[ui] || 0) + 1
  }
  return { total: rows.length, byStatus }
}

export async function getWmsOutbound(db: AppDatabase | DbLike, organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(stockOutbounds)
    .where(
      and(
        eq(stockOutbounds.organizationId, organizationId),
        or(eq(stockOutbounds.id, id), eq(stockOutbounds.outboundNo, id)),
        ne(stockOutbounds.outboundType, 'order'),
      ),
    )
    .limit(1)
  if (!row) return null
  return mapOutbound(db, organizationId, row)
}

export async function createWmsOutbound(
  db: AppDatabase,
  organizationId: string,
  input: {
    outboundType: string
    warehouse: string
    reason?: string
    remark?: string
    picker?: string
    lines: Array<{ sku: string; quantity: number; bin: string; note?: string }>
  },
): Promise<WmsOutboundDto> {
  const outboundType = toDbOutboundType(input.outboundType)
  if (!isNonOrderOutboundType(outboundType)) {
    throw new Error('订单出库请走 order.createOutbound；本接口仅非订单出库')
  }
  if (!input.lines?.length) throw new Error('至少一行出库明细')
  const warehouse = input.warehouse.trim() || DEFAULT_WMS_WAREHOUSE
  return db.transaction(async (tx) => {
    const outboundNo = await nextOutboundNo(tx, organizationId)
    const id = createId()
    const idem = `wms_outbound:${outboundNo}`
    await tx.insert(stockOutbounds).values({
      id,
      organizationId,
      outboundNo,
      outboundType,
      warehouseCode: warehouse,
      status: 'pending_pick',
      idempotencyKey: idem,
      reason: input.reason?.trim() || null,
      remark: input.remark?.trim() || null,
      picker: input.picker?.trim() || null,
    })
    let lineNo = 1
    for (const line of input.lines) {
      if (!line.sku?.trim() || !(line.quantity > 0)) throw new Error('明细 SKU/数量无效')
      const variant = await resolveVariantBySku(tx, organizationId, line.sku)
      await tx.insert(stockOutboundLines).values({
        id: createId(),
        organizationId,
        stockOutboundId: id,
        lineNo,
        variantId: variant.id,
        skuCode: variant.skuCode,
        binCode: line.bin.trim() || DEFAULT_WMS_BIN,
        qty: Math.floor(line.quantity),
        note: line.note?.trim() || null,
      })
      lineNo += 1
    }
    return (await getWmsOutbound(tx, organizationId, id))!
  })
}

export async function advanceWmsOutbound(
  db: AppDatabase,
  organizationId: string,
  id: string,
  operator?: string,
): Promise<WmsOutboundDto> {
  return db.transaction(async (tx) => {
    const current = await getWmsOutbound(tx, organizationId, id)
    if (!current) throw new Error('出库单不存在')
    if (current.status === '已出库') return current
    if (current.status === '已取消') throw new Error('已取消不可推进')
    const flow: Record<string, string> = {
      待拣货: 'picking',
      拣货中: 'reviewed',
      已复核: 'reviewed',
    }
    const next = flow[current.status]
    if (!next) throw new Error(`状态 ${current.status} 不可推进`)
    const patch: Partial<typeof stockOutbounds.$inferInsert> = {
      status: next,
      picker: operator?.trim() || current.picker || '当前用户',
      updatedAt: new Date(),
    }
    if (next === 'picking') patch.pickedAt = new Date()
    if (next === 'reviewed') patch.reviewedAt = new Date()
    await tx.update(stockOutbounds).set(patch).where(eq(stockOutbounds.id, current.id))
    return (await getWmsOutbound(tx, organizationId, current.id))!
  })
}

/**
 * 非订单出库过账：只减 on_hand（报损类型可减 damaged），**绝不**改 reserved / 释放销售占库。
 * 幂等键 ledger:wms_outbound:{outboundId}:{lineId}
 */
export async function postWmsOutbound(
  db: AppDatabase,
  organizationId: string,
  outboundId: string,
  operator?: string,
): Promise<WmsOutboundDto> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(stockOutbounds)
      .where(
        and(
          eq(stockOutbounds.organizationId, organizationId),
          or(eq(stockOutbounds.id, outboundId), eq(stockOutbounds.outboundNo, outboundId)),
        ),
      )
      .limit(1)
    if (!row) throw new Error('出库单不存在')
    if (!isNonOrderOutboundType(row.outboundType)) {
      throw new Error('订单出库请走 order.postOutbound')
    }
    if (row.status === 'posted') return (await getWmsOutbound(tx, organizationId, row.id))!
    if (row.status === 'cancelled') throw new Error('已取消出库单不可过账')
    const actor = operator?.trim() || row.picker || '当前用户'
    const lines = await tx
      .select()
      .from(stockOutboundLines)
      .where(
        and(
          eq(stockOutboundLines.organizationId, organizationId),
          eq(stockOutboundLines.stockOutboundId, row.id),
        ),
      )
    if (lines.length === 0) throw new Error('出库单无明细')

    const scrapDamaged = row.outboundType === 'stocktake_loss'

    for (const line of lines) {
      const idem = `ledger:wms_outbound:${row.id}:${line.id}`
      if (await findMovementByIdem(tx, organizationId, idem)) continue

      const balance = await getOrCreateBalance(tx, {
        organizationId,
        warehouseCode: row.warehouseCode,
        binCode: line.binCode,
        variantId: line.variantId,
      })

      let onHandAfter = balance.onHand
      let damagedAfter = balance.damaged
      // 绝不改 reserved
      const reservedAfter = balance.reserved

      if (scrapDamaged && balance.damaged >= line.qty) {
        // 报损出：优先从残次桶出
        damagedAfter = balance.damaged - line.qty
      } else {
        const available = availableQty(balance)
        if (available < line.qty) {
          throw new Error(
            `SKU ${line.skuCode} 可用不足（available=${available} < ${line.qty}）；不释放销售占库`,
          )
        }
        if (balance.onHand < line.qty) {
          throw new Error(`SKU ${line.skuCode} 在手不足（${balance.onHand} < ${line.qty}）`)
        }
        onHandAfter = balance.onHand - line.qty
      }

      await tx
        .update(inventoryBalances)
        .set({
          onHand: onHandAfter,
          damaged: damagedAfter,
          // reserved 保持不变
          version: balance.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(inventoryBalances.id, balance.id))

      await tx.insert(inventoryMovements).values({
        id: createId(),
        organizationId,
        variantId: line.variantId,
        warehouseCode: row.warehouseCode,
        binCode: line.binCode,
        movementType: 'wms_outbound',
        qtyDelta: -line.qty,
        onHandAfter,
        reservedAfter,
        qcHoldAfter: balance.qcHold,
        damagedAfter,
        sourceType: 'wms_outbound',
        sourceId: row.id,
        operator: actor,
        idempotencyKey: idem,
        occurredAt: new Date(),
        raw: {
          outboundNo: row.outboundNo,
          outboundType: row.outboundType,
          reason: row.reason,
          note: '非订单出库；未改 reserved',
        },
      })
    }

    await tx
      .update(stockOutbounds)
      .set({
        status: 'posted',
        picker: actor,
        postedAt: new Date(),
        reviewedAt: row.reviewedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(stockOutbounds.id, row.id))

    return (await getWmsOutbound(tx, organizationId, row.id))!
  })
}

export async function cancelWmsOutbound(
  db: AppDatabase,
  organizationId: string,
  id: string,
  reason?: string,
): Promise<WmsOutboundDto> {
  return db.transaction(async (tx) => {
    const current = await getWmsOutbound(tx, organizationId, id)
    if (!current) throw new Error('出库单不存在')
    if (current.status === '已出库') throw new Error('已出库不可取消')
    if (current.status === '已取消') return current
    await tx
      .update(stockOutbounds)
      .set({
        status: 'cancelled',
        reason: reason?.trim() || current.reason,
        updatedAt: new Date(),
      })
      .where(eq(stockOutbounds.id, current.id))
    return (await getWmsOutbound(tx, organizationId, current.id))!
  })
}

// ---------------------------------------------------------------------------
// stock adjustments
// ---------------------------------------------------------------------------

async function mapAdjustment(
  db: DbLike,
  organizationId: string,
  row: typeof stockAdjustments.$inferSelect,
): Promise<AdjustmentDto> {
  const lines = await db
    .select()
    .from(stockAdjustmentLines)
    .where(
      and(
        eq(stockAdjustmentLines.organizationId, organizationId),
        eq(stockAdjustmentLines.stockAdjustmentId, row.id),
      ),
    )
    .orderBy(asc(stockAdjustmentLines.lineNo))
  const first = lines[0]
  return {
    id: row.id,
    adjustmentNo: row.adjustmentNo,
    kind: toUiAdjustmentKind(row.kind),
    warehouse: row.warehouseCode,
    status: toUiAdjustmentStatus(row.status),
    reason: row.reason,
    applicant: row.applicant || '',
    approver: row.approver || '',
    createdAt: formatStamp(row.createdAt),
    approvedAt: formatStamp(row.approvedAt),
    postedAt: formatStamp(row.postedAt),
    rejectReason: row.rejectReason || '',
    remark: row.remark || '',
    idempotencyKey: row.idempotencyKey,
    lineCount: lines.length,
    firstSku: first?.skuCode || '',
    totalDiff: lines.reduce((s, l) => s + l.qtyDiff, 0),
    lines: lines.map((l) => ({
      id: l.id,
      lineNo: l.lineNo,
      sku: l.skuCode,
      variantId: l.variantId,
      bin: l.binCode,
      qtySystem: l.qtySystem,
      qtyCounted: l.qtyCounted,
      qtyDiff: l.qtyDiff,
      note: l.note || '',
    })),
  }
}

export async function listAdjustments(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string; status?: string; kind?: string } = {},
): Promise<PaginatedResult<AdjustmentListRow>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const filters: SQL[] = [eq(stockAdjustments.organizationId, organizationId)]
  if (input.status) filters.push(eq(stockAdjustments.status, toDbAdjustmentStatus(input.status)))
  if (input.kind) filters.push(eq(stockAdjustments.kind, toDbAdjustmentKind(input.kind)))
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(or(ilike(stockAdjustments.adjustmentNo, q), ilike(stockAdjustments.reason, q))!)
  }
  const where = and(...filters)
  const [totalRow] = await db.select({ c: count() }).from(stockAdjustments).where(where)
  const rows = await db
    .select()
    .from(stockAdjustments)
    .where(where)
    .orderBy(desc(stockAdjustments.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  const items: AdjustmentListRow[] = []
  for (const row of rows) {
    const { lines: _l, ...rest } = await mapAdjustment(db, organizationId, row)
    items.push(rest)
  }
  return { items, total: Number(totalRow?.c ?? 0), page, pageSize }
}

export async function adjustmentStats(db: AppDatabase, organizationId: string) {
  const rows = await db
    .select({ status: stockAdjustments.status })
    .from(stockAdjustments)
    .where(eq(stockAdjustments.organizationId, organizationId))
  const byStatus: Record<string, number> = {}
  for (const r of rows) {
    const ui = toUiAdjustmentStatus(r.status)
    byStatus[ui] = (byStatus[ui] || 0) + 1
  }
  return { total: rows.length, byStatus }
}

export async function getAdjustment(db: AppDatabase | DbLike, organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(stockAdjustments)
    .where(
      and(
        eq(stockAdjustments.organizationId, organizationId),
        or(eq(stockAdjustments.id, id), eq(stockAdjustments.adjustmentNo, id)),
      ),
    )
    .limit(1)
  if (!row) return null
  return mapAdjustment(db, organizationId, row)
}

export async function createAdjustment(
  db: AppDatabase,
  organizationId: string,
  input: {
    kind: string
    warehouse: string
    reason: string
    applicant?: string
    remark?: string
    lines: Array<{ sku: string; bin: string; qtySystem: number; qtyCounted: number; note?: string }>
  },
): Promise<AdjustmentDto> {
  if (!input.reason?.trim()) throw new Error('调整原因必填')
  if (!input.lines?.length) throw new Error('至少一行调整明细')
  return db.transaction(async (tx) => {
    const adjustmentNo = await nextAdjustmentNo(tx, organizationId)
    const id = createId()
    await tx.insert(stockAdjustments).values({
      id,
      organizationId,
      adjustmentNo,
      kind: toDbAdjustmentKind(input.kind),
      warehouseCode: input.warehouse.trim() || DEFAULT_WMS_WAREHOUSE,
      status: 'pending_approval',
      reason: input.reason.trim(),
      applicant: input.applicant?.trim() || '当前用户',
      remark: input.remark?.trim() || null,
      idempotencyKey: `stock_adjust:${adjustmentNo}`,
    })
    let lineNo = 1
    for (const line of input.lines) {
      const variant = await resolveVariantBySku(tx, organizationId, line.sku)
      const qtySystem = Math.floor(Number(line.qtySystem) || 0)
      const qtyCounted = Math.floor(Number(line.qtyCounted) || 0)
      await tx.insert(stockAdjustmentLines).values({
        id: createId(),
        organizationId,
        stockAdjustmentId: id,
        lineNo,
        variantId: variant.id,
        skuCode: variant.skuCode,
        binCode: line.bin.trim() || DEFAULT_WMS_BIN,
        qtySystem,
        qtyCounted,
        qtyDiff: qtyCounted - qtySystem,
        note: line.note?.trim() || null,
      })
      lineNo += 1
    }
    return (await getAdjustment(tx, organizationId, id))!
  })
}

export async function approveAdjustment(
  db: AppDatabase,
  organizationId: string,
  id: string,
  approver?: string,
): Promise<AdjustmentDto> {
  return db.transaction(async (tx) => {
    const current = await getAdjustment(tx, organizationId, id)
    if (!current) throw new Error('调整单不存在')
    if (current.status === '已过账') return current
    if (current.status === '已取消' || current.status === '已驳回') throw new Error('终态不可审批')
    await tx
      .update(stockAdjustments)
      .set({
        status: 'approved',
        approver: approver?.trim() || '审批人',
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(stockAdjustments.id, current.id))
    return (await getAdjustment(tx, organizationId, current.id))!
  })
}

export async function rejectAdjustment(
  db: AppDatabase,
  organizationId: string,
  id: string,
  rejectReason: string,
  approver?: string,
): Promise<AdjustmentDto> {
  if (!rejectReason?.trim()) throw new Error('驳回原因必填')
  return db.transaction(async (tx) => {
    const current = await getAdjustment(tx, organizationId, id)
    if (!current) throw new Error('调整单不存在')
    if (current.status === '已过账') throw new Error('已过账不可驳回')
    await tx
      .update(stockAdjustments)
      .set({
        status: 'rejected',
        rejectReason: rejectReason.trim(),
        approver: approver?.trim() || '审批人',
        updatedAt: new Date(),
      })
      .where(eq(stockAdjustments.id, current.id))
    return (await getAdjustment(tx, organizationId, current.id))!
  })
}

/**
 * 调整过账：按 qtyDiff 改 on_hand + 写 stock_adjust 流水。不改 reserved。
 * 幂等 ledger:stock_adjust:{adjustmentId}:{lineId}
 */
export async function postAdjustment(
  db: AppDatabase,
  organizationId: string,
  id: string,
  operator?: string,
): Promise<AdjustmentDto> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(stockAdjustments)
      .where(
        and(
          eq(stockAdjustments.organizationId, organizationId),
          or(eq(stockAdjustments.id, id), eq(stockAdjustments.adjustmentNo, id)),
        ),
      )
      .limit(1)
    if (!row) throw new Error('调整单不存在')
    if (row.status === 'posted') return (await getAdjustment(tx, organizationId, row.id))!
    if (row.status !== 'approved' && row.status !== 'pending_approval') {
      throw new Error('仅已通过（或待审批直过账）可过账')
    }
    const actor = operator?.trim() || row.approver || row.applicant || '当前用户'
    const lines = await tx
      .select()
      .from(stockAdjustmentLines)
      .where(
        and(
          eq(stockAdjustmentLines.organizationId, organizationId),
          eq(stockAdjustmentLines.stockAdjustmentId, row.id),
        ),
      )
    if (lines.length === 0) throw new Error('调整单无明细')

    for (const line of lines) {
      if (line.qtyDiff === 0) continue
      const idem = `ledger:stock_adjust:${row.id}:${line.id}`
      if (await findMovementByIdem(tx, organizationId, idem)) continue

      const balance = await getOrCreateBalance(tx, {
        organizationId,
        warehouseCode: row.warehouseCode,
        binCode: line.binCode,
        variantId: line.variantId,
      })

      const onHandAfter = balance.onHand + line.qtyDiff
      if (onHandAfter < 0) {
        throw new Error(`SKU ${line.skuCode} 调整后在手为负（${balance.onHand} + ${line.qtyDiff}）`)
      }
      // 不改 reserved；若盘亏导致 available 不够，仍允许（盘点事实），但拒绝把 on_hand 减到低于 reserved
      if (onHandAfter < balance.reserved) {
        throw new Error(
          `SKU ${line.skuCode} 调整后 on_hand(${onHandAfter}) < reserved(${balance.reserved})；不得侵蚀销售占库`,
        )
      }

      let damagedAfter = balance.damaged
      if (row.kind === 'damage' && line.qtyDiff < 0) {
        // 报损：实物减少同时残次增加对应绝对值（仍记 on_hand 变化）
        damagedAfter = balance.damaged + Math.abs(line.qtyDiff)
      }

      await tx
        .update(inventoryBalances)
        .set({
          onHand: onHandAfter,
          damaged: damagedAfter,
          version: balance.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(inventoryBalances.id, balance.id))

      await tx.insert(inventoryMovements).values({
        id: createId(),
        organizationId,
        variantId: line.variantId,
        warehouseCode: row.warehouseCode,
        binCode: line.binCode,
        movementType: 'stock_adjust',
        qtyDelta: line.qtyDiff,
        onHandAfter,
        reservedAfter: balance.reserved,
        qcHoldAfter: balance.qcHold,
        damagedAfter,
        sourceType: 'stock_adjustment',
        sourceId: row.id,
        operator: actor,
        idempotencyKey: idem,
        occurredAt: new Date(),
        raw: {
          adjustmentNo: row.adjustmentNo,
          kind: row.kind,
          reason: row.reason,
          qtySystem: line.qtySystem,
          qtyCounted: line.qtyCounted,
        },
      })
    }

    await tx
      .update(stockAdjustments)
      .set({
        status: 'posted',
        postedAt: new Date(),
        approvedAt: row.approvedAt ?? new Date(),
        approver: row.approver || actor,
        updatedAt: new Date(),
      })
      .where(eq(stockAdjustments.id, row.id))

    return (await getAdjustment(tx, organizationId, row.id))!
  })
}

// ---------------------------------------------------------------------------
// zones — commerce_warehouse_zones（真实表；兼容旧 warehouse:code 合成 ID）
// ---------------------------------------------------------------------------

function parseZoneId(id: string): { warehouseCode: string; code: string } | null {
  const idx = id.indexOf(':')
  if (idx <= 0) return null
  return { warehouseCode: id.slice(0, idx), code: id.slice(idx + 1) }
}

function toUiZoneStatus(status: string | undefined): '启用' | '停用' {
  if (!status) return '启用'
  if (status === '停用' || status === 'disabled' || status === 'inactive') return '停用'
  return '启用'
}

function toDbZoneStatus(status: string | undefined): 'active' | 'disabled' {
  if (!status) return 'active'
  if (status === '停用' || status === 'disabled' || status === 'inactive') return 'disabled'
  return 'active'
}

function mapZoneRow(
  row: { zone: typeof commerceWarehouseZones.$inferSelect; warehouseCode: string },
  binCount: number,
): ZoneDto {
  return {
    id: row.zone.id,
    warehouseId: row.zone.warehouseId,
    warehouseCode: row.warehouseCode,
    code: row.zone.code,
    name: row.zone.name,
    purpose: row.zone.purpose || '',
    status: toUiZoneStatus(row.zone.status),
    note: row.zone.note || '',
    binCount,
    updatedAt: formatStamp(row.zone.updatedAt),
  }
}

async function binCountsByZone(
  db: DbLike,
  organizationId: string,
  rows: Array<{ zone: typeof commerceWarehouseZones.$inferSelect }>,
): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  if (rows.length === 0) return result
  const counts = await db
    .select({
      warehouseId: commerceBins.warehouseId,
      zoneCode: commerceBins.zoneCode,
      c: count(),
    })
    .from(commerceBins)
    .where(
      and(
        eq(commerceBins.organizationId, organizationId),
        inArray(commerceBins.warehouseId, rows.map((r) => r.zone.warehouseId)),
        inArray(commerceBins.zoneCode, rows.map((r) => r.zone.code)),
      ),
    )
    .groupBy(commerceBins.warehouseId, commerceBins.zoneCode)
  for (const c of counts) {
    result.set(`${c.warehouseId}:${c.zoneCode}`, Number(c.c))
  }
  return result
}

export async function listZones(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string; warehouse?: string; status?: string } = {},
): Promise<PaginatedResult<ZoneDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const filters: SQL[] = [eq(commerceWarehouseZones.organizationId, organizationId)]
  if (input.warehouse?.trim()) {
    const term = input.warehouse.trim()
    filters.push(
      or(
        eq(commerceWarehouses.code, term),
        eq(commerceWarehouses.id, term),
      )!,
    )
  }
  if (input.status) {
    filters.push(eq(commerceWarehouseZones.status, toDbZoneStatus(input.status)))
  }
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(
      or(
        ilike(commerceWarehouseZones.code, q),
        ilike(commerceWarehouseZones.name, q),
        ilike(commerceWarehouseZones.purpose, q),
        ilike(commerceWarehouseZones.note, q),
        ilike(commerceWarehouses.code, q),
      )!,
    )
  }
  const where = and(...filters)
  const [totalRow] = await db
    .select({ c: count() })
    .from(commerceWarehouseZones)
    .innerJoin(commerceWarehouses, eq(commerceWarehouses.id, commerceWarehouseZones.warehouseId))
    .where(where)
  const rows = await db
    .select({ zone: commerceWarehouseZones, warehouseCode: commerceWarehouses.code })
    .from(commerceWarehouseZones)
    .innerJoin(commerceWarehouses, eq(commerceWarehouses.id, commerceWarehouseZones.warehouseId))
    .where(where)
    .orderBy(asc(commerceWarehouses.code), asc(commerceWarehouseZones.code))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  const binCounts = await binCountsByZone(db, organizationId, rows)
  return {
    items: rows.map((row) =>
      mapZoneRow(row, binCounts.get(`${row.zone.warehouseId}:${row.zone.code}`) || 0),
    ),
    total: Number(totalRow?.c ?? 0),
    page,
    pageSize,
  }
}

export async function zoneStats(db: AppDatabase, organizationId: string) {
  const [total] = await db
    .select({ c: count() })
    .from(commerceWarehouseZones)
    .where(eq(commerceWarehouseZones.organizationId, organizationId))
  const [active] = await db
    .select({ c: count() })
    .from(commerceWarehouseZones)
    .where(
      and(
        eq(commerceWarehouseZones.organizationId, organizationId),
        eq(commerceWarehouseZones.status, 'active'),
      ),
    )
  const [disabled] = await db
    .select({ c: count() })
    .from(commerceWarehouseZones)
    .where(
      and(
        eq(commerceWarehouseZones.organizationId, organizationId),
        eq(commerceWarehouseZones.status, 'disabled'),
      ),
    )
  const [withBins] = await db
    .select({ c: sql<number>`count(distinct ${commerceWarehouseZones.id})` })
    .from(commerceWarehouseZones)
    .innerJoin(
      commerceBins,
      and(
        eq(commerceBins.organizationId, commerceWarehouseZones.organizationId),
        eq(commerceBins.warehouseId, commerceWarehouseZones.warehouseId),
        eq(commerceBins.zoneCode, commerceWarehouseZones.code),
      ),
    )
    .where(eq(commerceWarehouseZones.organizationId, organizationId))
  return {
    zones: Number(total?.c ?? 0),
    activeZones: Number(active?.c ?? 0),
    disabledZones: Number(disabled?.c ?? 0),
    withBins: Number(withBins?.c ?? 0),
  }
}

async function findZone(
  db: DbLike,
  organizationId: string,
  idOrCode: string,
): Promise<{ zone: typeof commerceWarehouseZones.$inferSelect; warehouseCode: string } | null> {
  const parsed = parseZoneId(idOrCode)
  const condition = parsed
    ? and(
        eq(commerceWarehouseZones.organizationId, organizationId),
        eq(commerceWarehouses.code, parsed.warehouseCode),
        eq(commerceWarehouseZones.code, parsed.code.toUpperCase()),
      )
    : and(
        eq(commerceWarehouseZones.organizationId, organizationId),
        eq(commerceWarehouseZones.id, idOrCode),
      )
  const [row] = await db
    .select({ zone: commerceWarehouseZones, warehouseCode: commerceWarehouses.code })
    .from(commerceWarehouseZones)
    .innerJoin(commerceWarehouses, eq(commerceWarehouses.id, commerceWarehouseZones.warehouseId))
    .where(condition)
    .limit(1)
  return row ?? null
}

export async function getZone(db: AppDatabase | DbLike, organizationId: string, id: string) {
  const row = await findZone(db, organizationId, id)
  if (!row) return null
  const counts = await binCountsByZone(db, organizationId, [row])
  return mapZoneRow(row, counts.get(`${row.zone.warehouseId}:${row.zone.code}`) || 0)
}

export async function createZone(
  db: AppDatabase,
  organizationId: string,
  input: {
    warehouseCode: string
    code: string
    name?: string
    purpose?: string
    status?: string
    note?: string
  },
): Promise<ZoneDto> {
  const warehouseCode = input.warehouseCode.trim()
  const code = input.code.trim().toUpperCase()
  if (!warehouseCode || !code) throw new Error('仓库与库区编码必填')
  return db.transaction(async (tx) => {
    const [wh] = await tx
      .select()
      .from(commerceWarehouses)
      .where(
        and(
          eq(commerceWarehouses.organizationId, organizationId),
          eq(commerceWarehouses.code, warehouseCode),
        ),
      )
      .limit(1)
    if (!wh) throw new Error(`仓库 ${warehouseCode} 不存在`)
    const [dup] = await tx
      .select({ id: commerceWarehouseZones.id })
      .from(commerceWarehouseZones)
      .where(
        and(
          eq(commerceWarehouseZones.organizationId, organizationId),
          eq(commerceWarehouseZones.warehouseId, wh.id),
          eq(commerceWarehouseZones.code, code),
        ),
      )
      .limit(1)
    if (dup) throw new Error(`仓库 ${warehouseCode} 下已有库区 ${code}`)
    const id = createId()
    await tx.insert(commerceWarehouseZones).values({
      id,
      organizationId,
      warehouseId: wh.id,
      code,
      name: input.name?.trim() || `${code} 区`,
      purpose: input.purpose?.trim() || null,
      status: toDbZoneStatus(input.status),
      note: input.note?.trim() || null,
    })
    const row = await getZone(tx, organizationId, id)
    if (!row) throw new Error('库区创建失败')
    return row
  })
}

export async function updateZone(
  db: AppDatabase,
  organizationId: string,
  id: string,
  patch: Partial<{ name: string; purpose: string; status: string; note: string }>,
): Promise<ZoneDto> {
  return db.transaction(async (tx) => {
    const current = await findZone(tx, organizationId, id)
    if (!current) throw new Error('库区不存在')
    // 编码创建后不可变：patch 不接收 code。
    await tx
      .update(commerceWarehouseZones)
      .set({
        name:
          patch.name !== undefined
            ? patch.name.trim() || `${current.zone.code} 区`
            : current.zone.name,
        purpose: patch.purpose !== undefined ? patch.purpose.trim() || null : current.zone.purpose,
        status:
          patch.status !== undefined
            ? toDbZoneStatus(patch.status)
            : toDbZoneStatus(current.zone.status),
        note: patch.note !== undefined ? patch.note.trim() || null : current.zone.note,
        updatedAt: new Date(),
      })
      .where(eq(commerceWarehouseZones.id, current.zone.id))
    const row = await getZone(tx, organizationId, current.zone.id)
    if (!row) throw new Error('库区更新失败')
    return row
  })
}



export type InventoryAlertRow = {
  sku: string
  variantId: string
  title: string
  shopCount: number
  onHand: number
  reserved: number
  available: number
  inTransit: number
  customsClearing: number
  threshold: number
  ageDays: number
  alert: 'critical' | 'open' | null
  suggestion: string
}

/** /console/inventory 预警列表：按 SKU 聚合 balances。 */
export async function listInventoryAlerts(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string; alert?: string } = {},
): Promise<PaginatedResult<InventoryAlertRow> & { urgent: number; aged: number }> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const rows = await db
    .select({
      bal: inventoryBalances,
      skuCode: productVariants.skuCode,
      sku: productVariants.sku,
      title: products.title,
      updatedAt: inventoryBalances.updatedAt,
    })
    .from(inventoryBalances)
    .innerJoin(productVariants, eq(productVariants.id, inventoryBalances.variantId))
    .leftJoin(products, eq(products.id, productVariants.productId))
    .where(eq(inventoryBalances.organizationId, organizationId))

  const bySku = new Map<string, InventoryAlertRow & { _updated: number }>()
  const now = Date.now()
  for (const r of rows) {
    const sku = r.skuCode || r.sku
    const avail = availableQty(r.bal)
    const cur = bySku.get(sku) ?? {
      sku,
      variantId: r.bal.variantId,
      title: r.title || sku,
      shopCount: 0,
      onHand: 0,
      reserved: 0,
      available: 0,
      inTransit: 0,
      customsClearing: 0,
      threshold: 20,
      ageDays: 0,
      alert: null as 'critical' | 'open' | null,
      suggestion: '',
      _updated: 0,
    }
    cur.onHand += r.bal.onHand
    cur.reserved += r.bal.reserved
    cur.available += avail
    cur.inTransit += r.bal.inTransit
    cur.customsClearing += r.bal.customsClearing
    cur.shopCount += 1
    const ts = r.updatedAt ? new Date(r.updatedAt).getTime() : now
    if (ts > cur._updated) cur._updated = ts
    bySku.set(sku, cur)
  }

  let items = [...bySku.values()].map((row) => {
    const ageDays = Math.max(0, Math.floor((now - (row._updated || now)) / (24 * 3600 * 1000)))
    let alert: 'critical' | 'open' | null = null
    let suggestion = '库存正常'
    if (row.available <= 0) {
      alert = 'critical'
      suggestion = '可用为 0，请补货或释放预留'
    } else if (row.available < row.threshold) {
      alert = 'open'
      suggestion = `可用 ${row.available} 低于阈值 ${row.threshold}`
    } else if (ageDays >= 60 && row.available > 0) {
      alert = 'open'
      suggestion = `库龄约 ${ageDays} 天，关注滞销`
    }
    const { _updated: _, ...rest } = row
    return { ...rest, ageDays, alert, suggestion }
  })

  if (input.q?.trim()) {
    const q = input.q.trim().toLowerCase()
    items = items.filter(
      (r) =>
        r.sku.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        r.suggestion.toLowerCase().includes(q),
    )
  }
  if (input.alert === 'none') items = items.filter((r) => !r.alert)
  else if (input.alert && input.alert !== 'all') items = items.filter((r) => r.alert === input.alert)

  items.sort((a, b) => {
    const rank = (x: InventoryAlertRow['alert']) => (x === 'critical' ? 0 : x === 'open' ? 1 : 2)
    return rank(a.alert) - rank(b.alert) || a.sku.localeCompare(b.sku)
  })

  const urgent = items.filter((r) => r.alert === 'critical').length
  const aged = items.filter((r) => r.ageDays >= 60).length
  const total = items.length
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    total,
    page,
    pageSize,
    urgent,
    aged,
  }
}

export async function getInventoryAlertBySku(db: AppDatabase, organizationId: string, sku: string) {
  const result = await listInventoryAlerts(db, organizationId, { page: 1, pageSize: 500, q: sku })
  return result.items.find((r) => r.sku === sku) ?? null
}
