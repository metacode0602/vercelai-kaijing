import { randomUUID } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { listings, pendingActions, type AppDatabase } from "@workspace/db"
import { assertMcpWriteAllowed, type DomainActor } from "./actor"
import { NotFoundError } from "./errors"
import { requireDesktopShop } from "./shops"

const PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000

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

function actorName(actor: DomainActor): string {
  return actor.userId?.trim() || (actor.clientId ? `mcp:${actor.clientId}` : "mcp")
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
  },
): Promise<PendingWriteResult> {
  assertMcpWriteAllowed(actor, "listings.updateLivePrice")
  assertMcpWriteAllowed(actor, "sync.enqueue.price")
  assertMcpWriteAllowed(actor, "pending.confirm")
  if (!(input.priceAmount > 0)) throw new Error("售价必须大于 0")

  const listing = await loadListing(db, actor.organizationId, input.listingId)
  const shopId = input.shopId?.trim() || listing.shopId
  if (input.shopId?.trim() && input.shopId.trim() !== listing.shopId) {
    throw new Error("店铺与刊登不匹配")
  }
  await requireDesktopShop(db, actor.organizationId, shopId)

  const now = new Date()
  const idempotencyKey =
    input.idempotencyKey?.trim() || `mcp:price_change:${listing.id}:${input.priceAmount}:${input.currency ?? ""}`
  const existing = await findByIdempotency(db, actor.organizationId, idempotencyKey)
  if (existing) {
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
  },
): Promise<PendingWriteResult> {
  assertMcpWriteAllowed(actor, "sync.enqueue.inventory")
  assertMcpWriteAllowed(actor, "pending.confirm")
  if (!Number.isFinite(input.qty) || input.qty < 0) throw new Error("库存数量不能为负数")

  const listing = await loadListing(db, actor.organizationId, input.listingId)
  const shopId = input.shopId?.trim() || listing.shopId
  if (input.shopId?.trim() && input.shopId.trim() !== listing.shopId) {
    throw new Error("店铺与刊登不匹配")
  }
  await requireDesktopShop(db, actor.organizationId, shopId)

  const now = new Date()
  const idempotencyKey = input.idempotencyKey?.trim() || `mcp:inventory_push:${listing.id}:${input.qty}`
  const existing = await findByIdempotency(db, actor.organizationId, idempotencyKey)
  if (existing) {
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
}

/**
 * 补全 listing_submit 待审 payload，不确认、不发布。
 */
export async function completeListingSubmitPending(
  db: AppDatabase,
  actor: DomainActor,
  input: CompleteListingSubmitInput,
): Promise<PendingWriteResult> {
  assertMcpWriteAllowed(actor, "listings.publish")
  assertMcpWriteAllowed(actor, "pending.confirm")
  const [row] = await db
    .select()
    .from(pendingActions)
    .where(
      and(eq(pendingActions.organizationId, actor.organizationId), eq(pendingActions.id, input.pendingId)),
    )
    .limit(1)
  if (!row) throw new NotFoundError("待审单不存在")
  if (row.kind !== "listing_submit") throw new Error("仅刊登提交待审单可补全")
  if (row.status !== "pending") throw new Error("当前状态不可补全")
  if (row.shopId) await requireDesktopShop(db, actor.organizationId, row.shopId)

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
    if (!(input.sellPrice > 0)) throw new Error("售价必须大于 0")
    patch.sellPrice = input.sellPrice
  }
  const now = new Date()
  await db
    .update(pendingActions)
    .set({ payload: patch, updatedAt: now })
    .where(and(eq(pendingActions.organizationId, actor.organizationId), eq(pendingActions.id, row.id)))
  const updated = await findByIdempotency(db, actor.organizationId, row.idempotencyKey)
  if (!updated) throw new Error("补全待审失败")
  return toResult(updated, "已补全刊登提交待审，尚未确认，也不会发布到平台。请到 /console/pending 确认。", false)
}

/** 测试与守卫：MCP 不得直接执行这些动作。 */
export function denyDirectPlatformWrite(actor: DomainActor, action: string): never {
  assertMcpWriteAllowed(actor, action)
  throw new Error(`MCP 通道禁止直接执行 ${action}`)
}
