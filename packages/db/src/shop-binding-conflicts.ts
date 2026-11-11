/**
 * G8 跨租户店铺绑定冲突单的读写与裁决。
 * 调用方需传入同一事务中的 db/tx；对外包装函数会自行开事务。
 */
import { and, count, desc, eq, inArray, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import type { AppDatabase } from "./client"
import { organization } from "./auth-schema"
import {
  auditEvents,
  integrationLogs,
  integrationStates,
  shopBindingConflicts,
  shops,
} from "./commerce-schema"
import {
  OPEN_SHOP_BINDING_CONFLICT_STATUSES,
  SHOP_BINDING_CONFLICT_STATUS_LABELS,
  SHOP_BINDING_UNBOUND_STATUS,
  decideBindingConflictTransition,
  getTransferAppealDays,
  isShopBindingConflictStatus,
  type BindingConflictAction,
  type BindingConflictDecision,
  type ShopBindingConflictStatus,
} from "./shop-binding-policy"

export type DbLike = AppDatabase | Parameters<Parameters<AppDatabase["transaction"]>[0]>[0]
type ShopRow = typeof shops.$inferSelect
type ConflictRow = typeof shopBindingConflicts.$inferSelect

function asConflictStatus(value: string): ShopBindingConflictStatus {
  if (!isShopBindingConflictStatus(value)) {
    throw new Error(`未知冲突单状态：${value}`)
  }
  return value
}

function shopMeta(shop: { meta?: unknown }): Record<string, unknown> {
  return shop.meta && typeof shop.meta === "object"
    ? { ...(shop.meta as Record<string, unknown>) }
    : {}
}

function uniqueOrgIds(...ids: Array<string | null | undefined>) {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))]
}

export function buildBindingAuditPayload(input: {
  platform: string
  externalShopId: string
  challengerOrganizationId: string
  occupantOrganizationId: string
  challengerShopId?: string | null
  occupantShopId?: string | null
  conflictId?: string | null
  actorUserId?: string | null
  reason?: string | null
  extra?: Record<string, unknown>
}) {
  return {
    platform: input.platform,
    externalShopId: input.externalShopId,
    challengerOrganizationId: input.challengerOrganizationId,
    occupantOrganizationId: input.occupantOrganizationId,
    challengerShopId: input.challengerShopId ?? null,
    occupantShopId: input.occupantShopId ?? null,
    conflictId: input.conflictId ?? null,
    actorUserId: input.actorUserId ?? null,
    reason: input.reason ?? null,
    ...(input.extra ?? {}),
  }
}

async function writeBindingAudit(
  tx: DbLike,
  input: {
    organizationIds: string[]
    actorUserId?: string | null
    action: string
    entityType?: string
    entityId: string
    payload: Record<string, unknown>
  },
) {
  for (const organizationId of uniqueOrgIds(...input.organizationIds)) {
    await tx.insert(auditEvents).values({
      organizationId,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType ?? "shop_binding_conflict",
      entityId: input.entityId,
      after: input.payload,
      result: "success",
    })
  }
}

async function writeShopLog(
  tx: DbLike,
  input: {
    shopId: string
    action: string
    status: string
    message: string
    payload: Record<string, unknown>
  },
) {
  await tx.insert(integrationLogs).values({
    shopId: input.shopId,
    direction: "in",
    action: input.action,
    status: input.status,
    message: input.message.slice(0, 1000),
    payloadSummary: JSON.stringify(input.payload).slice(0, 2000),
  })
}

async function anotherShopHasExternalId(
  tx: DbLike,
  input: {
    organizationId: string
    platform: string
    externalShopId: string
    excludeShopId: string
  },
) {
  const [row] = await tx
    .select({ id: shops.id })
    .from(shops)
    .where(
      and(
        eq(shops.organizationId, input.organizationId),
        eq(shops.platform, input.platform),
        eq(shops.externalShopId, input.externalShopId),
        ne(shops.id, input.excludeShopId),
      ),
    )
    .limit(1)
  return Boolean(row)
}

export async function findOccupyingShop(
  tx: DbLike,
  input: {
    platform: string
    externalShopId: string
    excludeOrganizationId?: string
  },
) {
  const filters = [
    eq(shops.platform, input.platform),
    eq(shops.externalShopId, input.externalShopId),
    isNull(shops.deletedAt),
    ne(shops.status, SHOP_BINDING_UNBOUND_STATUS),
  ]
  if (input.excludeOrganizationId) {
    filters.push(ne(shops.organizationId, input.excludeOrganizationId))
  }
  const [row] = await tx
    .select()
    .from(shops)
    .where(and(...filters))
    .orderBy(
      sql`case ${shops.status} when 'active' then 0 when 'disabled' then 1 when 'connecting' then 2 when 'draft' then 3 else 4 end`,
    )
    .limit(1)
  return row ?? null
}

export async function recordShopIdentityUnavailable(
  tx: DbLike,
  input: {
    shop: ShopRow
    platform: string
    actorUserId?: string | null
  },
) {
  const message = "无法识别平台店铺身份，已拒绝保存授权，请重试"
  await tx
    .update(shops)
    .set({
      status: "error",
      meta: {
        ...shopMeta(input.shop),
        lastError: message,
      },
      updatedAt: new Date(),
    })
    .where(eq(shops.id, input.shop.id))
  await tx
    .insert(integrationStates)
    .values({
      shopId: input.shop.id,
      health: "error",
      lastError: "shop_identity_unavailable",
    })
    .onConflictDoUpdate({
      target: integrationStates.shopId,
      set: { health: "error", lastError: "shop_identity_unavailable" },
    })
  const payload = {
    platform: input.platform,
    externalShopId: null,
    organizationId: input.shop.organizationId,
    shopId: input.shop.id,
    actorUserId: input.actorUserId ?? null,
    reason: "missing_external_shop_id",
  }
  await writeBindingAudit(tx, {
    organizationIds: [input.shop.organizationId],
    actorUserId: input.actorUserId,
    action: "shop.binding.identity_unavailable",
    entityType: "shop",
    entityId: input.shop.id,
    payload,
  })
  await writeShopLog(tx, {
    shopId: input.shop.id,
    action: "oauth_callback",
    status: "error",
    message: "shop identity unavailable; refused to persist credentials",
    payload,
  })
  return message
}

export async function recordCrossTenantBindingConflict(
  tx: DbLike,
  input: {
    challengerShop: ShopRow
    occupantShop: ShopRow
    platform: string
    externalShopId: string
    actorUserId?: string | null
  },
) {
  const message = "该平台店铺已绑定到其他租户，请联系平台运营处理"
  const canWriteExternalId = !(await anotherShopHasExternalId(tx, {
    organizationId: input.challengerShop.organizationId,
    platform: input.platform,
    externalShopId: input.externalShopId,
    excludeShopId: input.challengerShop.id,
  }))
  await tx
    .update(shops)
    .set({
      status: "error",
      externalShopId: canWriteExternalId
        ? input.externalShopId
        : input.challengerShop.externalShopId,
      meta: {
        ...shopMeta(input.challengerShop),
        lastError: message,
        conflictExternalShopId: input.externalShopId,
      },
      updatedAt: new Date(),
    })
    .where(eq(shops.id, input.challengerShop.id))
  await tx
    .insert(integrationStates)
    .values({
      shopId: input.challengerShop.id,
      health: "error",
      lastError: "shop_already_bound_other_org",
    })
    .onConflictDoUpdate({
      target: integrationStates.shopId,
      set: { health: "error", lastError: "shop_already_bound_other_org" },
    })

  const [existing] = await tx
    .select()
    .from(shopBindingConflicts)
    .where(
      and(
        eq(shopBindingConflicts.platform, input.platform),
        eq(shopBindingConflicts.externalShopId, input.externalShopId),
        eq(
          shopBindingConflicts.challengerOrganizationId,
          input.challengerShop.organizationId,
        ),
        inArray(shopBindingConflicts.status, [
          ...OPEN_SHOP_BINDING_CONFLICT_STATUSES,
        ]),
      ),
    )
    .limit(1)

  let conflict: ConflictRow
  if (existing) {
    const [updated] = await tx
      .update(shopBindingConflicts)
      .set({
        challengerShopId: input.challengerShop.id,
        occupantShopId: input.occupantShop.id,
        occupantOrganizationId: input.occupantShop.organizationId,
        initiatorUserId: input.actorUserId ?? existing.initiatorUserId,
        updatedAt: new Date(),
      })
      .where(eq(shopBindingConflicts.id, existing.id))
      .returning()
    conflict = updated ?? existing
  } else {
    const [created] = await tx
      .insert(shopBindingConflicts)
      .values({
        platform: input.platform,
        externalShopId: input.externalShopId,
        challengerShopId: input.challengerShop.id,
        challengerOrganizationId: input.challengerShop.organizationId,
        occupantShopId: input.occupantShop.id,
        occupantOrganizationId: input.occupantShop.organizationId,
        initiatorUserId: input.actorUserId ?? null,
        status: "pending",
      })
      .returning()
    if (!created) throw new Error("创建冲突单失败")
    conflict = created
  }

  const payload = buildBindingAuditPayload({
    platform: input.platform,
    externalShopId: input.externalShopId,
    challengerOrganizationId: input.challengerShop.organizationId,
    occupantOrganizationId: input.occupantShop.organizationId,
    challengerShopId: input.challengerShop.id,
    occupantShopId: input.occupantShop.id,
    conflictId: conflict.id,
    actorUserId: input.actorUserId,
    reason: message,
  })
  await writeBindingAudit(tx, {
    organizationIds: [
      input.challengerShop.organizationId,
      input.occupantShop.organizationId,
    ],
    actorUserId: input.actorUserId,
    action: "shop.binding.conflict_detected",
    entityId: conflict.id,
    payload,
  })
  await writeShopLog(tx, {
    shopId: input.challengerShop.id,
    action: "oauth_callback",
    status: "error",
    message: "cross-tenant shop binding conflict",
    payload,
  })
  await writeShopLog(tx, {
    shopId: input.occupantShop.id,
    action: "shop_binding_conflict",
    status: "error",
    message: "cross-tenant shop binding conflict detected",
    payload,
  })
  return { conflict, message }
}

async function releaseOccupantShop(
  tx: DbLike,
  occupant: ShopRow,
  input: { reason: string; conflictId: string },
) {
  if (occupant.deletedAt) {
    throw new Error("占用方店铺已删除，无法按转移策略释放")
  }
  await tx
    .update(shops)
    .set({
      status: SHOP_BINDING_UNBOUND_STATUS,
      meta: {
        ...shopMeta(occupant),
        syncPaused: true,
        bindingReleasedAt: new Date().toISOString(),
        bindingReleasedReason: input.reason,
        bindingReleasedConflictId: input.conflictId,
      },
      updatedAt: new Date(),
    })
    .where(eq(shops.id, occupant.id))
  await tx
    .insert(integrationStates)
    .values({
      shopId: occupant.id,
      health: "paused",
      lastError: null,
    })
    .onConflictDoUpdate({
      target: integrationStates.shopId,
      set: { health: "paused" },
    })
}

async function grantChallengerReauth(tx: DbLike, challenger: ShopRow, conflict: ConflictRow) {
  await tx
    .update(shops)
    .set({
      status: "draft",
      meta: {
        ...shopMeta(challenger),
        transferReauthAllowed: true,
        lastError:
          "平台运营已批准转移，名额已释放，请重新授权。历史订单仍留在原租户，不会迁移。",
        conflictExternalShopId: conflict.externalShopId,
      },
      updatedAt: new Date(),
    })
    .where(eq(shops.id, challenger.id))
}

async function closeChallengerDraft(tx: DbLike, challenger: ShopRow, conflict: ConflictRow) {
  await tx
    .update(shops)
    .set({
      status: "disabled",
      deletedAt: new Date(),
      externalShopId: null,
      meta: {
        ...shopMeta(challenger),
        syncPaused: true,
        transferReauthAllowed: false,
        conflictClosed: true,
        closedExternalShopId: challenger.externalShopId ?? conflict.externalShopId,
        lastError: "平台运营已维持原绑定，本次授权申请已关闭。",
      },
      updatedAt: new Date(),
    })
    .where(eq(shops.id, challenger.id))
}

async function applyDecision(
  tx: DbLike,
  input: {
    decision: BindingConflictDecision
    conflict: ConflictRow
    reason: string
    extraConflictFields?: Partial<typeof shopBindingConflicts.$inferInsert>
  },
) {
  const [occupant] = await tx
    .select()
    .from(shops)
    .where(eq(shops.id, input.conflict.occupantShopId))
    .limit(1)
  const [challenger] = await tx
    .select()
    .from(shops)
    .where(eq(shops.id, input.conflict.challengerShopId))
    .limit(1)
  if (!occupant || !challenger) throw new Error("冲突单关联店铺不存在")

  if (input.decision.releaseOccupantSlot && occupant.status !== SHOP_BINDING_UNBOUND_STATUS) {
    await releaseOccupantShop(tx, occupant, {
      reason: input.reason,
      conflictId: input.conflict.id,
    })
  }
  if (input.decision.grantChallengerReauth) {
    await grantChallengerReauth(tx, challenger, input.conflict)
  }
  if (input.decision.closeChallengerDraft) {
    await closeChallengerDraft(tx, challenger, input.conflict)
  }

  const now = new Date()
  const [updated] = await tx
    .update(shopBindingConflicts)
    .set({
      status: input.decision.status,
      appealDeadlineAt: input.decision.appealDeadlineAt,
      releasedAt: input.decision.releaseOccupantSlot ? now : input.conflict.releasedAt,
      closedAt:
        input.decision.status === "closed" || input.decision.status === "upheld"
          ? now
          : input.conflict.closedAt,
      updatedAt: now,
      ...(input.extraConflictFields ?? {}),
    })
    .where(eq(shopBindingConflicts.id, input.conflict.id))
    .returning()
  return { conflict: updated ?? input.conflict, occupant, challenger }
}

async function loadConflict(tx: DbLike, conflictId: string) {
  const [row] = await tx
    .select()
    .from(shopBindingConflicts)
    .where(eq(shopBindingConflicts.id, conflictId))
    .limit(1)
  if (!row) throw new Error("冲突单不存在")
  return row
}

function transitionOf(
  conflict: ConflictRow,
  action: BindingConflictAction,
  now = new Date(),
) {
  return decideBindingConflictTransition({
    current: asConflictStatus(conflict.status),
    action,
    appealDays: getTransferAppealDays(),
    now,
    appealDeadlineAt: conflict.appealDeadlineAt,
  })
}

export async function finalizeExpiredTransferAppeals(tx: DbLike, now = new Date()) {
  const rows = await tx
    .select()
    .from(shopBindingConflicts)
    .where(
      and(
        eq(shopBindingConflicts.status, "transfer_approved_pending_appeal"),
        isNotNull(shopBindingConflicts.appealDeadlineAt),
        lte(shopBindingConflicts.appealDeadlineAt, now),
      ),
    )
  const finalized: ConflictRow[] = []
  for (const row of rows) {
    const decision = transitionOf(row, "expire_appeal_window", now)
    const reason = "申诉窗口结束且原租户未申诉，自动释放名额"
    const applied = await applyDecision(tx, { decision, conflict: row, reason })
    const payload = buildBindingAuditPayload({
      platform: row.platform,
      externalShopId: row.externalShopId,
      challengerOrganizationId: row.challengerOrganizationId,
      occupantOrganizationId: row.occupantOrganizationId,
      challengerShopId: row.challengerShopId,
      occupantShopId: row.occupantShopId,
      conflictId: row.id,
      reason,
    })
    await writeBindingAudit(tx, {
      organizationIds: [row.challengerOrganizationId, row.occupantOrganizationId],
      action: "shop.binding.released",
      entityId: row.id,
      payload,
    })
    await writeShopLog(tx, {
      shopId: row.occupantShopId,
      action: "shop_binding_release",
      status: "success",
      message: "申诉窗口结束，占用方名额已释放",
      payload,
    })
    await writeShopLog(tx, {
      shopId: row.challengerShopId,
      action: "shop_binding_release",
      status: "success",
      message: "申诉窗口结束，后来者可重新授权",
      payload,
    })
    finalized.push(applied.conflict)
  }
  return finalized
}

export async function markConflictClosedAfterReauth(
  tx: DbLike,
  input: {
    platform: string
    externalShopId: string
    organizationId: string
    shopId: string
    actorUserId?: string | null
  },
) {
  const [conflict] = await tx
    .select()
    .from(shopBindingConflicts)
    .where(
      and(
        eq(shopBindingConflicts.platform, input.platform),
        eq(shopBindingConflicts.externalShopId, input.externalShopId),
        eq(shopBindingConflicts.challengerOrganizationId, input.organizationId),
        eq(shopBindingConflicts.status, "released_pending_reauth"),
      ),
    )
    .limit(1)
  if (!conflict) return null
  const decision = transitionOf(conflict, "challenger_reauth_success")
  const applied = await applyDecision(tx, {
    decision,
    conflict,
    reason: "后来者重新授权成功",
  })
  const payload = buildBindingAuditPayload({
    platform: conflict.platform,
    externalShopId: conflict.externalShopId,
    challengerOrganizationId: conflict.challengerOrganizationId,
    occupantOrganizationId: conflict.occupantOrganizationId,
    challengerShopId: input.shopId,
    occupantShopId: conflict.occupantShopId,
    conflictId: conflict.id,
    actorUserId: input.actorUserId,
    reason: "后来者重新授权成功",
  })
  await writeBindingAudit(tx, {
    organizationIds: [
      conflict.challengerOrganizationId,
      conflict.occupantOrganizationId,
    ],
    actorUserId: input.actorUserId,
    action: "shop.binding.reauth_closed",
    entityId: conflict.id,
    payload,
  })
  await writeShopLog(tx, {
    shopId: input.shopId,
    action: "shop_binding_reauth",
    status: "success",
    message: "later party re-authorized after transfer release",
    payload,
  })
  return applied.conflict
}

export type ShopBindingConflictListItem = {
  id: string
  platform: string
  externalShopId: string
  status: ShopBindingConflictStatus
  statusLabel: string
  challengerShopId: string
  challengerShopName: string
  challengerOrganizationId: string
  challengerOrganizationName: string
  occupantShopId: string
  occupantShopName: string
  occupantOrganizationId: string
  occupantOrganizationName: string
  initiatorUserId: string | null
  createdAt: Date
  updatedAt: Date
  reviewedByUserId: string | null
  reviewReason: string | null
  appealDeadlineAt: Date | null
  appealContent: string | null
  appealedAt: Date | null
  appealReviewReason: string | null
  releasedAt: Date | null
}

export async function listShopBindingConflicts(
  db: AppDatabase,
  input: { page?: number; pageSize?: number } = {},
) {
  const page = Math.max(1, Math.trunc(input.page ?? 1))
  const pageSize = Math.min(100, Math.max(1, Math.trunc(input.pageSize ?? 20)))
  return db.transaction(async (tx) => {
    await finalizeExpiredTransferAppeals(tx)
    const challengerOrg = alias(organization, "challenger_org")
    const occupantOrg = alias(organization, "occupant_org")
    const challengerShop = alias(shops, "challenger_shop")
    const occupantShop = alias(shops, "occupant_shop")
    const [totalRow] = await tx
      .select({ value: count() })
      .from(shopBindingConflicts)
    const total = Number(totalRow?.value ?? 0)
    const rows = await tx
      .select({
        conflict: shopBindingConflicts,
        challengerOrganizationName: challengerOrg.name,
        occupantOrganizationName: occupantOrg.name,
        challengerShopName: challengerShop.name,
        occupantShopName: occupantShop.name,
      })
      .from(shopBindingConflicts)
      .innerJoin(
        challengerOrg,
        eq(challengerOrg.id, shopBindingConflicts.challengerOrganizationId),
      )
      .innerJoin(
        occupantOrg,
        eq(occupantOrg.id, shopBindingConflicts.occupantOrganizationId),
      )
      .innerJoin(
        challengerShop,
        eq(challengerShop.id, shopBindingConflicts.challengerShopId),
      )
      .innerJoin(
        occupantShop,
        eq(occupantShop.id, shopBindingConflicts.occupantShopId),
      )
      .orderBy(desc(shopBindingConflicts.updatedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize)
    const items = rows.map((row) => {
      const status = asConflictStatus(row.conflict.status)
      return {
        id: row.conflict.id,
        platform: row.conflict.platform,
        externalShopId: row.conflict.externalShopId,
        status,
        statusLabel: SHOP_BINDING_CONFLICT_STATUS_LABELS[status],
        challengerShopId: row.conflict.challengerShopId,
        challengerShopName: row.challengerShopName,
        challengerOrganizationId: row.conflict.challengerOrganizationId,
        challengerOrganizationName: row.challengerOrganizationName,
        occupantShopId: row.conflict.occupantShopId,
        occupantShopName: row.occupantShopName,
        occupantOrganizationId: row.conflict.occupantOrganizationId,
        occupantOrganizationName: row.occupantOrganizationName,
        initiatorUserId: row.conflict.initiatorUserId,
        createdAt: row.conflict.createdAt,
        updatedAt: row.conflict.updatedAt,
        reviewedByUserId: row.conflict.reviewedByUserId,
        reviewReason: row.conflict.reviewReason,
        appealDeadlineAt: row.conflict.appealDeadlineAt,
        appealContent: row.conflict.appealContent,
        appealedAt: row.conflict.appealedAt,
        appealReviewReason: row.conflict.appealReviewReason,
        releasedAt: row.conflict.releasedAt,
      } satisfies ShopBindingConflictListItem
    })
    return { items, total, page, pageSize }
  })
}

export async function upholdShopBindingConflict(
  db: AppDatabase,
  input: { conflictId: string; reviewerId: string; reason?: string },
) {
  return db.transaction(async (tx) => {
    await finalizeExpiredTransferAppeals(tx)
    const conflict = await loadConflict(tx, input.conflictId)
    const decision = transitionOf(conflict, "uphold")
    const reason = input.reason?.trim() || "维持原绑定"
    const applied = await applyDecision(tx, {
      decision,
      conflict,
      reason,
      extraConflictFields: {
        reviewedByUserId: input.reviewerId,
        reviewedAt: new Date(),
        reviewReason: input.reason?.trim() || null,
      },
    })
    const payload = buildBindingAuditPayload({
      platform: conflict.platform,
      externalShopId: conflict.externalShopId,
      challengerOrganizationId: conflict.challengerOrganizationId,
      occupantOrganizationId: conflict.occupantOrganizationId,
      challengerShopId: conflict.challengerShopId,
      occupantShopId: conflict.occupantShopId,
      conflictId: conflict.id,
      actorUserId: input.reviewerId,
      reason,
    })
    await writeBindingAudit(tx, {
      organizationIds: [
        conflict.challengerOrganizationId,
        conflict.occupantOrganizationId,
      ],
      actorUserId: input.reviewerId,
      action: "shop.binding.upheld",
      entityId: conflict.id,
      payload,
    })
    await writeShopLog(tx, {
      shopId: conflict.challengerShopId,
      action: "shop_binding_uphold",
      status: "success",
      message: "original binding upheld; challenger draft closed",
      payload,
    })
    await writeShopLog(tx, {
      shopId: conflict.occupantShopId,
      action: "shop_binding_uphold",
      status: "success",
      message: "original binding upheld",
      payload,
    })
    return { ok: true as const, conflict: applied.conflict }
  })
}

export async function approveShopBindingTransfer(
  db: AppDatabase,
  input: { conflictId: string; reviewerId: string; reason: string },
) {
  const reason = input.reason.trim()
  if (!reason) throw new Error("批准转移必须填写原因")
  return db.transaction(async (tx) => {
    await finalizeExpiredTransferAppeals(tx)
    const conflict = await loadConflict(tx, input.conflictId)
    const decision = transitionOf(conflict, "approve_transfer")
    const applied = await applyDecision(tx, {
      decision,
      conflict,
      reason,
      extraConflictFields: {
        reviewedByUserId: input.reviewerId,
        reviewedAt: new Date(),
        reviewReason: reason,
      },
    })
    const payload = buildBindingAuditPayload({
      platform: conflict.platform,
      externalShopId: conflict.externalShopId,
      challengerOrganizationId: conflict.challengerOrganizationId,
      occupantOrganizationId: conflict.occupantOrganizationId,
      challengerShopId: conflict.challengerShopId,
      occupantShopId: conflict.occupantShopId,
      conflictId: conflict.id,
      actorUserId: input.reviewerId,
      reason,
      extra: { nextStatus: decision.status },
    })
    await writeBindingAudit(tx, {
      organizationIds: [
        conflict.challengerOrganizationId,
        conflict.occupantOrganizationId,
      ],
      actorUserId: input.reviewerId,
      action: "shop.binding.transfer_approved",
      entityId: conflict.id,
      payload,
    })
    await writeShopLog(tx, {
      shopId: conflict.occupantShopId,
      action: "shop_binding_transfer_approved",
      status: "success",
      message: decision.releaseOccupantSlot
        ? "transfer approved and slot released"
        : "transfer approved; waiting for occupant appeal window",
      payload,
    })
    await writeShopLog(tx, {
      shopId: conflict.challengerShopId,
      action: "shop_binding_transfer_approved",
      status: "success",
      message: decision.releaseOccupantSlot
        ? "transfer approved; challenger may re-authorize"
        : "transfer approved; waiting for occupant appeal window",
      payload,
    })
    if (decision.releaseOccupantSlot) {
      await writeBindingAudit(tx, {
        organizationIds: [
          conflict.challengerOrganizationId,
          conflict.occupantOrganizationId,
        ],
        actorUserId: input.reviewerId,
        action: "shop.binding.released",
        entityId: conflict.id,
        payload,
      })
    }
    return { ok: true as const, conflict: applied.conflict }
  })
}

export async function appealShopBindingTransfer(
  db: AppDatabase,
  input: {
    shopId: string
    organizationId: string
    actorUserId: string
    content: string
  },
) {
  const content = input.content.trim()
  if (!content) throw new Error("请填写申诉内容")
  return db.transaction(async (tx) => {
    await finalizeExpiredTransferAppeals(tx)
    const [conflict] = await tx
      .select()
      .from(shopBindingConflicts)
      .where(
        and(
          eq(shopBindingConflicts.occupantShopId, input.shopId),
          eq(shopBindingConflicts.occupantOrganizationId, input.organizationId),
          eq(shopBindingConflicts.status, "transfer_approved_pending_appeal"),
        ),
      )
      .limit(1)
    if (!conflict) throw new Error("当前没有可申诉的过户申请")
    const decision = transitionOf(conflict, "appeal")
    const applied = await applyDecision(tx, {
      decision,
      conflict,
      reason: content,
      extraConflictFields: {
        appealContent: content,
        appealedAt: new Date(),
        appealedByUserId: input.actorUserId,
      },
    })
    const payload = buildBindingAuditPayload({
      platform: conflict.platform,
      externalShopId: conflict.externalShopId,
      challengerOrganizationId: conflict.challengerOrganizationId,
      occupantOrganizationId: conflict.occupantOrganizationId,
      challengerShopId: conflict.challengerShopId,
      occupantShopId: conflict.occupantShopId,
      conflictId: conflict.id,
      actorUserId: input.actorUserId,
      reason: content,
    })
    await writeBindingAudit(tx, {
      organizationIds: [
        conflict.challengerOrganizationId,
        conflict.occupantOrganizationId,
      ],
      actorUserId: input.actorUserId,
      action: "shop.binding.appealed",
      entityId: conflict.id,
      payload,
    })
    await writeShopLog(tx, {
      shopId: conflict.occupantShopId,
      action: "shop_binding_appeal",
      status: "success",
      message: "occupant appealed a pending transfer",
      payload,
    })
    await writeShopLog(tx, {
      shopId: conflict.challengerShopId,
      action: "shop_binding_appeal",
      status: "success",
      message: "occupant appealed a pending transfer",
      payload,
    })
    return { ok: true as const, conflict: applied.conflict }
  })
}

export async function reviewShopBindingAppeal(
  db: AppDatabase,
  input: {
    conflictId: string
    reviewerId: string
    decision: "accept" | "reject"
    reason: string
  },
) {
  const reason = input.reason.trim()
  if (!reason) throw new Error("复审必须填写原因")
  return db.transaction(async (tx) => {
    await finalizeExpiredTransferAppeals(tx)
    const conflict = await loadConflict(tx, input.conflictId)
    const action = input.decision === "accept" ? "accept_appeal" : "reject_appeal"
    const decision = transitionOf(conflict, action)
    const applied = await applyDecision(tx, {
      decision,
      conflict,
      reason,
      extraConflictFields: {
        appealReviewedByUserId: input.reviewerId,
        appealReviewedAt: new Date(),
        appealReviewReason: reason,
      },
    })
    const payload = buildBindingAuditPayload({
      platform: conflict.platform,
      externalShopId: conflict.externalShopId,
      challengerOrganizationId: conflict.challengerOrganizationId,
      occupantOrganizationId: conflict.occupantOrganizationId,
      challengerShopId: conflict.challengerShopId,
      occupantShopId: conflict.occupantShopId,
      conflictId: conflict.id,
      actorUserId: input.reviewerId,
      reason,
      extra: { appealDecision: input.decision },
    })
    const auditAction =
      input.decision === "accept" ? "shop.binding.appeal_accepted" : "shop.binding.appeal_rejected"
    await writeBindingAudit(tx, {
      organizationIds: [
        conflict.challengerOrganizationId,
        conflict.occupantOrganizationId,
      ],
      actorUserId: input.reviewerId,
      action: auditAction,
      entityId: conflict.id,
      payload,
    })
    await writeShopLog(tx, {
      shopId: conflict.occupantShopId,
      action: "shop_binding_appeal_review",
      status: "success",
      message:
        input.decision === "accept"
          ? "appeal accepted; original binding upheld"
          : "appeal rejected; slot released",
      payload,
    })
    await writeShopLog(tx, {
      shopId: conflict.challengerShopId,
      action: "shop_binding_appeal_review",
      status: "success",
      message:
        input.decision === "accept"
          ? "appeal accepted; original binding upheld"
          : "appeal rejected; challenger may re-authorize",
      payload,
    })
    if (decision.releaseOccupantSlot) {
      await writeBindingAudit(tx, {
        organizationIds: [
          conflict.challengerOrganizationId,
          conflict.occupantOrganizationId,
        ],
        actorUserId: input.reviewerId,
        action: "shop.binding.released",
        entityId: conflict.id,
        payload,
      })
    }
    return { ok: true as const, conflict: applied.conflict }
  })
}

export async function unbindShopBindingSlot(
  db: AppDatabase,
  input: {
    shopId: string
    organizationId: string
    actorUserId: string
    reason?: string
  },
) {
  const reason = input.reason?.trim() || "原租户正式解绑"
  return db.transaction(async (tx) => {
    await finalizeExpiredTransferAppeals(tx)
    const [shop] = await tx
      .select()
      .from(shops)
      .where(
        and(
          eq(shops.id, input.shopId),
          eq(shops.organizationId, input.organizationId),
          isNull(shops.deletedAt),
        ),
      )
      .limit(1)
    if (!shop) throw new Error("店铺不存在")
    if (shop.status === SHOP_BINDING_UNBOUND_STATUS) {
      throw new Error("店铺已正式解绑")
    }

    const openConflicts = await tx
      .select()
      .from(shopBindingConflicts)
      .where(
        and(
          eq(shopBindingConflicts.occupantShopId, shop.id),
          eq(shopBindingConflicts.occupantOrganizationId, input.organizationId),
          inArray(shopBindingConflicts.status, [
            ...OPEN_SHOP_BINDING_CONFLICT_STATUSES,
          ]),
        ),
      )

    if (openConflicts.length === 0) {
      await releaseOccupantShop(tx, shop, { reason, conflictId: shop.id })
      const payload = buildBindingAuditPayload({
        platform: shop.platform,
        externalShopId: shop.externalShopId ?? "",
        challengerOrganizationId: shop.organizationId,
        occupantOrganizationId: shop.organizationId,
        occupantShopId: shop.id,
        actorUserId: input.actorUserId,
        reason,
      })
      await writeBindingAudit(tx, {
        organizationIds: [shop.organizationId],
        actorUserId: input.actorUserId,
        action: "shop.binding.unbound",
        entityType: "shop",
        entityId: shop.id,
        payload,
      })
      await writeShopLog(tx, {
        shopId: shop.id,
        action: "shop_binding_unbind",
        status: "success",
        message: "occupant formally unbound shop and released slot",
        payload,
      })
      return { ok: true as const }
    }

    for (const conflict of openConflicts) {
      const decision = transitionOf(conflict, "occupant_unbind")
      await applyDecision(tx, { decision, conflict, reason })
      const payload = buildBindingAuditPayload({
        platform: conflict.platform,
        externalShopId: conflict.externalShopId,
        challengerOrganizationId: conflict.challengerOrganizationId,
        occupantOrganizationId: conflict.occupantOrganizationId,
        challengerShopId: conflict.challengerShopId,
        occupantShopId: conflict.occupantShopId,
        conflictId: conflict.id,
        actorUserId: input.actorUserId,
        reason,
      })
      await writeBindingAudit(tx, {
        organizationIds: [
          conflict.challengerOrganizationId,
          conflict.occupantOrganizationId,
        ],
        actorUserId: input.actorUserId,
        action: "shop.binding.unbound",
        entityId: conflict.id,
        payload,
      })
      await writeShopLog(tx, {
        shopId: conflict.occupantShopId,
        action: "shop_binding_unbind",
        status: "success",
        message: "occupant formally unbound shop and released slot",
        payload,
      })
      await writeShopLog(tx, {
        shopId: conflict.challengerShopId,
        action: "shop_binding_unbind",
        status: "success",
        message: "occupant unbound; challenger may re-authorize",
        payload,
      })
    }
    return { ok: true as const }
  })
}

export type ShopBindingView = {
  role: "challenger" | "occupant"
  conflictId: string
  status: ShopBindingConflictStatus
  statusLabel: string
  appealDeadlineAt: string | null
  canAppeal: boolean
  transferReauthAllowed: boolean
  message: string
}

function viewMessage(
  role: "challenger" | "occupant",
  status: ShopBindingConflictStatus,
  appealDeadlineAt: Date | null,
) {
  if (role === "challenger") {
    switch (status) {
      case "pending":
        return "该平台店铺已被其他账号绑定，请联系平台运营处理。"
      case "transfer_approved_pending_appeal":
        return "平台运营已批准转移，正在等待原绑定方申诉期结束。"
      case "appealed_pending_review":
        return "原绑定方已提出申诉，平台运营正在复审。"
      case "released_pending_reauth":
        return "名额已释放，请重新授权。历史订单仍留在原租户，不会迁移到本组织。"
      case "upheld":
        return "平台运营已维持原绑定，本次申请已关闭。"
      case "closed":
        return "该冲突单已关闭。"
    }
  }
  switch (status) {
    case "pending":
      return "其他账号正在申请绑定同一家平台店铺，平台运营处理前你的绑定继续有效。"
    case "transfer_approved_pending_appeal":
      return appealDeadlineAt
        ? `有人申请过户该店铺。你可在 ${appealDeadlineAt.toISOString()} 前提出申诉。系统不会自动通知对方或你；如需联系，请由平台运营自行处理。`
        : "有人申请过户该店铺。你可提出申诉。系统不会自动发送通知。"
    case "appealed_pending_review":
      return "你已提交申诉，请等待平台运营复审。"
    case "released_pending_reauth":
      return "该店铺名额已释放，同步已停止。历史订单、库存和结算仍保留在本组织。"
    case "upheld":
      return "平台运营已维持原绑定。"
    case "closed":
      return "该冲突单已关闭。"
  }
}

export async function getShopBindingView(
  db: AppDatabase,
  input: { shopId: string; organizationId: string },
): Promise<ShopBindingView | null> {
  return db.transaction(async (tx) => {
    await finalizeExpiredTransferAppeals(tx)
    const rows = await tx
      .select()
      .from(shopBindingConflicts)
      .where(
        or(
          and(
            eq(shopBindingConflicts.challengerShopId, input.shopId),
            eq(shopBindingConflicts.challengerOrganizationId, input.organizationId),
          ),
          and(
            eq(shopBindingConflicts.occupantShopId, input.shopId),
            eq(shopBindingConflicts.occupantOrganizationId, input.organizationId),
          ),
        ),
      )
      .orderBy(desc(shopBindingConflicts.updatedAt))
      .limit(10)
    const open = rows.find((row) =>
      (OPEN_SHOP_BINDING_CONFLICT_STATUSES as readonly string[]).includes(row.status),
    )
    const row = open ?? rows[0]
    if (!row) return null
    const status = asConflictStatus(row.status)
    const role =
      row.occupantOrganizationId === input.organizationId &&
      row.occupantShopId === input.shopId
        ? "occupant"
        : "challenger"
    const now = Date.now()
    const canAppeal =
      role === "occupant" &&
      status === "transfer_approved_pending_appeal" &&
      (!row.appealDeadlineAt || row.appealDeadlineAt.getTime() >= now)
    return {
      role,
      conflictId: row.id,
      status,
      statusLabel: SHOP_BINDING_CONFLICT_STATUS_LABELS[status],
      appealDeadlineAt: row.appealDeadlineAt?.toISOString() ?? null,
      canAppeal,
      transferReauthAllowed: role === "challenger" && status === "released_pending_reauth",
      message: viewMessage(role, status, row.appealDeadlineAt),
    }
  })
}

export async function resolveShopConflictLegacyRejected() {
  throw new Error("「转移」不再通过改写冲突店铺的组织 ID 执行。请使用「批准转移」。")
}
