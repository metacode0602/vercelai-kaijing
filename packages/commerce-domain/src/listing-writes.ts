import { randomUUID } from "node:crypto"
import { and, eq, like, or } from "drizzle-orm"
import {
  listings,
  pendingActions,
  products,
  productVariants,
  sellerSkuMappings,
  type AppDatabase,
} from "@workspace/db"
import type { DomainActor } from "./actor"
import { actorName, recordMcpAudit } from "./audit"
import { NotFoundError } from "./errors"
import { requireDesktopShop } from "./shops"

const PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000

export type ListingDraftResult = {
  id: string
  shopId: string
  status: "draft"
  publishState: "unpublished"
  title: string
  sellerSku: string
  sku: string
  pendingId?: string | null
  confirmPath: "/console/pending"
  message: string
}

async function resolveVariant(db: AppDatabase, organizationId: string, sku: string) {
  const code = sku.trim()
  const [row] = await db
    .select({ variant: productVariants, product: products })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(
      and(
        eq(productVariants.organizationId, organizationId),
        eq(products.organizationId, organizationId),
        or(eq(productVariants.skuCode, code), eq(productVariants.sku, code))!,
      ),
    )
    .limit(1)
  if (!row) throw new NotFoundError(`未找到内部 SKU ${code}`)
  return row
}

/**
 * 仅创建本地刊登草稿，强制 unpublished，不发布、不入队同步。
 */
export async function createListingDraft(
  db: AppDatabase,
  actor: DomainActor,
  input: {
    shopId: string
    sku: string
    sellerSku: string
    title: string
    sellPrice: number
    currency?: string
    brandName?: string
    categoryPath?: string
    categoryExternalId?: string
    warehouseCode?: string
    logisticsChannel?: string
    color?: string
    size?: string
    note?: string
  },
): Promise<ListingDraftResult> {
  if (!input.sku.trim()) throw new Error("请选择内部 SKU")
  if (!input.sellerSku.trim()) throw new Error("请填写 Seller SKU")
  if (!input.title.trim()) throw new Error("请填写刊登标题")
  if (!(input.sellPrice > 0)) throw new Error("售价必须大于 0")
  const shop = await requireDesktopShop(db, actor.organizationId, input.shopId)
  const { variant, product } = await resolveVariant(db, actor.organizationId, input.sku)
  const sellerSku = input.sellerSku.trim()
  const [dup] = await db
    .select({ id: sellerSkuMappings.id })
    .from(sellerSkuMappings)
    .where(
      and(
        eq(sellerSkuMappings.organizationId, actor.organizationId),
        eq(sellerSkuMappings.shopId, shop.id),
        eq(sellerSkuMappings.sellerSku, sellerSku),
      ),
    )
    .limit(1)
  if (dup) throw new Error(`该店铺已存在 Seller SKU ${sellerSku}`)

  const id = randomUUID()
  await db.transaction(async (tx) => {
    await tx.insert(listings).values({
      id,
      organizationId: actor.organizationId,
      shopId: shop.id,
      productId: product.id,
      variantId: variant.id,
      primaryVariantId: variant.id,
      status: "draft",
      title: input.title.trim(),
      listingTitle: input.title.trim(),
      brandName: input.brandName?.trim() || product.brand || null,
      categoryPath: input.categoryPath?.trim() || product.categoryHint || null,
      categoryExternalId: input.categoryExternalId?.trim() || null,
      priceAmount: String(input.sellPrice),
      priceCurrency: input.currency?.trim() || shop.currency || "USD",
      stockOnHand: 0,
      warehouseCode: input.warehouseCode?.trim() || "DEFAULT",
      logisticsChannel: input.logisticsChannel?.trim() || null,
      publishState: "unpublished",
      payload: {
        note: input.note?.trim() || "",
        sellerSku,
        primarySku: variant.skuCode ?? variant.sku,
        spuCode: product.spuCode,
        shopName: shop.name,
        platform: shop.platform,
        site: shop.marketplaceCountry || shop.region,
        source: "mcp",
      },
      submittedAt: null,
      liveAt: null,
    })
    await tx.insert(sellerSkuMappings).values({
      id: randomUUID(),
      organizationId: actor.organizationId,
      shopId: shop.id,
      listingId: id,
      itemId: null,
      platformSkuId: null,
      sellerSku,
      variantId: variant.id,
      status: "pending",
      source: "listing",
      meta: {
        color: input.color?.trim() || "",
        size: input.size?.trim() || "",
        listingStatus: "草稿",
        site: shop.marketplaceCountry || shop.region || "",
        platform: shop.platform,
        internalSku: variant.skuCode ?? variant.sku,
        source: "mcp",
      },
    })
  })
  await recordMcpAudit(db, actor, {
    action: "mcp.listings.create_draft",
    entityType: "listing",
    entityId: id,
    after: { shopId: shop.id, status: "draft", publishState: "unpublished", sellerSku },
    detail: "仅本地草稿，未发布、未入队同步。",
  })
  return {
    id,
    shopId: shop.id,
    status: "draft",
    publishState: "unpublished",
    title: input.title.trim(),
    sellerSku,
    sku: variant.skuCode || variant.sku,
    confirmPath: "/console/pending",
    message: "已创建本地刊登草稿（未发布）。提交审核只会生成待审，不会直接发布到平台。",
  }
}

/**
 * 提交审核：只生成 listing_submit 待审，不发布、不入队同步。
 */
export async function submitListingForReview(
  db: AppDatabase,
  actor: DomainActor,
  input: { listingId: string },
): Promise<ListingDraftResult> {
  const [row] = await db
    .select()
    .from(listings)
    .where(and(eq(listings.organizationId, actor.organizationId), eq(listings.id, input.listingId)))
    .limit(1)
  if (!row) throw new NotFoundError("刊登不存在")
  const shop = await requireDesktopShop(db, actor.organizationId, row.shopId)
  if (row.status !== "draft" && row.status !== "failed") {
    throw new Error("仅草稿或失败状态的刊登可提交审核，已上架刊登不能通过本工具发布")
  }
  if (row.externalItemId) {
    // 已有平台 ID 的在售改价走 price_change 待审，这里仍允许失败重提草稿，但不得发布
  }
  const [dup] = await db
    .select({ id: pendingActions.id })
    .from(pendingActions)
    .where(
      and(
        eq(pendingActions.organizationId, actor.organizationId),
        eq(pendingActions.kind, "listing_submit"),
        eq(pendingActions.status, "pending"),
        like(pendingActions.idempotencyKey, `listing_submit:listing:${row.id}:%`),
      ),
    )
    .limit(1)
  if (dup) {
    return {
      id: row.id,
      shopId: shop.id,
      status: "draft",
      publishState: "unpublished",
      title: row.listingTitle || row.title || row.id,
      sellerSku: "",
      sku: "",
      pendingId: dup.id,
      confirmPath: "/console/pending",
      message: "该刊登已有待审单，请先在 /console/pending 处理。未重复提交，也未发布。",
    }
  }
  const now = new Date()
  const pendingId = randomUUID()
  await db.transaction(async (tx) => {
    await tx.insert(pendingActions).values({
      id: pendingId,
      organizationId: actor.organizationId,
      shopId: shop.id,
      kind: "listing_submit",
      status: "pending",
      title: `刊登提交：${row.listingTitle || row.title || row.id}`,
      payload: { mode: "link", listingId: row.id, source: "mcp" },
      idempotencyKey: `listing_submit:listing:${row.id}:${now.getTime()}`,
      createdBy: actorName(actor),
      expiresAt: new Date(now.getTime() + PENDING_TTL_MS),
      updatedAt: now,
    })
    await tx
      .update(listings)
      .set({
        status: "pending_review",
        publishState: "pending_sync",
        updatedAt: now,
      })
      .where(and(eq(listings.id, row.id), eq(listings.organizationId, actor.organizationId)))
  })
  await recordMcpAudit(db, actor, {
    action: "mcp.listings.submit_for_review",
    entityType: "listing",
    entityId: row.id,
    after: { pendingId, status: "pending_review", publishState: "pending_sync" },
    detail: "已生成 listing_submit 待审，未发布、未入队同步。",
  })
  return {
    id: row.id,
    shopId: shop.id,
    status: "draft",
    publishState: "unpublished",
    title: row.listingTitle || row.title || row.id,
    sellerSku: "",
    sku: "",
    pendingId,
    confirmPath: "/console/pending",
    message: "已提交审核并生成待审单。刊登尚未发布到平台，请到 /console/pending 确认。",
  }
}
