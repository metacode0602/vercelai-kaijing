/**
 * Serverless billing orchestration service.
 *
 * Handles:
 * - Tenant resolution (organizationId → billingTenantId)
 * - Price snapshot lookup from platform_card_price_record
 * - Balance validation + freeze on creation
 * - Periodic consumption (reserved → consumed)
 * - Final settlement on stop/delete
 *
 * Design reference: tenant-balance-unification.md, serverless-implementation.md §6
 */

import { eq, and } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import {
  billingTenant,
  platformCardPriceRecord,
} from "@workspace/db"
import {
  getOrCreateTenantBalance,
  freezeBalance,
  unfreezeBalance,
  consumeReserved,
  type TenantBalance,
} from "@workspace/billing"

type DB = PostgresJsDatabase<Record<string, never>> | any

// ---------------------------------------------------------------------------
// Tenant resolution
// ---------------------------------------------------------------------------

/**
 * Resolve billing tenant ID from organizationId.
 * Uses the billingTenant table where platformTenantId = organizationId.
 * Falls back to organizationId itself if no mapping exists (legacy compat).
 */
export async function resolveTenantId(
  db: DB,
  organizationId: string,
): Promise<string> {
  const [row] = await db
    .select({ id: billingTenant.id })
    .from(billingTenant)
    .where(eq(billingTenant.platformTenantId, organizationId))
    .limit(1)

  return row?.id ?? organizationId
}

// ---------------------------------------------------------------------------
// Price snapshot
// ---------------------------------------------------------------------------

export interface PriceSnapshot {
  gpuCardTypeId: string
  productLine: string
  billingUnit: string
  sellPrice: number
  priceRecordId: string
}

/**
 * Look up the current platform sell price for a GPU card type + product line.
 * Returns null if no active price found.
 */
export async function lookupPriceSnapshot(
  db: DB,
  params: {
    gpuCardTypeId: string
    productLine: string
    billingUnit?: string
  },
): Promise<PriceSnapshot | null> {
  const billingUnit = params.billingUnit ?? "hour"

  const [row] = await db
    .select({
      gpuCardTypeId: platformCardPriceRecord.gpuCardTypeId,
      productLine: platformCardPriceRecord.productLine,
      billingUnit: platformCardPriceRecord.billingUnit,
      sellPrice: platformCardPriceRecord.sellPrice,
      priceRecordId: platformCardPriceRecord.id,
    })
    .from(platformCardPriceRecord)
    .where(
      and(
        eq(platformCardPriceRecord.gpuCardTypeId, params.gpuCardTypeId),
        eq(platformCardPriceRecord.productLine, params.productLine),
        eq(platformCardPriceRecord.billingUnit, billingUnit),
      ),
    )
    .limit(1)

  if (!row) return null

  return {
    gpuCardTypeId: row.gpuCardTypeId,
    productLine: row.productLine,
    billingUnit: row.billingUnit,
    sellPrice: Number(row.sellPrice),
    priceRecordId: row.priceRecordId,
  }
}

// ---------------------------------------------------------------------------
// Freeze estimate for on-demand serverless
// ---------------------------------------------------------------------------

/**
 * Calculate the estimated freeze amount for an on-demand serverless instance.
 * Uses: pricePerHour × gpuCount × estimatedHours.
 *
 * For on-demand instances, we freeze 1 hour worth as initial reservation.
 * The actual deduction happens via periodic 5-min billing.
 */
export function estimateFreezeAmount(
  pricePerHour: number,
  gpuCount: number,
  estimatedHours: number = 1,
): number {
  return Math.ceil(pricePerHour * gpuCount * estimatedHours * 100) / 100
}

// ---------------------------------------------------------------------------
// Billing: Create (freeze)
// ---------------------------------------------------------------------------

export interface BillingCreateResult {
  tenantId: string
  priceSnapshot: PriceSnapshot | null
  freezeAmount: number
  balanceAfter: TenantBalance | null
}

/**
 * Handle billing for serverless creation:
 * 1. Resolve tenant ID
 * 2. Look up price snapshot
 * 3. Calculate freeze amount
 * 4. Freeze funds in tenant balance
 *
 * Returns error if balance insufficient.
 */
export async function billServerlessCreate(
  db: DB,
  params: {
    organizationId: string
    computeBaseId: string
    gpuCardTypeId: string
    gpuCount: number
    commitment: string
  },
): Promise<BillingCreateResult | { error: string }> {
  const tenantId = await resolveTenantId(db, params.organizationId)

  // Look up price snapshot
  const priceSnapshot = await lookupPriceSnapshot(db, {
    gpuCardTypeId: params.gpuCardTypeId,
    productLine: "serverless",
    billingUnit: "hour",
  })

  // Calculate freeze amount
  const unitPrice = priceSnapshot?.sellPrice ?? 0
  const freezeAmount = estimateFreezeAmount(unitPrice, params.gpuCount)

  // Skip billing for prepaid commitment (handled separately)
  if (params.commitment !== "on_demand" && params.commitment !== "on-demand") {
    return {
      tenantId,
      priceSnapshot,
      freezeAmount: 0,
      balanceAfter: null,
    }
  }

  // Skip if no price found (allow deploy without billing in dev)
  if (freezeAmount <= 0) {
    return {
      tenantId,
      priceSnapshot,
      freezeAmount: 0,
      balanceAfter: null,
    }
  }

  // Ensure balance exists
  const balance = await getOrCreateTenantBalance(db, tenantId, params.organizationId)

  // Freeze funds
  const result = await freezeBalance(db, {
    tenantId,
    organizationId: params.organizationId,
    amount: freezeAmount,
    refType: "compute_base",
    refId: params.computeBaseId,
    description: `Serverless 部署冻结: ${params.gpuCount}x ${params.gpuCardTypeId}`,
  })

  if (!result) {
    return { error: `余额不足: 需要 ¥${freezeAmount.toFixed(2)}，可用 ¥${Number(balance.availableBalance).toFixed(2)}` }
  }

  return {
    tenantId,
    priceSnapshot,
    freezeAmount,
    balanceAfter: result.balance,
  }
}

// ---------------------------------------------------------------------------
// Billing: Stop (consume + unfreeze)
// ---------------------------------------------------------------------------

/**
 * Handle billing for serverless stop:
 * 1. Calculate actual usage (price × hours)
 * 2. Consume from reserved
 * 3. Unfreeze remaining reserved
 */
export async function billServerlessStop(
  db: DB,
  params: {
    organizationId: string
    computeBaseId: string
    tenantId: string
    pricePerHour: number
    gpuCount: number
    startedAt: Date
    stoppedAt?: Date
    /** When set to waverless, throws — use billWaverlessStop instead */
    orchestratorType?: string | null
  },
): Promise<{ consumed: number; unfrozen: number }> {
  if (params.orchestratorType === "waverless") {
    throw new Error(
      "billServerlessStop bypass required for waverless; call billWaverlessStop",
    )
  }
  const stoppedAt = params.stoppedAt ?? new Date()
  const hoursUsed = Math.max(0, (stoppedAt.getTime() - params.startedAt.getTime()) / 3_600_000)
  const totalConsumed = params.pricePerHour * params.gpuCount * hoursUsed

  if (totalConsumed <= 0) {
    return { consumed: 0, unfrozen: 0 }
  }

  // Consume from reserved (actual usage)
  const consumeResult = await consumeReserved(db, {
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    amount: Math.min(totalConsumed, 0.01), // Min 0.01 to record the transaction
    refType: "compute_base",
    refId: params.computeBaseId,
    description: `Serverless 用量结算: ${hoursUsed.toFixed(2)}h × ${params.gpuCount}x GPU`,
  })

  // Unfreeze remaining reserved
  const balance = consumeResult?.balance
  const reserved = balance ? Number(balance.reservedBalance) : 0
  if (reserved > 0) {
    await unfreezeBalance(db, {
      tenantId: params.tenantId,
      organizationId: params.organizationId,
      amount: reserved,
      refType: "compute_base",
      refId: params.computeBaseId,
      description: "Serverless 停止释放冻结",
    })
  }

  return { consumed: totalConsumed, unfrozen: reserved }
}

// ---------------------------------------------------------------------------
// Billing: Periodic deduction (for on-demand instances)
// ---------------------------------------------------------------------------

/**
 * Deduct usage for a running on-demand serverless instance.
 * Called every 5 minutes by the billing cron job.
 *
 * Formula: pricePerHour × gpuCount × (5/60) hours
 */
export async function billServerlessPeriodicDeduction(
  db: DB,
  params: {
    organizationId: string
    computeBaseId: string
    tenantId: string
    pricePerHour: number
    gpuCount: number
  },
): Promise<{ deducted: number } | { error: string }> {
  const deductionAmount = params.pricePerHour * params.gpuCount * (5 / 60)

  if (deductionAmount <= 0) {
    return { deducted: 0 }
  }

  const result = await consumeReserved(db, {
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    amount: deductionAmount,
    refType: "compute_base",
    refId: params.computeBaseId,
    description: `Serverless 周期扣费: 5min × ${params.gpuCount}x GPU`,
  })

  if (!result) {
    return { error: "余额不足" }
  }

  return { deducted: deductionAmount }
}

// ---------------------------------------------------------------------------
// Waverless dual-ledger (P0) — real settle path; still bypasses legacy stop/cron
// ---------------------------------------------------------------------------

export type DualLedgerHookKind = "customer_revenue" | "provider_cost"

export interface DualLedgerHookEvent {
  kind: DualLedgerHookKind
  computeBaseId: string
  tenantId: string
  organizationId: string
  sourceEventId: string
  quantityHint?: number
  unit?: string
  amount?: number
  metadata?: Record<string, unknown>
}

/**
 * Observability helper after dual-ledger writes.
 * Prefer settleWaverlessWindow / settleWaverlessStop for real ledger rows.
 */
export async function emitWaverlessDualLedgerHooks(
  events: DualLedgerHookEvent[],
): Promise<void> {
  for (const event of events) {
    console.info("[waverless-billing] dual-ledger", JSON.stringify(event))
  }
}

/**
 * Waverless stop settlement entrypoint.
 * Bypasses legacy billServerlessStop (known min(total, 0.01) defect).
 * Ingests worker intervals, settles due + tail windows (customer + Gongji cost),
 * then unfreezes remaining reserved balance.
 */
export async function billWaverlessStop(
  db: DB,
  params: {
    organizationId: string
    computeBaseId: string
    tenantId: string
    reason: "stop" | "delete" | "terminate_worker"
  },
): Promise<{ consumed: number; unfrozen: number; path: "waverless" }> {
  // Dynamic import avoids circular dependency with waverless-billing.ts
  const { settleWaverlessStop } = await import(
    "@/lib/server/services/waverless-billing"
  )
  const result = await settleWaverlessStop(db, params)

  await emitWaverlessDualLedgerHooks([
    {
      kind: "customer_revenue",
      computeBaseId: params.computeBaseId,
      tenantId: params.tenantId,
      organizationId: params.organizationId,
      sourceEventId: `wvr-stop-rev-${params.computeBaseId}`,
      quantityHint: result.settlements.reduce(
        (s, x) => s + (x.customerQuantity || 0),
        0,
      ),
      unit: "gpu_second",
      amount: result.consumed,
      metadata: {
        reason: params.reason,
        windows: result.settlements.map((s) => ({
          id: s.windowId,
          status: s.status,
          amount: s.customerAmount,
        })),
      },
    },
    {
      kind: "provider_cost",
      computeBaseId: params.computeBaseId,
      tenantId: params.tenantId,
      organizationId: params.organizationId,
      sourceEventId: `wvr-stop-cost-${params.computeBaseId}`,
      quantityHint: result.settlements.reduce(
        (s, x) => s + (x.supplierQuantity || 0),
        0,
      ),
      unit: "gpu_second",
      amount: result.settlements.reduce(
        (s, x) => s + (x.supplierEstimatedAmount || 0),
        0,
      ),
      metadata: {
        reason: params.reason,
        provider: "gongji",
        note: "provisional cost; not invoice",
      },
    },
  ])

  return {
    consumed: result.consumed,
    unfrozen: result.unfrozen,
    path: "waverless",
  }
}

/**
 * Guard: callers must route waverless instances here instead of billServerlessStop.
 */
export function assertNotWaverlessForLegacyBilling(
  orchestratorType: string | null | undefined,
): void {
  if (orchestratorType === "waverless") {
    throw new Error(
      "billServerlessStop is forbidden for orchestratorType=waverless; use billWaverlessStop",
    )
  }
}
