import type {
  DetailRelatedInfo,
  DetailRelatedParent,
  DetailRelatedSection,
} from '@/components/console/detail/detail-related-list'
import { DEMO_SUPPLIER_SKUS } from '@/lib/crossborder/supplier-sku-store'
import { DEMO_PURCHASE_ORDERS } from '@/lib/crossborder/purchase-order-store'
import {
  DEMO_PURCHASE_RECEIPTS,
  DEMO_STOCK_INBOUNDS,
  toRelatedInboundShape,
  toRelatedReceiptShape,
} from '@/lib/crossborder/purchase-receipt-store'
import { getOrders, getPackages } from '@/lib/crossborder/order-store'
import { getListings } from '@/lib/crossborder/listing-store'
import { getMappingExceptions } from '@/lib/crossborder/mapping-exception-store'
import { DEMO_WAREHOUSE_ZONES } from '@/lib/crossborder/warehouse-zone-store'
import {
  ERP_DEMO_AFTERSALES,
  ERP_DEMO_BINS,
  ERP_DEMO_INVENTORY,
  ERP_DEMO_MAPPINGS,
  ERP_DEMO_PRODUCTS,
  ERP_DEMO_PURCHASES,
  findProductBySku,
  findSupplierMasterByName,
  getDemoListingsBySellerSku,
  getDemoListingsBySku,
  getDemoListingsBySpu,
  getDemoSkuPricing,
  type DemoListing,
} from '@/lib/crossborder/erp-ued-data'
import {
  RELATED_DEMO_ADJUSTMENTS,
  RELATED_DEMO_APPROVALS,
  RELATED_DEMO_INBOUNDS,
  RELATED_DEMO_LEDGER,
  RELATED_DEMO_OUTBOUNDS,
  RELATED_DEMO_PICKS,
  RELATED_DEMO_RECEIPTS,
  RELATED_DEMO_RETURNS,
  RELATED_DEMO_SYNC_TASKS,
} from '@/lib/console/related-ops-data'
import { getCostBySku, getOrderById } from '@/lib/crossborder/mock-data'
import {
  DEMO_FREIGHT_ESTIMATES,
  estimatesForCarrier,
  estimatesForCarton,
  findShopByLabel,
  profitFeesFor,
  quotesForCarrier,
  quotesForEstimate,
  resolveInternalSku,
  settlementLinesFor,
} from '@/lib/crossborder/finance-related-data'

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
  settlements: ['shop'],
  finance: ['shop'],
  carriers: [],
  'carton-specs': [],
  freight: ['sku', 'cartonId'],
  reports: ['dimension'],
}

function str(row: UedRecord, key: string): string | undefined {
  const value = row[key]
  return typeof value === 'string' && value.trim() && value !== '—' ? value : undefined
}

function listingRows(listings: DemoListing[]) {
  return listings.map((item) => ({
    id: item.id,
    sku: item.sku,
    shop: item.shop,
    platform: item.platform,
    sellerSku: item.sellerSku,
    title: item.title,
    sellPrice: `${item.sellPrice.toFixed(2)} ${item.currency}`,
    status: item.status,
    stockOnHand: item.stockOnHand,
    href: `/console/listings/${encodeURIComponent(item.id)}`,
  }))
}

const LISTING_COLUMNS = [
  { key: 'id', label: '刊登 ID', mono: true, hrefKey: 'href' },
  { key: 'sku', label: '内部 SKU', mono: true },
  { key: 'shop', label: '店铺' },
  { key: 'platform', label: '平台' },
  { key: 'sellerSku', label: 'Seller SKU', mono: true },
  { key: 'sellPrice', label: '售价', numeric: true },
  { key: 'status', label: '状态' },
  { key: 'stockOnHand', label: '在库', numeric: true },
]

function listingsSection(
  listings: DemoListing[],
  opts?: { title?: string; description?: string },
): DetailRelatedSection {
  return {
    title: opts?.title ?? '刊登列表',
    description:
      opts?.description ?? '该对象关联的平台刊登（示例数据）；售价为店铺侧销售价',
    columns: LISTING_COLUMNS,
    rows: listingRows(listings),
    emptyText: '暂无刊登（示例）',
  }
}

function mappingRows(internalSku: string, excludeSellerSku?: string) {
  return ERP_DEMO_MAPPINGS.filter(
    (item) =>
      item.internalSku === internalSku &&
      !(excludeSellerSku && item.sellerSku === excludeSellerSku),
  ).map((item) => ({
    shop: item.shop,
    sellerSku: item.sellerSku,
    itemId: item.itemId,
    listingStatus: item.listingStatus,
    mappingStatus: item.mappingStatus,
    href: `/console/mappings/${encodeURIComponent(`${item.shop}::${item.sellerSku}`)}`,
  }))
}

function supplierSkuRows(internalSku: string, excludeId?: string) {
  return DEMO_SUPPLIER_SKUS.filter(
    (item) => item.sku === internalSku && item.id !== excludeId,
  ).map((item) => ({
    id: item.id,
    supplier: item.supplier,
    factoryCode: item.factoryCode,
    price: `${item.price} ${item.currency}`,
    preferred: item.preferred ? '是' : '否',
    status: item.status,
    href: `/console/supplier-skus/${encodeURIComponent(item.id)}`,
  }))
}

function balanceId(warehouse: string, bin: string, sku: string) {
  return `${warehouse}-${bin}-${sku}`
}

function inventoryRowsForSku(sku: string) {
  return ERP_DEMO_INVENTORY.filter((item) => item.sku === sku).map((item) => ({
    warehouse: item.warehouse,
    bin: item.bin,
    onHand: item.onHand,
    reserved: item.reserved,
    damaged: item.damaged,
    available: item.onHand - item.reserved - item.damaged,
    href: `/console/inventory-balances/${encodeURIComponent(balanceId(item.warehouse, item.bin, item.sku))}`,
  }))
}

function inventorySectionForSku(sku: string): DetailRelatedSection {
  return {
    title: '库存余额',
    description: `内部 SKU ${sku} 的仓库/库位库存汇总（示例）`,
    columns: [
      { key: 'warehouse', label: '仓库', mono: true },
      { key: 'bin', label: '库位', mono: true, hrefKey: 'href' },
      { key: 'onHand', label: '账面', numeric: true },
      { key: 'reserved', label: '锁定', numeric: true },
      { key: 'damaged', label: '残次', numeric: true },
      { key: 'available', label: '可用', numeric: true },
    ],
    rows: inventoryRowsForSku(sku),
    emptyText: '暂无库存余额',
  }
}

function purchaseOrderRows(filter: (po: (typeof DEMO_PURCHASE_ORDERS)[number]) => boolean) {
  return DEMO_PURCHASE_ORDERS.filter(filter).map((po) => ({
    id: po.id,
    poNo: po.poNo,
    sourceRequest: po.sourceRequest,
    supplier: po.supplier,
    warehouse: po.warehouse,
    totalAmount: `${po.totalAmount} ${po.currency}`,
    status: po.status,
    expectedAt: po.expectedAt,
    href: `/console/purchase-orders/${encodeURIComponent(po.id)}`,
  }))
}

const PO_COLUMNS = [
  { key: 'poNo', label: '采购单号', mono: true, hrefKey: 'href' },
  { key: 'sourceRequest', label: '来源申请', mono: true },
  { key: 'supplier', label: '供应商' },
  { key: 'totalAmount', label: '金额', numeric: true },
  { key: 'status', label: '状态' },
  { key: 'expectedAt', label: '预计到货' },
]

function receiptRows(filter: (r: { id: string; po: string; sku: string; arrived: number; qcPass: number; qcDefect: number; shortage: number; bin: string; operator: string; status: string }) => boolean) {
  type ReceiptShape = {
    id: string
    po: string
    sku: string
    arrived: number
    qcPass: number
    qcDefect: number
    shortage: number
    bin: string
    operator: string
    status: string
  }
  const fromStore: ReceiptShape[] = DEMO_PURCHASE_RECEIPTS.map(toRelatedReceiptShape)
  const byId = new Map<string, ReceiptShape>(fromStore.map((item) => [item.id, item]))
  for (const item of RELATED_DEMO_RECEIPTS) {
    if (!byId.has(item.id)) byId.set(item.id, item)
  }
  return [...byId.values()].filter(filter).map((item) => ({
    id: item.id,
    po: item.po,
    sku: item.sku,
    arrived: item.arrived,
    qcPass: item.qcPass,
    qcDefect: item.qcDefect,
    shortage: item.shortage,
    bin: item.bin,
    operator: item.operator,
    status: item.status,
    href: `/console/purchase-receipts/${encodeURIComponent(item.id)}`,
    poHref: `/console/purchase-orders/${encodeURIComponent(item.po)}`,
    skuHref: `/console/master-skus/${encodeURIComponent(item.sku)}`,
  }))
}

const RECEIPT_COLUMNS = [
  { key: 'id', label: '收货单', mono: true, hrefKey: 'href' },
  { key: 'po', label: '采购单', mono: true },
  { key: 'sku', label: '内部 SKU', mono: true },
  { key: 'arrived', label: '到货', numeric: true },
  { key: 'qcPass', label: '合格', numeric: true },
  { key: 'qcDefect', label: '残次', numeric: true },
  { key: 'status', label: '状态' },
]

function inboundRows(filter: (r: { id: string; sourceType: string; sourceDoc: string; sku: string; quantity: number; qcResult: string; bin: string; operator: string; at: string; status: string }) => boolean) {
  type InboundShape = {
    id: string
    sourceType: string
    sourceDoc: string
    sku: string
    quantity: number
    qcResult: string
    bin: string
    operator: string
    at: string
    status: string
  }
  const fromStore: InboundShape[] = DEMO_STOCK_INBOUNDS.map(toRelatedInboundShape)
  const byId = new Map<string, InboundShape>(fromStore.map((item) => [item.id, item]))
  for (const item of RELATED_DEMO_INBOUNDS) {
    if (!byId.has(item.id)) byId.set(item.id, item)
  }
  return [...byId.values()].filter(filter).map((item) => ({
    id: item.id,
    sourceType: item.sourceType,
    sourceDoc: item.sourceDoc,
    sku: item.sku,
    quantity: item.quantity,
    qcResult: item.qcResult,
    bin: item.bin,
    operator: item.operator,
    at: item.at,
    status: item.status,
    href: `/console/stock-inbounds/${encodeURIComponent(item.id)}`,
    skuHref: `/console/master-skus/${encodeURIComponent(item.sku)}`,
  }))
}

const INBOUND_COLUMNS = [
  { key: 'id', label: '入库单', mono: true, hrefKey: 'href' },
  { key: 'sourceType', label: '类型' },
  { key: 'sourceDoc', label: '来源单', mono: true },
  { key: 'sku', label: '内部 SKU', mono: true },
  { key: 'quantity', label: '数量', numeric: true },
  { key: 'bin', label: '库位', mono: true },
  { key: 'status', label: '状态' },
]

function outboundRows(filter: (r: (typeof RELATED_DEMO_OUTBOUNDS)[number]) => boolean) {
  return RELATED_DEMO_OUTBOUNDS.filter(filter).map((item) => ({
    id: item.id,
    order: item.order,
    sku: item.sku,
    quantity: item.quantity,
    bin: item.bin,
    status: item.status,
    at: item.at,
    href: `/console/stock-outbounds/${encodeURIComponent(item.id)}`,
  }))
}

const OUTBOUND_COLUMNS = [
  { key: 'id', label: '出库单', mono: true, hrefKey: 'href' },
  { key: 'order', label: '订单', mono: true },
  { key: 'sku', label: '内部 SKU', mono: true },
  { key: 'quantity', label: '数量', numeric: true },
  { key: 'bin', label: '库位', mono: true },
  { key: 'status', label: '状态' },
]

function ledgerRows(filter: (r: (typeof RELATED_DEMO_LEDGER)[number]) => boolean) {
  return RELATED_DEMO_LEDGER.filter(filter).map((item) => ({
    id: item.id,
    type: item.type,
    sku: item.sku,
    bin: item.bin,
    delta: item.delta,
    after: item.after,
    source: item.source,
    at: item.at,
    status: item.status,
    href: `/console/inventory-ledger/${encodeURIComponent(item.id)}`,
  }))
}

const LEDGER_COLUMNS = [
  { key: 'id', label: '流水号', mono: true, hrefKey: 'href' },
  { key: 'type', label: '类型' },
  { key: 'sku', label: '内部 SKU', mono: true },
  { key: 'delta', label: '变化', numeric: true },
  { key: 'after', label: '变动后', numeric: true },
  { key: 'source', label: '来源单', mono: true },
  { key: 'at', label: '时间' },
]

function purchaseRequestRows(filter: (r: (typeof ERP_DEMO_PURCHASES)[number]) => boolean) {
  return ERP_DEMO_PURCHASES.filter(filter).map((item) => ({
    id: item.id,
    applicant: item.applicant,
    sku: item.sku,
    quantity: item.quantity,
    supplier: item.supplier,
    unitPrice: `${item.unitPrice} ${item.currency}`,
    status: item.status,
    href: `/console/purchase-requests/${encodeURIComponent(item.id)}`,
  }))
}

const PR_COLUMNS = [
  { key: 'id', label: '申请单号', mono: true, hrefKey: 'href' },
  { key: 'applicant', label: '申请人' },
  { key: 'sku', label: '内部 SKU', mono: true },
  { key: 'quantity', label: '数量', numeric: true },
  { key: 'unitPrice', label: '单价', numeric: true },
  { key: 'status', label: '状态' },
]

function approvalRows(filter: (r: (typeof RELATED_DEMO_APPROVALS)[number]) => boolean) {
  return RELATED_DEMO_APPROVALS.filter(filter).map((item) => ({
    id: item.id,
    applicant: item.applicant,
    sku: item.sku,
    quantity: item.quantity,
    unitPrice: `${item.unitPrice} ${item.currency}`,
    status: item.status,
    submittedAt: item.submittedAt,
    href: `/console/purchase-approvals/${encodeURIComponent(item.id)}`,
  }))
}

const APPROVAL_COLUMNS = [
  { key: 'id', label: '申请单号', mono: true, hrefKey: 'href' },
  { key: 'applicant', label: '申请人' },
  { key: 'sku', label: '内部 SKU', mono: true },
  { key: 'quantity', label: '数量', numeric: true },
  { key: 'status', label: '状态' },
  { key: 'submittedAt', label: '提交时间' },
]

function buildSkuChildren(
  sku: string,
  opts?: { excludeSupplierSkuId?: string; excludeSellerSku?: string },
) {
  const sections: DetailRelatedSection[] = [
    listingsSection(getDemoListingsBySku(sku), {
      description: `内部 SKU ${sku} 的平台刊登（示例）；含售价`,
    }),
  ]

  const mappings = mappingRows(sku, opts?.excludeSellerSku)
  if (mappings.length > 0) {
    sections.push({
      title: 'Seller SKU 映射',
      description: '店铺侧 Seller SKU 与内部 SKU 的映射',
      columns: [
        { key: 'shop', label: '店铺' },
        { key: 'sellerSku', label: 'Seller SKU', mono: true, hrefKey: 'href' },
        { key: 'itemId', label: 'Item ID', mono: true },
        { key: 'listingStatus', label: '上架状态' },
        { key: 'mappingStatus', label: '映射状态' },
      ],
      rows: mappings,
      emptyText: '暂无映射',
    })
  }

  const suppliers = supplierSkuRows(sku, opts?.excludeSupplierSkuId)
  if (suppliers.length > 0) {
    sections.push({
      title: '供应商货号',
      description: '该内部 SKU 的供应商货号映射',
      columns: [
        { key: 'id', label: '映射 ID', mono: true, hrefKey: 'href' },
        { key: 'supplier', label: '供应商' },
        { key: 'factoryCode', label: '厂家款号', mono: true },
        { key: 'price', label: '采购价', numeric: true },
        { key: 'preferred', label: '首选' },
        { key: 'status', label: '状态' },
      ],
      rows: suppliers,
      emptyText: '暂无供应商货号',
    })
  }

  return sections
}

function parentForSpu(sku: string | undefined): DetailRelatedParent[] {
  if (!sku) return []
  const product = findProductBySku(sku)
  if (!product) return []
  return [
    {
      label: '所属 SPU',
      value: `${product.spu} · ${product.name}`,
      href: `/console/master-products/${encodeURIComponent(product.spu)}`,
      mono: true,
    },
  ]
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
  const supplier = findSupplierMasterByName(name)
  if (supplier) {
    return [
      {
        label: '供应商',
        value: `${supplier.code} · ${supplier.name}`,
        href: `/console/suppliers/${encodeURIComponent(supplier.code)}`,
        mono: true,
      },
    ]
  }
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
  const zoneCode = bin.split('-')[0]
  const zone = DEMO_WAREHOUSE_ZONES.find(
    (item) =>
      item.code === zoneCode && (!warehouse || item.warehouseCode === warehouse),
  )
  if (zone) {
    parents.push({
      label: '库区',
      value: `${zone.code} · ${zone.name}`,
      href: `/console/warehouse-zones/${encodeURIComponent(zone.id)}`,
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

function parentForShop(label: string | undefined): DetailRelatedParent[] {
  if (!label) return []
  const shop = findShopByLabel(label)
  if (shop) {
    return [
      {
        label: '店铺',
        value: shop.name,
        href: `/console/settings/shops/${encodeURIComponent(shop.id)}`,
      },
    ]
  }
  return [{ label: '店铺', value: label }]
}

function parentForOrder(order: string | undefined): DetailRelatedParent[] {
  if (!order || order === '—') return []
  const found = getOrderById(order)
  return [
    {
      label: '订单',
      value: order,
      mono: true,
      href: found
        ? `/console/orders/${encodeURIComponent(found.id)}`
        : `/console/orders/${encodeURIComponent(order)}`,
    },
  ]
}

function parentForCarton(cartonId: string | undefined): DetailRelatedParent[] {
  if (!cartonId) return []
  return [
    {
      label: '箱规',
      value: cartonId,
      mono: true,
      href: `/console/carton-specs/${encodeURIComponent(cartonId)}`,
    },
  ]
}

function parentForCostSku(costSku: string | undefined): DetailRelatedParent[] {
  if (!costSku) return []
  const cost = getCostBySku(costSku)
  if (!cost) return []
  return [
    {
      label: '成本测算',
      value: cost.sku,
      mono: true,
      href: `/console/costs/${encodeURIComponent(cost.sku)}`,
    },
  ]
}

function parentForRequest(requestId: string | undefined): DetailRelatedParent[] {
  if (!requestId) return []
  const inApprovals = RELATED_DEMO_APPROVALS.some((item) => item.id === requestId)
  return [
    {
      label: '来源申请',
      value: requestId,
      href: inApprovals
        ? `/console/purchase-approvals/${encodeURIComponent(requestId)}`
        : `/console/purchase-requests/${encodeURIComponent(requestId)}`,
      mono: true,
    },
  ]
}

function zoneForBin(bin: string | undefined, warehouse?: string) {
  if (!bin) return undefined
  const zoneCode = bin.split('-')[0]
  return DEMO_WAREHOUSE_ZONES.find(
    (item) =>
      item.code === zoneCode && (!warehouse || item.warehouseCode === warehouse),
  )
}

function skuOpsSections(sku: string): DetailRelatedSection[] {
  const sections: DetailRelatedSection[] = [inventorySectionForSku(sku)]

  const pos = purchaseOrderRows((po) => po.lines.some((line) => line.sku === sku))
  sections.push({
    title: '采购单',
    description: '含该 SKU 明细行的采购单（示例）',
    columns: PO_COLUMNS,
    rows: pos,
    emptyText: '暂无采购单',
  })

  const receipts = receiptRows((item) => item.sku === sku)
  sections.push({
    title: '到货质检',
    description: '该 SKU 的到货质检入库单（示例）',
    columns: RECEIPT_COLUMNS,
    rows: receipts,
    emptyText: '暂无到货记录',
  })

  const ledger = ledgerRows((item) => item.sku === sku)
  sections.push({
    title: '库存流水',
    description: '该 SKU 近期库存变动（示例）',
    columns: LEDGER_COLUMNS,
    rows: ledger,
    emptyText: '暂无流水',
  })

  return sections
}

/**
 * Build classified related-info for UED / handcrafted detail pages.
 * Parents → 主数据 link fields; children / ops docs → sectioned tables.
 */
export function buildUedRelatedInfo(
  module: string | undefined,
  row: UedRecord,
): DetailRelatedInfo {
  switch (module) {
    case 'master-products': {
      const spu = str(row, 'spu')
      const product = spu
        ? ERP_DEMO_PRODUCTS.find((item) => item.spu === spu)
        : undefined
      const listings = spu ? getDemoListingsBySpu(spu) : []
      const variants = (product?.variants ?? []).map((variant) => ({
        sku: variant.code,
        color: variant.color,
        size: variant.size,
        status: variant.status,
        href: `/console/master-skus/${encodeURIComponent(variant.code)}`,
      }))
      const skus = new Set(variants.map((item) => item.sku))
      const pos = purchaseOrderRows((po) => po.lines.some((line) => skus.has(line.sku)))

      return {
        parents: [],
        sections: [
          {
            title: 'SKU 列表',
            description: '该 SPU 下的内部 SKU（规格）',
            columns: [
              { key: 'sku', label: '内部 SKU', mono: true, hrefKey: 'href' },
              { key: 'color', label: '颜色' },
              { key: 'size', label: '尺码' },
              { key: 'status', label: '状态' },
            ],
            rows: variants,
            emptyText: '暂无 SKU',
          },
          listingsSection(listings, {
            description: '此商品各 SKU 的刊登列表（示例数据）；含售价',
          }),
          {
            title: '采购单',
            description: '覆盖本商品 SKU 的采购单（示例）',
            columns: PO_COLUMNS,
            rows: pos,
            emptyText: '暂无采购单',
          },
        ],
      }
    }

    case 'master-skus': {
      const sku = str(row, 'sku') || str(row, 'id')
      return {
        parents: parentForSpu(sku),
        sections: sku ? [...buildSkuChildren(sku), ...skuOpsSections(sku)] : [],
      }
    }

    case 'supplier-skus': {
      const sku = str(row, 'sku')
      const id = str(row, 'id')
      const supplierName = str(row, 'supplier')
      const parents: DetailRelatedParent[] = [
        ...parentForInternalSku(sku),
        ...parentForSpu(sku),
        ...parentForSupplier(supplierName),
      ]
      return {
        parents,
        sections: sku ? buildSkuChildren(sku, { excludeSupplierSkuId: id }) : [],
      }
    }

    case 'mappings': {
      const internalSku = str(row, 'internalSku')
      const shop = str(row, 'shop')
      const sellerSku = str(row, 'sellerSku')
      const parents: DetailRelatedParent[] = [
        ...parentForInternalSku(internalSku),
        ...parentForSpu(internalSku),
      ]
      const bySeller = shop && sellerSku ? getDemoListingsBySellerSku(shop, sellerSku) : []
      const bySku = internalSku ? getDemoListingsBySku(internalSku) : []
      const listingMap = new Map<string, DemoListing>()
      for (const item of [...bySeller, ...bySku]) listingMap.set(item.id, item)

      return {
        parents,
        sections: [
          listingsSection(Array.from(listingMap.values()), {
            description: '该映射关联的刊登（示例）；含售价',
          }),
          ...(internalSku
            ? buildSkuChildren(internalSku, { excludeSellerSku: sellerSku }).filter(
                (section) => section.title !== '刊登列表',
              )
            : []),
        ],
      }
    }

    case 'purchase-approvals': {
      const sku = str(row, 'sku')
      const id = str(row, 'id')
      const parents: DetailRelatedParent[] = [
        ...parentForInternalSku(sku),
        ...parentForSpu(sku),
      ]
      const pos = purchaseOrderRows(
        (po) => po.sourceRequest === id || po.lines.some((line) => line.sku === sku),
      )
      const requests = purchaseRequestRows((item) => item.id === id || item.sku === sku)
      return {
        parents,
        sections: [
          {
            title: '关联采购单',
            description: '由本申请生成或同 SKU 的采购单（示例）',
            columns: PO_COLUMNS,
            rows: pos,
            emptyText: '暂无采购单（通过后生成）',
          },
          {
            title: '同 SKU 采购申请',
            description: '同内部 SKU 的其他采购申请（示例）',
            columns: PR_COLUMNS,
            rows: requests.filter((item) => item.id !== id),
            emptyText: '暂无其他申请',
          },
          ...(sku ? [inventorySectionForSku(sku), listingsSection(getDemoListingsBySku(sku))] : []),
        ],
      }
    }

    case 'purchase-requests':
    case 'purchases': {
      const sku = str(row, 'sku')
      const id = str(row, 'id')
      const supplierName = str(row, 'supplier')
      const parents: DetailRelatedParent[] = [
        ...parentForInternalSku(sku),
        ...parentForSpu(sku),
        ...parentForSupplier(supplierName),
      ]
      const pos = purchaseOrderRows(
        (po) => po.sourceRequest === id || (sku ? po.lines.some((line) => line.sku === sku) : false),
      )
      const approvals = approvalRows((item) => item.id === id || (sku ? item.sku === sku : false))
      return {
        parents,
        sections: [
          {
            title: '采购审核',
            description: '本申请及同 SKU 审核记录（示例）',
            columns: APPROVAL_COLUMNS,
            rows: approvals,
            emptyText: '暂无审核记录',
          },
          {
            title: '关联采购单',
            description: '由申请生成的采购单（示例）',
            columns: PO_COLUMNS,
            rows: pos,
            emptyText: '暂无采购单',
          },
          ...(sku ? [inventorySectionForSku(sku)] : []),
        ],
      }
    }

    case 'purchase-receipts': {
      const sku = str(row, 'sku')
      const po = str(row, 'po')
      const bin = str(row, 'bin')
      const id = str(row, 'id')
      const parents: DetailRelatedParent[] = [
        ...parentForPo(po),
        ...parentForInternalSku(sku),
        ...parentForSpu(sku),
        ...parentForBin(bin),
      ]
      const inbounds = inboundRows(
        (item) => item.sourceDoc === id || (sku ? item.sku === sku : false),
      )
      const ledger = ledgerRows(
        (item) =>
          item.source === po ||
          item.source === id ||
          (sku ? item.sku === sku && item.bin === bin : false),
      )
      return {
        parents,
        sections: [
          {
            title: '入库单',
            description: '本收货批次生成的入库上架单（示例）',
            columns: INBOUND_COLUMNS,
            rows: inbounds,
            emptyText: '暂无入库单',
          },
          {
            title: '库存流水',
            description: '与本收货/采购相关的库存变动（示例）',
            columns: LEDGER_COLUMNS,
            rows: ledger,
            emptyText: '暂无流水',
          },
          ...(sku ? [inventorySectionForSku(sku)] : []),
        ],
      }
    }

    case 'suppliers': {
      const code = str(row, 'code')
      const name = str(row, 'name')
      const supplierSkus = DEMO_SUPPLIER_SKUS.filter(
        (item) => item.supplier === name || (code ? item.supplier.includes(code) : false),
      ).map((item) => ({
        id: item.id,
        sku: item.sku,
        factoryCode: item.factoryCode,
        price: `${item.price} ${item.currency}`,
        preferred: item.preferred ? '是' : '否',
        status: item.status,
        href: `/console/supplier-skus/${encodeURIComponent(item.id)}`,
        skuHref: `/console/master-skus/${encodeURIComponent(item.sku)}`,
      }))
      const pos = purchaseOrderRows((po) => po.supplier === name)
      const requests = purchaseRequestRows((item) => item.supplier === name)
      return {
        parents: [],
        sections: [
          {
            title: '供应商货号',
            description: '该供应商可采的内部 SKU / 厂家款号（示例）',
            columns: [
              { key: 'id', label: '映射 ID', mono: true, hrefKey: 'href' },
              { key: 'sku', label: '内部 SKU', mono: true, hrefKey: 'skuHref' },
              { key: 'factoryCode', label: '厂家款号', mono: true },
              { key: 'price', label: '采购价', numeric: true },
              { key: 'preferred', label: '首选' },
              { key: 'status', label: '状态' },
            ],
            rows: supplierSkus,
            emptyText: '暂无供应商货号',
          },
          {
            title: '采购单',
            description: '向该供应商下达的采购单（示例）',
            columns: PO_COLUMNS,
            rows: pos,
            emptyText: '暂无采购单',
          },
          {
            title: '采购申请',
            description: '指定该供应商的采购申请（示例）',
            columns: PR_COLUMNS,
            rows: requests,
            emptyText: '暂无采购申请',
          },
        ],
      }
    }

    case 'inventory-balances': {
      const sku = str(row, 'sku')
      const bin = str(row, 'bin')
      const warehouse = str(row, 'warehouse')
      const parents: DetailRelatedParent[] = [
        ...parentForInternalSku(sku),
        ...parentForSpu(sku),
        ...parentForBin(bin, warehouse),
      ]
      const ledger = ledgerRows(
        (item) =>
          (!sku || item.sku === sku) &&
          (!bin || item.bin === bin) &&
          (!warehouse || item.warehouse === warehouse),
      )
      const adjustments = RELATED_DEMO_ADJUSTMENTS.filter(
        (item) =>
          (!sku || item.sku === sku) &&
          (!warehouse || item.warehouse === warehouse) &&
          (!bin || item.bin.includes(bin)),
      ).map((item) => ({
        id: item.id,
        type: item.type,
        delta: item.delta,
        reason: item.reason,
        status: item.status,
        href: `/console/stock-adjustments/${encodeURIComponent(item.id)}`,
      }))
      const outbounds = outboundRows((item) => item.sku === sku && item.bin === bin)
      return {
        parents,
        sections: [
          ...(sku
            ? [
                listingsSection(getDemoListingsBySku(sku), {
                  description: '该 SKU 的平台刊登；库存同步影响可售（示例）',
                }),
              ]
            : []),
          {
            title: '库存流水',
            description: '本库位/SKU 的库存变动（示例）',
            columns: LEDGER_COLUMNS,
            rows: ledger,
            emptyText: '暂无流水',
          },
          {
            title: '盘点与调整',
            description: '影响本余额的调整单（示例）',
            columns: [
              { key: 'id', label: '调整单', mono: true, hrefKey: 'href' },
              { key: 'type', label: '类型' },
              { key: 'delta', label: '变化', numeric: true },
              { key: 'reason', label: '原因' },
              { key: 'status', label: '状态' },
            ],
            rows: adjustments,
            emptyText: '暂无调整单',
          },
          {
            title: '出库单',
            description: '从本库位出库的订单作业（示例）',
            columns: OUTBOUND_COLUMNS,
            rows: outbounds,
            emptyText: '暂无出库单',
          },
        ],
      }
    }

    case 'warehouse': {
      const code = str(row, 'code') || str(row, 'id')
      const warehouse = str(row, 'warehouse')
      const sku = str(row, 'sku')
      const zone = zoneForBin(code, warehouse)
      const parents: DetailRelatedParent[] = [
        ...(warehouse
          ? [{ label: '仓库', value: warehouse, mono: true } satisfies DetailRelatedParent]
          : []),
        ...(zone
          ? [
              {
                label: '库区',
                value: `${zone.code} · ${zone.name}`,
                href: `/console/warehouse-zones/${encodeURIComponent(zone.id)}`,
                mono: true,
              } satisfies DetailRelatedParent,
            ]
          : []),
        ...parentForInternalSku(sku),
        ...parentForSpu(sku),
      ]
      const balances = ERP_DEMO_INVENTORY.filter(
        (item) => item.bin === code && (!warehouse || item.warehouse === warehouse),
      ).map((item) => ({
        sku: item.sku,
        name: item.name,
        onHand: item.onHand,
        reserved: item.reserved,
        available: item.onHand - item.reserved - item.damaged,
        href: `/console/inventory-balances/${encodeURIComponent(balanceId(item.warehouse, item.bin, item.sku))}`,
        skuHref: `/console/master-skus/${encodeURIComponent(item.sku)}`,
      }))
      const ledger = ledgerRows((item) => item.bin === code)
      const inbounds = inboundRows((item) => item.bin === code)
      const receipts = receiptRows((item) => item.bin === code)
      return {
        parents,
        sections: [
          {
            title: '库存余额',
            description: '存放于本库位的 SKU 库存（示例）',
            columns: [
              { key: 'sku', label: '内部 SKU', mono: true, hrefKey: 'skuHref' },
              { key: 'name', label: '名称' },
              { key: 'onHand', label: '账面', numeric: true },
              { key: 'reserved', label: '锁定', numeric: true },
              { key: 'available', label: '可用', numeric: true, hrefKey: 'href' },
            ],
            rows: balances,
            emptyText: '库位空闲，暂无库存',
          },
          {
            title: '库存流水',
            description: '本库位近期出入库流水（示例）',
            columns: LEDGER_COLUMNS,
            rows: ledger,
            emptyText: '暂无流水',
          },
          {
            title: '入库单',
            description: '上架到本库位的入库单（示例）',
            columns: INBOUND_COLUMNS,
            rows: inbounds,
            emptyText: '暂无入库单',
          },
          {
            title: '到货质检',
            description: '指定本库位的到货批次（示例）',
            columns: RECEIPT_COLUMNS,
            rows: receipts,
            emptyText: '暂无到货记录',
          },
        ],
      }
    }

    case 'warehouse-zones': {
      const zoneCode = str(row, 'code')
      const warehouseCode = str(row, 'warehouseCode')
      const parents: DetailRelatedParent[] = warehouseCode
        ? [{ label: '仓库', value: warehouseCode, mono: true }]
        : []
      const bins = ERP_DEMO_BINS.filter(
        (item) =>
          (!zoneCode || item.code.startsWith(`${zoneCode}-`)) &&
          (!warehouseCode || item.warehouse === warehouseCode),
      ).map((item) => ({
        code: item.code,
        sku: item.sku,
        status: item.status,
        href: `/console/warehouse/${encodeURIComponent(item.code)}`,
        skuHref:
          item.sku !== '—'
            ? `/console/master-skus/${encodeURIComponent(item.sku)}`
            : undefined,
      }))
      const balances = ERP_DEMO_INVENTORY.filter(
        (item) =>
          (!zoneCode || item.bin.startsWith(`${zoneCode}-`)) &&
          (!warehouseCode || item.warehouse === warehouseCode),
      ).map((item) => ({
        bin: item.bin,
        sku: item.sku,
        onHand: item.onHand,
        available: item.onHand - item.reserved - item.damaged,
        href: `/console/inventory-balances/${encodeURIComponent(balanceId(item.warehouse, item.bin, item.sku))}`,
      }))
      return {
        parents,
        sections: [
          {
            title: '库位列表',
            description: '本库区下的库位与占用情况（示例）',
            columns: [
              { key: 'code', label: '库位', mono: true, hrefKey: 'href' },
              { key: 'sku', label: '占用 SKU', mono: true, hrefKey: 'skuHref' },
              { key: 'status', label: '状态' },
            ],
            rows: bins,
            emptyText: '暂无库位',
          },
          {
            title: '库存余额',
            description: '本库区 SKU 库存汇总（示例）',
            columns: [
              { key: 'bin', label: '库位', mono: true, hrefKey: 'href' },
              { key: 'sku', label: '内部 SKU', mono: true },
              { key: 'onHand', label: '账面', numeric: true },
              { key: 'available', label: '可用', numeric: true },
            ],
            rows: balances,
            emptyText: '暂无库存',
          },
        ],
      }
    }

    case 'stock-inbounds': {
      const sku = str(row, 'sku')
      const bin = str(row, 'bin')
      const sourceDoc = str(row, 'sourceDoc')
      const parents: DetailRelatedParent[] = [
        ...parentForInternalSku(sku),
        ...parentForSpu(sku),
        ...parentForBin(bin),
        ...(sourceDoc
          ? [
              {
                label: '来源单据',
                value: sourceDoc,
                href: sourceDoc.startsWith('RCV')
                  ? `/console/purchase-receipts/${encodeURIComponent(sourceDoc)}`
                  : sourceDoc.startsWith('AS')
                    ? `/console/aftersales/${encodeURIComponent(sourceDoc)}`
                    : undefined,
                mono: true,
              } satisfies DetailRelatedParent,
            ]
          : []),
      ]
      return {
        parents,
        sections: [
          ...(sku ? [inventorySectionForSku(sku)] : []),
          {
            title: '库存流水',
            description: '本入库相关流水（示例）',
            columns: LEDGER_COLUMNS,
            rows: ledgerRows(
              (item) =>
                item.source === sourceDoc ||
                (sku ? item.sku === sku && item.type.includes('入库') : false),
            ),
            emptyText: '暂无流水',
          },
        ],
      }
    }

    case 'stock-outbounds': {
      const sku = str(row, 'sku')
      const bin = str(row, 'bin')
      const order = str(row, 'order')
      const parents: DetailRelatedParent[] = [
        ...parentForInternalSku(sku),
        ...parentForSpu(sku),
        ...parentForBin(bin),
        ...(order ? [{ label: '订单', value: order, mono: true }] : []),
      ]
      const picks = RELATED_DEMO_PICKS.filter((item) => item.order === order).map((item) => ({
        id: item.id,
        shop: item.shop,
        skus: item.skus,
        tracking: item.tracking,
        status: item.status,
        href: `/console/picking/${encodeURIComponent(item.id)}`,
      }))
      return {
        parents,
        sections: [
          {
            title: '拣货包裹',
            description: '本出库关联的拣货/包裹（示例）',
            columns: [
              { key: 'id', label: '包裹号', mono: true, hrefKey: 'href' },
              { key: 'shop', label: '店铺' },
              { key: 'skus', label: 'SKU' },
              { key: 'tracking', label: '运单号', mono: true },
              { key: 'status', label: '状态' },
            ],
            rows: picks,
            emptyText: '暂无拣货单',
          },
          ...(sku ? [inventorySectionForSku(sku)] : []),
        ],
      }
    }

    case 'stock-adjustments': {
      const sku = str(row, 'sku')
      const binRaw = str(row, 'bin')
      const bin = binRaw?.split('→')[0]?.trim()
      const warehouse = str(row, 'warehouse')
      const parents: DetailRelatedParent[] = [
        ...parentForInternalSku(sku),
        ...parentForSpu(sku),
        ...parentForBin(bin, warehouse),
        ...(warehouse
          ? [{ label: '仓库', value: warehouse, mono: true } satisfies DetailRelatedParent]
          : []),
      ]
      return {
        parents,
        sections: [
          ...(sku && bin && warehouse
            ? [
                {
                  title: '库存余额',
                  description: '调整影响的库存余额（示例）',
                  columns: [
                    { key: 'warehouse', label: '仓库', mono: true },
                    { key: 'bin', label: '库位', mono: true, hrefKey: 'href' },
                    { key: 'onHand', label: '账面', numeric: true },
                    { key: 'available', label: '可用', numeric: true },
                  ],
                  rows: inventoryRowsForSku(sku).filter((item) => item.bin === bin),
                  emptyText: '暂无余额',
                } satisfies DetailRelatedSection,
              ]
            : sku
              ? [inventorySectionForSku(sku)]
              : []),
          {
            title: '库存流水',
            description: '同库位近期流水（示例）',
            columns: LEDGER_COLUMNS,
            rows: ledgerRows((item) => (!sku || item.sku === sku) && (!bin || item.bin === bin)),
            emptyText: '暂无流水',
          },
        ],
      }
    }

    case 'inventory-ledger': {
      const sku = str(row, 'sku')
      const bin = str(row, 'bin')
      const warehouse = str(row, 'warehouse')
      const source = str(row, 'source')
      const parents: DetailRelatedParent[] = [
        ...parentForInternalSku(sku),
        ...parentForSpu(sku),
        ...parentForBin(bin, warehouse),
        ...(source
          ? [
              {
                label: '来源单据',
                value: source,
                href: source.startsWith('PO')
                  ? `/console/purchase-orders/${encodeURIComponent(source)}`
                  : source.startsWith('AS')
                    ? `/console/aftersales/${encodeURIComponent(source)}`
                    : source.startsWith('RCV')
                      ? `/console/purchase-receipts/${encodeURIComponent(source)}`
                      : undefined,
                mono: true,
              } satisfies DetailRelatedParent,
            ]
          : []),
      ]
      return {
        parents,
        sections: [
          ...(sku && warehouse && bin
            ? [
                {
                  title: '库存余额',
                  description: '流水对应的当前余额（示例）',
                  columns: [
                    { key: 'warehouse', label: '仓库', mono: true },
                    { key: 'bin', label: '库位', mono: true, hrefKey: 'href' },
                    { key: 'onHand', label: '账面', numeric: true },
                    { key: 'available', label: '可用', numeric: true },
                  ],
                  rows: inventoryRowsForSku(sku).filter((item) => item.bin === bin),
                  emptyText: '暂无余额',
                } satisfies DetailRelatedSection,
              ]
            : []),
        ],
      }
    }

    case 'aftersales':
    case 'aftersale-returns':
    case 'aftersale-cancels': {
      const sku = str(row, 'sku')
      const order = str(row, 'order')
      const id = str(row, 'id')
      const parents: DetailRelatedParent[] = [
        ...parentForInternalSku(sku),
        ...parentForSpu(sku),
        ...(order ? [{ label: '原订单', value: order, mono: true }] : []),
      ]
      const returns = RELATED_DEMO_RETURNS.filter(
        (item) => item.id === id || item.order === order || (sku ? item.sku === sku : false),
      ).map((item) => ({
        id: item.id,
        order: item.order,
        sku: item.sku,
        qty: item.qty,
        qc: item.qc,
        status: item.status,
        href: `/console/aftersale-returns/${encodeURIComponent(item.id)}`,
      }))
      const inbounds = inboundRows(
        (item) =>
          item.sourceType.includes('售后') &&
          (item.sourceDoc === id || (sku ? item.sku === sku : false)),
      )
      const aftersales = ERP_DEMO_AFTERSALES.filter(
        (item) => item.order === order || (sku ? item.sku === sku : false),
      ).map((item) => ({
        id: item.id,
        type: item.type,
        reason: item.reason,
        refund: `${item.refund} ${item.currency}`,
        status: item.status,
        href: `/console/aftersales/${encodeURIComponent(item.id)}`,
      }))
      return {
        parents,
        sections: [
          {
            title: '售后工单',
            description: '同订单/SKU 的售后记录（示例）',
            columns: [
              { key: 'id', label: '售后单', mono: true, hrefKey: 'href' },
              { key: 'type', label: '类型' },
              { key: 'reason', label: '原因' },
              { key: 'refund', label: '退款', numeric: true },
              { key: 'status', label: '状态' },
            ],
            rows: aftersales.filter((item) => item.id !== id || module !== 'aftersales'),
            emptyText: '暂无其他售后',
          },
          {
            title: '退货收货',
            description: '退货入库与质检（示例）',
            columns: [
              { key: 'id', label: '退货单', mono: true, hrefKey: 'href' },
              { key: 'sku', label: '内部 SKU', mono: true },
              { key: 'qty', label: '数量', numeric: true },
              { key: 'qc', label: '质检' },
              { key: 'status', label: '状态' },
            ],
            rows: returns,
            emptyText: '暂无退货收货',
          },
          {
            title: '回库入库单',
            description: '售后合格回库的入库单（示例）',
            columns: INBOUND_COLUMNS,
            rows: inbounds,
            emptyText: '暂无回库单',
          },
        ],
      }
    }

    case 'picking':
    case 'shipments': {
      const order = str(row, 'order')
      const outboundId = str(row, 'outboundId')
      const skusField = str(row, 'skus')
      const firstSku = skusField?.match(/HSY\d+/)?.[0] || str(row, 'sku')
      const orderRec = order
        ? getOrders().find((item) => item.externalOrderId === order || item.id === order)
        : undefined
      const parents: DetailRelatedParent[] = [
        ...(order
          ? [
              {
                label: '订单',
                value: order,
                mono: true,
                href: `/console/orders/${encodeURIComponent(orderRec?.id || order)}`,
              },
            ]
          : []),
        ...parentForInternalSku(firstSku),
        ...(outboundId && outboundId !== '—'
          ? [
              {
                label: '出库单',
                value: outboundId,
                mono: true,
                href: `/console/stock-outbounds/${encodeURIComponent(outboundId)}`,
              },
            ]
          : []),
      ]
      const outbounds = outboundRows((item) => item.order === order)
      const storeOutbounds = getPackages()
        .filter((item) => item.order === order && item.outboundId)
        .map((item) => ({
          id: item.outboundId,
          order: item.order,
          sku: item.lines[0]?.sku ?? '—',
          quantity: item.items,
          bin: item.lines[0]?.bin ?? '—',
          status: item.status,
          at: '—',
          href: `/console/stock-outbounds/${encodeURIComponent(item.outboundId)}`,
        }))
      const outboundMap = new Map<string, (typeof outbounds)[number]>()
      for (const item of [...outbounds, ...storeOutbounds]) outboundMap.set(item.id, item)
      return {
        parents,
        sections: [
          {
            title: '出库单',
            description: '本包裹/发货关联的出库作业（示例 + 会话）',
            columns: OUTBOUND_COLUMNS,
            rows: Array.from(outboundMap.values()),
            emptyText: '暂无出库单',
          },
          ...(firstSku
            ? [
                inventorySectionForSku(firstSku),
                listingsSection(getDemoListingsBySku(firstSku)),
              ]
            : []),
        ],
      }
    }

    case 'sync-tasks': {
      const shop = str(row, 'shop')
      const target = str(row, 'target') ?? ''
      const skuMatch = target.match(/HSY\d+/)?.[0]
      const parents: DetailRelatedParent[] = [
        ...(shop ? [{ label: '店铺', value: shop }] : []),
        ...parentForInternalSku(skuMatch),
      ]
      const listings = skuMatch
        ? getDemoListingsBySku(skuMatch)
        : shop
          ? getDemoListingsBySku('HSY000001001').filter((item) => item.shop === shop)
          : []
      const siblings = RELATED_DEMO_SYNC_TASKS.filter(
        (item) => item.shop === shop && item.id !== str(row, 'id'),
      ).map((item) => ({
        id: item.id,
        type: item.type,
        target: item.target,
        progress: item.progress,
        status: item.status,
        lastRun: item.lastRun,
        href: `/console/sync-tasks/${encodeURIComponent(item.id)}`,
      }))
      return {
        parents,
        sections: [
          listingsSection(listings, {
            description: '任务涉及的刊登（示例）；上下架/价格/库存同步对象',
          }),
          {
            title: '同店同步任务',
            description: '同店铺近期发布与同步任务（示例）',
            columns: [
              { key: 'id', label: '任务 ID', mono: true, hrefKey: 'href' },
              { key: 'type', label: '类型' },
              { key: 'target', label: '目标' },
              { key: 'progress', label: '进度' },
              { key: 'status', label: '状态' },
            ],
            rows: siblings,
            emptyText: '暂无其他任务',
          },
        ],
      }
    }

    case 'reviews': {
      const sku = str(row, 'sku') || str(row, 'internalSku')
      return {
        parents: [...parentForInternalSku(sku), ...parentForSpu(sku)],
        sections: sku
          ? [
              listingsSection(getDemoListingsBySku(sku), {
                description: '评论所属刊登（示例）',
              }),
            ]
          : [],
      }
    }

    case 'profits': {
      const id = str(row, 'id')
      const dimension = str(row, 'dimension') ?? ''
      const isOrder = dimension.startsWith('订单') || Boolean(id && /^(DZ|LZ|TT|SP)-/.test(id))
      const orderId = isOrder ? id : undefined
      const sku = !isOrder ? id || str(row, 'sku') : resolveInternalSku(str(row, 'sku'))
      const shopLabel = dimension.includes('·')
        ? dimension.split('·').slice(1).join('·').trim()
        : undefined
      const feeLines = profitFeesFor(id).map((line, index) => ({
        id: `${line.profitId}-${line.feeType}-${index}`,
        feeType: line.feeType,
        amount: line.amount,
        currency: line.currency,
        note: line.note,
        settlementId: line.settlementId ?? '—',
        costSku: line.costSku ?? '—',
        settlementHref: line.settlementId
          ? `/console/settlements/${encodeURIComponent(line.settlementId)}`
          : undefined,
        costHref: line.costSku
          ? `/console/costs/${encodeURIComponent(line.costSku)}`
          : undefined,
      }))
      const parents: DetailRelatedParent[] = [
        ...parentForOrder(orderId),
        ...parentForInternalSku(sku),
        ...parentForSpu(sku),
        ...parentForShop(shopLabel),
      ]
      return {
        parents,
        sections: [
          {
            title: '费用拆分',
            description: '收入扣减项：商品成本 / 平台佣金 / 物流 / 退款等（示例）',
            columns: [
              { key: 'feeType', label: '费用项' },
              { key: 'amount', label: '金额' },
              { key: 'currency', label: '币种' },
              { key: 'note', label: '备注' },
              { key: 'settlementId', label: '结算单', mono: true, hrefKey: 'settlementHref' },
              { key: 'costSku', label: '成本 SKU', mono: true, hrefKey: 'costHref' },
            ],
            rows: feeLines,
            emptyText: '暂无费用拆分',
          },
          ...(sku
            ? [
                listingsSection(getDemoListingsBySku(sku), {
                  description: '本利润维度关联刊登（示例）',
                }),
              ]
            : []),
        ],
      }
    }

    case 'order-exceptions': {
      const sku = str(row, 'sku') || str(row, 'internalSku')
      const order = str(row, 'order')
      return {
        parents: [
          ...parentForInternalSku(sku),
          ...parentForSpu(sku),
          ...parentForOrder(order),
        ],
        sections: sku
          ? [
              listingsSection(getDemoListingsBySku(sku)),
              inventorySectionForSku(sku),
            ]
          : [],
      }
    }

    case 'settlements': {
      const settlementId = str(row, 'id')
      const shopLabel = str(row, 'shop')
      const platform = str(row, 'platform')
      const lines = settlementLinesFor(settlementId).map((line, index) => {
        const orderId = line.orderExternalId !== '—' ? line.orderExternalId : undefined
        const found = orderId ? getOrderById(orderId) : undefined
        return {
          id: `${line.settlementId}-${line.feeType}-${index}`,
          orderExternalId: line.orderExternalId,
          feeType: line.feeType,
          amount: line.amount,
          currency: line.currency,
          matchStatus: line.matchStatus,
          note: line.note,
          orderHref: orderId
            ? found
              ? `/console/orders/${encodeURIComponent(found.id)}`
              : `/console/orders/${encodeURIComponent(orderId)}`
            : undefined,
        }
      })
      const feeOnly = lines.filter((line) => line.orderExternalId === '—' || line.feeType.includes('费'))
      const parents: DetailRelatedParent[] = [
        ...parentForShop(shopLabel),
        ...(platform ? [{ label: '平台', value: platform }] : []),
      ]
      return {
        parents,
        sections: [
          {
            title: '结算明细行',
            description: '账单行对账：可点击订单号进入订单详情（示例）',
            columns: [
              { key: 'orderExternalId', label: '订单号', mono: true, hrefKey: 'orderHref' },
              { key: 'feeType', label: '费用类型' },
              { key: 'amount', label: '金额' },
              { key: 'currency', label: '币种' },
              { key: 'matchStatus', label: '匹配状态' },
              { key: 'note', label: '备注' },
            ],
            rows: lines,
            emptyText: '暂无结算明细',
          },
          {
            title: '关联费用汇总',
            description: '无订单号或费用类账单行（示例）',
            columns: [
              { key: 'feeType', label: '费用类型' },
              { key: 'amount', label: '金额' },
              { key: 'currency', label: '币种' },
              { key: 'matchStatus', label: '状态' },
              { key: 'note', label: '备注' },
            ],
            rows: feeOnly,
            emptyText: '暂无费用行',
          },
        ],
      }
    }

    case 'finance': {
      const platform = str(row, 'platform')
      const shopName =
        typeof row.settlement === 'object' &&
        row.settlement &&
        typeof (row.settlement as { shopName?: unknown }).shopName === 'string'
          ? (row.settlement as { shopName: string }).shopName
          : str(row, 'shop')
      const settlementId =
        typeof row.settlement === 'object' &&
        row.settlement &&
        typeof (row.settlement as { id?: unknown }).id === 'string'
          ? (row.settlement as { id: string }).id
          : str(row, 'id')
      const embeddedLines =
        typeof row.settlement === 'object' &&
        row.settlement &&
        Array.isArray((row.settlement as { lines?: unknown }).lines)
          ? (
              (row.settlement as {
                lines: Array<{ orderExternalId: string; amount: number; note: string }>
              }).lines
            ).map((line, index) => {
              const orderId =
                line.orderExternalId && line.orderExternalId !== 'fees'
                  ? line.orderExternalId
                  : undefined
              const found = orderId ? getOrderById(orderId) : undefined
              return {
                id: `${settlementId ?? platform}-${index}`,
                orderExternalId: line.orderExternalId,
                amount: line.amount,
                note: line.note,
                orderHref: orderId
                  ? found
                    ? `/console/orders/${encodeURIComponent(found.id)}`
                    : `/console/orders/${encodeURIComponent(orderId)}`
                  : undefined,
              }
            })
          : []
      const demoLines = settlementLinesFor(
        platform === 'Daraz' ? 'STL-DZ-2026-10-LK' : platform === 'Lazada' ? 'STL-LZ-2026-09-MY' : undefined,
      ).map((line, index) => {
        const orderId = line.orderExternalId !== '—' ? line.orderExternalId : undefined
        const found = orderId ? getOrderById(orderId) : undefined
        return {
          id: `demo-${line.settlementId}-${index}`,
          orderExternalId: line.orderExternalId,
          amount: line.amount,
          note: `${line.feeType} · ${line.note}`,
          orderHref: orderId
            ? found
              ? `/console/orders/${encodeURIComponent(found.id)}`
              : `/console/orders/${encodeURIComponent(orderId)}`
            : undefined,
        }
      })
      const lines = embeddedLines.length > 0 ? embeddedLines : demoLines
      return {
        parents: [
          ...parentForShop(shopName),
          ...(platform ? [{ label: '平台', value: platform }] : []),
          ...(settlementId
            ? [
                {
                  label: '结算单',
                  value: settlementId,
                  mono: true,
                  href: settlementId.startsWith('STL-')
                    ? `/console/settlements/${encodeURIComponent(settlementId)}`
                    : undefined,
                },
              ]
            : []),
        ],
        sections: [
          {
            title: '结算明细',
            description: '平台结算行与关联订单（示例）；可点击订单进入履约详情',
            columns: [
              { key: 'orderExternalId', label: '关联订单', mono: true, hrefKey: 'orderHref' },
              { key: 'amount', label: '金额' },
              { key: 'note', label: '备注' },
            ],
            rows: lines,
            emptyText: '暂无结算明细',
          },
        ],
      }
    }

    case 'costs': {
      const costSku = str(row, 'sku') || str(row, 'id')
      const internalSku = resolveInternalSku(costSku)
      const cost = costSku ? getCostBySku(costSku) : undefined
      const components = (cost?.components ?? []).map((item, index) => ({
        id: `${costSku}-comp-${index}`,
        component: item.component,
        amount: item.amount,
        note: item.note,
      }))
      const shipping = (cost?.shippingOptions ?? []).map((item, index) => ({
        id: `${costSku}-ship-${index}`,
        mode: item.mode,
        unitCost: item.unitCost,
        leadDays: item.leadDays,
        note: item.note,
      }))
      const freightLinks = DEMO_FREIGHT_ESTIMATES.filter(
        (item) => item.sku === internalSku,
      ).map((item) => ({
        id: item.id,
        scenario: item.scenario,
        freightUsd: item.freightUsd,
        ddpUsd: item.ddpUsd,
        status: item.status,
        href: `/console/freight/${encodeURIComponent(item.id)}`,
      }))
      const purchaseRefs = DEMO_PURCHASE_ORDERS.filter((po) =>
        po.lines.some((line) => line.sku === internalSku),
      )
        .slice(0, 6)
        .map((po) => ({
          id: po.id,
          supplier: po.supplier,
          status: po.status,
          totalAmount: po.totalAmount,
          currency: po.currency,
          href: `/console/purchase-orders/${encodeURIComponent(po.id)}`,
        }))
      return {
        parents: [
          ...parentForInternalSku(internalSku),
          ...parentForSpu(internalSku),
        ],
        sections: [
          {
            title: '成本构成',
            description: '采购 / 运费 / 关税 / 其他税项（示例，待核实）',
            columns: [
              { key: 'component', label: '费用项' },
              { key: 'amount', label: '金额' },
              { key: 'note', label: '备注' },
            ],
            rows: components,
            emptyText: '暂无成本构成',
          },
          {
            title: '头程方案',
            description: '可选运输方式对比（示例）',
            columns: [
              { key: 'mode', label: '方式' },
              { key: 'unitCost', label: '单位成本' },
              { key: 'leadDays', label: '时效（天）' },
              { key: 'note', label: '备注' },
            ],
            rows: shipping,
            emptyText: '暂无头程方案',
          },
          listingsSection(internalSku ? getDemoListingsBySku(internalSku) : [], {
            description: '该内部 SKU 的刊登与售价（示例）',
          }),
          {
            title: '采购成本参考',
            description: '覆盖本 SKU 的采购单（示例）',
            columns: [
              { key: 'id', label: '采购单', mono: true, hrefKey: 'href' },
              { key: 'supplier', label: '供应商' },
              { key: 'totalAmount', label: '金额' },
              { key: 'currency', label: '币种' },
              { key: 'status', label: '状态' },
            ],
            rows: purchaseRefs,
            emptyText: '暂无采购单',
          },
          {
            title: '关联运费测算',
            description: '同 SKU 的运费情景快照（示例）',
            columns: [
              { key: 'id', label: '测算单', mono: true, hrefKey: 'href' },
              { key: 'scenario', label: '情景' },
              { key: 'freightUsd', label: '运费 USD' },
              { key: 'ddpUsd', label: 'DDP USD' },
              { key: 'status', label: '状态' },
            ],
            rows: freightLinks,
            emptyText: '暂无运费测算',
          },
        ],
      }
    }

    case 'carriers': {
      const code = str(row, 'code') || str(row, 'id')
      const name = str(row, 'name')
      const quotes = quotesForCarrier(code || name).map((item) => ({
        id: item.id,
        lane: item.lane,
        type: item.type,
        unit: item.unit,
        price: item.price,
        transit: item.transit,
        validUntil: item.validUntil,
        estimateId: item.estimateId ?? '—',
        estimateHref: item.estimateId
          ? `/console/freight/${encodeURIComponent(item.estimateId)}`
          : undefined,
      }))
      const estimates = estimatesForCarrier(code || name).map((item) => ({
        id: item.id,
        scenario: item.scenario,
        sku: item.sku,
        ddpUsd: item.ddpUsd,
        status: item.status,
        href: `/console/freight/${encodeURIComponent(item.id)}`,
        skuHref: `/console/master-skus/${encodeURIComponent(item.sku)}`,
      }))
      return {
        parents: [],
        sections: [
          {
            title: '线路报价',
            description: '该承运商在运费测算中的即期报价 / 牌价（示例）',
            columns: [
              { key: 'id', label: '报价 ID', mono: true },
              { key: 'lane', label: '线路' },
              { key: 'type', label: '类型' },
              { key: 'price', label: '价格' },
              { key: 'transit', label: '时效' },
              { key: 'validUntil', label: '有效期' },
              { key: 'estimateId', label: '关联测算', mono: true, hrefKey: 'estimateHref' },
            ],
            rows: quotes,
            emptyText: '暂无线路报价',
          },
          {
            title: '采纳测算',
            description: '已选用本承运商的运费估算快照（示例）',
            columns: [
              { key: 'id', label: '测算单', mono: true, hrefKey: 'href' },
              { key: 'scenario', label: '情景' },
              { key: 'sku', label: '内部 SKU', mono: true, hrefKey: 'skuHref' },
              { key: 'ddpUsd', label: 'DDP USD' },
              { key: 'status', label: '状态' },
            ],
            rows: estimates,
            emptyText: '暂无采纳记录',
          },
        ],
      }
    }

    case 'carton-specs': {
      const cartonId = str(row, 'id')
      const estimates = estimatesForCarton(cartonId).map((item) => ({
        id: item.id,
        scenario: item.scenario,
        sku: item.sku,
        weightKg: item.weightKg,
        volumeM3: item.volumeM3,
        adoptedCarrier: item.adoptedCarrier,
        status: item.status,
        href: `/console/freight/${encodeURIComponent(item.id)}`,
        skuHref: `/console/master-skus/${encodeURIComponent(item.sku)}`,
        carrierHref: `/console/carriers/${encodeURIComponent(item.adoptedCarrierCode)}`,
      }))
      const costLinks = Object.entries(
        // map internal sku → cost demo sku for display
        { HSY000001001: 'TEE-001', HSY000002001: 'HUB-01' } as Record<string, string>,
      )
        .filter(([internal]) => estimates.some((item) => item.sku === internal))
        .map(([, costSku]) => {
          const cost = getCostBySku(costSku)
          return cost
            ? {
                id: cost.sku,
                title: cost.title,
                currency: cost.currency,
                suggestPrice: cost.suggestPrice,
                href: `/console/costs/${encodeURIComponent(cost.sku)}`,
              }
            : null
        })
        .filter(Boolean) as Array<Record<string, unknown>>
      return {
        parents: [],
        sections: [
          {
            title: '运费测算使用',
            description: '引用本箱规的估算情景（示例）',
            columns: [
              { key: 'id', label: '测算单', mono: true, hrefKey: 'href' },
              { key: 'scenario', label: '情景' },
              { key: 'sku', label: '内部 SKU', mono: true, hrefKey: 'skuHref' },
              { key: 'weightKg', label: '重量 kg' },
              { key: 'volumeM3', label: '体积 m³' },
              { key: 'adoptedCarrier', label: '承运商', hrefKey: 'carrierHref' },
              { key: 'status', label: '状态' },
            ],
            rows: estimates,
            emptyText: '暂无测算引用',
          },
          {
            title: '关联成本测算',
            description: '同 SKU 的到仓成本记录（示例）',
            columns: [
              { key: 'id', label: '成本 SKU', mono: true, hrefKey: 'href' },
              { key: 'title', label: '标题' },
              { key: 'suggestPrice', label: '建议售价' },
              { key: 'currency', label: '币种' },
            ],
            rows: costLinks,
            emptyText: '暂无成本记录',
          },
        ],
      }
    }

    case 'freight': {
      const estimateId = str(row, 'id')
      const sku = str(row, 'sku')
      const cartonId = str(row, 'cartonId')
      const quotes = quotesForEstimate(estimateId).map((item) => ({
        id: item.id,
        carrierName: item.carrierName,
        lane: item.lane,
        type: item.type,
        price: item.price,
        transit: item.transit,
        hsRate: item.hsRate,
        validUntil: item.validUntil,
        carrierHref: `/console/carriers/${encodeURIComponent(item.carrierCode)}`,
      }))
      return {
        parents: [
          ...parentForInternalSku(sku),
          ...parentForSpu(sku),
          ...parentForCarton(cartonId),
        ],
        sections: [
          {
            title: '承运商报价',
            description: '本情景下的即期报价与牌价（示例）；可点击进入承运商',
            columns: [
              { key: 'carrierName', label: '承运商', hrefKey: 'carrierHref' },
              { key: 'lane', label: '线路' },
              { key: 'type', label: '类型' },
              { key: 'price', label: '价格' },
              { key: 'transit', label: '时效' },
              { key: 'hsRate', label: 'HS / 税率' },
              { key: 'validUntil', label: '有效期' },
            ],
            rows: quotes,
            emptyText: '暂无报价',
          },
        ],
      }
    }

    case 'reports': {
      const dimension = str(row, 'dimension') ?? ''
      const shopHint = dimension.includes('/')
        ? dimension.split('/')[0]?.trim()
        : dimension.replace(/（.*）/, '').trim()
      const shop = findShopByLabel(shopHint) || findShopByLabel(dimension)
      return {
        parents: [
          ...parentForShop(shop?.name ?? (shopHint && shopHint !== '全平台' ? shopHint : undefined)),
          ...(dimension ? [{ label: '报表维度', value: dimension }] : []),
        ],
        sections: [
          {
            title: '库存摘要',
            description: '同维度示例库存（全量演示数据摘要）',
            columns: [
              { key: 'sku', label: '内部 SKU', mono: true, hrefKey: 'href' },
              { key: 'warehouse', label: '仓库' },
              { key: 'onHand', label: '在库' },
              { key: 'reserved', label: '锁定' },
              { key: 'inbound', label: '在途' },
            ],
            rows: ERP_DEMO_INVENTORY.slice(0, 6).map((item) => ({
              sku: item.sku,
              warehouse: item.warehouse,
              onHand: item.onHand,
              reserved: item.reserved,
              inbound: item.inbound,
              href: `/console/master-skus/${encodeURIComponent(item.sku)}`,
            })),
            emptyText: '暂无库存',
          },
          {
            title: '采购在途',
            description: '示例采购单摘要',
            columns: [
              { key: 'id', label: '采购单', mono: true, hrefKey: 'href' },
              { key: 'supplier', label: '供应商' },
              { key: 'status', label: '状态' },
              { key: 'totalAmount', label: '金额' },
            ],
            rows: DEMO_PURCHASE_ORDERS.slice(0, 6).map((po) => ({
              id: po.id,
              supplier: po.supplier,
              status: po.status,
              totalAmount: po.totalAmount,
              href: `/console/purchase-orders/${encodeURIComponent(po.id)}`,
            })),
            emptyText: '暂无采购单',
          },
        ],
      }
    }

    case 'logistics-lgs':
    case 'logistics-jsb': {
      const order = str(row, 'order')
      const tracking = str(row, 'tracking')
      const parents: DetailRelatedParent[] = [
        ...parentForOrder(order),
        ...(tracking ? [{ label: '运单号', value: tracking, mono: true }] : []),
      ]
      const picks = RELATED_DEMO_PICKS.filter(
        (item) =>
          (order ? item.order === order : false) ||
          (tracking ? item.tracking === tracking : false),
      ).map((item) => ({
        id: item.id,
        order: item.order,
        shop: item.shop,
        tracking: item.tracking,
        status: item.status,
        href: `/console/picking/${encodeURIComponent(item.id)}`,
      }))
      return {
        parents,
        sections:
          picks.length > 0
            ? [
                {
                  title: '拣货包裹',
                  description: '关联包裹作业（示例）',
                  columns: [
                    { key: 'id', label: '包裹号', mono: true, hrefKey: 'href' },
                    { key: 'order', label: '订单', mono: true },
                    { key: 'shop', label: '店铺' },
                    { key: 'tracking', label: '运单号', mono: true },
                    { key: 'status', label: '状态' },
                  ],
                  rows: picks,
                  emptyText: '暂无包裹',
                },
              ]
            : [],
      }
    }

    case 'integration-log': {
      const shop = str(row, 'shop')
      const requestId = str(row, 'requestId')
      const syncTaskId = str(row, 'syncTaskId')
      const parents: DetailRelatedParent[] = [
        ...(shop ? [{ label: '店铺', value: shop }] : []),
        ...(requestId ? [{ label: 'Request ID', value: requestId, mono: true }] : []),
        ...(syncTaskId
          ? [
              {
                label: '同步任务',
                value: syncTaskId,
                mono: true,
                href: `/console/sync-tasks/${encodeURIComponent(syncTaskId)}`,
              },
            ]
          : []),
      ]
      const siblings = RELATED_DEMO_SYNC_TASKS.filter(
        (item) =>
          (shop ? item.shop === shop : false) ||
          (requestId ? (item as { requestId?: string }).requestId === requestId : false),
      )
        .slice(0, 6)
        .map((item) => ({
          id: item.id,
          type: item.type,
          target: item.target,
          status: item.status,
          lastRun: item.lastRun,
          href: `/console/sync-tasks/${encodeURIComponent(item.id)}`,
        }))
      return {
        parents,
        sections: [
          {
            title: '关联同步任务',
            description: '同店铺 / request id 下的同步任务（示例）',
            columns: [
              { key: 'id', label: '任务 ID', mono: true, hrefKey: 'href' },
              { key: 'type', label: '类型' },
              { key: 'target', label: '目标' },
              { key: 'status', label: '状态' },
              { key: 'lastRun', label: '最近执行' },
            ],
            rows: siblings,
            emptyText: '暂无关联任务；可从详情页同步任务按钮跳转',
          },
        ],
      }
    }

    case 'shops': {
      const shop = str(row, 'name') || str(row, 'shop')
      const listings = shop
        ? getDemoListingsBySku('HSY000001001').filter((item) => item.shop === shop)
        : []
      const tasks = RELATED_DEMO_SYNC_TASKS.filter((item) => item.shop === shop).map((item) => ({
        id: item.id,
        type: item.type,
        target: item.target,
        status: item.status,
        lastRun: item.lastRun,
        href: `/console/sync-tasks/${encodeURIComponent(item.id)}`,
      }))
      return {
        parents: shop ? [{ label: '店铺', value: shop }] : [],
        sections: [
          listingsSection(listings, { description: '本店刊登（示例）' }),
          {
            title: '本店同步任务',
            description: '近期同步任务（示例）',
            columns: [
              { key: 'id', label: '任务 ID', mono: true, hrefKey: 'href' },
              { key: 'type', label: '类型' },
              { key: 'target', label: '目标' },
              { key: 'status', label: '状态' },
            ],
            rows: tasks,
            emptyText: '暂无同步任务',
          },
        ],
      }
    }

    case 'orders': {
      const sku = str(row, 'sku')
      const sellerSku = str(row, 'sellerSku')
      const orderId = str(row, 'id') || str(row, 'externalOrderId')
      const externalOrderId = str(row, 'externalOrderId') || str(row, 'order') || orderId
      const shop = str(row, 'shop')
      const packageId = str(row, 'packageId')
      const parents: DetailRelatedParent[] = [
        ...parentForInternalSku(sku),
        ...parentForSpu(sku),
        ...(shop ? [{ label: '店铺', value: shop }] : []),
        ...(sellerSku
          ? [
              {
                label: 'Seller SKU',
                value: sellerSku,
                mono: true,
                href: shop
                  ? `/console/mappings/${encodeURIComponent(`${shop}::${sellerSku}`)}`
                  : undefined,
              },
            ]
          : []),
      ]
      const exceptions = getMappingExceptions()
        .filter((item) => item.order === externalOrderId)
        .map((item) => ({
          id: item.id,
          order: item.order,
          sellerSku: item.sellerSku,
          kind: item.kind,
          status: item.status,
          blocksReservation: item.blocksReservation ? '是' : '否',
          href: `/console/order-exceptions/${encodeURIComponent(item.id)}`,
        }))
      const picks = getPackages()
        .filter((item) => item.order === externalOrderId || item.orderId === orderId)
        .map((item) => ({
          id: item.id,
          order: item.order,
          shop: item.shop,
          skus: item.skus,
          status: item.status,
          outboundId: item.outboundId || '—',
          href: `/console/picking/${encodeURIComponent(item.id)}`,
        }))
      const outbounds = outboundRows((item) => item.order === externalOrderId)
      const storeOut = picks
        .filter((item) => item.outboundId && item.outboundId !== '—')
        .map((item) => ({
          id: item.outboundId,
          order: item.order,
          sku: sku || '—',
          quantity: 0,
          bin: '—',
          status: item.status,
          at: '—',
          href: `/console/stock-outbounds/${encodeURIComponent(item.outboundId)}`,
        }))
      const outboundMap = new Map<string, (typeof outbounds)[number]>()
      for (const item of [...outbounds, ...storeOut]) outboundMap.set(String(item.id), item)
      const listings = sku
        ? getDemoListingsBySku(sku)
        : sellerSku
          ? getDemoListingsBySellerSku(shop || '', sellerSku)
          : []
      return {
        parents,
        sections: [
          {
            title: '映射异常',
            description: '该订单关联的 mapping_exceptions（阻断占库）',
            columns: [
              { key: 'id', label: '异常 ID', mono: true, hrefKey: 'href' },
              { key: 'sellerSku', label: 'Seller SKU', mono: true },
              { key: 'kind', label: '类型' },
              { key: 'status', label: '状态' },
              { key: 'blocksReservation', label: '阻断占库' },
            ],
            rows: exceptions,
            emptyText: '暂无映射异常',
          },
          {
            title: '拣货包裹',
            description: '订单关联拣货单（会话）',
            columns: [
              { key: 'id', label: '包裹', mono: true, hrefKey: 'href' },
              { key: 'skus', label: 'SKU 明细' },
              { key: 'status', label: '状态' },
              { key: 'outboundId', label: '出库单', mono: true },
            ],
            rows: picks,
            emptyText: '暂无拣货包裹',
          },
          {
            title: '出库单',
            description: '订单关联出库作业',
            columns: OUTBOUND_COLUMNS,
            rows: Array.from(outboundMap.values()),
            emptyText: '暂无出库单',
          },
          listingsSection(listings, { description: '订单 SKU / Seller SKU 关联刊登（示例）' }),
          ...(sku ? [inventorySectionForSku(sku)] : []),
          ...(packageId && packageId !== '—'
            ? []
            : []),
        ],
      }
    }

    case 'listings': {
      const sku = str(row, 'sku')
      const spu = str(row, 'spu')
      const sellerSku = str(row, 'sellerSku')
      const shop = str(row, 'shop')
      const listingId = str(row, 'id')
      const parents: DetailRelatedParent[] = [
        ...parentForInternalSku(sku),
        ...(spu
          ? [
              {
                label: '所属 SPU',
                value: spu,
                mono: true,
                href: `/console/master-products/${encodeURIComponent(spu)}`,
              },
            ]
          : parentForSpu(sku)),
        ...(shop ? [{ label: '店铺', value: shop }] : []),
      ]
      const liveListing = listingId ? getListings().find((item) => item.id === listingId) : undefined
      const mappingLines = (liveListing?.mappingLines ?? []).map((line) => ({
        id: `${line.shop}::${line.sellerSku}`,
        sellerSku: line.sellerSku,
        internalSku: line.internalSku,
        color: line.color,
        size: line.size,
        mappingStatus: line.mappingStatus,
        listingStatus: line.listingStatus,
        href: `/console/mappings/${encodeURIComponent(`${line.shop}::${line.sellerSku}`)}`,
      }))
      const mappingFallback =
        !mappingLines.length && shop && sellerSku
          ? ERP_DEMO_MAPPINGS.filter(
              (item) => item.shop === shop && item.sellerSku === sellerSku,
            ).map((item) => ({
              id: `${item.shop}::${item.sellerSku}`,
              sellerSku: item.sellerSku,
              internalSku: item.internalSku,
              color: item.color,
              size: item.size,
              mappingStatus: item.mappingStatus,
              listingStatus: item.listingStatus,
              href: `/console/mappings/${encodeURIComponent(`${item.shop}::${item.sellerSku}`)}`,
            }))
          : mappingLines
      const siblings = sku
        ? getListings()
            .filter((item) => item.sku === sku && item.id !== listingId)
            .map((item) => ({
              id: item.id,
              shop: item.shopName,
              platform: item.platform,
              sellerSku: item.sellerSku,
              title: item.title,
              sellPrice: `${item.sellPrice.toFixed(2)} ${item.currency}`,
              status: item.status,
              stockOnHand: item.stockOnHand,
              href: `/console/listings/${encodeURIComponent(item.id)}`,
            }))
        : []
      return {
        parents,
        sections: [
          {
            title: '映射行',
            description: '本刊登 Seller SKU → 内部 SKU（会话；与 mapping-store 双向）',
            columns: [
              { key: 'sellerSku', label: 'Seller SKU', mono: true, hrefKey: 'href' },
              { key: 'internalSku', label: '内部 SKU', mono: true },
              { key: 'color', label: '颜色' },
              { key: 'size', label: '尺码' },
              { key: 'listingStatus', label: '上架' },
              { key: 'mappingStatus', label: '映射状态' },
            ],
            rows: mappingFallback,
            emptyText: '暂无映射行',
          },
          {
            title: '同 SKU 其他刊登',
            description: '跨店刊登对照（会话）',
            columns: LISTING_COLUMNS,
            rows: siblings,
            emptyText: '暂无其他刊登',
          },
          ...(sku
            ? [
                inventorySectionForSku(sku),
                {
                  title: '同 SKU 映射',
                  description: '该内部 SKU 的其他 Seller 映射（示例）',
                  columns: [
                    { key: 'sellerSku', label: 'Seller SKU', mono: true, hrefKey: 'href' },
                    { key: 'shop', label: '店铺' },
                    { key: 'listingStatus', label: '上架' },
                    { key: 'mappingStatus', label: '映射状态' },
                  ],
                  rows: mappingRows(sku, sellerSku),
                  emptyText: '暂无其他映射',
                } satisfies DetailRelatedSection,
              ]
            : []),
        ],
      }
    }

    case 'imports':
    case 'import-templates':
    case 'erp-access':
      return { parents: [], sections: [] }

    default:
      return { parents: [], sections: [] }
  }
}

/** Related-info for handcrafted purchase-order detail page. */
export function buildPurchaseOrderRelatedInfo(order: {
  id: string
  poNo: string
  sourceRequest: string
  supplier: string
  warehouse: string
  lines: Array<{ sku: string }>
}): DetailRelatedInfo {
  const skus = [...new Set(order.lines.map((line) => line.sku))]
  const parents: DetailRelatedParent[] = [
    ...parentForRequest(order.sourceRequest),
    ...parentForSupplier(order.supplier),
    { label: '收货仓库', value: order.warehouse, mono: true },
  ]

  const receipts = receiptRows((item) => item.po === order.id || item.po === order.poNo)
  const inbounds = inboundRows((item) =>
    RELATED_DEMO_RECEIPTS.some(
      (receipt) =>
        (receipt.po === order.id || receipt.po === order.poNo) &&
        receipt.id === item.sourceDoc,
    ),
  )
  const ledger = ledgerRows(
    (item) =>
      item.source === order.id ||
      item.source === order.poNo ||
      skus.includes(item.sku),
  )
  const balances = ERP_DEMO_INVENTORY.filter((item) => skus.includes(item.sku)).map(
    (item) => ({
      sku: item.sku,
      warehouse: item.warehouse,
      bin: item.bin,
      onHand: item.onHand,
      available: item.onHand - item.reserved - item.damaged,
      href: `/console/inventory-balances/${encodeURIComponent(balanceId(item.warehouse, item.bin, item.sku))}`,
      skuHref: `/console/master-skus/${encodeURIComponent(item.sku)}`,
    }),
  )

  return {
    parents,
    sections: [
      {
        title: '到货质检入库',
        description: '本采购单的到货批次与质检结果（示例）',
        columns: RECEIPT_COLUMNS,
        rows: receipts,
        emptyText: '暂无到货记录',
      },
      {
        title: '入库单',
        description: '由本采购到货生成的入库上架单（示例）',
        columns: INBOUND_COLUMNS,
        rows: inbounds,
        emptyText: '暂无入库单',
      },
      {
        title: '库存余额',
        description: '采购明细 SKU 的当前库存（示例）',
        columns: [
          { key: 'sku', label: '内部 SKU', mono: true, hrefKey: 'skuHref' },
          { key: 'warehouse', label: '仓库', mono: true },
          { key: 'bin', label: '库位', mono: true, hrefKey: 'href' },
          { key: 'onHand', label: '账面', numeric: true },
          { key: 'available', label: '可用', numeric: true },
        ],
        rows: balances,
        emptyText: '暂无库存余额',
      },
      {
        title: '库存流水',
        description: '本采购单/明细 SKU 相关流水（示例）',
        columns: LEDGER_COLUMNS,
        rows: ledger,
        emptyText: '暂无流水',
      },
      ...(skus.length === 1
        ? [
            listingsSection(getDemoListingsBySku(skus[0]!), {
              description: '明细 SKU 的平台刊登（示例）；采购补货服务上架销售',
            }),
          ]
        : skus.length > 1
          ? [
              listingsSection(
                skus.flatMap((sku) => getDemoListingsBySku(sku)),
                {
                  description: '明细各 SKU 的平台刊登（示例）',
                },
              ),
            ]
          : []),
    ],
  }
}

/** Primary pricing fields for SKU-centric detail pages (mock). */
export function buildPrimaryPricingFields(sku: string | undefined) {
  if (!sku) return null
  const pricing = getDemoSkuPricing(sku)
  if (!pricing) return null
  return {
    title: '主定价信息',
    description: `${pricing.source} · 生效 ${pricing.effective}`,
    fields: [
      { label: '币种', value: pricing.currency },
      { label: '成本参考', value: `${pricing.costPrice.toFixed(2)} ${pricing.currency}` },
      { label: '主定价', value: `${pricing.basePrice.toFixed(2)} ${pricing.currency}` },
      { label: '建议售价', value: `${pricing.suggestPrice.toFixed(2)} ${pricing.currency}` },
      { label: '目标毛利率', value: `${pricing.targetMarginPct}%` },
      { label: '生效日期', value: pricing.effective },
    ],
  }
}

export function resolveSkuFromRow(row: UedRecord): string | undefined {
  if (typeof row.sku === 'string' && row.sku && row.sku !== '—') return row.sku
  if (typeof row.internalSku === 'string' && row.internalSku && row.internalSku !== '—') {
    return row.internalSku
  }
  if (typeof row.id === 'string' && /^[A-Z]{2,}\d{6,}$/.test(row.id)) return row.id
  return undefined
}
