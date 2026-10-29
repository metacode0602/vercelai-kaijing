/**
 * Shared ops demo documents for related-info tables on console detail pages.
 * Labeled as 示例/mock — keep in sync with list-page DEMO_* where practical.
 */

export type DemoApproval = {
  id: string
  applicant: string
  sku: string
  quantity: number
  unitPrice: number
  currency: string
  submittedAt: string
  approver: string
  opinion: string
  status: string
}

export type DemoReceipt = {
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

export type DemoInbound = {
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

export type DemoOutbound = {
  id: string
  order: string
  packageId: string
  sku: string
  quantity: number
  bin: string
  picker: string
  at: string
  status: string
}

export type DemoLedger = {
  id: string
  sku: string
  warehouse: string
  bin: string
  type: string
  before: number
  delta: number
  after: number
  source: string
  reason: string
  actor: string
  at: string
  status: string
}

export type DemoAdjustment = {
  id: string
  type: string
  sku: string
  warehouse: string
  bin: string
  before: number
  delta: number
  after: number
  reason: string
  applicant: string
  status: string
}

export type DemoReturn = {
  id: string
  order: string
  sku: string
  tracking: string
  receivedAt: string
  qty: number
  qc: string
  restock: number
  scrap: number
  status: string
}

export type DemoPick = {
  id: string
  order: string
  shop: string
  site: string
  items: number
  skus: string
  weight: string
  tracking: string
  picker: string
  status: string
}

export type DemoSyncTask = {
  id: string
  type: string
  target: string
  shop: string
  progress: string
  error: string
  retries: number
  lastRun: string
  status: string
}

/** 采购审核队列（示例） */
export const RELATED_DEMO_APPROVALS: DemoApproval[] = [
  {
    id: 'PR-2026-0012',
    applicant: '李萍',
    sku: 'HSY000001001',
    quantity: 100,
    unitPrice: 28,
    currency: 'CNY',
    submittedAt: '2026-10-28 09:40',
    approver: '杨洁 / 黄发聪',
    opinion: '—',
    status: '待审核',
  },
  {
    id: 'PR-2026-0010',
    applicant: '兰雨晨',
    sku: 'HSY000002001',
    quantity: 30,
    unitPrice: 62,
    currency: 'CNY',
    submittedAt: '2026-10-27 16:12',
    approver: '杨洁 / 黄发聪',
    opinion: '—',
    status: '待审核',
  },
  {
    id: 'PR-2026-0011',
    applicant: '杨洁',
    sku: 'HSY000002001',
    quantity: 50,
    unitPrice: 62,
    currency: 'CNY',
    submittedAt: '2026-10-27 11:05',
    approver: '黄发聪',
    opinion: '价格与上单一致，通过',
    status: '已审核',
  },
  {
    id: 'PR-2026-0008',
    applicant: '黄发聪',
    sku: 'HSY000001002',
    quantity: 80,
    unitPrice: 31,
    currency: 'CNY',
    submittedAt: '2026-10-24 14:22',
    approver: '杨洁',
    opinion: '单价高于近三单均价，暂缓',
    status: '已驳回',
  },
]

/** 到货质检入库（示例） */
export const RELATED_DEMO_RECEIPTS: DemoReceipt[] = [
  {
    id: 'RCV-2026-0044',
    po: 'PO-2026-0030',
    sku: 'HSY000001002',
    arrived: 40,
    qcPass: 32,
    qcDefect: 6,
    shortage: 2,
    bin: 'A-01-01-02',
    operator: '仓库员 · 兰雨晨',
    status: '部分入库',
  },
  {
    id: 'RCV-2026-0045',
    po: 'PO-2026-0031',
    sku: 'HSY000002001',
    arrived: 50,
    qcPass: 0,
    qcDefect: 0,
    shortage: 0,
    bin: 'B-02-01-01',
    operator: '仓库员 · 兰雨晨',
    status: '待质检',
  },
  {
    id: 'RCV-2026-0041',
    po: 'PO-2026-0028',
    sku: 'HSY000001001',
    arrived: 100,
    qcPass: 98,
    qcDefect: 2,
    shortage: 0,
    bin: 'A-01-01-01',
    operator: '仓库员 · 兰雨晨',
    status: '已入库',
  },
]

/** 入库单（示例） */
export const RELATED_DEMO_INBOUNDS: DemoInbound[] = [
  {
    id: 'IN-2026-0052',
    sourceType: '采购入库',
    sourceDoc: 'RCV-2026-0041',
    sku: 'HSY000001001',
    quantity: 98,
    qcResult: '合格 98 / 残次 2',
    bin: 'A-01-01-01',
    operator: '兰雨晨',
    at: '2026-10-26 15:20',
    status: '已上架',
  },
  {
    id: 'IN-2026-0053',
    sourceType: '采购入库',
    sourceDoc: 'RCV-2026-0044',
    sku: 'HSY000001002',
    quantity: 32,
    qcResult: '合格 32 / 残次 6',
    bin: 'A-01-01-02',
    operator: '兰雨晨',
    at: '2026-10-28 10:05',
    status: '待上架',
  },
  {
    id: 'IN-2026-0054',
    sourceType: '售后回库',
    sourceDoc: 'AS-2026-0081',
    sku: 'HSY000002001',
    quantity: 1,
    qcResult: '质检合格可售 1',
    bin: 'B-02-01-01',
    operator: '仓库员',
    at: '2026-10-28 11:40',
    status: '待上架',
  },
]

/** 出库单（示例） */
export const RELATED_DEMO_OUTBOUNDS: DemoOutbound[] = [
  {
    id: 'OUT-2026-0087',
    order: 'DZ-10021',
    packageId: 'PKG-DZ-10021',
    sku: 'HSY000001001',
    quantity: 2,
    bin: 'A-01-01-01',
    picker: '仓库员 · 兰雨晨',
    at: '2026-10-28 09:12',
    status: '待拣货',
  },
  {
    id: 'OUT-2026-0086',
    order: 'LZ-2201',
    packageId: 'PKG-LZ-2201',
    sku: 'HSY000002001',
    quantity: 1,
    bin: 'B-02-01-01',
    picker: '仓库员 · 兰雨晨',
    at: '2026-10-28 08:40',
    status: '拣货中',
  },
  {
    id: 'OUT-2026-0084',
    order: 'DZ-10018',
    packageId: 'PKG-DZ-10018',
    sku: 'HSY000002001',
    quantity: 1,
    bin: 'B-02-01-01',
    picker: '仓库员 · 兰雨晨',
    at: '2026-10-20 10:20',
    status: '已出库',
  },
]

/** 库存流水（示例）— enriched for warehouse / balance demos */
export const RELATED_DEMO_LEDGER: DemoLedger[] = [
  {
    id: 'MOV-2026-10012',
    sku: 'HSY000001001',
    warehouse: 'WH-CN-XMN-001',
    bin: 'A-01-01-01',
    type: '采购入库',
    before: 30,
    delta: 20,
    after: 50,
    source: 'PO-2026-0028',
    reason: '合格入库',
    actor: '仓库员',
    at: '2026-10-26 15:22',
    status: '已记账',
  },
  {
    id: 'MOV-2026-10011',
    sku: 'HSY000001001',
    warehouse: 'WH-CN-XMN-001',
    bin: 'A-01-01-01',
    type: '订单锁定',
    before: 50,
    delta: -4,
    after: 46,
    source: 'DZ-10021',
    reason: '订单预留（示例）',
    actor: '系统',
    at: '2026-10-28 08:02',
    status: '已记账',
  },
  {
    id: 'MOV-2026-10010',
    sku: 'HSY000001002',
    warehouse: 'WH-CN-XMN-001',
    bin: 'A-01-01-02',
    type: '采购入库',
    before: 0,
    delta: 32,
    after: 32,
    source: 'PO-2026-0030',
    reason: '部分合格入库',
    actor: '仓库员',
    at: '2026-10-28 10:08',
    status: '已记账',
  },
  {
    id: 'MOV-2026-10009',
    sku: 'HSY000002001',
    warehouse: 'WH-CN-XMN-001',
    bin: 'B-02-01-01',
    type: '订单出库',
    before: 86,
    delta: -1,
    after: 85,
    source: 'DZ-10018',
    reason: '订单发货',
    actor: '系统',
    at: '2026-10-20 10:25',
    status: '已记账',
  },
  {
    id: 'MOV-2026-10008',
    sku: 'HSY000002001',
    warehouse: 'WH-CN-XMN-001',
    bin: 'B-02-01-01',
    type: '售后回库',
    before: 85,
    delta: 1,
    after: 86,
    source: 'AS-2026-0081',
    reason: '退货合格回库（示例）',
    actor: '仓库员',
    at: '2026-10-28 11:45',
    status: '已记账',
  },
]

/** 盘点与调整（示例） */
export const RELATED_DEMO_ADJUSTMENTS: DemoAdjustment[] = [
  {
    id: 'ADJ-2026-0018',
    type: '盘亏',
    sku: 'HSY000001001',
    warehouse: 'WH-CN-XMN-001',
    bin: 'A-01-01-01',
    before: 46,
    delta: -1,
    after: 45,
    reason: '月度盘点差异（示例）',
    applicant: '兰雨晨',
    status: '待审批',
  },
  {
    id: 'ADJ-2026-0017',
    type: '报损',
    sku: 'HSY000002001',
    warehouse: 'WH-CN-XMN-001',
    bin: 'B-02-01-01',
    before: 86,
    delta: -1,
    after: 85,
    reason: '运输破损（示例）',
    applicant: '仓库员',
    status: '已通过',
  },
  {
    id: 'ADJ-2026-0016',
    type: '库位转移',
    sku: 'HSY000001002',
    warehouse: 'WH-CN-XMN-001',
    bin: 'A-01-01-02 → C-01-01-01',
    before: 12,
    delta: 0,
    after: 12,
    reason: '库位整理（示例）',
    applicant: '仓库员',
    status: '已通过',
  },
]

/** 退货收货（示例） */
export const RELATED_DEMO_RETURNS: DemoReturn[] = [
  {
    id: 'AS-2026-0081',
    order: 'DZ-10018',
    sku: 'HSY000002001',
    tracking: 'DZRT-5521',
    receivedAt: '2026-10-28 11:20',
    qty: 1,
    qc: '待质检',
    restock: 0,
    scrap: 0,
    status: '待质检',
  },
  {
    id: 'AS-2026-0077',
    order: 'LZ-2180',
    sku: 'HSY000001001',
    tracking: 'LZRT-1180',
    receivedAt: '2026-10-25 15:05',
    qty: 2,
    qc: '合格 1 / 残次 1',
    restock: 1,
    scrap: 1,
    status: '已回库',
  },
]

/** 拣货包裹（示例） */
export const RELATED_DEMO_PICKS: DemoPick[] = [
  {
    id: 'PKG-2026-0051',
    order: 'DZ-10021',
    shop: 'Daraz LK',
    site: 'LK',
    items: 2,
    skus: 'HSY000001001 ×2',
    weight: '待称重',
    tracking: '待生成',
    picker: '—',
    status: '待拣货',
  },
  {
    id: 'PKG-2026-0050',
    order: 'LZ-2201',
    shop: 'Lazada TH',
    site: 'TH',
    items: 1,
    skus: 'HSY000002001 ×1',
    weight: '480 g',
    tracking: 'THJSB-8821',
    picker: '兰雨晨',
    status: '已复核',
  },
  {
    id: 'PKG-2026-0044',
    order: 'DZ-10018',
    shop: 'Daraz LK',
    site: 'LK',
    items: 1,
    skus: 'HSY000002001 ×1',
    weight: '460 g',
    tracking: 'DZLK9981',
    picker: '兰雨晨',
    status: '已出库',
  },
]

/** 发布与同步任务（示例） */
export const RELATED_DEMO_SYNC_TASKS: DemoSyncTask[] = [
  {
    id: 'TASK-2026-10841',
    type: '库存同步',
    target: 'HSY000001001 × 6 刊登',
    shop: 'Lazada MY',
    progress: '6 / 6',
    error: '—',
    retries: 0,
    lastRun: '2026-10-28 10:02',
    status: '成功',
  },
  {
    id: 'TASK-2026-10842',
    type: '价格同步',
    target: 'TEE-001 等 3 刊登',
    shop: 'Daraz LK',
    progress: '2 / 3',
    error: 'ITEM_NOT_FOUND (404) · LK-ITEM-9011',
    retries: 1,
    lastRun: '2026-10-28 10:05',
    status: '部分失败',
  },
  {
    id: 'TASK-2026-10843',
    type: '发布刊登',
    target: '草稿 LIST-2026-0231',
    shop: 'Lazada PH',
    progress: '0 / 1',
    error: '类目属性缺失（示例）',
    retries: 0,
    lastRun: '2026-10-28 09:41',
    status: '失败',
  },
]
