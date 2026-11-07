/**
 * 售后逆向单同步 + 到期退款决定（apps/api 应用内 cron）。
 * @see docs/design/aftersale-cancel-ingest-and-policy.md
 *
 * 链路：connector.listReverseOrders → 映射为 DomainReverseOrderDetail →
 *   ingestReverse（apps/shop dataaccess）→ 按店铺策略释放占库 / 排期退款 →
 *   runDueRefundDecisions 扫描到期 scheduled 单 → connector.decideReverse。
 *
 * marketplace connector 的 listReverseOrders / getReverseOrderDetail / decideReverse
 * 当前为可选接口，adapter 未实现时本轮跳过该店铺并写 integration_logs。
 */
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import {
  integrationLogs,
  integrationStates,
  organization,
  refunds,
  reverseOrders,
  reverseOrderItems,
  shopAftersalePolicies,
  shops,
} from "@workspace/db"
import { db } from "../db"
import { createShopConnector } from "./connector"
import { isLazopPlatform } from "./app-env"
import type {
  DomainReverseDecideInput,
  DomainReverseOrderDetail,
} from "@workspace/marketplace"
import type { MarketplaceSyncShop } from "./sync"

const DAY_MS = 24 * 60 * 60 * 1000

let reverseInflight: Promise<unknown> | null = null
let decideInflight: Promise<unknown> | null = null

/** 由 cron 路由触发：售后逆向单同步。返回是否已接受执行。 */
export function triggerReverseSync(): boolean {
  if (reverseInflight) return false
  const task = runReverseSyncForAllShops()
    .then((r) => console.info("[reverse-sync] completed", r))
    .catch((error) => console.error("[reverse-sync] failed", error))
    .finally(() => {
      if (reverseInflight === task) reverseInflight = null
    })
  reverseInflight = task
  return true
}

/** 由 cron 路由触发：到期退款决定。 */
export function triggerDueRefundDecisions(): boolean {
  if (decideInflight) return false
  const task = runDueRefundDecisions()
    .then((r) => console.info("[reverse-refund-decide] completed", r))
    .catch((error) => console.error("[reverse-refund-decide] failed", error))
    .finally(() => {
      if (decideInflight === task) decideInflight = null
    })
  decideInflight = task
  return true
}

/**
 * 单张逆向单补拉（webhook 触发）：拉详情 → 建档 → 策略释放 / 排期。
 * 与 runReverseSyncForAllShops 共用 ingestReverseViaApi。
 */
export async function syncReverseOrder(input: {
  shop: MarketplaceSyncShop
  externalReverseOrderId: string
  now?: Date
}): Promise<void> {
  const now = input.now ?? new Date()
  const connector = await createShopConnector(input.shop)
  if (!connector.getReverseOrderDetail) {
    await logIntegration({
      shopId: input.shop.id,
      action: "reverse.webhook_sync",
      status: "error",
      message: `${input.shop.platform} connector 未实现 getReverseOrderDetail，跳过单号补拉`,
    })
    return
  }
  const detail = await connector.getReverseOrderDetail(
    input.externalReverseOrderId,
  )
  await ingestReverseViaApi(input.shop, detail, now)
  await logIntegration({
    shopId: input.shop.id,
    action: "reverse.webhook_sync",
    status: "success",
    message: `${input.shop.platform} reverse ${input.externalReverseOrderId} synced via push`,
  })
}

function envInt(name: string, fallback: number): number {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function platformTime(value: unknown): Date | null {
  if (value == null || value === "") return null
  const numeric = typeof value === "number" ? value : Number(value)
  if (Number.isFinite(numeric) && numeric > 0) {
    const ms = numeric < 1_000_000_000_000 ? numeric * 1000 : numeric
    const date = new Date(ms)
    return Number.isNaN(date.getTime()) ? null : date
  }
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date
}

async function loadShopsForReverse(): Promise<MarketplaceSyncShop[]> {
  const rows = await db
    .select({
      id: shops.id,
      organizationId: shops.organizationId,
      platform: shops.platform,
      name: shops.name,
      region: shops.region,
      currency: shops.currency,
      meta: shops.meta,
    })
    .from(shops)
    .innerJoin(organization, eq(organization.id, shops.organizationId))
    .leftJoin(integrationStates, eq(integrationStates.shopId, shops.id))
    .where(
      and(
        inArray(shops.platform, ["daraz", "lazada", "tiktok_shop"]),
        inArray(shops.status, ["active", "error"]),
        isNull(shops.deletedAt),
        eq(organization.entryApproved, true),
        sql`coalesce((${shops.meta} ->> 'syncPaused')::boolean, false) = false`,
      ),
    )
  return rows
}

async function logIntegration(input: {
  shopId: string
  action: string
  status: "success" | "error"
  message: string
  payloadSummary?: Record<string, unknown>
}) {
  await db.insert(integrationLogs).values({
    shopId: input.shopId,
    direction: "in",
    action: input.action,
    status: input.status,
    message: input.message,
    payloadSummary: input.payloadSummary
      ? JSON.stringify(input.payloadSummary).slice(0, 2000)
      : null,
  })
}

/**
 * 同步售后逆向单：拉取 → 建档（含策略释放 / 排期）。
 * connector 未实现 listReverseOrders 时跳过并记录。
 */
export async function runReverseSyncForAllShops(now: Date = new Date()): Promise<{
  shops: number
  ingested: number
  skipped: number
  errors: Array<{ shopId: string; message: string }>
}> {
  const shopRows = await loadShopsForReverse()
  const result = { shops: shopRows.length, ingested: 0, skipped: 0, errors: [] as Array<{ shopId: string; message: string }> }

  for (const shop of shopRows) {
    try {
      const connector = await createShopConnector(shop)
      if (!connector.listReverseOrders || !connector.getReverseOrderDetail) {
        result.skipped += 1
        await logIntegration({
          shopId: shop.id,
          action: "reverse.sync",
          status: "error",
          message: `${shop.platform} connector 未实现 listReverseOrders，跳过售后同步`,
        })
        continue
      }

      const state = await db
        .select()
        .from(integrationStates)
        .where(eq(integrationStates.shopId, shop.id))
        .limit(1)
      const overlapMs = envInt("MARKETPLACE_SYNC_REVERSE_OVERLAP_MINUTES", 60) * 60 * 1000
      const backfillDays = envInt("MARKETPLACE_SYNC_REVERSE_BACKFILL_DAYS", 7)
      const updatedAfter = state[0]?.lastReverseSyncAt
        ? new Date(state[0].lastReverseSyncAt.getTime() - overlapMs)
        : new Date(now.getTime() - backfillDays * DAY_MS)
      const maxPages = envInt("MARKETPLACE_SYNC_REVERSE_MAX_PAGES", 5)
      const pageSize = envInt("MARKETPLACE_SYNC_REVERSE_PAGE_SIZE", 50)

      let cursor: string | null = null
      let count = 0
      for (let page = 0; page < maxPages; page += 1) {
        const page1 = await connector.listReverseOrders({
          cursor,
          pageSize,
          updatedAfter: updatedAfter.toISOString(),
          updatedBefore: now.toISOString(),
        })
        for (const summary of page1.items) {
          if (!summary.externalReverseOrderId) continue
          let detail: DomainReverseOrderDetail
          try {
            detail = await connector.getReverseOrderDetail(
              summary.externalReverseOrderId,
            )
          } catch (err) {
            await logIntegration({
              shopId: shop.id,
              action: "reverse.detail",
              status: "error",
              message: `detail failed for ${summary.externalReverseOrderId}: ${err instanceof Error ? err.message : String(err)}`,
            })
            continue
          }
          await ingestReverseViaApi(shop, detail, now)
          count += 1
        }
        if (!page1.nextCursor) break
        cursor = page1.nextCursor
      }

      await db
        .insert(integrationStates)
        .values({ shopId: shop.id, health: "success", lastReverseSyncAt: now })
        .onConflictDoUpdate({
          target: integrationStates.shopId,
          set: { health: "success", lastReverseSyncAt: now, lastError: null },
        })
      result.ingested += count
      await logIntegration({
        shopId: shop.id,
        action: "reverse.sync",
        status: "success",
        message: `${shop.platform} reverse synced`,
        payloadSummary: { ingested: count },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      result.errors.push({ shopId: shop.id, message })
      await logIntegration({
        shopId: shop.id,
        action: "reverse.sync",
        status: "error",
        message: message.slice(0, 1000),
      })
    }
  }
  return result
}

/**
 * apps/api 侧建档：直接写表（apps/shop dataaccess 不是 workspace 包，无法跨包导入）。
 * 与 apps/shop dataaccess/aftersale.ts ingestReverse 行为一致：
 *   - upsert reverse_orders / reverse_order_items / refunds
 *   - 按 shop_aftersale_policies 释放占库 / 排期退款
 * 占库释放的库存流水由 apps/shop 侧 releaseReserved 在控制台触发；
 * 本轮 cron 仅写决策状态，不直接改 inventory_balances（避免与 shop 事务逻辑分叉）。
 */
async function ingestReverseViaApi(
  shop: MarketplaceSyncShop,
  detail: DomainReverseOrderDetail,
  now: Date,
): Promise<void> {
  const requestType = detail.requestType
  const platformCreatedAt = platformTime(detail.platformCreatedAt) ?? now
  const line = detail.lines[0]
  const refundAmount = line?.refundAmount ? Number(line.refundAmount) : 0
  const currency = line?.currency || shop.currency

  const [policy] = await db
    .select()
    .from(shopAftersalePolicies)
    .where(eq(shopAftersalePolicies.shopId, shop.id))
    .limit(1)
  const inventoryReleaseMode = (policy?.inventoryReleaseMode as "manual" | "auto") ?? "manual"
  const refundMode = (policy?.refundMode as "manual" | "auto") ?? "manual"
  const refundWaitDays = policy?.refundWaitDays ?? 1
  const autoRefundSupported = isLazopPlatform(shop.platform)

  let refundDecision: string
  let refundDueAt: Date | null = null
  if (requestType === "CANCEL" || requestType === "ONLY_REFUND") {
    if (refundMode === "auto" && autoRefundSupported) {
      const due = new Date(platformCreatedAt.getTime() + refundWaitDays * DAY_MS)
      refundDueAt = due < now ? now : due
      refundDecision = "scheduled"
    } else if (!autoRefundSupported) {
      refundDecision = "unsupported"
    } else {
      refundDecision = "pending_manual"
    }
  } else {
    refundDecision = "pending_manual"
  }

  const raw = {
    typeLabel: requestType === "ONLY_REFUND" ? "仅退款" : requestType === "CANCEL" ? "取消订单" : "退货退款",
    reason: line?.reasonText || "",
    reasonCode: line?.reasonCode || "",
    refundAmount,
    currency,
    sku: line?.sellerSku || "",
    shopName: shop.name,
    releaseReserved: requestType === "CANCEL" ? 1 : 0,
  platformSync: "已同步",
  uiStatus: requestType === "CANCEL" || requestType === "ONLY_REFUND" ? "待确认" : "待确认",
    cancelStatus: "待确认",
  }

  const [existing] = await db
    .select()
    .from(reverseOrders)
    .where(
      and(
        eq(reverseOrders.shopId, shop.id),
        eq(reverseOrders.externalReverseOrderId, detail.externalReverseOrderId),
      ),
    )
    .limit(1)

  let reverseId: string
  if (existing) {
    reverseId = existing.id
    await db
      .update(reverseOrders)
      .set({
        requestType,
        platformStatus: (detail.raw?.status as string) || existing.platformStatus,
        platformCreatedAt,
        platformUpdatedAt: now,
        refundDecision: refundDecision as never,
        refundDueAt,
        raw: { ...existing.raw, ...raw },
        updatedAt: now,
      })
      .where(eq(reverseOrders.id, existing.id))
  } else {
    reverseId = randomUUID()
    await db.insert(reverseOrders).values({
      id: reverseId,
      organizationId: shop.organizationId,
      shopId: shop.id,
      externalReverseOrderId: detail.externalReverseOrderId,
      externalTradeOrderId: detail.externalTradeOrderId || null,
      requestType,
      platformStatus: (detail.raw?.status as string) || "REVERSE_REQUESTED",
      platformCreatedAt,
      platformUpdatedAt: now,
      inventoryReleaseMode,
      inventoryReleaseStatus: "pending_manual",
      refundMode,
      refundWaitDays,
      refundDecision: refundDecision as never,
      refundDueAt,
      raw,
    })
  }

  // 逆向行
  if (line) {
    const [existLine] = await db
      .select()
      .from(reverseOrderItems)
      .where(
        and(
          eq(reverseOrderItems.shopId, shop.id),
          eq(reverseOrderItems.externalReverseLineId, line.externalReverseLineId),
        ),
      )
      .limit(1)
    if (existLine) {
      await db
        .update(reverseOrderItems)
        .set({
          reverseStatus: line.reverseStatus || existLine.reverseStatus,
          reasonCode: line.reasonCode || existLine.reasonCode,
          reasonText: line.reasonText || existLine.reasonText,
          refundAmount: line.refundAmount ?? existLine.refundAmount,
          currency: line.currency || existLine.currency,
          updatedAt: now,
        })
        .where(eq(reverseOrderItems.id, existLine.id))
    } else {
      await db.insert(reverseOrderItems).values({
        id: randomUUID(),
        organizationId: shop.organizationId,
        shopId: shop.id,
        reverseOrderId: reverseId,
        externalReverseLineId: line.externalReverseLineId,
        externalOrderLineId: line.externalOrderLineId || null,
        reverseStatus: line.reverseStatus || null,
        reasonCode: line.reasonCode || null,
        reasonText: line.reasonText || null,
        refundAmount: line.refundAmount ?? null,
        currency: line.currency || currency,
        isNeedRefund: refundAmount > 0,
      })
    }
  }

  // 退款行
  if (refundAmount > 0) {
    const [existRefund] = await db
      .select()
      .from(refunds)
      .where(and(eq(refunds.organizationId, shop.organizationId), eq(refunds.reverseOrderId, reverseId)))
      .limit(1)
    if (!existRefund) {
      await db.insert(refunds).values({
        id: randomUUID(),
        organizationId: shop.organizationId,
        shopId: shop.id,
        reverseOrderId: reverseId,
        externalRefundId: `RF-${detail.externalReverseOrderId}`,
        amount: String(refundAmount),
        currency,
        status: "pending",
      })
    }
  }
}

/**
 * 扫描到期 scheduled 退款决定，调用 connector.decideReverse。
 */
export async function runDueRefundDecisions(now: Date = new Date()): Promise<{
  processed: number
  agreed: number
  rejected: number
  errors: Array<{ reverseOrderId: string; message: string }>
}> {
  const result = { processed: 0, agreed: 0, rejected: 0, errors: [] as Array<{ reverseOrderId: string; message: string }> }

  const candidates = await db
    .select({
      id: reverseOrders.id,
      organizationId: reverseOrders.organizationId,
      shopId: reverseOrders.shopId,
      externalReverseOrderId: reverseOrders.externalReverseOrderId,
      requestType: reverseOrders.requestType,
      refundDecision: reverseOrders.refundDecision,
      refundDueAt: reverseOrders.refundDueAt,
    })
    .from(reverseOrders)
    .where(
      and(
        eq(reverseOrders.refundDecision, "scheduled"),
        gte(reverseOrders.refundDueAt, new Date(0)),
        sql`${reverseOrders.refundDueAt} <= ${now}`,
      ),
    )
    .orderBy(desc(reverseOrders.refundDueAt))
    .limit(envInt("MARKETPLACE_SYNC_REVERSE_DECIDE_LIMIT", 50))

  for (const c of candidates) {
    if (c.requestType !== "CANCEL" && c.requestType !== "ONLY_REFUND") continue
    result.processed += 1
    try {
      const [shop] = await db
        .select({
          id: shops.id,
          organizationId: shops.organizationId,
          platform: shops.platform,
          name: shops.name,
          region: shops.region,
          currency: shops.currency,
          meta: shops.meta,
        })
        .from(shops)
        .where(eq(shops.id, c.shopId))
        .limit(1)
      if (!shop) throw new Error("店铺不存在")

      const connector = await createShopConnector(shop)
      if (!connector.decideReverse) {
        await db
          .update(reverseOrders)
          .set({ refundDecision: "unsupported", updatedAt: now })
          .where(eq(reverseOrders.id, c.id))
        await logIntegration({
          shopId: shop.id,
          action: "reverse.refund_decide",
          status: "error",
          message: `${shop.platform} connector 未实现 decideReverse，标记 unsupported`,
        })
        continue
      }

      // 决定前再拉详情校验状态（设计 §4.2）。
      if (connector.getReverseOrderDetail) {
        const detail = await connector.getReverseOrderDetail(c.externalReverseOrderId)
        const lineStatus = (detail.lines[0]?.reverseStatus || "").toUpperCase()
        if (lineStatus && lineStatus !== "REQUEST_INITIATE") {
          await db
            .update(reverseOrders)
            .set({ refundDecision: "skipped", updatedAt: now })
            .where(eq(reverseOrders.id, c.id))
          continue
        }
        if (detail.disputeInProgress) {
          await db
            .update(reverseOrders)
            .set({ refundDecision: "skipped", updatedAt: now })
            .where(eq(reverseOrders.id, c.id))
          continue
        }
      }

      const input: DomainReverseDecideInput = {
        externalReverseOrderId: c.externalReverseOrderId,
        requestType: c.requestType as DomainReverseDecideInput["requestType"],
        agree: true,
      }
      const res = await connector.decideReverse(input)
      if (res.ok) {
        await db
          .update(reverseOrders)
          .set({ refundDecision: "agreed", updatedAt: now })
          .where(eq(reverseOrders.id, c.id))
        result.agreed += 1
      } else {
        result.errors.push({ reverseOrderId: c.id, message: "decideReverse 返回失败" })
      }
      await logIntegration({
        shopId: shop.id,
        action: "reverse.refund_decide",
        status: res.ok ? "success" : "error",
        message: `${shop.platform} reverse ${c.externalReverseOrderId} decide ${res.ok ? "agreed" : "failed"}`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      result.errors.push({ reverseOrderId: c.id, message })
      await logIntegration({
        shopId: c.shopId,
        action: "reverse.refund_decide",
        status: "error",
        message: message.slice(0, 1000),
      })
    }
  }
  return result
}
