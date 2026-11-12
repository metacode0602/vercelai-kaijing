import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { syncJobRuns, syncTasks, type AppDatabase } from "@workspace/db"
import type { DomainActor } from "./actor"
import { recordMcpAudit, actorName } from "./audit"
import { requireDesktopShop } from "./shops"

/** 允许 MCP 请求的读同步（DB type）。 */
export const MCP_READ_SYNC_TYPES = [
  "orders",
  "listings",
  "settlements",
  "logistics",
  "reviews",
  "returns",
] as const

export type McpReadSyncType = (typeof MCP_READ_SYNC_TYPES)[number]

/** 会绕过待审直接写平台，MCP 一律拒绝。 */
export const MCP_FORBIDDEN_SYNC_TYPES = [
  "inventory",
  "price",
  "publish",
  "status",
  "ship_batch",
] as const

const TYPE_ALIASES: Record<string, string> = {
  orders: "orders",
  订单同步: "orders",
  listings: "listings",
  刊登同步: "listings",
  刊登拉取: "listings",
  settlements: "settlements",
  finance: "settlements",
  结算同步: "settlements",
  logistics: "logistics",
  物流同步: "logistics",
  reviews: "reviews",
  评论抓取: "reviews",
  评论同步: "reviews",
  returns: "returns",
  退货同步: "returns",
  inventory: "inventory",
  库存同步: "inventory",
  库存推送: "inventory",
  price: "price",
  价格同步: "price",
  改价回写: "price",
  publish: "publish",
  发布刊登: "publish",
  status: "status",
  状态同步: "status",
  ship_batch: "ship_batch",
  物流交运: "ship_batch",
}

export const WRITE_SYNC_REFUSAL =
  "库存推送、改价回写、发布刊登或刊登状态同步会直接写平台，不能通过 MCP 入队。请创建待审，由运营在 /console/pending 确认后再执行。"

export const SHIP_BATCH_REFUSAL = "物流交运不在本期工作台开放，且会触发平台写入，已拒绝。"

export const RETURNS_UNWIRED = "平台售后列表 OpenAPI 未接线，禁止伪同步。"

export function normalizeSyncRequestType(raw?: string | null): string {
  const key = raw?.trim() ?? ""
  if (!key) throw new Error("请指定同步类型")
  return TYPE_ALIASES[key] ?? TYPE_ALIASES[key.toLowerCase()] ?? key.toLowerCase()
}

export function isForbiddenWriteSyncType(type: string): boolean {
  return (MCP_FORBIDDEN_SYNC_TYPES as readonly string[]).includes(type)
}

export function isReadSyncType(type: string): type is McpReadSyncType {
  return (MCP_READ_SYNC_TYPES as readonly string[]).includes(type)
}

export function assertMcpReadSyncType(type: string): McpReadSyncType {
  if (type === "ship_batch") throw new Error(SHIP_BATCH_REFUSAL)
  if (isForbiddenWriteSyncType(type)) throw new Error(WRITE_SYNC_REFUSAL)
  if (!isReadSyncType(type)) {
    throw new Error(`不支持的同步类型：${type}。本期仅允许订单、刊登拉取、结算、物流轨迹、评论等读同步。`)
  }
  return type
}

async function nextTaskNo(db: AppDatabase, organizationId: string): Promise<string> {
  const year = new Date().getFullYear()
  const rows = await db
    .select({ taskNo: syncTasks.taskNo })
    .from(syncTasks)
    .where(eq(syncTasks.organizationId, organizationId))
  let max = 0
  const re = new RegExp(`^TASK-${year}-(\\d+)$`)
  for (const row of rows) {
    const match = re.exec(row.taskNo)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return `TASK-${year}-${String(max + 1).padStart(5, "0")}`
}

export type ReadSyncRequestResult = {
  id: string
  taskNo: string
  type: string
  status: string
  shopId: string
  requestId: string
  error: string | null
  shouldTrigger: boolean
  resource: "orders" | "listings" | "settlements" | "logistics" | "reviews" | null
  message: string
}

const RESOURCE_BY_TYPE: Record<Exclude<McpReadSyncType, "returns">, NonNullable<ReadSyncRequestResult["resource"]>> = {
  orders: "orders",
  listings: "listings",
  settlements: "settlements",
  logistics: "logistics",
  reviews: "reviews",
}

/**
 * 仅入队读同步。禁止 inventory/price/publish/status/ship_batch。
 * 退货同步如实记为失败，不假装已拉取。
 */
export async function requestReadSync(
  db: AppDatabase,
  actor: DomainActor,
  input: { type: string; shopId: string; target?: string; note?: string },
): Promise<ReadSyncRequestResult> {
  const type = assertMcpReadSyncType(normalizeSyncRequestType(input.type))
  const shop = await requireDesktopShop(db, actor.organizationId, input.shopId)
  const now = new Date()
  const id = randomUUID()
  const requestId = `req_${id.replace(/-/g, "").slice(0, 12)}`
  const taskNo = await nextTaskNo(db, actor.organizationId)
  const returnsFailed = type === "returns"
  await db.insert(syncTasks).values({
    id,
    organizationId: actor.organizationId,
    shopId: shop.id,
    taskNo,
    type,
    target: input.target?.trim() || shop.name,
    status: returnsFailed ? "failed" : "queued",
    progressDone: 0,
    progressTotal: 1,
    retries: 0,
    requestId,
    enqueuedAt: now,
    lastRunAt: now,
    finishedAt: returnsFailed ? now : null,
    error: returnsFailed ? RETURNS_UNWIRED : null,
    note: returnsFailed
      ? RETURNS_UNWIRED
      : input.note?.trim() || "MCP 读同步已入队，复用现有 connector，不在 MCP 内另写一套平台调用。",
    raw: { source: "mcp_read_sync" },
  })
  await db.insert(syncJobRuns).values({
    id: randomUUID(),
    organizationId: actor.organizationId,
    syncTaskId: id,
    runNo: 1,
    status: returnsFailed ? "failed" : "queued",
    requestId,
    message: returnsFailed ? RETURNS_UNWIRED : "已入队，等待读同步",
    detail: returnsFailed ? RETURNS_UNWIRED : "将调用现有 apps/api marketplace connector。",
    actor: actorName(actor),
    startedAt: now,
    finishedAt: returnsFailed ? now : null,
    createdAt: now,
  })
  const result: ReadSyncRequestResult = {
    id,
    taskNo,
    type,
    status: returnsFailed ? "failed" : "queued",
    shopId: shop.id,
    requestId,
    error: returnsFailed ? RETURNS_UNWIRED : null,
    shouldTrigger: !returnsFailed,
    resource: returnsFailed ? null : RESOURCE_BY_TYPE[type],
    message: returnsFailed
      ? RETURNS_UNWIRED
      : "已创建读同步任务。不会入队库存/改价/发布等写同步。",
  }
  await recordMcpAudit(db, actor, {
    action: "mcp.sync.request",
    entityType: "sync_task",
    entityId: id,
    after: { type, status: result.status, shopId: shop.id },
    result: returnsFailed ? "failed" : "queued",
    detail: result.message,
  })
  return result
}
