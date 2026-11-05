'use client'

/**
 * inventory_reservations 原型投影。
 * 订单确认按单位行生成预留；出库 consumed，取消 release，映射异常不生成。
 */

import { createDemoStore } from '@/lib/crossborder/local-store'

export const RESERVATION_STATUSES = ['reserved', 'consumed', 'released', 'expired'] as const
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number]

export type InventoryReservation = {
  id: string
  orderId: string
  orderLineId: string
  order: string
  shipmentId: string
  shopId: string
  externalShopId: string
  shop: string
  platform: string
  sku: string
  warehouse: string
  bin: string
  qty: number
  status: ReservationStatus
  idempotencyKey: string
  reservedAt: string
  releasedAt: string
  consumedAt: string
  expiresAt: string
}

const DEMO_RESERVATIONS: InventoryReservation[] = [
  {
    id: 'RSV-2026-0001',
    orderId: 'ord-10021',
    orderLineId: 'DZ-10021-1',
    order: 'DZ-10021',
    shipmentId: '',
    shopId: 'b5ofcwj2mzauov29y08m0q99',
    externalShopId: 'dz-lk-88021',
    shop: 'Daraz LK',
    platform: 'daraz',
    sku: 'HSY000001001',
    warehouse: 'WH-CN-XMN-001',
    bin: 'A-01-01-01',
    qty: 1,
    status: 'reserved',
    idempotencyKey: 'ledger:order_reserve:DZ-10021:DZ-10021-1',
    reservedAt: '2026-10-20 20:10',
    releasedAt: '',
    consumedAt: '',
    expiresAt: '2026-11-03 20:10',
  },
  {
    id: 'RSV-2026-0002',
    orderId: 'ord-10021',
    orderLineId: 'DZ-10021-2',
    order: 'DZ-10021',
    shipmentId: '',
    shopId: 'b5ofcwj2mzauov29y08m0q99',
    externalShopId: 'dz-lk-88021',
    shop: 'Daraz LK',
    platform: 'daraz',
    sku: 'HSY000001001',
    warehouse: 'WH-CN-XMN-001',
    bin: 'A-01-01-01',
    qty: 1,
    status: 'reserved',
    idempotencyKey: 'ledger:order_reserve:DZ-10021:DZ-10021-2',
    reservedAt: '2026-10-20 20:10',
    releasedAt: '',
    consumedAt: '',
    expiresAt: '2026-11-03 20:10',
  },
  {
    id: 'RSV-2026-0003',
    orderId: 'ord-10018',
    orderLineId: 'DZ-10018-1',
    order: 'DZ-10018',
    shipmentId: 'PKG-2026-0044',
    shopId: 'b5ofcwj2mzauov29y08m0q99',
    externalShopId: 'dz-lk-88021',
    shop: 'Daraz LK',
    platform: 'daraz',
    sku: 'HSY000002001',
    warehouse: 'WH-CN-XMN-001',
    bin: 'B-02-01-01',
    qty: 1,
    status: 'consumed',
    idempotencyKey: 'ledger:order_ship:DZ-10018:HSY000002001',
    reservedAt: '2026-10-18 12:20',
    releasedAt: '',
    consumedAt: '2026-10-20 14:10',
    expiresAt: '2026-11-01 12:20',
  },
  {
    id: 'RSV-2026-0004',
    orderId: 'ord-2233',
    orderLineId: 'LZ-2233-1',
    order: 'LZ-2233',
    shipmentId: '',
    shopId: 's8v7xkqw0asyz4zhswxwzdd3',
    externalShopId: 'lz-my-10288',
    shop: 'Lazada MY',
    platform: 'lazada',
    sku: 'HSY000001002',
    warehouse: 'WH-CN-XMN-001',
    bin: 'A-01-01-02',
    qty: 1,
    status: 'released',
    idempotencyKey: 'ledger:order_release:AS-2026-0082',
    reservedAt: '2026-10-27 18:10',
    releasedAt: '2026-10-28 09:30',
    consumedAt: '',
    expiresAt: '2026-11-10 18:10',
  },
]

type ReservationState = {
  reservations: InventoryReservation[]
}

const store = createDemoStore<ReservationState>('open-shop.console.demo.reservations.v1', {
  reservations: structuredClone(DEMO_RESERVATIONS),
})

export function useInventoryReservations() {
  return store.useStore().reservations
}

export function getInventoryReservations() {
  return store.get().reservations
}

export function labelReservationStatus(status: string) {
  const labels: Record<string, string> = {
    reserved: '锁定中',
    consumed: '已出库',
    released: '已释放',
    expired: '已过期',
  }
  return labels[status] ?? status
}

export function reservationKpi(rows: InventoryReservation[]) {
  const active = rows.filter((row) => row.status === 'reserved')
  return {
    total: rows.length,
    active: active.length,
    activeQty: active.reduce((sum, row) => sum + row.qty, 0),
    consumedQty: rows.filter((row) => row.status === 'consumed').reduce((sum, row) => sum + row.qty, 0),
    releasedQty: rows.filter((row) => row.status === 'released').reduce((sum, row) => sum + row.qty, 0),
    shops: [...new Set(active.map((row) => row.shop))],
  }
}

export function createOrderReservations(input: {
  orderId: string
  order: string
  shopId: string
  externalShopId: string
  shop: string
  platform: string
  lines: Array<{ id: string; sku: string; warehouse: string; bin: string; qty: number }>
}): InventoryReservation[] {
  const state = store.get()
  const created: InventoryReservation[] = []
  for (const line of input.lines) {
    if (state.reservations.some((row) => row.orderLineId === line.id)) continue
    const id = `RSV-2026-${String(state.reservations.length + created.length + 1).padStart(4, '0')}`
    created.push({
      id,
      orderId: input.orderId,
      orderLineId: line.id,
      order: input.order,
      shipmentId: '',
      shopId: input.shopId,
      externalShopId: input.externalShopId,
      shop: input.shop,
      platform: input.platform,
      sku: line.sku,
      warehouse: line.warehouse,
      bin: line.bin,
      qty: line.qty,
      status: 'reserved',
      idempotencyKey: `ledger:order_reserve:${input.order}:${line.id}`,
      reservedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
      releasedAt: '',
      consumedAt: '',
      expiresAt: '',
    })
  }
  if (created.length > 0) {
    store.set({ reservations: [...created, ...state.reservations] })
  }
  return created
}

export function consumeOrderReservations(input: {
  order: string
  shipmentId: string
}): InventoryReservation[] {
  const consumedAt = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const updated = store.get().reservations.map((row) =>
    row.order === input.order && row.status === 'reserved'
      ? { ...row, status: 'consumed' as const, shipmentId: input.shipmentId, consumedAt }
      : row,
  )
  store.set({ reservations: updated })
  return updated.filter((row) => row.order === input.order && row.status === 'consumed')
}

export function releaseReservation(
  id: string,
): { ok: true; row: InventoryReservation; note: string } | { ok: false; reason: string } {
  const current = store.get().reservations.find((row) => row.id === id)
  if (!current) return { ok: false, reason: '预留记录不存在' }
  if (current.status !== 'reserved') return { ok: false, reason: `当前状态「${labelReservationStatus(current.status)}」不可释放` }
  const updated: InventoryReservation = {
    ...current,
    status: 'released',
    releasedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
  }
  store.set({
    reservations: store.get().reservations.map((row) => (row.id === id ? updated : row)),
  })
  return { ok: true, row: updated, note: `${id} 已模拟释放 ${current.qty} 件；真实实现应同时写 order_release 流水。` }
}
