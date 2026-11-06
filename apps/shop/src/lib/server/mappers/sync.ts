/**
 * 同步任务 UI ↔ DB 映射（模块13）。
 */

export const UI_SYNC_TASK_TYPES = [
  '库存同步',
  '价格同步',
  '发布刊登',
  '状态同步',
  '订单同步',
  '评论抓取',
  '退货同步',
  '物流同步',
  '刊登同步',
  '结算同步',
] as const
export type UiSyncTaskType = (typeof UI_SYNC_TASK_TYPES)[number]

export const UI_SYNC_TASK_STATUSES = [
  '成功',
  '失败',
  '部分失败',
  '排队',
  '排队重试',
  '运行中',
] as const
export type UiSyncTaskStatus = (typeof UI_SYNC_TASK_STATUSES)[number]

const TYPE_UI_TO_DB: Record<UiSyncTaskType, string> = {
  库存同步: 'inventory',
  价格同步: 'price',
  发布刊登: 'publish',
  状态同步: 'status',
  订单同步: 'orders',
  评论抓取: 'reviews',
  退货同步: 'returns',
  物流同步: 'logistics',
  刊登同步: 'listings',
  结算同步: 'settlements',
}
const TYPE_DB_TO_UI: Record<string, UiSyncTaskType> = {
  inventory: '库存同步',
  price: '价格同步',
  publish: '发布刊登',
  status: '状态同步',
  orders: '订单同步',
  reviews: '评论抓取',
  returns: '退货同步',
  logistics: '物流同步',
  listings: '刊登同步',
  settlements: '结算同步',
}

const STATUS_UI_TO_DB: Record<UiSyncTaskStatus, string> = {
  成功: 'success',
  失败: 'failed',
  部分失败: 'partial_failed',
  排队: 'queued',
  排队重试: 'retry_queued',
  运行中: 'running',
}
const STATUS_DB_TO_UI: Record<string, UiSyncTaskStatus> = {
  success: '成功',
  failed: '失败',
  partial_failed: '部分失败',
  queued: '排队',
  retry_queued: '排队重试',
  running: '运行中',
}

export function toDbSyncType(ui?: string | null): string {
  if (!ui) return 'inventory'
  return TYPE_UI_TO_DB[ui as UiSyncTaskType] ?? ui
}

export function toUiSyncType(db?: string | null): UiSyncTaskType {
  if (!db) return '库存同步'
  return TYPE_DB_TO_UI[db] ?? (UI_SYNC_TASK_TYPES.includes(db as UiSyncTaskType) ? (db as UiSyncTaskType) : '库存同步')
}

export function toDbSyncStatus(ui?: string | null): string | undefined {
  if (!ui) return undefined
  return STATUS_UI_TO_DB[ui as UiSyncTaskStatus] ?? ui
}

export function toUiSyncStatus(db?: string | null): UiSyncTaskStatus {
  if (!db) return '排队'
  return STATUS_DB_TO_UI[db] ?? (UI_SYNC_TASK_STATUSES.includes(db as UiSyncTaskStatus) ? (db as UiSyncTaskStatus) : '排队')
}

export function formatStamp(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
