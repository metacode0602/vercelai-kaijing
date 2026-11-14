import { randomUUID } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { listings, pendingActions, type AppDatabase } from "@workspace/db"
import { assertMcpWriteAllowed, type DomainActor } from "./actor"
import { actorName, recordMcpAudit } from "./audit"
import { ConflictError, DomainError, NotFoundError } from "./errors"
import { requireDesktopShop } from "./shops"

const PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** 解析客户端传入的乐观锁时间戳；未传返回 null，格式非法抛 validation_error。 */
function parseExpectedUpdatedAt(value: string | undefined): Date | null {
  if (value === undefined) return null
  const ts = Date.parse(value)
  if (Number.isNaN(ts)) throw new DomainError("validation_error", "expectedUpdatedAt 不是合法的 ISO 8601 时间")
  return new Date(ts)
}

export type PendingWriteResult = {
  id: string
  kind: string
  status: string
  shopId: string | null
  listingId: string | null
  title: string
  confirmPath: "/console/pending"
  message: string
  reused: boolean
}

function readPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

async function loadListing(db: AppDatabase, organizationId: string, listingId: string) {
  const [row] = await db
    .select()
    .from(listings)
    .where(and(eq(listings.organizationId, organizationId), eq(listings.id, listingId)))
    .limit(1)
  if (!row) throw new NotFoundError("刊登不存在")
  return row
}

async function findByIdempotency(db: AppDatabase, organizationId: string, idempotencyKey: string) {
  const [row] = await db
    .select()
    .from(pendingActions)
    .where(
      and(eq(pendingActions.organizationId, organizationId), eq(pendingActions.idempotencyKey, idempotencyKey)),
    )
    .limit(1)
  return row ?? null
}

function toResult(
  row: typeof pendingActions.$inferSelect,
  message: string,
  reused: boolean,
): PendingWriteResult {
  const payload = readPayload(row.payload)
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    shopId: row.shopId,
    listingId: typeof payload.listingId === "string" ? payload.listingId : null,
    title: row.title,
    confirmPath: "/console/pending",
    message,
    reused,
  }
}

/**
 * 只创建改价待审，不修改刊登售价，也不入队同步。
 */
export async function createPriceChangePending(
  db: AppDatabase,
  actor: DomainActor,
  input: {
    listingId: string
    shopId?: string
    priceAmount: number
    currency?: string
    idempotencyKey?: string
    expectedUpdatedAt?: string
  },
): Promise<PendingWriteResult> {
  if (!(input.priceAmount > 0)) throw new DomainError("validation_error", "售价必须大于 0")

  const listing = await loadListing(db, actor.organizationId, input.listingId)
  const shopId = input.shopId?.trim() || listing.shopId
  if (input.shopId?.trim() && input.shopId.trim() !== listing.shopId) {
    throw new DomainError("validation_error", "店铺与刊登不匹配")
  }
  await requireDesktopShop(db, actor.organizationId, shopId)

  const expected = parseExpectedUpdatedAt(input.expectedUpdatedAt)
  const now = new Date()
  const idempotencyKey =
    input.idempotencyKey?.trim() || `mcp:price_change:${listing.id}:${input.priceAmount}:${input.currency ?? ""}`
  const existing = await findByIdempotency(db, actor.organizationId, idempotencyKey)
  if (existing) {
    if (expected && existing.updatedAt.getTime() !== expected.getTime()) {
      throw new ConflictError("已存在的改价待审在你读取后被修改，请刷新后重试", existing.id)
    }
    return toResult(existing, "已存在相同改价待审，未重复创建，也未改动刊登售价。", true)
  }

  const id = randomUUID()
  await db.insert(pendingActions).values({
    id,
    organizationId: actor.organizationId,
    shopId,
    kind: "price_change",
    status: "pending",
    title: `改价：${listing.listingTitle || listing.title || listing.id}`,
    payload: {
      listingId: listing.id,
      shopId,
      priceAmount: input.priceAmount,
      sellPrice: input.priceAmount,
      currency: input.currency ?? listing.priceCurrency ?? undefined,
      previousPrice: listing.priceAmount,
      source: "mcp",
    },
    idempotencyKey,
    createdBy: actorName(actor),
    expiresAt: new Date(now.getTime() + PENDING_TTL_MS),
    updatedAt: now,
  })
  const row = await findByIdempotency(db, actor.organizationId, idempotencyKey)
  if (!row) throw new Error("创建改价待审失败")
  await recordMcpAudit(db, actor, {
    action: "mcp.pending.create_price_change",
    entityType: "pending_action",
    entityId: row.id,
    after: { kind: "price_change", listingId: listing.id, priceAmount: input.priceAmount },
    detail: "只创建待审，未改刊登售价，未入队同步。",
  })
  return toResult(row, "已创建改价待审。刊登售价尚未更改，请到 /console/pending 确认后才会写回平台。", false)
}

/**
 * 只创建库存推送待审，不改可售库存，也不入队同步。
 */
export async function createInventoryPushPending(
  db: AppDatabase,
  actor: DomainActor,
  input: {
    listingId: string
    shopId?: string
    qty: number
    idempotencyKey?: string
    expectedUpdatedAt?: string
  },
): Promise<PendingWriteResult> {
  if (!Number.isFinite(input.qty) || input.qty < 0) throw new DomainError("validation_error", "库存数量不能为负数")

  const listing = await loadListing(db, actor.organizationId, input.listingId)
  const shopId = input.shopId?.trim() || listing.shopId
  if (input.shopId?.trim() && input.shopId.trim() !== listing.shopId) {
    throw new DomainError("validation_error", "店铺与刊登不匹配")
  }
  await requireDesktopShop(db, actor.organizationId, shopId)

  const expected = parseExpectedUpdatedAt(input.expectedUpdatedAt)
  const now = new Date()
  const idempotencyKey = input.idempotencyKey?.trim() || `mcp:inventory_push:${listing.id}:${input.qty}`
  const existing = await findByIdempotency(db, actor.organizationId, idempotencyKey)
  if (existing) {
    if (expected && existing.updatedAt.getTime() !== expected.getTime()) {
      throw new ConflictError("已存在的库存推送待审在你读取后被修改，请刷新后重试", existing.id)
    }
    return toResult(existing, "已存在相同库存推送待审，未重复创建，也未向平台推送库存。", true)
  }

  const id = randomUUID()
  await db.insert(pendingActions).values({
    id,
    organizationId: actor.organizationId,
    shopId,
    kind: "inventory_push",
    status: "pending",
    title: `库存推送：${listing.listingTitle || listing.title || listing.id}`,
    payload: {
      listingId: listing.id,
      shopId,
      qty: input.qty,
      source: "mcp",
    },
    idempotencyKey,
    createdBy: actorName(actor),
    expiresAt: new Date(now.getTime() + PENDING_TTL_MS),
    updatedAt: now,
  })
  const row = await findByIdempotency(db, actor.organizationId, idempotencyKey)
  if (!row) throw new Error("创建库存推送待审失败")
  await recordMcpAudit(db, actor, {
    action: "mcp.pending.create_inventory_push",
    entityType: "pending_action",
    entityId: row.id,
    after: { kind: "inventory_push", listingId: listing.id, qty: input.qty },
    detail: "只创建待审，未向平台推送库存。",
  })
  return toResult(row, "已创建库存推送待审。尚未向平台推送，请到 /console/pending 确认。", false)
}

export type CompleteListingSubmitInput = {
  pendingId: string
  shopId?: string
  sku?: string
  sellerSku?: string
  title?: string
  sellPrice?: number
  currency?: string
  brandName?: string
  categoryPath?: string
  categoryExternalId?: string
  note?: string
  color?: string
  size?: string
  warehouseCode?: string
  logisticsChannel?: string
  expectedUpdatedAt?: string
}

/**
 * 补全 listing_submit 待审 payload，不确认、不发布。
 */
export async function completeListingSubmitPending(
  db: AppDatabase,
  actor: DomainActor,
  input: CompleteListingSubmitInput,
): Promise<PendingWriteResult> {
  const [row] = await db
    .select()
    .from(pendingActions)
    .where(
      and(eq(pendingActions.organizationId, actor.organizationId), eq(pendingActions.id, input.pendingId)),
    )
    .limit(1)
  if (!row) throw new NotFoundError("待审单不存在")
  if (row.kind !== "listing_submit") throw new DomainError("validation_error", "仅刊登提交待审单可补全")
  if (row.status !== "pending") throw new DomainError("validation_error", "当前状态不可补全")
  if (row.shopId) await requireDesktopShop(db, actor.organizationId, row.shopId)

  const expected = parseExpectedUpdatedAt(input.expectedUpdatedAt)
  const payload = readPayload(row.payload)
  const patch: Record<string, unknown> = { ...payload }
  const fields: Array<keyof CompleteListingSubmitInput> = [
    "shopId",
    "sku",
    "sellerSku",
    "title",
    "currency",
    "brandName",
    "categoryPath",
    "categoryExternalId",
    "note",
    "color",
    "size",
    "warehouseCode",
    "logisticsChannel",
  ]
  for (const key of fields) {
    const value = input[key]
    if (typeof value === "string" && value.trim()) patch[key] = value.trim()
  }
  if (input.sellPrice != null) {
    if (!(input.sellPrice > 0)) throw new DomainError("validation_error", "售价必须大于 0")
    patch.sellPrice = input.sellPrice
  }
  const now = new Date()
  const conditions = [
    eq(pendingActions.organizationId, actor.organizationId),
    eq(pendingActions.id, row.id),
  ]
  if (expected) conditions.push(eq(pendingActions.updatedAt, expected))
  const updatedRows = await db
    .update(pendingActions)
    .set({ payload: patch, updatedAt: now })
    .where(and(...conditions))
    .returning({ id: pendingActions.id })
  if (expected && updatedRows.length === 0) {
    throw new ConflictError("待审单已被他人修改（expectedUpdatedAt 不一致），请刷新后重试", row.id)
  }
  const updated = await findByIdempotency(db, actor.organizationId, row.idempotencyKey)
  if (!updated) throw new Error("补全待审失败")
  await recordMcpAudit(db, actor, {
    action: "mcp.pending.complete_listing_submit",
    entityType: "pending_action",
    entityId: updated.id,
    after: { kind: updated.kind, status: updated.status },
    detail: "仅补全 payload，未确认、未发布。",
  })
  return toResult(updated, "已补全刊登提交待审，尚未确认，也不会发布到平台。请到 /console/pending 确认。", false)
}

/** 测试与守卫：MCP 不得直接执行这些动作。 */
export function denyDirectPlatformWrite(actor: DomainActor, action: string): never {
  assertMcpWriteAllowed(actor, action)
  throw new Error(`MCP 通道禁止直接执行 ${action}`)
}
