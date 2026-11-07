'use client'

/**
 * @deprecated 模块6：Console 主路径已切 tRPC `aftersale` → dataaccess → PostgreSQL。
 * 本文件仅保留 toRelated*Shape 供页面 related-info 使用；状态枚举以 aftersale.meta（server mappers）为准。
 * 勿再调用 createTicket / createCancel / registerReturnReceive / completeReturnQc / approveCancel 写 localStorage。
 *
 * 历史：售后 / 退货质检回库 / 取消退款 原型会话 store（Phase 4 UED）。
 */

import { createDemoStore } from '@/lib/crossborder/local-store'
import { ERP_DEMO_AFTERSALES, type DemoAfterSale } from '@/lib/crossborder/erp-ued-data'
import {
  applyAftersaleRestock,
  applyAftersaleScrap,
  applyOrderReleaseReserved,
} from '@/lib/crossborder/wms-store'

export type AftersaleReturn = {
  id: string
  reverseOrderId: string
  externalReturnId: string
  order: string
  shop: string
  sku: string
  warehouse: string
  bin: string
  tracking: string
  returnShipmentId: string
  receivedAt: string
  qty: number
  qcPass: number
  qcDefect: number
  qc: string
  restock: number
  scrap: number
  status: string
  platformStatus: string
  qcDecision: string
  inspectedAt: string
  refundId: string
  refundStatus: string
  packageCondition: string
  remark: string
  restockLedgerId: string
  scrapLedgerId: string
}

export type AftersaleCancel = {
  id: string
  reverseOrderId: string
  externalReverseId: string
  order: string
  shop: string
  sku: string
  warehouse: string
  bin: string
  type: string
  platformSync: string
  platformStatus: string
  platformUpdatedAt: string
  refundId: string
  refundStatus: string
  refundedAt: string
  refund: number
  currency: string
  releaseReserved: number
  status: string
  reason: string
  reasonCode: string
  remark: string
  releasedAt: string
  releaseLedgerId: string
}

export type AftersaleTicket = DemoAfterSale & {
  shop: string
  warehouse: string
  reverseOrderId: string
  externalReverseId: string
  platformStatus: string
  platformUpdatedAt: string
  returnShipmentId: string
  returnTracking: string
  refundId: string
  refundStatus: string
  refundedAt: string
  refundMethod: string
  qcDecision: string
  isCancelPending: boolean
}

function nowStamp() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const DEMO_RETURNS: AftersaleReturn[] = [
  {
    id: 'AS-2026-0081',
    reverseOrderId: 'RV-2026-0081',
    externalReturnId: 'DZ-RETURN-5521',
    order: 'DZ-10018',
    shop: 'Daraz LK',
    sku: 'HSY000002001',
    warehouse: 'WH-CN-XMN-001',
    bin: 'B-02-01-01',
    tracking: 'DZRT-5521',
    returnShipmentId: 'RS-2026-0081',
    receivedAt: '2026-10-28 11:20',
    qty: 1,
    qcPass: 0,
    qcDefect: 0,
    qc: '待质检',
    restock: 0,
    scrap: 0,
    status: '待质检',
    platformStatus: 'RETURN_RECEIVED',
    qcDecision: 'pending',
    inspectedAt: '',
    refundId: 'RF-2026-0081',
    refundStatus: 'pending',
    packageCondition: '完好',
    remark: '',
    restockLedgerId: '',
    scrapLedgerId: '',
  },
  {
    id: 'AS-2026-0077',
    reverseOrderId: 'RV-2026-0077',
    externalReturnId: 'LZ-RETURN-1180',
    order: 'LZ-2180',
    shop: 'Lazada MY',
    sku: 'HSY000001001',
    warehouse: 'WH-CN-XMN-001',
    bin: 'A-01-01-01',
    tracking: 'LZRT-1180',
    returnShipmentId: 'RS-2026-0077',
    receivedAt: '2026-10-25 15:05',
    qty: 2,
    qcPass: 1,
    qcDefect: 1,
    qc: '合格 1 / 残次 1',
    restock: 1,
    scrap: 1,
    status: '已回库',
    platformStatus: 'RETURN_RECEIVED',
    qcDecision: 'partial_restock',
    inspectedAt: '2026-10-25 17:40',
    refundId: 'RF-2026-0077',
    refundStatus: 'refunded',
    packageCondition: '轻微破损',
    remark: '一件可售一件报损',
    restockLedgerId: 'ledger:aftersale_restock:AS-2026-0077',
    scrapLedgerId: 'ledger:aftersale_scrap:AS-2026-0077',
  },
  {
    id: 'AS-2026-0070',
    reverseOrderId: 'RV-2026-0070',
    externalReturnId: 'DZ-RETURN-5480',
    order: 'DZ-09988',
    shop: 'Daraz LK',
    sku: 'HSY000001002',
    warehouse: 'WH-CN-XMN-001',
    bin: 'A-01-01-02',
    tracking: 'DZRT-5480',
    returnShipmentId: 'RS-2026-0070',
    receivedAt: '2026-10-19 09:30',
    qty: 1,
    qcPass: 1,
    qcDefect: 0,
    qc: '合格 1',
    restock: 1,
    scrap: 0,
    status: '已回库',
    platformStatus: 'RETURN_RECEIVED',
    qcDecision: 'restock',
    inspectedAt: '2026-10-19 11:10',
    refundId: 'RF-2026-0070',
    refundStatus: 'refunded',
    packageCondition: '完好',
    remark: '',
    restockLedgerId: 'ledger:aftersale_restock:AS-2026-0070',
    scrapLedgerId: '',
  },
]

const DEMO_CANCELS: AftersaleCancel[] = [
  {
    id: 'AS-2026-0079',
    reverseOrderId: 'RV-2026-0079',
    externalReverseId: 'DZ-REV-0079',
    order: 'DZ-10012',
    shop: 'Daraz LK',
    sku: 'HSY000001001',
    warehouse: 'WH-CN-XMN-001',
    bin: 'A-01-01-01',
    type: '仅退款',
    platformSync: '平台已同步',
    platformStatus: 'REFUND_APPROVED',
    platformUpdatedAt: '2026-10-26 10:12',
    refundId: 'RF-2026-0079',
    refundStatus: 'refunded',
    refundedAt: '2026-10-26 10:20',
    refund: 3,
    currency: 'USD',
    releaseReserved: 0,
    status: '已审核',
    reason: '物流延迟补偿',
    reasonCode: 'LOGISTICS_DELAY',
    remark: '',
    releasedAt: '',
    releaseLedgerId: '',
  },
  {
    id: 'AS-2026-0082',
    reverseOrderId: 'RV-2026-0082',
    externalReverseId: 'LZ-REV-0082',
    order: 'LZ-2233',
    shop: 'Lazada MY',
    sku: 'HSY000001002',
    warehouse: 'WH-CN-XMN-001',
    bin: 'A-01-01-02',
    type: '取消订单',
    platformSync: '等待平台确认',
    platformStatus: 'REVERSE_REQUESTED',
    platformUpdatedAt: '2026-10-28 09:30',
    refundId: 'RF-2026-0082',
    refundStatus: 'pending',
    refundedAt: '',
    refund: 6.8,
    currency: 'MYR',
    releaseReserved: 1,
    status: '待确认',
    reason: '买家未付款超时取消',
    reasonCode: 'BUYER_CANCEL',
    remark: '',
    releasedAt: '',
    releaseLedgerId: '',
  },
  {
    id: 'AS-2026-0075',
    reverseOrderId: 'RV-2026-0075',
    externalReverseId: 'DZ-REV-0075',
    order: 'DZ-10004',
    shop: 'Daraz LK',
    sku: 'HSY000002001',
    warehouse: 'WH-CN-XMN-001',
    bin: 'B-02-01-01',
    type: '取消订单',
    platformSync: '平台已同步',
    platformStatus: 'REVERSE_APPROVED',
    platformUpdatedAt: '2026-10-22 14:05',
    refundId: 'RF-2026-0075',
    refundStatus: 'refunded',
    refundedAt: '2026-10-22 14:20',
    refund: 24,
    currency: 'USD',
    releaseReserved: 0,
    status: '已审核',
    reason: '买家主动取消',
    reasonCode: 'BUYER_CANCEL',
    remark: '',
    releasedAt: '',
    releaseLedgerId: '',
  },
]

const DEMO_TICKETS: AftersaleTicket[] = ERP_DEMO_AFTERSALES.map((item) => {
  const hasReturn = item.returned > 0
  const prefix = item.order.startsWith('DZ') ? 'DZ' : 'LZ'
  return {
    ...item,
    shop: item.order.startsWith('DZ') ? 'Daraz LK' : 'Lazada MY',
    warehouse: 'WH-CN-XMN-001',
    reverseOrderId: `RV-${item.id.slice(3)}`,
    externalReverseId: `${prefix}-REV-${item.id.slice(-4)}`,
    platformStatus: item.status === '已审核' ? 'REVERSE_APPROVED' : 'REVERSE_REQUESTED',
    platformUpdatedAt: '2026-10-28 09:30',
    returnShipmentId: hasReturn ? `RS-${item.id.slice(3)}` : '',
    returnTracking: hasReturn ? `${prefix}RT-${item.id.slice(-4)}` : '',
    refundId: `RF-${item.id.slice(3)}`,
    refundStatus: item.status === '已审核' ? 'refunded' : 'pending',
    refundedAt: item.status === '已审核' ? '2026-10-28 11:20' : '',
    refundMethod: 'platform_original',
    qcDecision: hasReturn ? 'pending' : 'not_applicable',
    isCancelPending: item.type === '取消',
  }
})

type AftersaleState = {
  returns: AftersaleReturn[]
  cancels: AftersaleCancel[]
  tickets: AftersaleTicket[]
}

const store = createDemoStore<AftersaleState>('open-shop.console.demo.aftersale.v2', {
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
  returnShipmentId?: string
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
    reverseOrderId: `RV-${id.slice(3)}`,
    externalReturnId: `RETURN-${id.slice(3)}`,
    order,
    shop: input.shop || 'Daraz LK',
    sku,
    warehouse: input.warehouse || 'WH-CN-XMN-001',
    bin: input.bin.trim(),
    tracking,
    returnShipmentId: input.returnShipmentId || `RS-${id.slice(3)}`,
    receivedAt: nowStamp(),
    qty,
    qcPass: 0,
    qcDefect: 0,
    qc: '待质检',
    restock: 0,
    scrap: 0,
    status: '待质检',
    platformStatus: 'RETURN_RECEIVED',
    qcDecision: 'pending',
    inspectedAt: '',
    refundId: `RF-${id.slice(3)}`,
    refundStatus: 'pending',
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

  const status: string =
    pass > 0 && defect > 0 ? '部分回库' : pass > 0 ? '已回库' : '已报损'

  const updated: AftersaleReturn = {
    ...current,
    qcPass: pass,
    qcDefect: defect,
    qc: `合格 ${pass} / 残次 ${defect}`,
    restock: pass,
    scrap: defect,
    status,
    qcDecision: pass > 0 && defect > 0 ? 'partial_restock' : pass > 0 ? 'restock' : 'scrap',
    inspectedAt: nowStamp(),
    refundStatus: 'refund_processing',
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
    platformStatus: 'REVERSE_APPROVED',
    platformUpdatedAt: nowStamp(),
    refundStatus: current.refund > 0 ? 'refunded' : 'not_applicable',
    refundedAt: current.refund > 0 ? nowStamp() : '',
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

  const id = `AS-2026-${String(store.get().cancels.length + 90).padStart(4, '0')}`
  const row: AftersaleCancel = {
    id,
    reverseOrderId: `RV-${id.slice(3)}`,
    externalReverseId: `REV-${id.slice(3)}`,
    order: input.order.trim(),
    shop: input.shop,
    sku: input.sku.trim(),
    warehouse: input.warehouse || 'WH-CN-XMN-001',
    bin: input.bin || 'A-01-01-01',
    type: input.type,
    platformSync: input.platformSync || '等待平台确认',
    platformStatus: 'REVERSE_REQUESTED',
    platformUpdatedAt: nowStamp(),
    refundId: `RF-${id.slice(3)}`,
    refundStatus: 'pending',
    refundedAt: '',
    refund: input.refund,
    currency: input.currency,
    releaseReserved: input.releaseReserved ?? 0,
    status: '待确认',
    reason: input.reason.trim(),
    reasonCode: input.type === '取消订单' ? 'BUYER_CANCEL' : 'REFUND_ONLY',
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
  const id = `AS-2026-${String(store.get().tickets.length + 83).padStart(4, '0')}`
  const returned = input.returned ?? 0
  const row: AftersaleTicket = {
    id,
    order: input.order.trim(),
    sku: input.sku.trim(),
    type: input.type,
    reason: input.reason.trim(),
    refund: input.refund,
    currency: input.currency,
    returned,
    qc: input.qc || (returned > 0 ? '待质检' : '不适用'),
    status: (input.status as AftersaleTicket['status']) || '待确认',
    shop: input.shop || 'Daraz LK',
    warehouse: 'WH-CN-XMN-001',
    reverseOrderId: `RV-${id.slice(3)}`,
    externalReverseId: `REV-${id.slice(3)}`,
    platformStatus: 'REVERSE_REQUESTED',
    platformUpdatedAt: nowStamp(),
    returnShipmentId: returned > 0 ? `RS-${id.slice(3)}` : '',
    returnTracking: returned > 0 ? `RT-${id.slice(-4)}` : '',
    refundId: `RF-${id.slice(3)}`,
    refundStatus: 'pending',
    refundedAt: '',
    refundMethod: 'platform_original',
    qcDecision: returned > 0 ? 'pending' : 'not_applicable',
    isCancelPending: input.type === '取消',
  }
  mutate((s) => ({ ...s, tickets: [row, ...s.tickets] }))
  return { ok: true, row }
}

export function toRelatedReturnShape(row: AftersaleReturn): Record<string, unknown> {
  return {
    id: row.id,
    reverseOrderId: row.reverseOrderId,
    externalReturnId: row.externalReturnId,
    order: row.order,
    sku: row.sku,
    tracking: row.tracking,
    returnShipmentId: row.returnShipmentId,
    receivedAt: row.receivedAt,
    qty: row.qty,
    qc: row.qc,
    qcDecision: row.qcDecision,
    inspectedAt: row.inspectedAt || '—',
    restock: row.restock,
    scrap: row.scrap,
    status: row.status,
    platformStatus: row.platformStatus,
    refundId: row.refundId,
    refundStatus: row.refundStatus,
    warehouse: row.warehouse,
    bin: row.bin,
    shop: row.shop,
  }
}

export function toRelatedCancelShape(row: AftersaleCancel): Record<string, unknown> {
  return {
    id: row.id,
    reverseOrderId: row.reverseOrderId,
    externalReverseId: row.externalReverseId,
    order: row.order,
    shop: row.shop,
    sku: row.sku,
    type: row.type,
    platformSync: row.platformSync,
    platformStatus: row.platformStatus,
    platformUpdatedAt: row.platformUpdatedAt,
    refundId: row.refundId,
    refundStatus: row.refundStatus,
    refundedAt: row.refundedAt || '—',
    refund: row.refund,
    currency: row.currency,
    releaseReserved: row.releaseReserved,
    status: row.status,
    reason: row.reason,
    reasonCode: row.reasonCode,
  }
}

export function toRelatedTicketShape(row: AftersaleTicket): Record<string, unknown> {
  return {
    id: row.id,
    reverseOrderId: row.reverseOrderId,
    externalReverseId: row.externalReverseId,
    order: row.order,
    sku: row.sku,
    type: row.type,
    reason: row.reason,
    refund: row.refund,
    currency: row.currency,
    returned: row.returned,
    qc: row.qc,
    qcDecision: row.qcDecision,
    status: row.status,
    platformStatus: row.platformStatus,
    platformUpdatedAt: row.platformUpdatedAt,
    returnShipmentId: row.returnShipmentId || '—',
    returnTracking: row.returnTracking || '—',
    refundId: row.refundId,
    refundStatus: row.refundStatus,
    refundedAt: row.refundedAt || '—',
    refundMethod: row.refundMethod,
    shop: row.shop,
  }
}
