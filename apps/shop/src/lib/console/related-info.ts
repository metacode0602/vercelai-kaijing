import type {
  DetailRelatedInfo,
  DetailRelatedParent,
  DetailRelatedSection,
} from '@/components/console/detail/detail-related-list'
import { zoneRecordId } from '@/lib/crossborder/warehouse-zone-store'

export type UedRecord = Record<string, unknown>

/** Scalar keys replaced by navigable parent fields in 主数据 (avoid duplicate plain text). */
export const RELATED_PARENT_REPLACED_KEYS: Record<string, string[]> = {
  'master-skus': ['spu'],
  'supplier-skus': ['sku', 'supplier'],
  mappings: ['internalSku'],
  'purchase-approvals': ['sku'],
  'purchase-requests': ['sku', 'supplier'],
  purchases: ['sku', 'supplier'],
  'purchase-receipts': ['po', 'sku', 'bin'],
  'inventory-balances': ['sku', 'bin', 'warehouse'],
  warehouse: ['sku', 'warehouse'],
  'warehouse-zones': ['warehouseCode'],
  'stock-inbounds': ['sku', 'bin', 'sourceDoc'],
  'stock-outbounds': ['sku', 'bin', 'order'],
  'stock-adjustments': ['sku', 'bin', 'warehouse'],
  'inventory-ledger': ['sku', 'bin', 'warehouse', 'source'],
  aftersales: ['sku', 'order'],
  'aftersale-returns': ['sku', 'order'],
  'aftersale-cancels': ['sku', 'order'],
  picking: ['order'],
  shipments: ['order'],
  profits: ['sku', 'order'],
  'order-exceptions': ['internalSku', 'order'],
  reviews: ['sku'],
  orders: ['sku', 'sellerSku', 'packageId'],
  listings: ['sku', 'spu', 'sellerSku'],
  costs: ['internalSku'],
  settlements: ['shop', 'platform'],
  finance: ['shop', 'platform'],
  carriers: [],
  'carton-specs': [],
  freight: ['sku', 'cartonId'],
  reports: ['dimension'],
  'ocean-containers': ['warehouse'],
  'fee-templates': [],
  'logistics-lgs': ['order'],
  'logistics-jsb': ['order'],
}

/** Domains without real related tables yet — empty copy must not look like live ERP rows. */
const PENDING_MODULES = new Set([
  'candidates',
  'reviews',
  'aftersales',
  'aftersale-returns',
  'aftersale-cancels',
  'purchase-approvals',
  'sync-tasks',
  'integration-log',
  'shops',
  'order-exceptions',
  'profits',
  'settlements',
  'finance',
  'costs',
  'carriers',
  'carton-specs',
  'freight',
  'reports',
  'supplier-skus',
  'suppliers',
  'picking',
  'shipments',
  'imports',
  'import-templates',
  'erp-access',
])

/**
 * Optional real rows assembled by detail pages (tRPC / already-loaded detail).
 * When omitted, wired modules show honest empty 「暂无关联数据」;
 * pending modules show 「待接入」.
 */
export type RelatedDataBag = {
  parents?: DetailRelatedParent[]
  sections?: DetailRelatedSection[]
  variants?: Array<Record<string, unknown>>
  balances?: Array<Record<string, unknown>>
  movements?: Array<Record<string, unknown>>
  outbounds?: Array<Record<string, unknown>>
  adjustments?: Array<Record<string, unknown>>
  bins?: Array<Record<string, unknown>>
  purchaseOrders?: Array<Record<string, unknown>>
  receipts?: Array<Record<string, unknown>>
  inbounds?: Array<Record<string, unknown>>
  mappings?: Array<Record<string, unknown>>
  listings?: Array<Record<string, unknown>>
  packages?: Array<Record<string, unknown>>
  shipments?: Array<Record<string, unknown>>
  feeVersions?: Array<Record<string, unknown>>
  oceanLines?: Array<Record<string, unknown>>
  oceanBoxes?: Array<Record<string, unknown>>
  orderLines?: Array<Record<string, unknown>>
  supplierSkus?: Array<Record<string, unknown>>
  syncTasks?: Array<Record<string, unknown>>
}

function str(row: UedRecord, key: string): string | undefined {
  const value = row[key]
  return typeof value === 'string' && value.trim() && value !== '—' ? value : undefined
}

function pendingSection(title: string, reason: 'pending' | 'empty' = 'pending'): DetailRelatedSection {
  return {
    title,
    description:
      reason === 'pending'
        ? '该关联域尚未接库；不展示演示样本行'
        : '当前无匹配关联记录',
    columns: [{ key: 'hint', label: '说明' }],
    rows: [],
    emptyText: reason === 'pending' ? '待接入' : '暂无关联数据',
  }
}

function section(
  title: string,
  description: string,
  columns: DetailRelatedSection['columns'],
  rows: Array<Record<string, unknown>>,
  emptyText = '暂无关联数据',
): DetailRelatedSection {
  return { title, description, columns, rows, emptyText }
}

export const VARIANT_COLUMNS = [
  { key: 'sku', label: '内部 SKU', mono: true, hrefKey: 'href' },
  { key: 'color', label: '颜色' },
  { key: 'size', label: '尺码' },
  { key: 'status', label: '状态' },
]

export const BALANCE_COLUMNS = [
  { key: 'warehouse', label: '仓库', mono: true },
  { key: 'bin', label: '库位', mono: true, hrefKey: 'href' },
  { key: 'sku', label: '内部 SKU', mono: true, hrefKey: 'skuHref' },
  { key: 'onHand', label: '账面', numeric: true },
  { key: 'reserved', label: '锁定', numeric: true },
  { key: 'damaged', label: '残次', numeric: true },
  { key: 'available', label: '可用', numeric: true },
]

export const MOVEMENT_COLUMNS = [
  { key: 'id', label: '流水号', mono: true, hrefKey: 'href' },
  { key: 'type', label: '类型' },
  { key: 'sku', label: '内部 SKU', mono: true },
  { key: 'delta', label: '变化', numeric: true },
  { key: 'after', label: '变动后', numeric: true },
  { key: 'source', label: '来源单', mono: true },
  { key: 'at', label: '时间' },
]

export const OUTBOUND_COLUMNS = [
  { key: 'id', label: '出库单', mono: true, hrefKey: 'href' },
  { key: 'order', label: '订单', mono: true },
  { key: 'sku', label: '内部 SKU', mono: true },
  { key: 'quantity', label: '数量', numeric: true },
  { key: 'bin', label: '库位', mono: true },
  { key: 'status', label: '状态' },
]

export const ADJUSTMENT_COLUMNS = [
  { key: 'id', label: '调整单', mono: true, hrefKey: 'href' },
  { key: 'kind', label: '类型' },
  { key: 'status', label: '状态' },
]

export const BIN_COLUMNS = [
  { key: 'code', label: '库位', mono: true, hrefKey: 'href' },
  { key: 'name', label: '名称' },
  { key: 'boundSku', label: '绑定 SKU', mono: true },
  { key: 'status', label: '状态' },
]

export const PO_COLUMNS = [
  { key: 'poNo', label: '采购单号', mono: true, hrefKey: 'href' },
  { key: 'supplier', label: '供应商' },
  { key: 'totalAmount', label: '金额', numeric: true },
  { key: 'status', label: '状态' },
  { key: 'expectedAt', label: '预计到货' },
]

export const RECEIPT_COLUMNS = [
  { key: 'id', label: '收货单', mono: true, hrefKey: 'href' },
  { key: 'po', label: '采购单', mono: true },
  { key: 'sku', label: '内部 SKU', mono: true },
  { key: 'arrived', label: '到货', numeric: true },
  { key: 'qcPass', label: '合格', numeric: true },
  { key: 'status', label: '状态' },
]

export const INBOUND_COLUMNS = [
  { key: 'id', label: '入库单', mono: true, hrefKey: 'href' },
  { key: 'sourceType', label: '类型' },
  { key: 'sourceDoc', label: '来源单', mono: true },
  { key: 'sku', label: '内部 SKU', mono: true },
  { key: 'quantity', label: '数量', numeric: true },
  { key: 'bin', label: '库位', mono: true },
  { key: 'status', label: '状态' },
]

export const LISTING_COLUMNS = [
  { key: 'id', label: '刊登 ID', mono: true, hrefKey: 'href' },
  { key: 'sku', label: '内部 SKU', mono: true },
  { key: 'shop', label: '店铺' },
  { key: 'platform', label: '平台' },
  { key: 'sellerSku', label: 'Seller SKU', mono: true },
  { key: 'status', label: '状态' },
]

export const MAPPING_COLUMNS = [
  { key: 'shop', label: '店铺' },
  { key: 'sellerSku', label: 'Seller SKU', mono: true, hrefKey: 'href' },
  { key: 'itemId', label: 'Item ID', mono: true },
  { key: 'listingStatus', label: '上架状态' },
  { key: 'mappingStatus', label: '映射状态' },
]

export function mapBalanceRows(
  items: Array<{
    id: string
    warehouse: string
    bin: string
    sku: string
    onHand: number
    reserved: number
    damaged: number
    available: number
  }>,
) {
  return items.map((item) => ({
    warehouse: item.warehouse,
    bin: item.bin,
    sku: item.sku,
    onHand: item.onHand,
    reserved: item.reserved,
    damaged: item.damaged,
    available: item.available,
    href: `/console/inventory-balances/${encodeURIComponent(item.id)}`,
    skuHref: `/console/master-skus/${encodeURIComponent(item.sku)}`,
  }))
}

export function mapMovementRows(
  items: Array<{
    id: string
    type: string
    sku: string
    qtyDelta: number
    onHandAfter: number
    sourceId: string
    occurredAt: string
  }>,
) {
  return items.map((item) => ({
    id: item.id,
    type: item.type,
    sku: item.sku,
    delta: item.qtyDelta,
    after: item.onHandAfter,
    source: item.sourceId,
    at: item.occurredAt,
    href: `/console/inventory-ledger/${encodeURIComponent(item.id)}`,
  }))
}

export function mapOutboundRows(
  items: Array<{
    id: string
    outboundNo?: string
    order?: string
    sku?: string
    quantity?: number
    bin?: string
    status: string
  }>,
) {
  return items.map((item) => ({
    id: item.outboundNo || item.id,
    order: item.order || '—',
    sku: item.sku || '—',
    quantity: item.quantity ?? 0,
    bin: item.bin || '—',
    status: item.status,
    href: `/console/stock-outbounds/${encodeURIComponent(item.id)}`,
  }))
}

export function mapAdjustmentRows(
  items: Array<{ id: string; adjustmentNo?: string; kind: string; status: string }>,
) {
  return items.map((item) => ({
    id: item.adjustmentNo || item.id,
    kind: item.kind,
    status: item.status,
    href: `/console/stock-adjustments/${encodeURIComponent(item.id)}`,
  }))
}

export function mapBinRows(
  items: Array<{
    id?: string
    warehouseId?: string
    code: string
    name?: string
    boundSku?: string
    status: string
  }>,
) {
  return items.map((item) => ({
    code: item.code,
    name: item.name || item.code,
    boundSku: item.boundSku || '—',
    status: item.status,
    href: `/console/warehouse/${encodeURIComponent(item.warehouseId || item.id || item.code)}`,
  }))
}

function parentForSpuFromRow(row: UedRecord, sku?: string): DetailRelatedParent[] {
  const spu = str(row, 'spu')
  if (spu) {
    const name = str(row, 'name') || str(row, 'productName')
    return [
      {
        label: '所属 SPU',
        value: name ? `${spu} · ${name}` : spu,
        href: `/console/master-products/${encodeURIComponent(spu)}`,
        mono: true,
      },
    ]
  }
  if (!sku) return []
  // No demo lookup — link by convention only when spu not on row.
  return []
}

function parentForInternalSku(sku: string | undefined): DetailRelatedParent[] {
  if (!sku) return []
  return [
    {
      label: '内部 SKU',
      value: sku,
      href: `/console/master-skus/${encodeURIComponent(sku)}`,
      mono: true,
    },
  ]
}

function parentForSupplier(name: string | undefined): DetailRelatedParent[] {
  if (!name) return []
  return [{ label: '供应商', value: name }]
}

function parentForBin(bin: string | undefined, warehouse?: string): DetailRelatedParent[] {
  if (!bin) return []
  const parents: DetailRelatedParent[] = [
    {
      label: '库位',
      value: warehouse ? `${warehouse} · ${bin}` : bin,
      href: `/console/warehouse/${encodeURIComponent(bin)}`,
      mono: true,
    },
  ]
  const zoneCode = (bin.split('-')[0] || '').trim()
  if (zoneCode && warehouse) {
    parents.push({
      label: '库区',
      value: `${zoneCode} 区`,
      href: `/console/warehouse-zones/${encodeURIComponent(zoneRecordId(warehouse, zoneCode))}`,
      mono: true,
    })
  }
  return parents
}

function parentForPo(po: string | undefined): DetailRelatedParent[] {
  if (!po) return []
  return [
    {
      label: '采购单',
      value: po,
      href: `/console/purchase-orders/${encodeURIComponent(po)}`,
      mono: true,
    },
  ]
}

function parentForOrder(order: string | undefined): DetailRelatedParent[] {
  if (!order || order === '—') return []
  return [
    {
      label: '订单',
      value: order,
      mono: true,
      href: `/console/orders/${encodeURIComponent(order)}`,
    },
  ]
}

function parentForRequest(requestId: string | undefined): DetailRelatedParent[] {
  if (!requestId) return []
  return [
    {
      label: '来源申请',
      value: requestId,
      href: `/console/purchase-requests/${encodeURIComponent(requestId)}`,
      mono: true,
    },
  ]
}

function parentForWarehouse(code: string | undefined): DetailRelatedParent[] {
  if (!code) return []
  return [
    {
      label: '仓库',
      value: code,
      mono: true,
      href: `/console/warehouse/${encodeURIComponent(code)}`,
    },
  ]
}

function parentsFromRow(module: string, row: UedRecord): DetailRelatedParent[] {
  const sku = str(row, 'sku') || str(row, 'internalSku')
  const parents: DetailRelatedParent[] = []
  switch (module) {
    case 'master-skus':
      parents.push(...parentForSpuFromRow(row, sku))
      break
    case 'supplier-skus':
    case 'mappings':
    case 'purchase-approvals':
    case 'purchase-requests':
    case 'purchases':
      parents.push(...parentForInternalSku(sku), ...parentForSpuFromRow(row, sku), ...parentForSupplier(str(row, 'supplier')))
      break
    case 'purchase-receipts':
      parents.push(
        ...parentForPo(str(row, 'po')),
        ...parentForInternalSku(sku),
        ...parentForBin(str(row, 'bin'), str(row, 'warehouse')),
      )
      break
    case 'inventory-balances':
      parents.push(
        ...parentForInternalSku(sku),
        ...parentForBin(str(row, 'bin'), str(row, 'warehouse')),
        ...parentForWarehouse(str(row, 'warehouse')),
      )
      break
    case 'warehouse':
      parents.push(
        ...parentForInternalSku(str(row, 'boundSku') || sku),
        ...parentForWarehouse(str(row, 'warehouseCode') || str(row, 'warehouse')),
      )
      break
    case 'warehouse-zones':
      parents.push(...parentForWarehouse(str(row, 'warehouseCode')))
      break
    case 'stock-inbounds':
      parents.push(
        ...parentForInternalSku(sku),
        ...parentForBin(str(row, 'bin'), str(row, 'warehouse')),
        ...parentForPo(str(row, 'sourceDoc')),
      )
      break
    case 'stock-outbounds':
      parents.push(
        ...parentForInternalSku(sku),
        ...parentForOrder(str(row, 'order')),
        ...parentForBin(str(row, 'bin'), str(row, 'warehouse')),
      )
      break
    case 'stock-adjustments':
      parents.push(
        ...parentForInternalSku(sku || str(row, 'firstSku')),
        ...parentForWarehouse(str(row, 'warehouse')),
        ...parentForBin(str(row, 'bin'), str(row, 'warehouse')),
      )
      break
    case 'inventory-ledger':
      parents.push(
        ...parentForInternalSku(sku),
        ...parentForBin(str(row, 'bin'), str(row, 'warehouse')),
        ...parentForWarehouse(str(row, 'warehouse')),
      )
      break
    case 'aftersales':
    case 'aftersale-returns':
    case 'aftersale-cancels':
      parents.push(...parentForInternalSku(sku), ...parentForOrder(str(row, 'order')))
      break
    case 'picking':
    case 'shipments':
    case 'logistics-lgs':
    case 'logistics-jsb':
      parents.push(...parentForOrder(str(row, 'order') || str(row, 'orderId')))
      break
    case 'orders':
      parents.push(...parentForInternalSku(sku))
      break
    case 'listings':
      parents.push(...parentForInternalSku(sku), ...parentForSpuFromRow(row, sku))
      break
    case 'ocean-containers':
      parents.push(...parentForWarehouse(str(row, 'warehouse') || str(row, 'destWarehouse')))
      break
    default:
      break
  }
  return parents
}

function sectionsFromBag(module: string, data: RelatedDataBag | undefined): DetailRelatedSection[] {
  if (data?.sections && data.sections.length > 0) return data.sections

  const out: DetailRelatedSection[] = []
  const push = (
    key: keyof RelatedDataBag,
    title: string,
    description: string,
    columns: DetailRelatedSection['columns'],
  ) => {
    const rows = (data?.[key] as Array<Record<string, unknown>> | undefined) ?? []
    // Only emit a section when bag explicitly provided for that key OR module expects it.
    if (data && key in data) {
      out.push(section(title, description, columns, rows))
    }
  }

  switch (module) {
    case 'master-products':
      push('variants', 'SKU 列表', '该 SPU 下的内部 SKU（规格）', VARIANT_COLUMNS)
      push('listings', '刊登列表', '此商品各 SKU 的刊登', LISTING_COLUMNS)
      push('purchaseOrders', '采购单', '覆盖本商品 SKU 的采购单', PO_COLUMNS)
      break
    case 'master-skus':
      push('listings', '刊登列表', '该 SKU 的平台刊登', LISTING_COLUMNS)
      push('mappings', 'Seller SKU 映射', '店铺侧映射', MAPPING_COLUMNS)
      push('supplierSkus', '供应商货号', '该内部 SKU 的供应商货号', [
        { key: 'id', label: '映射 ID', mono: true, hrefKey: 'href' },
        { key: 'supplier', label: '供应商' },
        { key: 'factoryCode', label: '厂家款号', mono: true },
        { key: 'status', label: '状态' },
      ])
      push('balances', '库存余额', '仓库/库位库存汇总', BALANCE_COLUMNS)
      push('purchaseOrders', '采购单', '含该 SKU 明细行的采购单', PO_COLUMNS)
      push('receipts', '到货质检', '该 SKU 的到货质检', RECEIPT_COLUMNS)
      push('movements', '库存流水', '该 SKU 近期库存变动', MOVEMENT_COLUMNS)
      break
    case 'inventory-balances':
      push('movements', '库存流水', '本仓位 SKU 的追加流水', MOVEMENT_COLUMNS)
      push('outbounds', '相关出库单', '同库位 SKU 出库作业', OUTBOUND_COLUMNS)
      push('adjustments', '相关调整单', '同库位 SKU 盘点 / 调整', ADJUSTMENT_COLUMNS)
      break
    case 'warehouse':
      push('balances', '库位库存', '绑定 SKU 在本库位的余额', BALANCE_COLUMNS)
      push('movements', '库存流水', '本库位近期流水', MOVEMENT_COLUMNS)
      push('bins', '同仓库位', '同仓库其他库位', BIN_COLUMNS)
      break
    case 'warehouse-zones':
      push('bins', '下属库位', '本库区库位', BIN_COLUMNS)
      push('balances', '库区库存', '本库区库位余额', BALANCE_COLUMNS)
      break
    case 'stock-adjustments':
      push('balances', '相关余额', '调整明细涉及的库存余额', BALANCE_COLUMNS)
      push('movements', '过账流水', '本调整单过账产生的流水', MOVEMENT_COLUMNS)
      break
    case 'inventory-ledger':
      push('balances', '当前余额', '流水对应仓位 SKU 余额', BALANCE_COLUMNS)
      break
    case 'stock-outbounds':
      push('orderLines', '出库明细', '出库单行', [
        { key: 'sku', label: '内部 SKU', mono: true },
        { key: 'quantity', label: '数量', numeric: true },
        { key: 'bin', label: '库位', mono: true },
        { key: 'status', label: '状态' },
      ])
      push('movements', '出库流水', '本出库单相关流水', MOVEMENT_COLUMNS)
      break
    case 'stock-inbounds':
      push('movements', '入库流水', '本入库单相关流水', MOVEMENT_COLUMNS)
      push('balances', '上架后余额', '目标库位余额', BALANCE_COLUMNS)
      break
    case 'purchase-receipts':
      push('inbounds', '入库单', '由本到货生成的入库上架单', INBOUND_COLUMNS)
      push('movements', '库存流水', '本到货相关流水', MOVEMENT_COLUMNS)
      break
    case 'purchase-requests':
    case 'purchases':
      push('purchaseOrders', '关联采购单', '由申请生成的采购单', PO_COLUMNS)
      push('balances', '库存余额', '申请 SKU 当前库存', BALANCE_COLUMNS)
      break
    case 'orders':
      push('orderLines', '订单行', '订单明细', [
        { key: 'sku', label: '内部 SKU', mono: true },
        { key: 'sellerSku', label: 'Seller SKU', mono: true },
        { key: 'quantity', label: '数量', numeric: true },
        { key: 'status', label: '状态' },
      ])
      push('outbounds', '出库单', '本订单出库', OUTBOUND_COLUMNS)
      push('packages', '包裹', '履约包裹', [
        { key: 'id', label: '包裹号', mono: true, hrefKey: 'href' },
        { key: 'status', label: '状态' },
      ])
      push('shipments', '运单', '物流运单', [
        { key: 'id', label: '运单号', mono: true, hrefKey: 'href' },
        { key: 'carrier', label: '承运商' },
        { key: 'status', label: '状态' },
      ])
      break
    case 'listings':
      push('mappings', '映射行', '本刊登映射', MAPPING_COLUMNS)
      push('listings', '其他刊登', '同 SKU 其他刊登', LISTING_COLUMNS)
      break
    case 'logistics-lgs':
    case 'logistics-jsb':
      push('packages', '包裹', '批次/运单关联包裹', [
        { key: 'id', label: '包裹号', mono: true, hrefKey: 'href' },
        { key: 'order', label: '订单', mono: true },
        { key: 'status', label: '状态' },
      ])
      push('shipments', '运单事件', '轨迹事件', [
        { key: 'at', label: '时间' },
        { key: 'status', label: '状态' },
        { key: 'note', label: '说明' },
      ])
      break
    case 'fee-templates':
      push('feeVersions', '版本', '费用模板版本', [
        { key: 'version', label: '版本', mono: true, hrefKey: 'href' },
        { key: 'status', label: '状态' },
        { key: 'effectiveFrom', label: '生效' },
      ])
      break
    case 'ocean-containers':
      push('oceanLines', '柜次明细', '装箱 SKU 行', [
        { key: 'sku', label: '内部 SKU', mono: true },
        { key: 'quantity', label: '数量', numeric: true },
        { key: 'status', label: '状态' },
      ])
      push('oceanBoxes', '箱唛', '柜内箱', [
        { key: 'boxNo', label: '箱号', mono: true },
        { key: 'sku', label: 'SKU', mono: true },
        { key: 'quantity', label: '数量', numeric: true },
      ])
      push('movements', '在途流水', '开船/到港/清关/到仓流水', MOVEMENT_COLUMNS)
      break
    default:
      break
  }
  return out
}

/**
 * Build classified related-info for UED / handcrafted detail pages.
 * Parents → 主数据 link fields; children / ops docs → sectioned tables.
 * Never imports ERP_DEMO_* / RELATED_DEMO_* / DEMO_* arrays.
 */
export function buildUedRelatedInfo(
  module: string | undefined,
  row: UedRecord,
  data?: RelatedDataBag,
): DetailRelatedInfo {
  if (!module) return { parents: [], sections: [] }

  const parents = [...parentsFromRow(module, row), ...(data?.parents ?? [])]
  const fromBag = sectionsFromBag(module, data)

  if (fromBag.length > 0) {
    return { parents, sections: fromBag }
  }

  if (PENDING_MODULES.has(module)) {
    return {
      parents,
      sections: [pendingSection('关联数据', 'pending')],
    }
  }

  // Wired domains with no bag yet: honest empty, not fake samples.
  return {
    parents,
    sections: [pendingSection('关联数据', 'empty')],
  }
}

/** Related-info for handcrafted purchase-order detail page. */
export function buildPurchaseOrderRelatedInfo(
  order: {
    id: string
    poNo: string
    sourceRequest: string
    supplier: string
    warehouse: string
    lines: Array<{ sku: string }>
  },
  data?: RelatedDataBag,
): DetailRelatedInfo {
  const parents: DetailRelatedParent[] = [
    ...parentForRequest(order.sourceRequest),
    ...parentForSupplier(order.supplier),
    { label: '收货仓库', value: order.warehouse, mono: true },
    ...(data?.parents ?? []),
  ]

  if (data?.sections?.length) {
    return { parents, sections: data.sections }
  }

  const sections: DetailRelatedSection[] = []
  if (data && 'receipts' in data) {
    sections.push(
      section('到货质检入库', '本采购单的到货批次与质检结果', RECEIPT_COLUMNS, data.receipts ?? []),
    )
  }
  if (data && 'inbounds' in data) {
    sections.push(section('入库单', '由本采购到货生成的入库上架单', INBOUND_COLUMNS, data.inbounds ?? []))
  }
  if (data && 'balances' in data) {
    sections.push(section('库存余额', '采购明细 SKU 的当前库存', BALANCE_COLUMNS, data.balances ?? []))
  }
  if (data && 'movements' in data) {
    sections.push(section('库存流水', '本采购单/明细 SKU 相关流水', MOVEMENT_COLUMNS, data.movements ?? []))
  }

  if (sections.length === 0) {
    sections.push(pendingSection('关联数据', 'empty'))
  }

  return { parents, sections }
}

/** Primary pricing — no demo pricing table; return null until fee/cost domain wires it. */
export function buildPrimaryPricingFields(_sku: string | undefined): {
  title: string
  description: string
  fields: Array<{ label: string; value: string }>
} | null {
  return null
}

export function resolveSkuFromRow(row: UedRecord): string | undefined {
  if (typeof row.sku === 'string' && row.sku && row.sku !== '—') return row.sku
  if (typeof row.internalSku === 'string' && row.internalSku && row.internalSku !== '—') {
    return row.internalSku
  }
  if (typeof row.id === 'string' && /^[A-Z]{2,}\d{6,}$/.test(row.id)) return row.id
  return undefined
}
