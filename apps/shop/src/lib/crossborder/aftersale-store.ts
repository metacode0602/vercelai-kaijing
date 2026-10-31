'use client'

/**
 * 售后 / 退货质检回库 / 取消退款 原型会话 store（Phase 4）。
 * 对齐 aftersale_orders / aftersale_return_items；回库经 wms-store 写流水。
 */

import { createDemoStore } from '@/lib/crossborder/local-store'
import { ERP_DEMO_AFTERSALES, type DemoAfterSale } from '@/lib/crossborder/erp-ued-data'
import {
  applyAftersaleRestock,
  applyAftersaleScrap,
  applyOrderReleaseReserved,
} from '@/lib/crossborder/wms-store'

export const RETURN_STATUSES = ['待收货确认', '待质检', '质检中', '已回库', '已报损', '部分回库'] as const
export type ReturnStatus = (typeof RETURN_STATUSES)[number]

export const CANCEL_STATUSES = ['待确认', '已审核', '已驳回'] as const
export type CancelStatus = (typeof CANCEL_STATUSES)[number]

export type AftersaleReturn = {
  id: string
  order: string
  shop: string
  sku: string
  warehouse: string
  bin: string
  tracking: string
  receivedAt: string
  qty: number
  qcPass: number
  qcDefect: number
  qc: string
  restock: number
  scrap: number
  status: ReturnStatus | string
  packageCondition: string
  remark: string
  restockLedgerId: string
  scrapLedgerId: string
}

export type AftersaleCancel = {
  id: string
  order: string
  shop: string
  sku: string
  warehouse: string
  bin: string
  type: string
  platformSync: string
  refund: number
  currency: string
  releaseReserved: number
  status: CancelStatus | string
  reason: string
  remark: string
  releasedAt: string
  releaseLedgerId: string
}

export type AftersaleTicket = DemoAfterSale & {
  shop: string
  warehouse: string
}

function nowStamp() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const DEMO_RETURNS: AftersaleReturn[] = [
  {
    id: 'AS-2026-0081',
    order: 'DZ-10018',
    shop: 'Daraz LK',
    sku: 'HSY000002001',
    warehouse: 'WH-CN-XMN-001',
    bin: 'B-02-01-01',
    tracking: 'DZRT-5521',
    receivedAt: '2026-10-28 11:20',
    qty: 1,
    qcPass: 0,
    qcDefect: 0,
    qc: '待质检',
    restock: 0,
    scrap: 0,
    status: '待质检',
    packageCondition: '完好',
    remark: '',
    restockLedgerId: '',
    scrapLedgerId: '',
  },
  {
    id: 'AS-2026-0077',
    order: 'LZ-2180',
    shop: 'Lazada MY',
    sku: 'HSY000001001',
    warehouse: 'WH-CN-XMN-001',
    bin: 'A-01-01-01',
    tracking: 'LZRT-1180',
    receivedAt: '2026-10-25 15:05',
    qty: 2,
    qcPass: 1,
    qcDefect: 1,
    qc: '合格 1 / 残次 1',
    restock: 1,
    scrap: 1,
    status: '已回库',
    packageCondition: '轻微破损',
    remark: '一件可售一件报损',
    restockLedgerId: 'ledger:aftersale_restock:AS-2026-0077',
    scrapLedgerId: 'ledger:aftersale_scrap:AS-2026-0077',
  },
  {
    id: 'AS-2026-0070',
    order: 'DZ-09988',
    shop: 'Daraz LK',
    sku: 'HSY000001002',
    warehouse: 'WH-CN-XMN-001',
    bin: 'A-01-01-02',
    tracking: 'DZRT-5480',
    receivedAt: '2026-10-19 09:30',
    qty: 1,
    qcPass: 1,
    qcDefect: 0,
    qc: '合格 1',
    restock: 1,
    scrap: 0,
    status: '已回库',
    packageCondition: '完好',
    remark: '',
    restockLedgerId: 'ledger:aftersale_restock:AS-2026-0070',
    scrapLedgerId: '',
  },
]

const DEMO_CANCELS: AftersaleCancel[] = [
  {
    id: 'AS-2026-0079',
    order: 'DZ-10012',
    shop: 'Daraz LK',
    sku: 'HSY000001001',
    warehouse: 'WH-CN-XMN-001',
    bin: 'A-01-01-01',
    type: '仅退款',
    platformSync: '平台已同步',
    refund: 3,
    currency: 'USD',
    releaseReserved: 0,
    status: '已审核',
    reason: '物流延迟补偿',
    remark: '',
    releasedAt: '',
    releaseLedgerId: '',
  },
  {
    id: 'AS-2026-0082',
    order: 'LZ-2233',
    shop: 'Lazada MY',
    sku: 'HSY000001002',
    warehouse: 'WH-CN-XMN-001',
    bin: 'A-01-01-02',
    type: '取消订单',
    platformSync: '等待平台确认',
    refund: 6.8,
    currency: 'MYR',
    releaseReserved: 1,
    status: '待确认',
    reason: '买家未付款超时取消',
    remark: '',
    releasedAt: '',
    releaseLedgerId: '',
  },
  {
    id: 'AS-2026-0075',
    order: 'DZ-10004',
    shop: 'Daraz LK',
    sku: 'HSY000002001',
    warehouse: 'WH-CN-XMN-001',
    bin: 'B-02-01-01',
    type: '取消订单',
    platformSync: '平台已同步',
    refund: 24,
    currency: 'USD',
    releaseReserved: 0,
    status: '已审核',
    reason: '买家主动取消',
    remark: '',
    releasedAt: '',
    releaseLedgerId: '',
  },
]

const DEMO_TICKETS: AftersaleTicket[] = ERP_DEMO_AFTERSALES.map((item) => ({
  ...item,
  shop: item.order.startsWith('DZ') ? 'Daraz LK' : 'Lazada MY',
  warehouse: 'WH-CN-XMN-001',
}))

type AftersaleState = {
  returns: AftersaleReturn[]
  cancels: AftersaleCancel[]
  tickets: AftersaleTicket[]
}

const store = createDemoStore<AftersaleState>('open-shop.console.demo.aftersale.v1', {
  returns: structuredClone(DEMO_RETURNS),
  cancels: structuredClone(DEMO_CANCELS),
  tickets: structuredClone(DEMO_TICKETS),
})

function mutate(updater: (state: AftersaleState) => AftersaleState) {
  store.set(updater(store.get()))
}

export function useAftersaleReturns() {
  return store.useStore().returns
}

export function useAftersaleCancels() {
  return store.useStore().cancels
}

export function useAftersaleTickets() {
  return store.useStore().tickets
}

export function getAftersaleReturn(id: string) {
  return store.get().returns.find((item) => item.id === id)
}

export function getAftersaleCancel(id: string) {
  return store.get().cancels.find((item) => item.id === id)
}

export function getAftersaleTicket(id: string) {
  return store.get().tickets.find((item) => item.id === id)
}

export function countReturnsByStatus(rows: AftersaleReturn[]) {
  return {
    total: rows.length,
    pendingReceive: rows.filter((r) => r.status === '待收货确认').length,
    pendingQc: rows.filter((r) => r.status === '待质检' || r.status === '质检中').length,
    restocked: rows.filter((r) => r.status === '已回库' || r.status === '部分回库').length,
    scrapped: rows.filter((r) => r.status === '已报损').length,
  }
}

export function countCancelsByStatus(rows: AftersaleCancel[]) {
  return {
    total: rows.length,
    pending: rows.filter((r) => r.status === '待确认').length,
    approved: rows.filter((r) => r.status === '已审核').length,
    rejected: rows.filter((r) => r.status === '已驳回').length,
  }
}

export function countTicketsKpi(rows: AftersaleTicket[]) {
  return {
    total: rows.length,
    pending: rows.filter((r) => r.status === '待确认').length,
    approved: rows.filter((r) => r.status === '已审核' || r.status === '已入库').length,
    withReturn: rows.filter((r) => r.returned > 0).length,
  }
}

export function registerReturnReceive(input: {
  id: string
  order: string
  shop?: string
  sku: string
  warehouse?: string
  bin: string
  tracking: string
  qty: number
  packageCondition?: string
  remark?: string
}): { ok: true; row: AftersaleReturn } | { ok: false; reason: string } {
  const id = input.id.trim()
  const order = input.order.trim()
  const sku = input.sku.trim()
  const tracking = input.tracking.trim()
  const qty = Number(input.qty)
  if (!id) return { ok: false, reason: '售后单号不能为空' }
  if (!order) return { ok: false, reason: '原订单号不能为空' }
  if (!sku) return { ok: false, reason: '内部 SKU 不能为空' }
  if (!tracking) return { ok: false, reason: '寄回运单号不能为空' }
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, reason: '实收数量必须为正整数' }
  if (!input.bin.trim()) return { ok: false, reason: '收货库位不能为空' }

  const existing = store.get().returns.find((item) => item.id === id)
  if (existing && existing.status !== '待收货确认') {
    return { ok: false, reason: `${id} 已收货，请勿重复登记` }
  }

  const row: AftersaleReturn = {
    id,
    order,
    shop: input.shop || 'Daraz LK',
    sku,
    warehouse: input.warehouse || 'WH-CN-XMN-001',
    bin: input.bin.trim(),
    tracking,
    receivedAt: nowStamp(),
    qty,
    qcPass: 0,
    qcDefect: 0,
    qc: '待质检',
    restock: 0,
    scrap: 0,
    status: '待质检',
    packageCondition: input.packageCondition || '完好',
    remark: input.remark || '',
    restockLedgerId: '',
    scrapLedgerId: '',
  }

  mutate((state) => ({
    ...state,
    returns: [row, ...state.returns.filter((item) => item.id !== id)],
  }))
  return { ok: true, row }
}

/**
 * 质检完成并回库 / 报损：经 wms-store 写流水（售后回库 / 质检报损），禁止直改余额。
 */
export function completeReturnQc(input: {
  id: string
  qcPass: number
  qcDefect: number
  actor?: string
}): { ok: true; row: AftersaleReturn; note: string } | { ok: false; reason: string } {
  const state = store.get()
  const current = state.returns.find((item) => item.id === idOf(input.id))
  if (!current) return { ok: false, reason: '退货单不存在' }
  if (current.status !== '待质检' && current.status !== '质检中') {
    return { ok: false, reason: `当前状态「${current.status}」不可质检过账` }
  }
  const pass = Number(input.qcPass)
  const defect = Number(input.qcDefect)
  if (!Number.isFinite(pass) || pass < 0 || !Number.isFinite(defect) || defect < 0) {
    return { ok: false, reason: '合格 / 残次数量无效' }
  }
  if (pass + defect !== current.qty) {
    return { ok: false, reason: `合格+残次必须等于实收数量 ${current.qty}` }
  }

  const actor = input.actor || '当前用户'
  let restockLedgerId = current.restockLedgerId
  let scrapLedgerId = current.scrapLedgerId
  const notes: string[] = []

  if (pass > 0) {
    const key = `ledger:aftersale_restock:${current.id}`
    const result = applyAftersaleRestock({
      warehouse: current.warehouse,
      bin: current.bin,
      sku: current.sku,
      quantity: pass,
      sourceDoc: current.id,
      actor,
      idempotencyKey: key,
      reason: `售后回库 ${current.id}`,
    })
    if (!result.ok) return { ok: false, reason: result.reason }
    restockLedgerId = result.entry.idempotencyKey
    notes.push(result.duplicated ? `回库幂等命中 ${result.entry.id}` : `回库流水 ${result.entry.id}`)
  }

  if (defect > 0) {
    const key = `ledger:aftersale_scrap:${current.id}`
    const result = applyAftersaleScrap({
      warehouse: current.warehouse,
      bin: current.bin,
      sku: current.sku,
      quantity: defect,
      sourceDoc: current.id,
      actor,
      idempotencyKey: key,
      reason: `售后报损 ${current.id}`,
    })
    if (!result.ok) return { ok: false, reason: result.reason }
    scrapLedgerId = result.entry.idempotencyKey
    notes.push(result.duplicated ? `报损幂等命中 ${result.entry.id}` : `报损流水 ${result.entry.id}`)
  }

  const status: ReturnStatus =
    pass > 0 && defect > 0 ? '部分回库' : pass > 0 ? '已回库' : '已报损'

  const updated: AftersaleReturn = {
    ...current,
    qcPass: pass,
    qcDefect: defect,
    qc: `合格 ${pass} / 残次 ${defect}`,
    restock: pass,
    scrap: defect,
    status,
    restockLedgerId,
    scrapLedgerId,
  }

  mutate((s) => ({
    ...s,
    returns: s.returns.map((item) => (item.id === current.id ? updated : item)),
  }))

  return { ok: true, row: updated, note: notes.join('；') || '质检完成' }
}

function idOf(id: string) {
  return id
}

export function approveCancel(
  id: string,
  actor?: string,
): { ok: true; row: AftersaleCancel; note: string } | { ok: false; reason: string } {
  const current = store.get().cancels.find((item) => item.id === id)
  if (!current) return { ok: false, reason: '取消/退款单不存在' }
  if (current.status !== '待确认') return { ok: false, reason: `当前状态「${current.status}」不可审核` }

  let releaseLedgerId = current.releaseLedgerId
  let releasedAt = current.releasedAt
  const notes: string[] = [`退款 ${current.refund} ${current.currency} 已记账（原型）`]

  if (current.type === '取消订单' && current.releaseReserved > 0) {
    const key = `ledger:order_release:${current.id}`
    const result = applyOrderReleaseReserved({
      warehouse: current.warehouse,
      bin: current.bin,
      sku: current.sku,
      quantity: current.releaseReserved,
      sourceDoc: current.id,
      actor: actor || '当前用户',
      idempotencyKey: key,
      reason: `取消释放锁定 ${current.order}`,
    })
    if (!result.ok) return { ok: false, reason: result.reason }
    releaseLedgerId = result.entry.idempotencyKey
    releasedAt = nowStamp()
    notes.push(
      result.duplicated
        ? `释放幂等命中 ${result.entry.id}`
        : `释放锁定 ${current.releaseReserved} · 流水 ${result.entry.id}`,
    )
  } else {
    notes.push('仅退款不释放锁定、不虚增库存')
  }

  const updated: AftersaleCancel = {
    ...current,
    status: '已审核',
    platformSync: '平台已同步（示例）',
    releaseLedgerId,
    releasedAt,
  }
  mutate((s) => ({
    ...s,
    cancels: s.cancels.map((item) => (item.id === id ? updated : item)),
  }))
  return { ok: true, row: updated, note: notes.join('；') }
}

export function createCancel(input: {
  order: string
  shop: string
  sku: string
  type: string
  reason: string
  refund: number
  currency: string
  releaseReserved?: number
  platformSync?: string
  remark?: string
  warehouse?: string
  bin?: string
}): { ok: true; row: AftersaleCancel } | { ok: false; reason: string } {
  if (!input.order.trim()) return { ok: false, reason: '平台订单号不能为空' }
  if (!input.sku.trim()) return { ok: false, reason: 'SKU 不能为空' }
  if (!input.reason.trim()) return { ok: false, reason: '原因不能为空' }
  if (!Number.isFinite(input.refund) || input.refund < 0) return { ok: false, reason: '退款金额无效' }

  const row: AftersaleCancel = {
    id: `AS-2026-${String(store.get().cancels.length + 90).padStart(4, '0')}`,
    order: input.order.trim(),
    shop: input.shop,
    sku: input.sku.trim(),
    warehouse: input.warehouse || 'WH-CN-XMN-001',
    bin: input.bin || 'A-01-01-01',
    type: input.type,
    platformSync: input.platformSync || '等待平台确认',
    refund: input.refund,
    currency: input.currency,
    releaseReserved: input.releaseReserved ?? 0,
    status: '待确认',
    reason: input.reason.trim(),
    remark: input.remark || '',
    releasedAt: '',
    releaseLedgerId: '',
  }
  mutate((s) => ({ ...s, cancels: [row, ...s.cancels] }))
  return { ok: true, row }
}

export function createTicket(input: {
  order: string
  sku: string
  type: string
  reason: string
  refund: number
  currency: string
  returned?: number
  qc?: string
  status?: string
  shop?: string
}): { ok: true; row: AftersaleTicket } | { ok: false; reason: string } {
  if (!input.order.trim()) return { ok: false, reason: '平台订单号不能为空' }
  if (!input.sku.trim()) return { ok: false, reason: '内部 SKU 不能为空' }
  if (!input.reason.trim()) return { ok: false, reason: '售后原因不能为空' }
  const row: AftersaleTicket = {
    id: `AS-2026-${String(store.get().tickets.length + 83).padStart(4, '0')}`,
    order: input.order.trim(),
    sku: input.sku.trim(),
    type: input.type,
    reason: input.reason.trim(),
    refund: input.refund,
    currency: input.currency,
    returned: input.returned ?? 0,
    qc: input.qc || (input.returned && input.returned > 0 ? '待质检' : '不适用'),
    status: (input.status as AftersaleTicket['status']) || '待确认',
    shop: input.shop || 'Daraz LK',
    warehouse: 'WH-CN-XMN-001',
  }
  mutate((s) => ({ ...s, tickets: [row, ...s.tickets] }))
  return { ok: true, row }
}

export function toRelatedReturnShape(row: AftersaleReturn): Record<string, unknown> {
  return {
    id: row.id,
    order: row.order,
    sku: row.sku,
    tracking: row.tracking,
    receivedAt: row.receivedAt,
    qty: row.qty,
    qc: row.qc,
    restock: row.restock,
    scrap: row.scrap,
    status: row.status,
    warehouse: row.warehouse,
    bin: row.bin,
    shop: row.shop,
  }
}

export function toRelatedCancelShape(row: AftersaleCancel): Record<string, unknown> {
  return {
    id: row.id,
    order: row.order,
    shop: row.shop,
    sku: row.sku,
    type: row.type,
    platformSync: row.platformSync,
    refund: row.refund,
    currency: row.currency,
    releaseReserved: row.releaseReserved,
    status: row.status,
    reason: row.reason,
  }
}

export function toRelatedTicketShape(row: AftersaleTicket): Record<string, unknown> {
  return {
    id: row.id,
    order: row.order,
    sku: row.sku,
    type: row.type,
    reason: row.reason,
    refund: row.refund,
    currency: row.currency,
    returned: row.returned,
    qc: row.qc,
    status: row.status,
    shop: row.shop,
  }
}
