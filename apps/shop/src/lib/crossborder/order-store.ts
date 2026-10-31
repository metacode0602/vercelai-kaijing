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

export type OrderLine = {
  id: string
  sku: string
  title: string
  qty: number
  unitPrice: number
  sellerSku: string
  /** 建议拣货库位 */
  bin: string
  warehouse: string
  fulfillmentStatus: string
  packageId: string | null
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
  shopId: string
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
  shippingSummary: string
  placedAt: string
  paidAt: string | null
  currency: string
  totalAmount: number
  shippingAmount: number
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
  order: string
  orderId: string
  shop: string
  site: string
  items: number
  skus: string
  weight: string
  tracking: string
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
  shop: string
  shopId: string
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
    shopId: 'b5ofcwj2mzauov29y08m0q99',
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
    shippingSummary: 'Colombo · Standard · ETA 2–3d（示例）',
    placedAt: '2026-10-20 08:12',
    paidAt: '2026-10-20 08:15',
    currency: 'USD',
    totalAmount: 36.5,
    shippingAmount: 2.5,
    reserved: true,
    lines: [
      {
        id: 'ol-10021-1',
        sku: 'HSY000001001',
        title: 'Oversized Cotton Tee · Black L',
        qty: 2,
        unitPrice: 12.5,
        sellerSku: 'DZ-TEE-001',
        bin: 'A-01-01-01',
        warehouse: 'WH-CN-XMN-001',
        fulfillmentStatus: 'unfulfilled',
        packageId: 'PKG-2026-0051',
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
    shopId: 'b5ofcwj2mzauov29y08m0q99',
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
    shippingSummary: 'Kandy · Express · tracking DZLK9981（示例）',
    placedAt: '2026-10-19 21:03',
    paidAt: '2026-10-19 21:05',
    currency: 'USD',
    totalAmount: 24.0,
    shippingAmount: 3.0,
    reserved: true,
    lines: [
      {
        id: 'ol-10018-1',
        sku: 'HSY000002001',
        title: 'USB-C Hub 7-in-1',
        qty: 1,
        unitPrice: 24.0,
        sellerSku: 'DZ-HUB-01',
        bin: 'B-02-01-01',
        warehouse: 'WH-CN-XMN-001',
        fulfillmentStatus: 'shipped',
        packageId: 'PKG-2026-0044',
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
    shopId: 'b5ofcwj2mzauov29y08m0q99',
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
    shippingSummary: 'Galle · Standard · delivered（示例）',
    placedAt: '2026-10-18 14:22',
    paidAt: '2026-10-18 14:25',
    currency: 'USD',
    totalAmount: 18.9,
    shippingAmount: 2.0,
    reserved: true,
    lines: [
      {
        id: 'ol-10012-1',
        sku: 'HSY000001002',
        title: 'Oversized Cotton Tee · White L',
        qty: 1,
        unitPrice: 18.9,
        sellerSku: 'DZ-TEE-001-WH',
        bin: 'A-01-01-02',
        warehouse: 'WH-CN-XMN-001',
        fulfillmentStatus: 'delivered',
        packageId: 'PKG-DZ-10012',
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
    shopId: 's8v7xkqw0asyz4zhswxwzdd3',
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
    shippingSummary: 'KL · 映射异常阻断占库（示例）',
    placedAt: '2026-10-20 16:01',
    paidAt: null,
    currency: 'MYR',
    totalAmount: 55.0,
    shippingAmount: 5.0,
    reserved: false,
    lines: [
      {
        id: 'ol-lz-1',
        sku: 'HSY000002001',
        title: 'USB-C Hub 7-in-1',
        qty: 1,
        unitPrice: 55.0,
        sellerSku: 'TEE-BLK-L',
        bin: 'B-02-01-01',
        warehouse: 'WH-CN-XMN-001',
        fulfillmentStatus: 'unfulfilled',
        packageId: 'PKG-2026-0050',
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
    shopId: 'kqw7alhkgefjmffogbib1z79',
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
    shippingSummary: 'LA · FBT · awaiting label（示例）',
    placedAt: '2026-10-20 12:40',
    paidAt: '2026-10-20 12:41',
    currency: 'USD',
    totalAmount: 26.9,
    shippingAmount: 0,
    reserved: false,
    lines: [
      {
        id: 'ol-tts-1',
        sku: 'HSY000002001',
        title: 'USB-C Hub 7-in-1',
        qty: 1,
        unitPrice: 26.9,
        sellerSku: 'TTS-HUB-01',
        bin: 'B-02-01-01',
        warehouse: 'WH-CN-XMN-001',
        fulfillmentStatus: 'ready_to_ship',
        packageId: 'PKG-TTS-901',
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
    order: 'DZ-10021',
    orderId: 'ord-10021',
    shop: 'Daraz LK',
    site: 'LK',
    items: 2,
    skus: 'HSY000001001 ×2',
    weight: '待称重',
    tracking: '待生成',
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
    order: 'LZ-2201',
    orderId: 'ord-lz-2201',
    shop: 'Lazada TH',
    site: 'TH',
    items: 1,
    skus: 'HSY000002001 ×1',
    weight: '480 g',
    tracking: 'THJSB-8821',
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
    order: 'DZ-10018',
    orderId: 'ord-10018',
    shop: 'Daraz LK',
    site: 'LK',
    items: 1,
    skus: 'HSY000002001 ×1',
    weight: '460 g',
    tracking: 'DZLK9981',
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

export function toOrderListRow(order: ShopOrder): OrderListRow {
  return {
    id: order.id,
    externalOrderId: order.externalOrderId,
    shop: order.shopName,
    shopId: order.shopId,
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
    sku: first?.sku ?? '—',
    sellerSku: first?.sellerSku ?? '—',
    city: order.city,
    totalAmount: order.totalAmount,
    currency: order.currency,
    packageId: order.packageId ?? '—',
    reserved: order.reserved ? '是' : '否',
  }
}

export function toRelatedPackageShape(pkg: FulfillmentPackage) {
  return {
    id: pkg.id,
    order: pkg.order,
    shop: pkg.shop,
    site: pkg.site,
    items: pkg.items,
    skus: pkg.skus,
    weight: pkg.weight,
    tracking: pkg.tracking,
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
        actor: '系统',
        idempotencyKey: `ledger:order_reserve:${current.externalOrderId}:${line.sku}`,
        reason: '订单确认占库',
      })
      if (!result.ok) return result
    }
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
    order: order?.externalOrderId || input.order.trim(),
    orderId: order?.id || '',
    shop: input.shop.trim(),
    site: input.site.trim(),
    items: qty,
    skus: `${input.sku.trim()} ×${qty}`,
    weight: input.weight?.trim() || '待称重',
    tracking: '待生成',
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
        lines: item.lines.map((line) =>
          line.sku === input.sku.trim() ? { ...line, packageId: id } : line,
        ),
      }
    }),
  }))
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
          shippingProvider: order.shippingProvider || '平台物流',
          timeline: markTimeline(order.timeline, 'shipped', stamp, '拣货出库完成 · 已写流水'),
          lines: order.lines.map((line) => ({
            ...line,
            fulfillmentStatus: 'shipped',
            packageId: id,
            trackingNumber: tracking,
          })),
        }
      }),
    }))
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
  return { ok: true, package: updated }
}
