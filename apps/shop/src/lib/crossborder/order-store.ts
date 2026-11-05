'use client'

/**
 * 订单 + 拣货包裹原型会话 store（P0 商业闭环）。
 * 订单确认可写「订单锁定」流水；拣货终态调用 wms-store createStockOutbound / postStockOutbound 写出库流水。
 * 禁止直改库存余额。
 */

import { createDemoStore } from '@/lib/crossborder/local-store'
import {
  createStockOutbound,
  getStockOutbound,
  listBalancesForSku,
  postStockOutbound,
  applyOrderReserve,
  type StockOutbound,
} from '@/lib/crossborder/wms-store'
import {
  consumeOrderReservations,
  createOrderReservations,
} from '@/lib/crossborder/inventory-reservation-store'
import {
  appendTrackingEvent,
  createShipment,
} from '@/lib/crossborder/shipment-store'

export const ORDER_STATUSES = [
  'created',
  'paid',
  'ready_to_ship',
  'shipped',
  'delivered',
  'cancelled',
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const PACKAGE_STATUSES = ['待拣货', '拣货中', '已复核', '已出库', '已取消'] as const
export type PackageStatus = (typeof PACKAGE_STATUSES)[number]

export const MAPPING_STATUSES = ['ok', 'pending', 'exception'] as const
export type MappingStatus = (typeof MAPPING_STATUSES)[number]

export const INTEGRATION_SYNC_STATUSES = ['synced', 'pending', 'error'] as const
export type IntegrationSyncStatus = (typeof INTEGRATION_SYNC_STATUSES)[number]

/**
 * 平台订单行按「商品单位」落库：每行 qty=1，展示时按 SKU 聚合。
 * 字段对应 order_lines；平台侧行 ID 独立保留，不能用 sellerSku 代替。
 */
export type OrderLine = {
  id: string
  externalLineId: string
  sku: string
  title: string
  qty: number
  unitPrice: number
  paidPrice: number
  taxAmount: number
  discountAmount: number
  shippingAmount: number
  sellerSku: string
  shopSku: string
  platformSkuId: string
  /** 建议拣货库位 */
  bin: string
  warehouse: string
  fulfillmentStatus: string
  platformStatus: string
  returnStatus: string | null
  mappingStatus: MappingStatus
  packageId: string | null
  shipmentId: string | null
  trackingNumber: string | null
}

export type OrderTimelineStep = {
  at: string
  status: string
  note: string
  current?: boolean
}

export type ShopOrder = {
  id: string
  externalOrderId: string
  orderNumber: string | null
  shopId: string
  externalShopId: string
  shopName: string
  platform: string
  status: OrderStatus
  platformStatus: string
  fulfillmentStatus: string
  buyerNameMask: string
  buyerRegion: string
  city: string
  paymentMethod: string | null
  shippingProvider: string | null
  trackingNumber: string | null
  packageId: string | null
  shipmentIds: string[]
  warehouseCode: string | null
  shippingSummary: string
  placedAt: string
  paidAt: string | null
  platformUpdatedAt: string | null
  lastSyncedAt: string | null
  integrationStatus: IntegrationSyncStatus
  currency: string
  totalAmount: number
  shippingAmount: number
  voucherAmount: number
  buyerNote: string | null
  isCancelPending: boolean
  /** 是否已占库（订单锁定流水） */
  reserved: boolean
  lines: OrderLine[]
  timeline: OrderTimelineStep[]
}

export type PackageLine = {
  sku: string
  qty: number
  bin: string
  warehouse: string
}

export type FulfillmentPackage = {
  id: string
  externalPackageId: string
  order: string
  orderId: string
  shop: string
  shopId: string
  platform: string
  site: string
  items: number
  skus: string
  weight: string
  tracking: string
  providerCode: string
  providerType: string
  platformStatus: string
  rtsAt: string | null
  shippedAt: string | null
  deliveredAt: string | null
  picker: string
  status: PackageStatus
  outboundId: string
  warehouse: string
  remark: string
  lines: PackageLine[]
}

export type OrderListRow = {
  id: string
  externalOrderId: string
  orderNumber: string | null
  shop: string
  shopId: string
  externalShopId: string
  platform: string
  status: OrderStatus
  platformStatus: string
  fulfillmentStatus: string
  paymentMethod: string | null
  shippingProvider: string | null
  trackingNumber: string | null
  buyerRegion: string
  total: string
  totalAmount: number
  currency: string
  placedAt: string
  city: string
  reserved: boolean
  shipmentCount: number
  lastSyncedAt: string | null
  integrationStatus: IntegrationSyncStatus
  mappingStatus: MappingStatus
}

function nowStamp() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const DEMO_ORDERS: ShopOrder[] = [
  {
    id: 'ord-10021',
    externalOrderId: 'DZ-10021',
    orderNumber: 'DZ-10021',
    shopId: 'b5ofcwj2mzauov29y08m0q99',
    externalShopId: 'dz-lk-88021',
    shopName: 'Daraz LK · Demo',
    platform: 'daraz',
    status: 'paid',
    platformStatus: 'pending',
    fulfillmentStatus: 'unfulfilled',
    buyerNameMask: 'N****a',
    buyerRegion: 'Western · Colombo',
    city: 'Colombo',
    paymentMethod: 'COD',
    shippingProvider: 'Daraz Logistics',
    trackingNumber: null,
    packageId: 'PKG-2026-0051',
    shipmentIds: ['PKG-2026-0051'],
    warehouseCode: 'WH-CN-XMN-001',
    shippingSummary: 'Colombo · Standard · ETA 2–3d（示例）',
    placedAt: '2026-10-20 08:12',
    paidAt: '2026-10-20 08:15',
    platformUpdatedAt: '2026-10-20 08:15',
    lastSyncedAt: '2026-10-20 20:40',
    integrationStatus: 'synced',
    currency: 'USD',
    totalAmount: 36.5,
    shippingAmount: 2.5,
    voucherAmount: 1.5,
    buyerNote: 'Leave at the front desk, please.',
    isCancelPending: false,
    reserved: true,
    lines: [
      {
        id: 'ol-10021-1-1',
        externalLineId: 'DZL-10021-1',
        sku: 'HSY000001001',
        title: 'Oversized Cotton Tee · Black L',
        qty: 1,
        unitPrice: 12.5,
        paidPrice: 11.75,
        taxAmount: 0,
        discountAmount: 0.75,
        shippingAmount: 1.25,
        sellerSku: 'DZ-TEE-001',
        shopSku: 'DZ-TEE-001',
        platformSkuId: 'LK-SKU-5201-01',
        bin: 'A-01-01-01',
        warehouse: 'WH-CN-XMN-001',
        fulfillmentStatus: 'unfulfilled',
        platformStatus: 'pending',
        returnStatus: null,
        mappingStatus: 'ok',
        packageId: 'PKG-2026-0051',
        shipmentId: 'PKG-2026-0051',
        trackingNumber: null,
      },
      {
        id: 'ol-10021-1-2',
        externalLineId: 'DZL-10021-2',
        sku: 'HSY000001001',
        title: 'Oversized Cotton Tee · Black L',
        qty: 1,
        unitPrice: 12.5,
        paidPrice: 11.75,
        taxAmount: 0,
        discountAmount: 0.75,
        shippingAmount: 1.25,
        sellerSku: 'DZ-TEE-001',
        shopSku: 'DZ-TEE-001',
        platformSkuId: 'LK-SKU-5201-01',
        bin: 'A-01-01-01',
        warehouse: 'WH-CN-XMN-001',
        fulfillmentStatus: 'unfulfilled',
        platformStatus: 'pending',
        returnStatus: null,
        mappingStatus: 'ok',
        packageId: 'PKG-2026-0051',
        shipmentId: 'PKG-2026-0051',
        trackingNumber: null,
      },
    ],
    timeline: [
      { at: '2026-10-20 08:12', status: 'created', note: '平台下单' },
      { at: '2026-10-20 08:15', status: 'paid', note: '买家已付款 · 已占库', current: true },
      { at: '—', status: 'ready_to_ship', note: '待拣货出库' },
      { at: '—', status: 'shipped', note: '待揽收' },
      { at: '—', status: 'delivered', note: '待签收' },
    ],
  },
  {
    id: 'ord-10018',
    externalOrderId: 'DZ-10018',
    orderNumber: 'DZ-10018',
    shopId: 'b5ofcwj2mzauov29y08m0q99',
    externalShopId: 'dz-lk-88021',
    shopName: 'Daraz LK · Demo',
    platform: 'daraz',
    status: 'shipped',
    platformStatus: 'shipped',
    fulfillmentStatus: 'shipped',
    buyerNameMask: 'K****i',
    buyerRegion: 'Central · Kandy',
    city: 'Kandy',
    paymentMethod: 'Visa',
    shippingProvider: 'Daraz Express',
    trackingNumber: 'DZLK9981',
    packageId: 'PKG-2026-0044',
    shipmentIds: ['PKG-2026-0044'],
    warehouseCode: 'WH-CN-XMN-001',
    shippingSummary: 'Kandy · Express · tracking DZLK9981（示例）',
    placedAt: '2026-10-19 21:03',
    paidAt: '2026-10-19 21:05',
    platformUpdatedAt: '2026-10-20 14:10',
    lastSyncedAt: '2026-10-20 20:40',
    integrationStatus: 'synced',
    currency: 'USD',
    totalAmount: 24.0,
    shippingAmount: 3.0,
    voucherAmount: 0,
    buyerNote: null,
    isCancelPending: false,
    reserved: true,
    lines: [
      {
        id: 'ol-10018-1',
        externalLineId: 'DZL-10018-1',
        sku: 'HSY000002001',
        title: 'USB-C Hub 7-in-1',
        qty: 1,
        unitPrice: 24.0,
        paidPrice: 24.0,
        taxAmount: 0,
        discountAmount: 0,
        shippingAmount: 3.0,
        sellerSku: 'DZ-HUB-01',
        shopSku: 'DZ-HUB-01',
        platformSkuId: 'LK-SKU-5201-01',
        bin: 'B-02-01-01',
        warehouse: 'WH-CN-XMN-001',
        fulfillmentStatus: 'shipped',
        platformStatus: 'shipped',
        returnStatus: 'return_requested',
        mappingStatus: 'ok',
        packageId: 'PKG-2026-0044',
        shipmentId: 'PKG-2026-0044',
        trackingNumber: 'DZLK9981',
      },
    ],
    timeline: [
      { at: '2026-10-19 21:03', status: 'created', note: '平台下单' },
      { at: '2026-10-19 21:05', status: 'paid', note: '买家已付款' },
      { at: '2026-10-20 09:40', status: 'ready_to_ship', note: '拣货完成' },
      { at: '2026-10-20 14:10', status: 'shipped', note: '已揽收 · 在途（当前）', current: true },
      { at: '—', status: 'delivered', note: '待签收' },
    ],
  },
  {
    id: 'ord-10012',
    externalOrderId: 'DZ-10012',
    orderNumber: 'DZ-10012',
    shopId: 'b5ofcwj2mzauov29y08m0q99',
    externalShopId: 'dz-lk-88021',
    shopName: 'Daraz LK · Demo',
    platform: 'daraz',
    status: 'delivered',
    platformStatus: 'delivered',
    fulfillmentStatus: 'delivered',
    buyerNameMask: 'S****a',
    buyerRegion: 'Southern · Galle',
    city: 'Galle',
    paymentMethod: 'COD',
    shippingProvider: 'Daraz Logistics',
    trackingNumber: 'DZLK7712',
    packageId: 'PKG-DZ-10012',
    shipmentIds: ['PKG-DZ-10012'],
    warehouseCode: 'WH-CN-XMN-001',
    shippingSummary: 'Galle · Standard · delivered（示例）',
    placedAt: '2026-10-18 14:22',
    paidAt: '2026-10-18 14:25',
    platformUpdatedAt: '2026-10-20 11:05',
    lastSyncedAt: '2026-10-20 20:40',
    integrationStatus: 'synced',
    currency: 'USD',
    totalAmount: 18.9,
    shippingAmount: 2.0,
    voucherAmount: 0,
    buyerNote: null,
    isCancelPending: false,
    reserved: true,
    lines: [
      {
        id: 'ol-10012-1',
        externalLineId: 'DZL-10012-1',
        sku: 'HSY000001002',
        title: 'Oversized Cotton Tee · White L',
        qty: 1,
        unitPrice: 18.9,
        paidPrice: 18.9,
        taxAmount: 0,
        discountAmount: 0,
        shippingAmount: 2.0,
        sellerSku: 'DZ-TEE-001-WH',
        shopSku: 'DZ-TEE-001-WH',
        platformSkuId: 'LK-SKU-9011-WH',
        bin: 'A-01-01-02',
        warehouse: 'WH-CN-XMN-001',
        fulfillmentStatus: 'delivered',
        platformStatus: 'delivered',
        returnStatus: null,
        mappingStatus: 'ok',
        packageId: 'PKG-DZ-10012',
        shipmentId: 'PKG-DZ-10012',
        trackingNumber: 'DZLK7712',
      },
    ],
    timeline: [
      { at: '2026-10-18 14:22', status: 'created', note: '平台下单' },
      { at: '2026-10-18 14:25', status: 'paid', note: '买家已付款' },
      { at: '2026-10-18 18:00', status: 'ready_to_ship', note: '拣货完成' },
      { at: '2026-10-19 08:20', status: 'shipped', note: '已发货' },
      { at: '2026-10-20 11:05', status: 'delivered', note: '已签收（当前）', current: true },
    ],
  },
  {
    id: 'ord-lz-2201',
    externalOrderId: 'LZ-2201',
    orderNumber: 'LZ-2201',
    shopId: 's8v7xkqw0asyz4zhswxwzdd3',
    externalShopId: 'lz-my-10288',
    shopName: 'Lazada MY · Sandbox',
    platform: 'lazada',
    status: 'created',
    platformStatus: 'unpaid',
    fulfillmentStatus: 'unfulfilled',
    buyerNameMask: 'A****n',
    buyerRegion: 'WP · Kuala Lumpur',
    city: 'Kuala Lumpur',
    paymentMethod: null,
    shippingProvider: null,
    trackingNumber: null,
    packageId: 'PKG-2026-0050',
    shipmentIds: ['PKG-2026-0050'],
    warehouseCode: 'WH-CN-XMN-001',
    shippingSummary: 'KL · 映射异常阻断占库（示例）',
    placedAt: '2026-10-20 16:01',
    paidAt: null,
    platformUpdatedAt: '2026-10-20 16:01',
    lastSyncedAt: '2026-10-20 16:05',
    integrationStatus: 'error',
    currency: 'MYR',
    totalAmount: 55.0,
    shippingAmount: 5.0,
    voucherAmount: 0,
    buyerNote: null,
    isCancelPending: true,
    reserved: false,
    lines: [
      {
        id: 'ol-lz-1',
        externalLineId: 'LZL-2201-1',
        sku: 'HSY000002001',
        title: 'USB-C Hub 7-in-1',
        qty: 1,
        unitPrice: 55.0,
        paidPrice: 55.0,
        taxAmount: 0,
        discountAmount: 0,
        shippingAmount: 5.0,
        sellerSku: 'TEE-BLK-L',
        shopSku: 'TEE-BLK-L',
        platformSkuId: 'MY-SKU-8802-BLK-L',
        bin: 'B-02-01-01',
        warehouse: 'WH-CN-XMN-001',
        fulfillmentStatus: 'unfulfilled',
        platformStatus: 'unpaid',
        returnStatus: null,
        mappingStatus: 'exception',
        packageId: 'PKG-2026-0050',
        shipmentId: 'PKG-2026-0050',
        trackingNumber: null,
      },
    ],
    timeline: [
      { at: '2026-10-20 16:01', status: 'created', note: '沙箱下单 · 映射异常（当前）', current: true },
      { at: '—', status: 'paid', note: '待支付 / 待修复映射' },
      { at: '—', status: 'ready_to_ship', note: '—' },
      { at: '—', status: 'shipped', note: '—' },
      { at: '—', status: 'delivered', note: '—' },
    ],
  },
  {
    id: 'ord-tts-901',
    externalOrderId: 'TTS-901',
    orderNumber: 'TTS-901',
    shopId: 'kqw7alhkgefjmffogbib1z79',
    externalShopId: 'tts-748812',
    shopName: 'TikTok Shop · Demo',
    platform: 'tiktok_shop',
    status: 'ready_to_ship',
    platformStatus: 'AWAITING_SHIPMENT',
    fulfillmentStatus: 'ready_to_ship',
    buyerNameMask: 'T****k',
    buyerRegion: 'US · CA',
    city: 'Los Angeles',
    paymentMethod: 'TikTok Pay',
    shippingProvider: 'TikTok FBT',
    trackingNumber: null,
    packageId: 'PKG-TTS-901',
    shipmentIds: ['PKG-TTS-901'],
    warehouseCode: 'WH-CN-XMN-001',
    shippingSummary: 'LA · FBT · awaiting label（示例）',
    placedAt: '2026-10-20 12:40',
    paidAt: '2026-10-20 12:41',
    platformUpdatedAt: '2026-10-20 13:00',
    lastSyncedAt: '2026-10-20 20:40',
    integrationStatus: 'synced',
    currency: 'USD',
    totalAmount: 26.9,
    shippingAmount: 0,
    voucherAmount: 0,
    buyerNote: null,
    isCancelPending: false,
    reserved: false,
    lines: [
      {
        id: 'ol-tts-1',
        externalLineId: 'TTSL-901-1',
        sku: 'HSY000002001',
        title: 'USB-C Hub 7-in-1',
        qty: 1,
        unitPrice: 26.9,
        paidPrice: 26.9,
        taxAmount: 0,
        discountAmount: 0,
        shippingAmount: 0,
        sellerSku: 'TTS-HUB-01',
        shopSku: 'TTS-HUB-01',
        platformSkuId: 'TTS-SKU-HUB-01',
        bin: 'B-02-01-01',
        warehouse: 'WH-CN-XMN-001',
        fulfillmentStatus: 'ready_to_ship',
        platformStatus: 'AWAITING_SHIPMENT',
        returnStatus: null,
        mappingStatus: 'pending',
        packageId: 'PKG-TTS-901',
        shipmentId: 'PKG-TTS-901',
        trackingNumber: null,
      },
    ],
    timeline: [
      { at: '2026-10-20 12:40', status: 'created', note: '平台下单' },
      { at: '2026-10-20 12:41', status: 'paid', note: '已付款' },
      { at: '2026-10-20 13:00', status: 'ready_to_ship', note: '待打单（当前）', current: true },
      { at: '—', status: 'shipped', note: '—' },
      { at: '—', status: 'delivered', note: '—' },
    ],
  },
]

export const DEMO_PACKAGES: FulfillmentPackage[] = [
  {
    id: 'PKG-2026-0051',
    externalPackageId: 'DZ-PKG-2026-0051',
    order: 'DZ-10021',
    orderId: 'ord-10021',
    shop: 'Daraz LK',
    shopId: 'b5ofcwj2mzauov29y08m0q99',
    platform: 'daraz',
    site: 'LK',
    items: 2,
    skus: 'HSY000001001 ×2',
    weight: '待称重',
    tracking: '待生成',
    providerCode: 'DARAZ_LOGISTICS',
    providerType: 'platform',
    platformStatus: 'pending',
    rtsAt: null,
    shippedAt: null,
    deliveredAt: null,
    picker: '—',
    status: '待拣货',
    outboundId: 'OUT-2026-0087',
    warehouse: 'WH-CN-XMN-001',
    remark: '',
    lines: [
      { sku: 'HSY000001001', qty: 2, bin: 'A-01-01-01', warehouse: 'WH-CN-XMN-001' },
    ],
  },
  {
    id: 'PKG-2026-0050',
    externalPackageId: 'LZ-PKG-2026-0050',
    order: 'LZ-2201',
    orderId: 'ord-lz-2201',
    shop: 'Lazada MY',
    shopId: 's8v7xkqw0asyz4zhswxwzdd3',
    platform: 'lazada',
    site: 'MY',
    items: 1,
    skus: 'HSY000002001 ×1',
    weight: '480 g',
    tracking: 'THJSB-8821',
    providerCode: 'LGS_MY',
    providerType: 'lgs',
    platformStatus: 'ready_to_ship',
    rtsAt: '2026-10-28 09:10',
    shippedAt: null,
    deliveredAt: null,
    picker: '兰雨晨',
    status: '已复核',
    outboundId: '',
    warehouse: 'WH-CN-XMN-001',
    remark: '映射异常订单 · 人工补建拣货',
    lines: [
      { sku: 'HSY000002001', qty: 1, bin: 'B-02-01-01', warehouse: 'WH-CN-XMN-001' },
    ],
  },
  {
    id: 'PKG-2026-0044',
    externalPackageId: 'DZ-PKG-2026-0044',
    order: 'DZ-10018',
    orderId: 'ord-10018',
    shop: 'Daraz LK',
    shopId: 'b5ofcwj2mzauov29y08m0q99',
    platform: 'daraz',
    site: 'LK',
    items: 1,
    skus: 'HSY000002001 ×1',
    weight: '460 g',
    tracking: 'DZLK9981',
    providerCode: 'DARAZ_EXPRESS',
    providerType: 'platform',
    platformStatus: 'shipped',
    rtsAt: '2026-10-20 10:05',
    shippedAt: '2026-10-20 14:10',
    deliveredAt: null,
    picker: '兰雨晨',
    status: '已出库',
    outboundId: '',
    warehouse: 'WH-CN-XMN-001',
    remark: '',
    lines: [
      { sku: 'HSY000002001', qty: 1, bin: 'B-02-01-01', warehouse: 'WH-CN-XMN-001' },
    ],
  },
]

type OrderState = {
  orders: ShopOrder[]
  packages: FulfillmentPackage[]
}

const seed: OrderState = {
  orders: structuredClone(DEMO_ORDERS),
  packages: structuredClone(DEMO_PACKAGES),
}

const store = createDemoStore<OrderState>('open-shop.console.demo.orders.v1', seed)

function mutate(updater: (current: OrderState) => OrderState) {
  store.set(updater(store.get()))
}

export function useOrders() {
  return store.useStore().orders
}

export function usePackages() {
  return store.useStore().packages
}

export function useOrderState() {
  return store.useStore()
}

export function getOrders() {
  return store.get().orders
}

export function getPackages() {
  return store.get().packages
}

export function getOrderById(id: string) {
  return store.get().orders.find((item) => item.id === id || item.externalOrderId === id)
}

export function getPackageById(id: string) {
  return store.get().packages.find((item) => item.id === id)
}

export type OrderLineSummary = {
  sku: string
  title: string
  sellerSku: string
  shopSku: string
  platformSkuId: string
  quantity: number
  unitPrice: number
  paidPrice: number
  mappingStatus: MappingStatus
  returnStatus: string | null
  lineIds: string[]
  externalLineIds: string[]
}

/** 单位行 → SKU 聚合视图；下单/占库仍按单位行处理。 */
export function aggregateOrderLines(lines: OrderLine[]): OrderLineSummary[] {
  const grouped = new Map<string, OrderLineSummary>()
  for (const line of lines) {
    const key = `${line.sku}::${line.sellerSku}`
    const current = grouped.get(key)
    if (current) {
      current.quantity += line.qty
      current.paidPrice += line.paidPrice
      current.lineIds.push(line.id)
      current.externalLineIds.push(line.externalLineId)
      if (line.mappingStatus === 'exception') current.mappingStatus = 'exception'
      continue
    }
    grouped.set(key, {
      sku: line.sku,
      title: line.title,
      sellerSku: line.sellerSku,
      shopSku: line.shopSku,
      platformSkuId: line.platformSkuId,
      quantity: line.qty,
      unitPrice: line.unitPrice,
      paidPrice: line.paidPrice,
      mappingStatus: line.mappingStatus,
      returnStatus: line.returnStatus,
      lineIds: [line.id],
      externalLineIds: [line.externalLineId],
    })
  }
  return [...grouped.values()]
}

export function orderMappingStatus(order: ShopOrder): MappingStatus {
  if (order.lines.some((line) => line.mappingStatus === 'exception')) return 'exception'
  if (order.lines.some((line) => line.mappingStatus === 'pending')) return 'pending'
  return 'ok'
}

export function toOrderListRow(order: ShopOrder): OrderListRow {
  return {
    id: order.id,
    externalOrderId: order.externalOrderId,
    orderNumber: order.orderNumber,
    shop: order.shopName,
    shopId: order.shopId,
    externalShopId: order.externalShopId,
    platform: order.platform,
    status: order.status,
    platformStatus: order.platformStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    paymentMethod: order.paymentMethod,
    shippingProvider: order.shippingProvider,
    trackingNumber: order.trackingNumber,
    buyerRegion: order.buyerRegion,
    total: order.totalAmount.toFixed(2),
    totalAmount: order.totalAmount,
    currency: order.currency,
    placedAt: order.placedAt,
    city: order.city,
    reserved: order.reserved,
    shipmentCount: order.shipmentIds.length,
    lastSyncedAt: order.lastSyncedAt,
    integrationStatus: order.integrationStatus,
    mappingStatus: orderMappingStatus(order),
  }
}

export function toRelatedOrderShape(order: ShopOrder) {
  const first = order.lines[0]
  return {
    id: order.id,
    externalOrderId: order.externalOrderId,
    order: order.externalOrderId,
    shop: order.shopName,
    platform: order.platform,
    status: order.status,
    platformStatus: order.platformStatus,
    sku: first?.sku ?? '—',
    sellerSku: first?.sellerSku ?? '—',
    city: order.city,
    totalAmount: order.totalAmount,
    currency: order.currency,
    packageId: order.packageId ?? '—',
    shipmentIds: order.shipmentIds.join(', ') || '—',
    reserved: order.reserved ? '是' : '否',
    integrationStatus: order.integrationStatus,
    lastSyncedAt: order.lastSyncedAt ?? '—',
  }
}

export function toRelatedPackageShape(pkg: FulfillmentPackage) {
  return {
    id: pkg.id,
    externalPackageId: pkg.externalPackageId,
    order: pkg.order,
    shop: pkg.shop,
    site: pkg.site,
    platform: pkg.platform,
    items: pkg.items,
    skus: pkg.skus,
    weight: pkg.weight,
    tracking: pkg.tracking,
    providerCode: pkg.providerCode,
    providerType: pkg.providerType as 'platform' | 'lgs' | 'jsb' | 'third_party' | 'manual',
    platformStatus: pkg.platformStatus,
    picker: pkg.picker,
    status: pkg.status,
    outboundId: pkg.outboundId || '—',
  }
}

function nextPackageId(packages: FulfillmentPackage[]) {
  let max = 51
  for (const item of packages) {
    const matched = /^PKG-2026-(\d+)$/.exec(item.id)
    if (matched) max = Math.max(max, Number(matched[1]))
  }
  return `PKG-2026-${String(max + 1).padStart(4, '0')}`
}

function markTimeline(steps: OrderTimelineStep[], currentStatus: string, at: string, note?: string) {
  return steps.map((step) => {
    const isCurrent = step.status === currentStatus
    return {
      ...step,
      current: isCurrent,
      at: isCurrent && step.at === '—' ? at : step.at,
      note: isCurrent && note ? note : step.note,
    }
  })
}

/**
 * 订单确认：paid / created → ready_to_ship，并按行写「订单锁定」流水（幂等）。
 * 不直改余额。
 */
export function confirmOrder(
  id: string,
): { ok: true; order: ShopOrder } | { ok: false; reason: string } {
  const current = getOrderById(id)
  if (!current) return { ok: false, reason: '订单不存在' }
  if (current.status === 'cancelled') return { ok: false, reason: '订单已取消' }
  if (current.status === 'shipped' || current.status === 'delivered') {
    return { ok: false, reason: '订单已发货，无需再确认' }
  }
  if (!current.lines.length) return { ok: false, reason: '订单无明细行，无法确认' }
  const mappingException = current.lines.find((line) => line.mappingStatus === 'exception')
  if (mappingException) {
    return {
      ok: false,
      reason: `Seller SKU ${mappingException.sellerSku} 映射异常，禁止自动占库；请先在映射页修复`,
    }
  }

  if (!current.reserved) {
    for (const line of current.lines) {
      const balances = listBalancesForSku(line.sku)
      const balance =
        balances.find((item) => item.bin === line.bin && item.warehouse === line.warehouse) ??
        balances[0]
      if (!balance) {
        return { ok: false, reason: `SKU ${line.sku} 无库存余额，无法占库` }
      }
      if (balance.available < line.qty) {
        return {
          ok: false,
          reason: `SKU ${line.sku} 可用库存不足（可用 ${balance.available}，需要 ${line.qty}）`,
        }
      }
      const result = applyOrderReserve({
        warehouse: balance.warehouse,
        bin: balance.bin,
        sku: line.sku,
        quantity: line.qty,
        sourceDoc: current.externalOrderId,
        sourceLineId: line.id,
        shop: current.shopName,
        platform: current.platform,
        externalShopId: current.externalShopId,
        actor: '系统',
        idempotencyKey: `ledger:order_reserve:${current.externalOrderId}:${line.id}`,
        reason: `订单确认占库 · 平台行 ${line.externalLineId}`,
      })
      if (!result.ok) return result
    }
    createOrderReservations({
      orderId: current.id,
      order: current.externalOrderId,
      shopId: current.shopId,
      externalShopId: current.externalShopId,
      shop: current.shopName,
      platform: current.platform,
      lines: current.lines.map((line) => ({
        id: line.id,
        sku: line.sku,
        warehouse: line.warehouse,
        bin: line.bin,
        qty: line.qty,
      })),
    })
  }

  const stamp = nowStamp()
  let updated!: ShopOrder
  mutate((state) => ({
    ...state,
    orders: state.orders.map((item) => {
      if (item.id !== current.id) return item
      updated = {
        ...item,
        status: 'ready_to_ship',
        fulfillmentStatus: 'ready_to_ship',
        platformStatus: item.platformStatus === 'unpaid' ? 'pending' : item.platformStatus,
        paidAt: item.paidAt || stamp,
        reserved: true,
        timeline: markTimeline(
          item.timeline.map((step) =>
            step.status === 'paid' && step.at === '—'
              ? { ...step, at: stamp, note: '买家已付款' }
              : step,
          ),
          'ready_to_ship',
          stamp,
          '已确认 · 已占库 · 待拣货',
        ),
      }
      return updated
    }),
  }))
  return { ok: true, order: updated }
}

/**
 * 原型模拟从 Lazada / Daraz 重新拉取订单头。真实实现应走
 * packages/marketplace 连接器 → orders / order_lines upsert。
 */
export function refreshOrderFromPlatform(
  id: string,
  platformStatus?: string,
): { ok: true; order: ShopOrder; note: string } | { ok: false; reason: string } {
  const current = getOrderById(id)
  if (!current) return { ok: false, reason: '订单不存在' }
  const stamp = nowStamp()
  let updated!: ShopOrder
  mutate((state) => ({
    ...state,
    orders: state.orders.map((item) => {
      if (item.id !== current.id) return item
      updated = {
        ...item,
        platformStatus: platformStatus || item.platformStatus,
        platformUpdatedAt: stamp,
        lastSyncedAt: stamp,
        integrationStatus: 'synced',
      }
      return updated
    }),
  }))
  return {
    ok: true,
    order: updated,
    note: `已模拟从 ${updated.platform.toUpperCase()} 拉取订单 ${updated.externalOrderId}；平台状态 ${updated.platformStatus}`,
  }
}

export function createPackage(input: {
  order: string
  shop: string
  site: string
  sku: string
  quantity: number
  bin: string
  warehouse?: string
  picker?: string
  weight?: string
  remark?: string
}): { ok: true; package: FulfillmentPackage } | { ok: false; reason: string } {
  if (!input.order.trim()) return { ok: false, reason: '请选择订单' }
  if (!input.sku.trim()) return { ok: false, reason: '请选择内部 SKU' }
  if (!input.bin.trim()) return { ok: false, reason: '请选择拣货库位' }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { ok: false, reason: '数量必须大于 0' }
  }
  if (!input.remark?.trim()) return { ok: false, reason: '请填写补建原因' }

  const order = getOrderById(input.order)
  const open = store
    .get()
    .packages.find(
      (item) =>
        item.order === (order?.externalOrderId || input.order) &&
        item.status !== '已出库' &&
        item.status !== '已取消',
    )
  if (open) {
    return { ok: false, reason: `订单已有未出库包裹 ${open.id}，禁止重复出库` }
  }

  const warehouse = input.warehouse?.trim() || 'WH-CN-XMN-001'
  const id = nextPackageId(store.get().packages)
  const qty = Math.floor(input.quantity)
  const pkg: FulfillmentPackage = {
    id,
    externalPackageId: `${order?.platform.toUpperCase() || 'MANUAL'}-${id}`,
    order: order?.externalOrderId || input.order.trim(),
    orderId: order?.id || '',
    shop: input.shop.trim(),
    shopId: order?.shopId || '',
    platform: order?.platform || 'manual',
    site: input.site.trim(),
    items: qty,
    skus: `${input.sku.trim()} ×${qty}`,
    weight: input.weight?.trim() || '待称重',
    tracking: '待生成',
    providerCode: 'MANUAL',
    providerType: 'manual',
    platformStatus: 'pending',
    rtsAt: null,
    shippedAt: null,
    deliveredAt: null,
    picker: input.picker?.trim() || '当前用户',
    status: '待拣货',
    outboundId: '',
    warehouse,
    remark: input.remark.trim(),
    lines: [{ sku: input.sku.trim(), qty, bin: input.bin.trim(), warehouse }],
  }

  mutate((state) => ({
    ...state,
    packages: [pkg, ...state.packages],
    orders: state.orders.map((item) => {
      if (!order || item.id !== order.id) return item
      return {
        ...item,
        packageId: id,
        shipmentIds: [...new Set([...item.shipmentIds, id])],
        lines: item.lines.map((line) =>
          line.sku === input.sku.trim()
            ? { ...line, packageId: id, shipmentId: id }
            : line,
        ),
      }
    }),
  }))
  createShipment({
    id,
    order: pkg.order,
    shopId: pkg.shopId,
    shop: pkg.shop,
    platform: pkg.platform,
    site: pkg.site,
    warehouse,
    providerCode: pkg.providerCode,
    providerType: pkg.providerType as 'platform' | 'lgs' | 'jsb' | 'third_party' | 'manual',
    mode: 'manual',
    tracking: pkg.tracking,
    weight: pkg.weight,
    items: pkg.items,
    skus: pkg.skus,
    picker: pkg.picker,
    remark: pkg.remark,
  })
  return { ok: true, package: pkg }
}

function ensureOutboundForPackage(
  pkg: FulfillmentPackage,
): { ok: true; outbound: StockOutbound } | { ok: false; reason: string } {
  if (pkg.outboundId) {
    const existing = getStockOutbound(pkg.outboundId)
    if (existing) return { ok: true, outbound: existing }
  }
  const created = createStockOutbound({
    outboundType: '订单出库',
    warehouse: pkg.warehouse || pkg.lines[0]?.warehouse || 'WH-CN-XMN-001',
    order: pkg.order,
    packageId: pkg.id,
    picker: pkg.picker === '—' ? '当前用户' : pkg.picker,
    remark: pkg.remark || `拣货单 ${pkg.id} 出库`,
    lines: pkg.lines.map((line) => ({
      sku: line.sku,
      quantity: line.qty,
      bin: line.bin,
    })),
  })
  if (!created.ok) return created
  mutate((state) => ({
    ...state,
    packages: state.packages.map((item) =>
      item.id === pkg.id ? { ...item, outboundId: created.outbound.id } : item,
    ),
  }))
  return created
}

/**
 * 推进拣货：待拣货 → 拣货中 → 已复核 → 已出库。
 * 终态「已出库」调用 createStockOutbound（若无）+ postStockOutbound 写流水。
 */
export function advancePackage(
  id: string,
): { ok: true; package: FulfillmentPackage; outbound?: StockOutbound } | { ok: false; reason: string } {
  const current = getPackageById(id)
  if (!current) return { ok: false, reason: '拣货单不存在' }
  if (current.status === '已出库') return { ok: false, reason: '已出库（幂等）' }
  if (current.status === '已取消') return { ok: false, reason: '已取消，不可推进' }

  if (current.status === '已复核') {
    const ensured = ensureOutboundForPackage(current)
    if (!ensured.ok) return ensured
    const posted = postStockOutbound(ensured.outbound.id)
    if (!posted.ok) return posted

    const stamp = nowStamp()
    const tracking =
      current.tracking === '待生成' ? `TRK-${id.slice(-4)}` : current.tracking
    let updated!: FulfillmentPackage
    mutate((state) => ({
      ...state,
      packages: state.packages.map((item) => {
        if (item.id !== id) return item
        updated = {
          ...item,
          status: '已出库',
          tracking,
          outboundId: posted.outbound.id,
          platformStatus: 'shipped',
          rtsAt: item.rtsAt || stamp,
          shippedAt: stamp,
          picker: item.picker === '—' ? '当前用户' : item.picker,
          weight: item.weight === '待称重' ? '470 g' : item.weight,
        }
        return updated
      }),
      orders: state.orders.map((order) => {
        if (order.externalOrderId !== current.order && order.id !== current.orderId) return order
        return {
          ...order,
          status: 'shipped',
          fulfillmentStatus: 'shipped',
          platformStatus: 'shipped',
          trackingNumber: tracking,
          packageId: id,
          shipmentIds: [...new Set([...order.shipmentIds, id])],
          platformUpdatedAt: stamp,
          lastSyncedAt: stamp,
          integrationStatus: 'synced',
          shippingProvider: order.shippingProvider || '平台物流',
          timeline: markTimeline(order.timeline, 'shipped', stamp, '拣货出库完成 · 已写流水'),
          lines: order.lines.map((line) => ({
            ...line,
            fulfillmentStatus: 'shipped',
            packageId: id,
            shipmentId: id,
            trackingNumber: tracking,
          })),
        }
      }),
    }))
    appendTrackingEvent({
      shipmentId: id,
      statusCode: 'SHIPPED',
      title: '仓库出库',
      description: `拣货出库完成，运单 ${tracking}`,
      eventTime: stamp,
      source: 'manual',
    })
    consumeOrderReservations({ order: current.order, shipmentId: id })
    return { ok: true, package: updated, outbound: posted.outbound }
  }

  const nextStatus: PackageStatus =
    current.status === '待拣货' ? '拣货中' : current.status === '拣货中' ? '已复核' : current.status

  // 进入拣货中/已复核前确保出库单已建
  if (nextStatus === '已复核' || nextStatus === '拣货中') {
    const ensured = ensureOutboundForPackage(current)
    if (!ensured.ok) return ensured
  }

  const linkedOutboundId = getPackageById(id)?.outboundId || current.outboundId
  let updated!: FulfillmentPackage
  mutate((state) => ({
    ...state,
    packages: state.packages.map((item) => {
      if (item.id !== id) return item
      updated = {
        ...item,
        status: nextStatus,
        outboundId: linkedOutboundId || item.outboundId,
        picker: item.picker === '—' ? '当前用户' : item.picker,
        weight:
          nextStatus === '已复核' && item.weight === '待称重' ? '470 g' : item.weight,
      }
      return updated
    }),
  }))
  if (nextStatus === '已复核') {
    appendTrackingEvent({
      shipmentId: id,
      statusCode: 'READY_TO_SHIP',
      title: '仓库拣货完成',
      description: '复核通过，等待平台 / 货代揽收',
      source: 'manual',
    })
  }
  return { ok: true, package: updated }
}
