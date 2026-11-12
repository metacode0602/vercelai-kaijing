import { randomUUID } from "node:crypto"
import { and, eq, sql } from "drizzle-orm"
import { pendingActions, productCandidates, products, type AppDatabase } from "@workspace/db"
import type { DomainActor } from "./actor"
import { actorName, recordMcpAudit } from "./audit"
import { NotFoundError } from "./errors"

const PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000
const SOURCING_KIND = "sourcing_upsert"

export type CandidateWriteResult = {
  id: string
  status: string
  title: string
  pendingId: string | null
  productId: string | null
  listingSubmitPendingId?: string | null
  confirmPath: "/console/pending"
  message: string
}

function readRationale(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

async function loadCandidate(db: AppDatabase, organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(productCandidates)
    .where(and(eq(productCandidates.organizationId, organizationId), eq(productCandidates.id, id)))
    .limit(1)
  if (!row) throw new NotFoundError("候选不存在")
  return row
}

async function nextSpuCode(db: AppDatabase, organizationId: string): Promise<string> {
  const [row] = await db
    .select({
      maxNum: sql<number>`coalesce(max(nullif(regexp_replace(${products.spuCode}, '^HSY', ''), '')::int), 0)`,
    })
    .from(products)
    .where(eq(products.organizationId, organizationId))
  return `HSY${String(Number(row?.maxNum ?? 0) + 1).padStart(6, "0")}`
}

export async function createCandidatePending(
  db: AppDatabase,
  actor: DomainActor,
  input: {
    title: string
    url?: string
    categoryHint?: string
    score?: number
    source?: string
    currency?: string
    landedCost?: number
    suggestPrice?: number
    marginPct?: number
    goNoGo?: string
    competition?: string
    marketPotential?: string
    risk?: string
  },
): Promise<CandidateWriteResult> {
  const title = input.title.trim()
  if (!title) throw new Error("请填写候选标题")
  const source = (input.source?.trim() || "manual").toLowerCase()
  if (!["manual", "import", "sourcing"].includes(source)) {
    throw new Error("来源只能是 manual、import 或 sourcing，且不会假装爬虫已成功")
  }
  const id = randomUUID()
  const actionId = randomUUID()
  const now = new Date()
  const rationale = {
    currency: input.currency ?? "USD",
    landedCost: input.landedCost ?? 0,
    suggestPrice: input.suggestPrice ?? 0,
    marginPct: input.marginPct ?? 0,
    goNoGo: input.goNoGo ?? "HOLD",
    competition: input.competition ?? "",
    marketPotential: input.marketPotential ?? "",
    risk: input.risk ?? "",
    evidenceLabel:
      source === "manual" ? "手工录入 · 非爬虫" : source === "import" ? "批量导入 · 非爬虫" : "寻源备注 · 未接市场爬虫",
    evidenceStatus: "manual",
  }
  await db.transaction(async (tx) => {
    await tx.insert(pendingActions).values({
      id: actionId,
      organizationId: actor.organizationId,
      kind: SOURCING_KIND,
      status: "pending",
      title: `选品入库 · ${title}`,
      payload: { candidateId: id, source, title },
      idempotencyKey: `sourcing_upsert:candidate:${id}`,
      createdBy: actorName(actor),
      expiresAt: new Date(now.getTime() + PENDING_TTL_MS),
      updatedAt: now,
    })
    await tx.insert(productCandidates).values({
      id,
      organizationId: actor.organizationId,
      title,
      url: input.url?.trim() || null,
      categoryHint: input.categoryHint?.trim() || null,
      score: String(input.score ?? 0),
      rationale,
      status: "new",
      source,
      pendingActionId: actionId,
      createdAt: now,
      updatedAt: now,
    })
  })
  await recordMcpAudit(db, actor, {
    action: "mcp.candidates.create",
    entityType: "product_candidate",
    entityId: id,
    after: { title, source, pendingId: actionId, kind: SOURCING_KIND },
    detail: "已创建候选与 sourcing_upsert 待审，未发布。",
  })
  return {
    id,
    status: "new",
    title,
    pendingId: actionId,
    productId: null,
    confirmPath: "/console/pending",
    message: "已创建选品候选，待审 kind 为 sourcing_upsert。尚未入库商品，也未发布刊登。",
  }
}

export async function updateCandidateDraft(
  db: AppDatabase,
  actor: DomainActor,
  input: {
    id: string
    title?: string
    url?: string
    categoryHint?: string
    score?: number
    currency?: string
    landedCost?: number
    suggestPrice?: number
    marginPct?: number
    goNoGo?: string
  },
): Promise<CandidateWriteResult> {
  const existing = await loadCandidate(db, actor.organizationId, input.id)
  if (existing.status !== "new") throw new Error("仅待审候选可编辑")
  const prev = readRationale(existing.rationale)
  const rationale = { ...prev }
  if (input.currency != null) rationale.currency = input.currency
  if (input.landedCost != null) rationale.landedCost = input.landedCost
  if (input.suggestPrice != null) rationale.suggestPrice = input.suggestPrice
  if (input.marginPct != null) rationale.marginPct = input.marginPct
  if (input.goNoGo != null) rationale.goNoGo = input.goNoGo
  const now = new Date()
  const title = input.title?.trim() || existing.title
  await db
    .update(productCandidates)
    .set({
      title,
      url: input.url !== undefined ? input.url.trim() || null : existing.url,
      categoryHint: input.categoryHint !== undefined ? input.categoryHint.trim() || null : existing.categoryHint,
      score: input.score != null ? String(input.score) : existing.score,
      rationale,
      updatedAt: now,
    })
    .where(eq(productCandidates.id, existing.id))
  await recordMcpAudit(db, actor, {
    action: "mcp.candidates.update",
    entityType: "product_candidate",
    entityId: existing.id,
    before: { title: existing.title, status: existing.status },
    after: { title, status: existing.status },
  })
  return {
    id: existing.id,
    status: existing.status,
    title,
    pendingId: existing.pendingActionId,
    productId: existing.productId,
    confirmPath: "/console/pending",
    message: "已更新候选资料，未确认待审，也未发布。",
  }
}

/**
 * 接受候选：创建 SPU 草稿 + listing_submit 待审。不发布、不确认待审。
 */
export async function acceptCandidateAsDraft(
  db: AppDatabase,
  actor: DomainActor,
  input: {
    id: string
    mode?: "create_draft" | "link_existing"
    productId?: string
    productSpu?: string
    brand?: string
  },
): Promise<CandidateWriteResult> {
  const existing = await loadCandidate(db, actor.organizationId, input.id)
  if (existing.status === "rejected") throw new Error("已拒绝的候选不能再通过")
  const actorLabel = actorName(actor)
  const mode = input.mode ?? "create_draft"
  let productId = input.productId?.trim() || existing.productId || ""

  if (existing.status === "accepted" && existing.productId) {
    const listingPendingKey = `listing_submit:candidate:${existing.id}`
    const [listingPending] = await db
      .select({ id: pendingActions.id })
      .from(pendingActions)
      .where(
        and(eq(pendingActions.organizationId, actor.organizationId), eq(pendingActions.idempotencyKey, listingPendingKey)),
      )
      .limit(1)
    return {
      id: existing.id,
      status: existing.status,
      title: existing.title,
      pendingId: existing.pendingActionId,
      productId: existing.productId,
      listingSubmitPendingId: listingPending?.id ?? null,
      confirmPath: "/console/pending",
      message: "该候选已通过。如需发布请在 /console/pending 确认刊登提交待审。",
    }
  }

  const now = new Date()
  if (mode === "link_existing") {
    if (!productId && input.productSpu) {
      const [product] = await db
        .select()
        .from(products)
        .where(and(eq(products.organizationId, actor.organizationId), eq(products.spuCode, input.productSpu.trim())))
        .limit(1)
      if (!product) throw new NotFoundError(`未找到 SPU ${input.productSpu}`)
      productId = product.id
    }
    if (!productId) throw new Error("关联已有商品时需要 productId 或 productSpu")
  } else if (!productId) {
    productId = randomUUID()
    const spuCode = await nextSpuCode(db, actor.organizationId)
    await db.insert(products).values({
      id: productId,
      organizationId: actor.organizationId,
      spuCode,
      title: existing.title,
      status: "draft",
      source: "manual",
      brand: input.brand?.trim() || existing.categoryHint || null,
      categoryHint: existing.categoryHint,
      payload: { source: "mcp_candidate_accept", candidateId: existing.id },
    })
  }

  const listingPendingKey = `listing_submit:candidate:${existing.id}`
  const listingPendingId = randomUUID()
  await db.transaction(async (tx) => {
    await tx
      .update(productCandidates)
      .set({
        status: "accepted",
        productId,
        rejectReason: null,
        reviewedBy: actorLabel,
        reviewedAt: now,
        updatedAt: now,
        rationale: { ...readRationale(existing.rationale), goNoGo: "GO" },
      })
      .where(eq(productCandidates.id, existing.id))

    const [listingPending] = await tx
      .select({ id: pendingActions.id })
      .from(pendingActions)
      .where(
        and(eq(pendingActions.organizationId, actor.organizationId), eq(pendingActions.idempotencyKey, listingPendingKey)),
      )
      .limit(1)
    if (!listingPending) {
      await tx.insert(pendingActions).values({
        id: listingPendingId,
        organizationId: actor.organizationId,
        kind: "listing_submit",
        status: "pending",
        title: `刊登提交：${existing.title}`,
        payload: {
          mode: "create",
          source: "candidate",
          candidateId: existing.id,
          productId,
          title: existing.title,
          categoryPath: existing.categoryHint?.trim() || "",
          brandName: input.brand?.trim() || "",
        },
        idempotencyKey: listingPendingKey,
        createdBy: actorLabel,
        expiresAt: new Date(now.getTime() + PENDING_TTL_MS),
        updatedAt: now,
      })
    }
  })

  const [listingPending] = await db
    .select({ id: pendingActions.id })
    .from(pendingActions)
    .where(
      and(eq(pendingActions.organizationId, actor.organizationId), eq(pendingActions.idempotencyKey, listingPendingKey)),
    )
    .limit(1)

  await recordMcpAudit(db, actor, {
    action: "mcp.candidates.accept",
    entityType: "product_candidate",
    entityId: existing.id,
    after: { productId, listingSubmitPendingId: listingPending?.id ?? listingPendingId, status: "accepted" },
    detail: "已建 SPU 草稿与 listing_submit 待审，未确认、未发布。",
  })
  return {
    id: existing.id,
    status: "accepted",
    title: existing.title,
    pendingId: existing.pendingActionId,
    productId,
    listingSubmitPendingId: listingPending?.id ?? listingPendingId,
    confirmPath: "/console/pending",
    message:
      "已接受候选：创建了 SPU 草稿和刊登提交待审。未发布到平台，也未确认待审。请到 /console/pending 由运营确认。",
  }
}

export async function rejectCandidateDraft(
  db: AppDatabase,
  actor: DomainActor,
  input: { id: string; reason: string },
): Promise<CandidateWriteResult> {
  const reason = input.reason.trim()
  if (!reason) throw new Error("拒绝必须填写理由")
  const existing = await loadCandidate(db, actor.organizationId, input.id)
  if (existing.status === "accepted") throw new Error("已通过的候选不能拒绝")
  const now = new Date()
  await db
    .update(productCandidates)
    .set({
      status: "rejected",
      rejectReason: reason,
      reviewedBy: actorName(actor),
      reviewedAt: now,
      updatedAt: now,
      rationale: { ...readRationale(existing.rationale), goNoGo: "NO_GO" },
    })
    .where(eq(productCandidates.id, existing.id))
  await recordMcpAudit(db, actor, {
    action: "mcp.candidates.reject",
    entityType: "product_candidate",
    entityId: existing.id,
    after: { status: "rejected", reason },
    detail: "已拒绝候选。对应待审未由 MCP 关闭，请运营在控制台处理。",
  })
  return {
    id: existing.id,
    status: "rejected",
    title: existing.title,
    pendingId: existing.pendingActionId,
    productId: existing.productId,
    confirmPath: "/console/pending",
    message: "已拒绝该候选。MCP 不会关闭或确认对应待审，如需处理请到 /console/pending。",
  }
}
