'use client'

/**
 * 同步任务 + 接口日志原型会话 store（Phase 4）。
 * 对齐 schema：import_batches / integration_logs；任务与日志通过 requestId 关联。
 * 重试 / 抓取均为原型动作，不调用真实平台 connector。
 */

import { createDemoStore } from '@/lib/crossborder/local-store'

export const SYNC_TASK_STATUSES = ['成功', '失败', '部分失败', '排队', '排队重试', '运行中'] as const
export type SyncTaskStatus = (typeof SYNC_TASK_STATUSES)[number]

export const SYNC_TASK_TYPES = ['库存同步', '价格同步', '发布刊登', '状态同步', '订单同步', '评论抓取', '退货同步'] as const
export type SyncTaskType = (typeof SYNC_TASK_TYPES)[number]

export type SyncTask = {
  id: string
  type: SyncTaskType | string
  target: string
  shop: string
  progressDone: number
  progressTotal: number
  progress: string
  error: string
  retries: number
  lastRun: string
  status: SyncTaskStatus | string
  /** 关联 integration_logs.request_id */
  requestId: string
  createdAt: string
}

export type IntegrationLog = {
  id: string
  requestId: string
  at: string
  actor: string
  action: string
  method: string
  path: string
  shop: string
  object: string
  httpStatus: number
  latencyMs: number
  result: string
  detail: string
  /** 关联 sync task id */
  syncTaskId: string
  errorCode: string
}

function nowStamp() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const DEMO_TASKS: SyncTask[] = [
  {
    id: 'TASK-2026-10841',
    type: '库存同步',
    target: 'HSY000001001 × 6 刊登',
    shop: 'Lazada MY',
    progressDone: 6,
    progressTotal: 6,
    progress: '6 / 6',
    error: '—',
    retries: 0,
    lastRun: '2026-10-28 10:02',
    status: '成功',
    requestId: 'req_stk_10841',
    createdAt: '2026-10-28 10:00',
  },
  {
    id: 'TASK-2026-10842',
    type: '价格同步',
    target: 'TEE-001 等 3 刊登',
    shop: 'Daraz LK',
    progressDone: 2,
    progressTotal: 3,
    progress: '2 / 3',
    error: 'ITEM_NOT_FOUND (404) · LK-ITEM-9011',
    retries: 1,
    lastRun: '2026-10-28 10:05',
    status: '部分失败',
    requestId: 'req_price_10842',
    createdAt: '2026-10-28 10:03',
  },
  {
    id: 'TASK-2026-10843',
    type: '发布刊登',
    target: '草稿 LIST-2026-0231',
    shop: 'Lazada PH',
    progressDone: 0,
    progressTotal: 1,
    progress: '0 / 1',
    error: '类目属性缺失（示例）',
    retries: 0,
    lastRun: '2026-10-28 09:41',
    status: '失败',
    requestId: 'req_pub_10843',
    createdAt: '2026-10-28 09:40',
  },
  {
    id: 'TASK-2026-10838',
    type: '状态同步',
    target: '28 个刊登上下架',
    shop: 'Lazada MY',
    progressDone: 28,
    progressTotal: 28,
    progress: '28 / 28',
    error: '—',
    retries: 0,
    lastRun: '2026-10-27 22:00',
    status: '成功',
    requestId: 'req_st_10838',
    createdAt: '2026-10-27 21:58',
  },
  {
    id: 'TASK-2026-10850',
    type: '订单同步',
    target: '增量订单窗口 2h',
    shop: 'Daraz LK',
    progressDone: 0,
    progressTotal: 1,
    progress: '0 / 1',
    error: '—',
    retries: 0,
    lastRun: '—',
    status: '排队',
    requestId: 'req_ord_10850',
    createdAt: '2026-10-28 10:10',
  },
  {
    id: 'TASK-2026-10851',
    type: '评论抓取',
    target: 'HSY000001001 · 近 7 日',
    shop: 'Daraz LK',
    progressDone: 26,
    progressTotal: 26,
    progress: '26 / 26',
    error: '—',
    retries: 0,
    lastRun: '2026-10-28 06:32',
    status: '成功',
    requestId: 'req_rev_10851',
    createdAt: '2026-10-28 06:30',
  },
]

const DEMO_LOGS: IntegrationLog[] = [
  {
    id: 'ilog-1',
    requestId: 'req_price_10842',
    at: '2026-10-28 10:05:12',
    actor: '系统',
    action: '价格同步',
    method: 'POST',
    path: '/daraz/product/price/update',
    shop: 'Daraz LK',
    object: 'LK-ITEM-9011',
    httpStatus: 404,
    latencyMs: 420,
    result: '失败',
    detail: 'ITEM_NOT_FOUND · 平台变体不存在（示例）',
    syncTaskId: 'TASK-2026-10842',
    errorCode: 'ITEM_NOT_FOUND',
  },
  {
    id: 'ilog-2',
    requestId: 'req_price_10842',
    at: '2026-10-28 10:05:08',
    actor: '系统',
    action: '价格同步',
    method: 'POST',
    path: '/daraz/product/price/update',
    shop: 'Daraz LK',
    object: 'LK-ITEM-8801',
    httpStatus: 200,
    latencyMs: 310,
    result: '成功',
    detail: '价格已更新（示例）',
    syncTaskId: 'TASK-2026-10842',
    errorCode: '—',
  },
  {
    id: 'ilog-3',
    requestId: 'req_pub_10843',
    at: '2026-10-28 09:41:22',
    actor: '李萍',
    action: '发布刊登',
    method: 'POST',
    path: '/lazada/product/create',
    shop: 'Lazada PH',
    object: 'LIST-2026-0231',
    httpStatus: 400,
    latencyMs: 680,
    result: '失败',
    detail: '类目属性缺失：brand / material（示例）',
    syncTaskId: 'TASK-2026-10843',
    errorCode: 'ATTR_REQUIRED',
  },
  {
    id: 'ilog-4',
    requestId: 'req_stk_10841',
    at: '2026-10-28 10:02:40',
    actor: '系统',
    action: '库存同步',
    method: 'PUT',
    path: '/lazada/stock/update',
    shop: 'Lazada MY',
    object: 'HSY000001001',
    httpStatus: 200,
    latencyMs: 255,
    result: '成功',
    detail: '6 个刊登库存推送完成',
    syncTaskId: 'TASK-2026-10841',
    errorCode: '—',
  },
  {
    id: 'ilog-5',
    requestId: 'req_ord_sync_fail',
    at: '2026-10-28 09:02:00',
    actor: '系统',
    action: '订单同步',
    method: 'GET',
    path: '/lazada/orders/get',
    shop: 'Lazada MY',
    object: 'Lazada MY',
    httpStatus: 401,
    latencyMs: 120,
    result: '未连接',
    detail: '授权失效或未连接（示例）；请到店铺连接重新授权',
    syncTaskId: '',
    errorCode: 'UNAUTHORIZED',
  },
  {
    id: 'ilog-6',
    requestId: 'req_rev_10851',
    at: '2026-10-28 06:32:05',
    actor: '系统',
    action: '评论抓取',
    method: 'GET',
    path: '/daraz/reviews/get',
    shop: 'Daraz LK',
    object: 'HSY000001001',
    httpStatus: 200,
    latencyMs: 1400,
    result: '成功',
    detail: '抓取 26 条，去重 26 条',
    syncTaskId: 'TASK-2026-10851',
    errorCode: '—',
  },
]

type SyncState = {
  tasks: SyncTask[]
  logs: IntegrationLog[]
}

const store = createDemoStore<SyncState>('open-shop.console.demo.sync.v1', {
  tasks: structuredClone(DEMO_TASKS),
  logs: structuredClone(DEMO_LOGS),
})

function mutate(updater: (state: SyncState) => SyncState) {
  store.set(updater(store.get()))
}

export function useSyncTasks() {
  return store.useStore().tasks
}

export function useIntegrationLogs() {
  return store.useStore().logs
}

export function getSyncTasks() {
  return store.get().tasks
}

export function getIntegrationLogs() {
  return store.get().logs
}

export function getSyncTask(id: string) {
  return store.get().tasks.find((item) => item.id === id)
}

export function getIntegrationLog(id: string) {
  return store.get().logs.find((item) => item.id === id || item.requestId === id)
}

export function getLogsByRequestId(requestId: string) {
  return store.get().logs.filter((item) => item.requestId === requestId)
}

export function getLogsBySyncTask(taskId: string) {
  return store.get().logs.filter((item) => item.syncTaskId === taskId)
}

export function countSyncTasksByStatus(tasks: SyncTask[]) {
  const counts = { 成功: 0, 失败: 0, 部分失败: 0, 排队: 0, 其他: 0 }
  for (const task of tasks) {
    if (task.status === '成功') counts.成功 += 1
    else if (task.status === '失败') counts.失败 += 1
    else if (task.status === '部分失败') counts.部分失败 += 1
    else if (task.status === '排队' || task.status === '排队重试' || task.status === '运行中') counts.排队 += 1
    else counts.其他 += 1
  }
  return counts
}

export function countLogsByResult(logs: IntegrationLog[]) {
  const counts = { 成功: 0, 失败: 0, 未连接: 0, 其他: 0 }
  for (const log of logs) {
    if (log.result === '成功') counts.成功 += 1
    else if (log.result === '失败') counts.失败 += 1
    else if (log.result === '未连接') counts.未连接 += 1
    else counts.其他 += 1
  }
  return counts
}

/** 原型重试：更新任务状态与重试次数，并追加一条排队日志（不调用平台） */
export function retrySyncTask(
  id: string,
): { ok: true; task: SyncTask } | { ok: false; reason: string } {
  const state = store.get()
  const task = state.tasks.find((item) => item.id === id)
  if (!task) return { ok: false, reason: '同步任务不存在' }
  if (task.status === '成功') return { ok: false, reason: '已成功的任务无需重试' }
  if (task.status === '排队' || task.status === '排队重试' || task.status === '运行中') {
    return { ok: false, reason: '任务已在排队或运行中' }
  }

  const requestId = `req_retry_${Date.now().toString(36)}`
  const updated: SyncTask = {
    ...task,
    status: '排队重试',
    retries: task.retries + 1,
    error: '—',
    lastRun: nowStamp(),
    requestId,
    progress: `0 / ${task.progressTotal}`,
    progressDone: 0,
  }

  const log: IntegrationLog = {
    id: `ilog-retry-${Date.now().toString(36)}`,
    requestId,
    at: nowStamp(),
    actor: '当前用户',
    action: `${task.type} · 重试`,
    method: 'POST',
    path: '/prototype/retry',
    shop: task.shop,
    object: task.id,
    httpStatus: 0,
    latencyMs: 0,
    result: '重试已排队',
    detail: '原型重试：未调用真实平台 connector',
    syncTaskId: task.id,
    errorCode: '—',
  }

  mutate((current) => ({
    tasks: current.tasks.map((item) => (item.id === id ? updated : item)),
    logs: [log, ...current.logs],
  }))
  return { ok: true, task: updated }
}

export function retryIntegrationLog(
  logId: string,
): { ok: true; log: IntegrationLog; task?: SyncTask } | { ok: false; reason: string } {
  const state = store.get()
  const log = state.logs.find((item) => item.id === logId)
  if (!log) return { ok: false, reason: '接口日志不存在' }
  if (log.result === '成功') return { ok: false, reason: '成功日志无需重试' }

  if (log.syncTaskId) {
    const result = retrySyncTask(log.syncTaskId)
    if (!result.ok) return result
    return { ok: true, log, task: result.task }
  }

  const updated: IntegrationLog = {
    ...log,
    result: '重试已排队',
    detail: '原型重试动作；未调用连接器',
    at: nowStamp(),
  }
  mutate((current) => ({
    ...current,
    logs: current.logs.map((item) => (item.id === logId ? updated : item)),
  }))
  return { ok: true, log: updated }
}

export function toSyncTaskListRow(task: SyncTask) {
  return { ...task }
}

export function toIntegrationLogListRow(log: IntegrationLog) {
  return { ...log }
}

export function toRelatedSyncTaskShape(task: SyncTask): Record<string, unknown> {
  return {
    id: task.id,
    type: task.type,
    target: task.target,
    shop: task.shop,
    progress: task.progress,
    error: task.error,
    retries: task.retries,
    lastRun: task.lastRun,
    status: task.status,
    requestId: task.requestId,
  }
}

export function toRelatedIntegrationLogShape(log: IntegrationLog): Record<string, unknown> {
  return {
    id: log.id,
    at: log.at,
    actor: log.actor,
    action: log.action,
    object: log.object,
    result: log.result,
    detail: log.detail,
    requestId: log.requestId,
    shop: log.shop,
    syncTaskId: log.syncTaskId,
    method: log.method,
    path: log.path,
    httpStatus: log.httpStatus,
    latencyMs: log.latencyMs,
    errorCode: log.errorCode,
  }
}
