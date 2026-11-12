import { randomUUID } from "node:crypto"
import { and, desc, eq, inArray, or } from "drizzle-orm"
import { pricingSuggestionDrafts, productVariants, type AppDatabase } from "@workspace/db"
import type { DomainActor } from "./actor"
import { actorName, recordMcpAudit } from "./audit"
import { assertDesktopMarketplaceScope } from "./desktop-scope"
import { NotFoundError } from "./errors"

export type PricingDraftSaveResult = {
  id: string
  sku: string
  variantId: string
  platform: string
  site: string
  versionNo: number
  status: "current"
  suggestedRetail: number
  suggestedFreeShipping: number | null
  currency: string
  listingPriceChanged: false
  message: string
}

/**
 * 只保存建议价草稿。不改刊登售价，不发布，不入队改价同步。
 */
export async function savePricingSuggestionDraft(
  db: AppDatabase,
  actor: DomainActor,
  input: {
    sku: string
    suggestedRetail: number
    suggestedFreeShipping?: number
    currency: string
    platform?: string
    site?: string
    isEstimate?: boolean
    snapshot?: Record<string, unknown>
  },
): Promise<PricingDraftSaveResult> {
  const scope = assertDesktopMarketplaceScope({ platform: input.platform, site: input.site })
  if (!(input.suggestedRetail > 0)) throw new Error("建议零售价无效，无法保存草稿")
  const sku = input.sku.trim()
  if (!sku) throw new Error("请填写内部 SKU")
  const currency = input.currency.trim().toUpperCase()
  if (!currency) throw new Error("请填写币种")

  const [variant] = await db
    .select()
    .from(productVariants)
    .where(
      and(
        eq(productVariants.organizationId, actor.organizationId),
        or(eq(productVariants.skuCode, sku), eq(productVariants.sku, sku))!,
      ),
    )
    .limit(1)
  if (!variant) throw new NotFoundError(`未找到 SKU ${sku}`)

  const existing = await db
    .select({
      id: pricingSuggestionDrafts.id,
      versionNo: pricingSuggestionDrafts.versionNo,
      status: pricingSuggestionDrafts.status,
    })
    .from(pricingSuggestionDrafts)
    .where(
      and(
        eq(pricingSuggestionDrafts.organizationId, actor.organizationId),
        eq(pricingSuggestionDrafts.variantId, variant.id),
        eq(pricingSuggestionDrafts.platform, scope.platform),
        eq(pricingSuggestionDrafts.site, scope.site),
      ),
    )
    .orderBy(desc(pricingSuggestionDrafts.versionNo))
  const currentIds = existing.filter((row) => row.status === "current").map((row) => row.id)
  const nextVersionNo = (existing[0]?.versionNo ?? 0) + 1
  const id = randomUUID()
  const now = new Date()
  await db.transaction(async (tx) => {
    if (currentIds.length) {
      await tx
        .update(pricingSuggestionDrafts)
        .set({ status: "superseded", updatedAt: now })
        .where(
          and(eq(pricingSuggestionDrafts.organizationId, actor.organizationId), inArray(pricingSuggestionDrafts.id, currentIds)),
        )
    }
    await tx.insert(pricingSuggestionDrafts).values({
      id,
      organizationId: actor.organizationId,
      variantId: variant.id,
      sku: variant.skuCode || variant.sku,
      platform: scope.platform,
      site: scope.site,
      versionNo: nextVersionNo,
      status: "current",
      suggestedRetail: String(input.suggestedRetail),
      suggestedFreeShipping:
        input.suggestedFreeShipping != null ? String(input.suggestedFreeShipping) : null,
      currency,
      isEstimate: Boolean(input.isEstimate),
      snapshot: { ...(input.snapshot ?? {}), source: "mcp" },
      source: "mcp",
      createdBy: actorName(actor),
    })
  })

  await recordMcpAudit(db, actor, {
    action: "mcp.pricing.save_draft",
    entityType: "pricing_suggestion_draft",
    entityId: id,
    after: {
      sku: variant.skuCode || variant.sku,
      platform: scope.platform,
      site: scope.site,
      versionNo: nextVersionNo,
      suggestedRetail: input.suggestedRetail,
      currency,
    },
    detail: "仅保存建议草稿，未改刊登售价，未入队改价同步。",
  })
  return {
    id,
    sku: variant.skuCode || variant.sku,
    variantId: variant.id,
    platform: scope.platform,
    site: scope.site,
    versionNo: nextVersionNo,
    status: "current",
    suggestedRetail: input.suggestedRetail,
    suggestedFreeShipping: input.suggestedFreeShipping ?? null,
    currency,
    listingPriceChanged: false,
    message: "已保存定价建议草稿，未改刊登售价，也未向平台回写。",
  }
}
