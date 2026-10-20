/**
 * Waverless P0 dual-ledger billing (customer revenue ≠ Gongji supplier cost).
 *
 * - Ingest usage (poll workers or push API)
 * - Settle UTC 5-minute windows + stop tail
 * - Write customer ledger + supplier cost ledger separately
 * - Never call legacy billServerlessStop / SkyPilot cron amounts
 *
 * Assumptions: docs/design/cloud/waverless-billing-p0-assumptions.md
 */

import { and, desc, eq, gte, lt, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import {
  computeBase,
  computeBillingContractSnapshot,
  computeBillingWindow,
  computeCustomerLedgerEntry,
  computeSupplierCostEntry,
  computeUsageEvent,
  serverlessDetail,
} from "@workspace/db"
import { consumeReserved, getOrCreateTenantBalance, unfreezeBalance } from "@workspace/billing"

import {
  listWaverlessWorkers,
  type WaverlessWorker,
  type WaverlessWorkerStatus,
} from "@/lib/server/services/waverless"
import { resolveTenantId } from "@/lib/server/services/billing"

import {
  floorToWindowStart,
  getGongjiCostRatePerGpuHour,
  gpuSecondsToAmount,
  roundMoney4,
  windowEndFromStart,
  windowIdempotencyKey,
  windowConsumeIdempotencyKey,
} from "@/lib/server/services/waverless-billing-math"
import {
  applyBillingSuspensionAndDrain,
  clearBillingSuspensionAfterSettle,
  recordIngestCursor,
} from "@/lib/server/services/waverless-billing-lifecycle"

export {
  floorToWindowStart,
  getGongjiCostRatePerGpuHour,
  gpuSecondsToAmount,
  roundMoney4,
  windowEndFromStart,
  windowIdempotencyKey,
} from "@/lib/server/services/waverless-billing-math"

type DB = PostgresJsDatabase<Record<string, never>> | any

const CUSTOMER_BILLABLE_STATUSES = new Set<WaverlessWorkerStatus | string>([
  "READY",
  "BUSY",
  "DRAINING",
])

function usageSourceEventId(
  computeBaseId: string,
  workerId: string,
  intervalStart: Date,
  intervalEnd: Date,
): string {
  return `wvr:${computeBaseId}:${workerId}:${intervalStart.toISOString()}:${intervalEnd.toISOString()}`
}

function overlapMs(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): number {
  const start = Math.max(aStart.getTime(), bStart.getTime())
  const end = Math.min(aEnd.getTime(), bEnd.getTime())
  return Math.max(0, end - start)
}

export function customerBillableInterval(
  worker: WaverlessWorker,
  now: Date = new Date(),
): { start: Date; end: Date } | null {
  const status = worker.status
  const readyAt = worker.readyAt ? new Date(worker.readyAt) : null
  const createdAt = worker.createdAt ? new Date(worker.createdAt) : null
  const terminatedAt = worker.terminatedAt ? new Date(worker.terminatedAt) : null

  let start: Date | null = readyAt
  if (!start && CUSTOMER_BILLABLE_STATUSES.has(status) && createdAt) {
    start = createdAt
  }
  if (!start) return null

  const end = terminatedAt && terminatedAt.getTime() < now.getTime() ? terminatedAt : now
  if (end.getTime() <= start.getTime()) return null
  return { start, end }
}

// ---------------------------------------------------------------------------
// Create-time immutable contract snapshot
// ---------------------------------------------------------------------------

/** Frozen sell + Gongji cost rates for an endpoint (never re-read live env/price). */
export interface WaverlessContractRates {
  snapshotId: string
  sellPricePerGpuHour: number
  priceRecordId: string | null
  costRatePerGpuHour: number
  currency: string
  supplierRateMissing: boolean
  gpuCardTypeId: string
}

export async function getBillingContractSnapshot(
  db: DB,
  computeBaseId: string,
): Promise<WaverlessContractRates | null> {
  const [row] = await db
    .select()
    .from(computeBillingContractSnapshot)
    .where(eq(computeBillingContractSnapshot.computeBaseId, computeBaseId))
    .limit(1)

  if (!row) return null

  const meta = (row.metadata ?? {}) as Record<string, unknown>
  const costRate = Number(row.supplierCostRatePerGpuHour)
  return {
    snapshotId: row.id,
    sellPricePerGpuHour: Number(row.customerSellPricePerGpuHour),
    priceRecordId: row.customerPriceRecordId,
    costRatePerGpuHour: costRate,
    currency: row.currency,
    supplierRateMissing: Boolean(meta.supplierRateMissing) || costRate <= 0,
    gpuCardTypeId: row.customerGpuCardTypeId,
  }
}

/**
 * Persist create-time sell price + Gongji cost rate. Idempotent on computeBaseId.
 * Call only from waverless create path after price lookup.
 */
export async function createBillingContractSnapshot(
  db: DB,
  params: {
    computeBaseId: string
    tenantId: string
    organizationId: string
    purchaseType?: string
    sellPricePerGpuHour: number
    priceRecordId?: string | null
    gpuCardTypeId: string
    productLine?: string
    billingUnit?: string
    /** Freeze env cost at create; omit to read WAVERLESS_GONGJI_COST_PER_GPU_HOUR once */
    supplierCostRatePerGpuHour?: number
    currency?: string
    metadata?: Record<string, unknown>
  },
): Promise<WaverlessContractRates> {
  const existing = await getBillingContractSnapshot(db, params.computeBaseId)
  if (existing) return existing

  const costRate =
    params.supplierCostRatePerGpuHour ?? getGongjiCostRatePerGpuHour()
  const rateMissing = !(costRate > 0)
  const id = crypto.randomUUID()

  await db.insert(computeBillingContractSnapshot).values({
    id,
    computeBaseId: params.computeBaseId,
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    purchaseType: params.purchaseType ?? "on_demand",
    currency: params.currency ?? "CNY",
    customerSellPricePerGpuHour: String(params.sellPricePerGpuHour),
    customerPriceRecordId: params.priceRecordId ?? null,
    customerGpuCardTypeId: params.gpuCardTypeId,
    customerProductLine: params.productLine ?? "serverless",
    customerBillingUnit: params.billingUnit ?? "hour",
    supplierProviderId: "gongji",
    supplierCostRatePerGpuHour: String(costRate),
    snappedAt: new Date(),
    metadata: {
      supplierRateMissing: rateMissing,
      rateSource: rateMissing ? "rate_missing" : "WAVERLESS_GONGJI_COST_PER_GPU_HOUR",
      sellPriceSource: "platform_card_price_record",
      ...(params.metadata ?? {}),
    },
  })

  return {
    snapshotId: id,
    sellPricePerGpuHour: params.sellPricePerGpuHour,
    priceRecordId: params.priceRecordId ?? null,
    costRatePerGpuHour: costRate,
    currency: params.currency ?? "CNY",
    supplierRateMissing: rateMissing,
    gpuCardTypeId: params.gpuCardTypeId,
  }
}

// ---------------------------------------------------------------------------
// Usage ingest (push)
// ---------------------------------------------------------------------------

export interface IngestUsageEventInput {
  sourceEventId: string
  eventVersion?: number
  tenantId: string
  organizationId: string
  computeBaseId: string
  workerId: string
  providerId?: string
  providerResourceId?: string | null
  logicalAzId?: string | null
  gpuCount?: number
  intervalStart: Date | string
  intervalEnd: Date | string
  occurredAt?: Date | string
  metadata?: Record<string, unknown>
}

/**
 * Insert one usage event. Idempotent on (source, sourceEventId, eventVersion).
 * Returns inserted=false when the unique key already exists.
 */
export async function ingestUsageEvent(
  db: DB,
  input: IngestUsageEventInput,
): Promise<{ id: string; inserted: boolean }> {
  const intervalStart = new Date(input.intervalStart)
  const intervalEnd = new Date(input.intervalEnd)
  if (!(intervalEnd > intervalStart)) {
    throw new Error("intervalEnd must be after intervalStart")
  }
  const gpuCount = Math.max(1, input.gpuCount ?? 1)
  const quantity = ((intervalEnd.getTime() - intervalStart.getTime()) / 1000) * gpuCount
  const id = crypto.randomUUID()
  const eventVersion = input.eventVersion ?? 1

  const rows = await db
    .insert(computeUsageEvent)
    .values({
      id,
      source: "waverless",
      sourceEventId: input.sourceEventId,
      eventVersion,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      computeBaseId: input.computeBaseId,
      workerId: input.workerId,
      providerId: input.providerId ?? "gongji",
      providerResourceId: input.providerResourceId ?? null,
      logicalAzId: input.logicalAzId ?? null,
      meter: "gpu_runtime",
      quantity: String(roundMoney4(quantity)),
      unit: "gpu_second",
      gpuCount,
      intervalStart,
      intervalEnd,
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : intervalEnd,
      sliceStatus: "closed",
      metadata: input.metadata ?? {},
    })
    .onConflictDoNothing()
    .returning({ id: computeUsageEvent.id })

  if (rows[0]?.id) {
    return { id: rows[0].id, inserted: true }
  }

  const [existing] = await db
    .select({ id: computeUsageEvent.id })
    .from(computeUsageEvent)
    .where(
      and(
        eq(computeUsageEvent.source, "waverless"),
        eq(computeUsageEvent.sourceEventId, input.sourceEventId),
        eq(computeUsageEvent.eventVersion, eventVersion),
      ),
    )
    .limit(1)

  return { id: existing?.id ?? id, inserted: false }
}

// ---------------------------------------------------------------------------
// Usage ingest (poll workers → per-window slices)
// ---------------------------------------------------------------------------

export interface PollIngestResult {
  computeBaseId: string
  workersSeen: number
  eventsInserted: number
  eventsSkipped: number
  error?: string
}

/**
 * Derive closed usage slices for [windowStart, windowEnd) from live worker list.
 * One event per worker per window (idempotent sourceEventId).
 */
export async function ingestUsageFromWorkersForWindow(
  db: DB,
  params: {
    computeBaseId: string
    organizationId: string
    tenantId: string
    waverlessEndpointId: string
    logicalAzId?: string | null
    providerId?: string | null
    gpuCount: number
    windowStart: Date
    windowEnd: Date
  },
): Promise<PollIngestResult> {
  const result: PollIngestResult = {
    computeBaseId: params.computeBaseId,
    workersSeen: 0,
    eventsInserted: 0,
    eventsSkipped: 0,
  }

  let workers: WaverlessWorker[] = []
  try {
    const page = await listWaverlessWorkers(params.waverlessEndpointId, {
      page: 1,
      pageSize: 100,
    })
    workers = page.items ?? []
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
    return result
  }

  result.workersSeen = workers.length
  const gpuCount = Math.max(1, params.gpuCount)

  for (const worker of workers) {
    const billable = customerBillableInterval(worker, params.windowEnd)
    if (!billable) {
      result.eventsSkipped++
      continue
    }

    const ms = overlapMs(
      billable.start,
      billable.end,
      params.windowStart,
      params.windowEnd,
    )
    if (ms <= 0) {
      result.eventsSkipped++
      continue
    }

    const intervalStart = new Date(
      Math.max(billable.start.getTime(), params.windowStart.getTime()),
    )
    const intervalEnd = new Date(
      Math.min(billable.end.getTime(), params.windowEnd.getTime()),
    )
    const sourceEventId = usageSourceEventId(
      params.computeBaseId,
      worker.workerId,
      intervalStart,
      intervalEnd,
    )

    const { inserted } = await ingestUsageEvent(db, {
      sourceEventId,
      tenantId: params.tenantId,
      organizationId: params.organizationId,
      computeBaseId: params.computeBaseId,
      workerId: worker.workerId,
      providerId: params.providerId ?? worker.providerId ?? "gongji",
      providerResourceId: null,
      logicalAzId: params.logicalAzId ?? worker.logicalAzId,
      gpuCount,
      intervalStart,
      intervalEnd,
      occurredAt: intervalEnd,
      metadata: {
        workerStatus: worker.status,
        ingest: "poll_workers",
        windowStart: params.windowStart.toISOString(),
        windowEnd: params.windowEnd.toISOString(),
      },
    })

    if (inserted) result.eventsInserted++
    else result.eventsSkipped++
  }

  return result
}

// ---------------------------------------------------------------------------
// Window settlement (dual ledger)
// ---------------------------------------------------------------------------

export interface SettleWindowResult {
  computeBaseId: string
  windowId: string
  status: string
  customerQuantity: number
  customerAmount: number
  supplierQuantity: number
  supplierEstimatedAmount: number
  walletTxId?: string | null
  error?: string
}

async function sumUsageInWindow(
  db: DB,
  computeBaseId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<number> {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${computeUsageEvent.quantity}), 0)`,
    })
    .from(computeUsageEvent)
    .where(
      and(
        eq(computeUsageEvent.computeBaseId, computeBaseId),
        gte(computeUsageEvent.intervalStart, windowStart),
        lt(computeUsageEvent.intervalStart, windowEnd),
      ),
    )

  return Number(row?.total ?? 0)
}

/**
 * Settle one UTC 5-minute window: customer consumeReserved + dual ledger rows.
 * Idempotent via unique (computeBaseId, windowStart, windowEnd) + status gate.
 */
export async function settleWaverlessWindow(
  db: DB,
  params: {
    computeBaseId: string
    organizationId: string
    tenantId: string
    windowStart: Date
    windowEnd: Date
    /** Required create-time contract; settle refuses if null/missing */
    contract: WaverlessContractRates | null
    kind?: "usage_settle" | "tail_settle"
    /** When true, settle even if windowEnd is in the future (stop/tail) */
    force?: boolean
    /** When settle fails for insufficient balance, run drain + billing_suspended */
    waverlessEndpointId?: string
  },
): Promise<SettleWindowResult> {
  const kind = params.kind ?? "usage_settle"
  const now = new Date()
  if (!params.force && params.windowEnd.getTime() > now.getTime()) {
    return {
      computeBaseId: params.computeBaseId,
      windowId: "",
      status: "skipped_future",
      customerQuantity: 0,
      customerAmount: 0,
      supplierQuantity: 0,
      supplierEstimatedAmount: 0,
    }
  }

  const idempotencyKey = windowIdempotencyKey(
    params.computeBaseId,
    params.windowStart,
    params.windowEnd,
  )

  const [existing] = await db
    .select()
    .from(computeBillingWindow)
    .where(eq(computeBillingWindow.idempotencyKey, idempotencyKey))
    .limit(1)

  if (existing && existing.status === "settled") {
    return {
      computeBaseId: params.computeBaseId,
      windowId: existing.id,
      status: existing.status,
      customerQuantity: Number(existing.customerQuantity),
      customerAmount: Number(existing.customerAmount),
      supplierQuantity: Number(existing.supplierQuantity),
      supplierEstimatedAmount: Number(existing.supplierEstimatedAmount),
      walletTxId: existing.walletTxId,
    }
  }
  // skipped_zero may be re-opened on force/tail when usage arrives later
  if (existing && existing.status === "skipped_zero" && !params.force) {
    return {
      computeBaseId: params.computeBaseId,
      windowId: existing.id,
      status: existing.status,
      customerQuantity: Number(existing.customerQuantity),
      customerAmount: Number(existing.customerAmount),
      supplierQuantity: Number(existing.supplierQuantity),
      supplierEstimatedAmount: Number(existing.supplierEstimatedAmount),
      walletTxId: existing.walletTxId,
    }
  }

  // Harden: never fall back to live env / live platform price
  if (!params.contract || !(params.contract.sellPricePerGpuHour > 0)) {
    if (existing) {
      await db
        .update(computeBillingWindow)
        .set({
          status: "failed",
          errorMessage: "billing_contract_snapshot_missing",
          updatedAt: new Date(),
        })
        .where(eq(computeBillingWindow.id, existing.id))
    }
    return {
      computeBaseId: params.computeBaseId,
      windowId: existing?.id ?? "",
      status: "failed",
      customerQuantity: 0,
      customerAmount: 0,
      supplierQuantity: 0,
      supplierEstimatedAmount: 0,
      error: "billing_contract_snapshot_missing",
    }
  }

  const contract = params.contract

  const customerQuantity = await sumUsageInWindow(
    db,
    params.computeBaseId,
    params.windowStart,
    params.windowEnd,
  )
  const sellPerHour = contract.sellPricePerGpuHour
  const costPerHour = contract.costRatePerGpuHour
  const customerAmount = gpuSecondsToAmount(customerQuantity, sellPerHour)
  const supplierEstimatedAmount = gpuSecondsToAmount(customerQuantity, costPerHour)

  const windowId = existing?.id ?? crypto.randomUUID()

  if (!existing) {
    await db.insert(computeBillingWindow).values({
      id: windowId,
      computeBaseId: params.computeBaseId,
      tenantId: params.tenantId,
      organizationId: params.organizationId,
      windowStart: params.windowStart,
      windowEnd: params.windowEnd,
      status: "settling",
      customerQuantity: String(customerQuantity),
      customerAmount: String(customerAmount),
      customerUnitPricePerGpuHour: String(sellPerHour),
      customerPriceRecordId: contract.priceRecordId,
      supplierQuantity: String(customerQuantity),
      supplierEstimatedAmount: String(supplierEstimatedAmount),
      supplierCostRatePerGpuHour: String(costPerHour),
      idempotencyKey,
      metadata: {
        kind,
        contractSnapshotId: contract.snapshotId,
        rateMissing: contract.supplierRateMissing,
      },
    })
  } else {
    await db
      .update(computeBillingWindow)
      .set({
        status: "settling",
        customerQuantity: String(customerQuantity),
        customerAmount: String(customerAmount),
        customerUnitPricePerGpuHour: String(sellPerHour),
        customerPriceRecordId: contract.priceRecordId,
        supplierQuantity: String(customerQuantity),
        supplierEstimatedAmount: String(supplierEstimatedAmount),
        supplierCostRatePerGpuHour: String(costPerHour),
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(computeBillingWindow.id, windowId))
  }

  if (customerQuantity <= 0) {
    await db
      .update(computeBillingWindow)
      .set({
        status: "skipped_zero",
        settledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(computeBillingWindow.id, windowId))

    return {
      computeBaseId: params.computeBaseId,
      windowId,
      status: "skipped_zero",
      customerQuantity: 0,
      customerAmount: 0,
      supplierQuantity: 0,
      supplierEstimatedAmount: 0,
    }
  }

  // Resume wallet tx if a prior attempt already consumed for this window
  let walletTxId: string | null = existing?.walletTxId ?? null

  if (customerAmount > 0 && !walletTxId) {
    const consume = await consumeReserved(db, {
      tenantId: params.tenantId,
      organizationId: params.organizationId,
      amount: customerAmount,
      refType: "compute_base",
      refId: params.computeBaseId,
      idempotencyKey: windowConsumeIdempotencyKey(idempotencyKey),
      description: `Waverless ${kind} ${windowId}: ${customerQuantity.toFixed(3)} gpu·s @ ¥${sellPerHour}/h`,
    })

    if (!consume) {
      await db
        .update(computeBillingWindow)
        .set({
          status: "failed",
          errorMessage: "insufficient_reserved_balance",
          updatedAt: new Date(),
        })
        .where(eq(computeBillingWindow.id, windowId))

      if (params.waverlessEndpointId) {
        await applyBillingSuspensionAndDrain(db, {
          computeBaseId: params.computeBaseId,
          organizationId: params.organizationId,
          tenantId: params.tenantId,
          waverlessEndpointId: params.waverlessEndpointId,
          reason: "insufficient_reserved_balance",
          windowId,
          triggeredBy: "waverless-settle",
        }).catch((err) => {
          console.error("[waverless-billing] suspension drain failed", err)
        })
      }

      return {
        computeBaseId: params.computeBaseId,
        windowId,
        status: "failed",
        customerQuantity,
        customerAmount,
        supplierQuantity: customerQuantity,
        supplierEstimatedAmount,
        error: "insufficient_reserved_balance",
      }
    }
    walletTxId = consume.tx.id
    await db
      .update(computeBillingWindow)
      .set({ walletTxId, updatedAt: new Date() })
      .where(eq(computeBillingWindow.id, windowId))
  }

  // Avoid duplicate ledger lines on retry after failed/skipped_zero
  const [existingCustomerLine] = await db
    .select({ id: computeCustomerLedgerEntry.id })
    .from(computeCustomerLedgerEntry)
    .where(eq(computeCustomerLedgerEntry.billingWindowId, windowId))
    .limit(1)

  // Customer revenue ledger (never store supplier rate here)
  if (!existingCustomerLine) await db.insert(computeCustomerLedgerEntry).values({
    id: crypto.randomUUID(),
    computeBaseId: params.computeBaseId,
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    billingWindowId: windowId,
    kind,
    meter: "gpu_runtime",
    quantity: String(customerQuantity),
    unit: "gpu_second",
    unitPricePerGpuHour: String(sellPerHour),
    amount: String(customerAmount),
    currency: "CNY",
    priceRecordId: contract.priceRecordId,
    balanceTxId: walletTxId,
    description: `Customer revenue ${kind} window ${params.windowStart.toISOString()}`,
    metadata: {
      sellPriceSource: "create_time_contract_snapshot",
      contractSnapshotId: contract.snapshotId,
    },
  })

  const [existingCostLine] = await db
    .select({ id: computeSupplierCostEntry.id })
    .from(computeSupplierCostEntry)
    .where(eq(computeSupplierCostEntry.billingWindowId, windowId))
    .limit(1)

  // Supplier cost ledger (Gongji) — distinct rate/amount
  if (!existingCostLine) await db.insert(computeSupplierCostEntry).values({
    id: crypto.randomUUID(),
    computeBaseId: params.computeBaseId,
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    billingWindowId: windowId,
    providerId: "gongji",
    meter: "gpu_runtime",
    quantity: String(customerQuantity),
    unit: "gpu_second",
    costRatePerGpuHour: String(costPerHour),
    estimatedAmount: String(supplierEstimatedAmount),
    currency: "CNY",
    status: costPerHour > 0 ? "accrued" : "accrued",
    description: `Gongji provisional cost ${kind}`,
    metadata: {
      rateSource: contract.supplierRateMissing
        ? "rate_missing_at_create"
        : "create_time_contract_snapshot",
      contractSnapshotId: contract.snapshotId,
      note: "Provisional; not Gongji invoice. Frozen at endpoint create; never live env.",
    },
  })

  await db
    .update(computeBillingWindow)
    .set({
      status: "settled",
      walletTxId,
      settledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(computeBillingWindow.id, windowId))

  if (customerAmount > 0 && walletTxId) {
    await clearBillingSuspensionAfterSettle(db, {
      computeBaseId: params.computeBaseId,
      reason: "结算扣款成功，自动恢复计费",
    }).catch(() => {})
  }

  return {
    computeBaseId: params.computeBaseId,
    windowId,
    status: "settled",
    customerQuantity,
    customerAmount,
    supplierQuantity: customerQuantity,
    supplierEstimatedAmount,
    walletTxId,
  }
}

// ---------------------------------------------------------------------------
// Endpoint-level: due windows + stop/tail
// ---------------------------------------------------------------------------

export interface WaverlessEndpointBillingContext {
  computeBaseId: string
  organizationId: string
  tenantId: string
  waverlessEndpointId: string
  logicalAzId: string | null
  providerId: string | null
  gpuCount: number
  gpuCardTypeId: string | null
  createdAt: Date
}

export async function listWaverlessOnDemandEndpoints(
  db: DB,
): Promise<WaverlessEndpointBillingContext[]> {
  const rows = await db
    .select({
      computeBaseId: computeBase.id,
      organizationId: computeBase.organizationId,
      resourceSpec: computeBase.resourceSpec,
      createdAt: computeBase.createdAt,
      waverlessEndpointId: serverlessDetail.waverlessEndpointId,
      logicalAzId: serverlessDetail.logicalAzId,
      providerId: serverlessDetail.providerId,
      orchestratorType: serverlessDetail.orchestratorType,
      commitment: computeBase.commitment,
      status: computeBase.status,
    })
    .from(computeBase)
    .innerJoin(serverlessDetail, eq(computeBase.id, serverlessDetail.computeBaseId))
    .where(
      and(
        eq(serverlessDetail.orchestratorType, "waverless"),
        eq(computeBase.commitment, "on_demand"),
        eq(computeBase.status, "running"),
      ),
    )

  const out: WaverlessEndpointBillingContext[] = []
  for (const row of rows) {
    const tenantId = await resolveTenantId(db, row.organizationId)
    const spec = (row.resourceSpec ?? {}) as Record<string, unknown>
    out.push({
      computeBaseId: row.computeBaseId,
      organizationId: row.organizationId,
      tenantId,
      waverlessEndpointId: row.waverlessEndpointId ?? row.computeBaseId,
      logicalAzId: row.logicalAzId,
      providerId: row.providerId,
      gpuCount: Math.max(1, Number(spec.gpuCount ?? 1)),
      gpuCardTypeId: (spec.gpuCardTypeId as string) ?? null,
      createdAt: row.createdAt,
    })
  }
  return out
}

/**
 * Settle all completed 5-minute windows since endpoint create (or last settled).
 * Typically called by the waverless billing cron.
 */
export async function settleDueWindowsForEndpoint(
  db: DB,
  ctx: WaverlessEndpointBillingContext,
  opts?: { asOf?: Date; maxWindows?: number },
): Promise<{
  ingest: PollIngestResult[]
  settlements: SettleWindowResult[]
}> {
  const asOf = opts?.asOf ?? new Date()
  const maxWindows = opts?.maxWindows ?? 12 // catch-up cap per cron tick (~1h)
  const currentWindowStart = floorToWindowStart(asOf)
  // Only settle windows that have fully closed
  const lastCloseableEnd = currentWindowStart

  const [lastSettled] = await db
    .select({ windowEnd: computeBillingWindow.windowEnd })
    .from(computeBillingWindow)
    .where(
      and(
        eq(computeBillingWindow.computeBaseId, ctx.computeBaseId),
        sql`${computeBillingWindow.status} in ('settled', 'skipped_zero')`,
      ),
    )
    .orderBy(desc(computeBillingWindow.windowEnd))
    .limit(1)

  let cursor = lastSettled?.windowEnd
    ? new Date(lastSettled.windowEnd)
    : floorToWindowStart(ctx.createdAt)

  // Never start before create; never walk more than maxWindows
  if (cursor.getTime() < floorToWindowStart(ctx.createdAt).getTime()) {
    cursor = floorToWindowStart(ctx.createdAt)
  }

  const contract = await getBillingContractSnapshot(db, ctx.computeBaseId)
  if (!contract) {
    return {
      ingest: [],
      settlements: [
        {
          computeBaseId: ctx.computeBaseId,
          windowId: "",
          status: "failed",
          customerQuantity: 0,
          customerAmount: 0,
          supplierQuantity: 0,
          supplierEstimatedAmount: 0,
          error: "billing_contract_snapshot_missing",
        },
      ],
    }
  }

  const ingest: PollIngestResult[] = []
  const settlements: SettleWindowResult[] = []
  let processed = 0

  while (cursor.getTime() < lastCloseableEnd.getTime() && processed < maxWindows) {
    const wStart = cursor
    const wEnd = windowEndFromStart(wStart)

    const poll = await ingestUsageFromWorkersForWindow(db, {
      computeBaseId: ctx.computeBaseId,
      organizationId: ctx.organizationId,
      tenantId: ctx.tenantId,
      waverlessEndpointId: ctx.waverlessEndpointId,
      logicalAzId: ctx.logicalAzId,
      providerId: ctx.providerId,
      gpuCount: ctx.gpuCount,
      windowStart: wStart,
      windowEnd: wEnd,
    })
    ingest.push(poll)
    await recordIngestCursor(db, ctx.computeBaseId, wEnd).catch(() => {})

    const settled = await settleWaverlessWindow(db, {
      computeBaseId: ctx.computeBaseId,
      organizationId: ctx.organizationId,
      tenantId: ctx.tenantId,
      windowStart: wStart,
      windowEnd: wEnd,
      contract,
      kind: "usage_settle",
      waverlessEndpointId: ctx.waverlessEndpointId,
    })
    settlements.push(settled)

    cursor = wEnd
    processed++
  }

  return { ingest, settlements }
}

/**
 * Final settle on stop/delete: ingest + settle open/current window as tail, then unfreeze.
 */
export async function settleWaverlessStop(
  db: DB,
  params: {
    organizationId: string
    computeBaseId: string
    tenantId: string
    reason: "stop" | "delete" | "terminate_worker"
  },
): Promise<{
  consumed: number
  unfrozen: number
  settlements: SettleWindowResult[]
  path: "waverless"
}> {
  const [row] = await db
    .select({
      computeBaseId: computeBase.id,
      organizationId: computeBase.organizationId,
      resourceSpec: computeBase.resourceSpec,
      createdAt: computeBase.createdAt,
      waverlessEndpointId: serverlessDetail.waverlessEndpointId,
      logicalAzId: serverlessDetail.logicalAzId,
      providerId: serverlessDetail.providerId,
      orchestratorType: serverlessDetail.orchestratorType,
    })
    .from(computeBase)
    .innerJoin(serverlessDetail, eq(computeBase.id, serverlessDetail.computeBaseId))
    .where(eq(computeBase.id, params.computeBaseId))
    .limit(1)

  const settlements: SettleWindowResult[] = []
  let consumed = 0

  if (row && row.orchestratorType === "waverless") {
    const spec = (row.resourceSpec ?? {}) as Record<string, unknown>
    const ctx: WaverlessEndpointBillingContext = {
      computeBaseId: row.computeBaseId,
      organizationId: row.organizationId,
      tenantId: params.tenantId,
      waverlessEndpointId: row.waverlessEndpointId ?? row.computeBaseId,
      logicalAzId: row.logicalAzId,
      providerId: row.providerId,
      gpuCount: Math.max(1, Number(spec.gpuCount ?? 1)),
      gpuCardTypeId: (spec.gpuCardTypeId as string) ?? null,
      createdAt: row.createdAt,
    }

    // Close any fully-elapsed windows first
    const due = await settleDueWindowsForEndpoint(db, ctx)
    settlements.push(...due.settlements)

    // Tail: current (possibly partial) window ending at now
    const now = new Date()
    const wStart = floorToWindowStart(now)
    const wEnd = now
    if (wEnd.getTime() > wStart.getTime()) {
      await ingestUsageFromWorkersForWindow(db, {
        computeBaseId: ctx.computeBaseId,
        organizationId: ctx.organizationId,
        tenantId: ctx.tenantId,
        waverlessEndpointId: ctx.waverlessEndpointId,
        logicalAzId: ctx.logicalAzId,
        providerId: ctx.providerId,
        gpuCount: ctx.gpuCount,
        windowStart: wStart,
        windowEnd: wEnd,
      })

      const contract = await getBillingContractSnapshot(db, ctx.computeBaseId)

      // Use synthetic window end = ceil for unique key stability on stop
      const closedEnd = windowEndFromStart(wStart)
      const tail = await settleWaverlessWindow(db, {
        computeBaseId: ctx.computeBaseId,
        organizationId: ctx.organizationId,
        tenantId: ctx.tenantId,
        windowStart: wStart,
        windowEnd: closedEnd,
        contract,
        kind: "tail_settle",
        force: true,
        waverlessEndpointId: ctx.waverlessEndpointId,
      })
      settlements.push(tail)
    }

    consumed = settlements.reduce((s, x) => s + (x.customerAmount || 0), 0)
  }

  // Unfreeze remaining reserved after settle
  const balance = await getOrCreateTenantBalance(
    db,
    params.tenantId,
    params.organizationId,
  )
  const reserved = Number(balance.reservedBalance)
  let unfrozen = 0
  if (reserved > 0) {
    await unfreezeBalance(db, {
      tenantId: params.tenantId,
      organizationId: params.organizationId,
      amount: reserved,
      refType: "compute_base",
      refId: params.computeBaseId,
      description: `Waverless ${params.reason} 释放冻结`,
    })
    unfrozen = reserved
  }

  return { consumed, unfrozen, settlements, path: "waverless" }
}

/**
 * Cron entry: settle all running waverless on_demand endpoints.
 */
export async function runWaverlessBillingCron(db: DB): Promise<{
  endpoints: number
  settled: number
  failed: number
  ingested: number
  details: Array<{
    computeBaseId: string
    settled: number
    failed: number
    ingestError?: string
  }>
}> {
  const endpoints = await listWaverlessOnDemandEndpoints(db)
  let settled = 0
  let failed = 0
  let ingested = 0
  const details: Array<{
    computeBaseId: string
    settled: number
    failed: number
    ingestError?: string
  }> = []

  for (const ctx of endpoints) {
    try {
      const { ingest, settlements } = await settleDueWindowsForEndpoint(db, ctx)
      const epSettled = settlements.filter((s) => s.status === "settled").length
      const epFailed = settlements.filter((s) => s.status === "failed").length
      const ingestEvents = ingest.reduce((n, i) => n + i.eventsInserted, 0)
      const ingestError = ingest.find((i) => i.error)?.error
      settled += epSettled
      failed += epFailed
      ingested += ingestEvents
      details.push({
        computeBaseId: ctx.computeBaseId,
        settled: epSettled,
        failed: epFailed,
        ingestError,
      })

      // Insufficient balance → billing_suspended + drain handled inside settleWaverlessWindow
    } catch (err) {
      failed++
      details.push({
        computeBaseId: ctx.computeBaseId,
        settled: 0,
        failed: 1,
        ingestError: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { endpoints: endpoints.length, settled, failed, ingested, details }
}

// ---------------------------------------------------------------------------
// Ownership-gated visibility (tenant console / tRPC)
// ---------------------------------------------------------------------------

export async function listBillingWindowsForEndpoint(
  db: DB,
  params: {
    computeBaseId: string
    organizationId: string
    limit?: number
  },
): Promise<Array<typeof computeBillingWindow.$inferSelect>> {
  const limit = Math.min(100, Math.max(1, params.limit ?? 50))
  // Ownership: join compute_base org
  const [owned] = await db
    .select({ id: computeBase.id })
    .from(computeBase)
    .where(
      and(
        eq(computeBase.id, params.computeBaseId),
        eq(computeBase.organizationId, params.organizationId),
      ),
    )
    .limit(1)
  if (!owned) return []

  return db
    .select()
    .from(computeBillingWindow)
    .where(eq(computeBillingWindow.computeBaseId, params.computeBaseId))
    .orderBy(desc(computeBillingWindow.windowStart))
    .limit(limit)
}

export async function listCustomerLedgerForEndpoint(
  db: DB,
  params: {
    computeBaseId: string
    organizationId: string
    limit?: number
  },
): Promise<Array<typeof computeCustomerLedgerEntry.$inferSelect>> {
  const limit = Math.min(100, Math.max(1, params.limit ?? 50))
  const [owned] = await db
    .select({ id: computeBase.id })
    .from(computeBase)
    .where(
      and(
        eq(computeBase.id, params.computeBaseId),
        eq(computeBase.organizationId, params.organizationId),
      ),
    )
    .limit(1)
  if (!owned) return []

  return db
    .select()
    .from(computeCustomerLedgerEntry)
    .where(eq(computeCustomerLedgerEntry.computeBaseId, params.computeBaseId))
    .orderBy(desc(computeCustomerLedgerEntry.createdAt))
    .limit(limit)
}

export async function listSupplierCostForEndpoint(
  db: DB,
  params: {
    computeBaseId: string
    organizationId: string
    limit?: number
  },
): Promise<Array<typeof computeSupplierCostEntry.$inferSelect>> {
  const limit = Math.min(100, Math.max(1, params.limit ?? 50))
  const [owned] = await db
    .select({ id: computeBase.id })
    .from(computeBase)
    .where(
      and(
        eq(computeBase.id, params.computeBaseId),
        eq(computeBase.organizationId, params.organizationId),
      ),
    )
    .limit(1)
  if (!owned) return []

  return db
    .select()
    .from(computeSupplierCostEntry)
    .where(eq(computeSupplierCostEntry.computeBaseId, params.computeBaseId))
    .orderBy(desc(computeSupplierCostEntry.createdAt))
    .limit(limit)
}

/**
 * Combined billing visibility for an owned endpoint (contract + windows + ledgers).
 */
export async function getEndpointBillingVisibility(
  db: DB,
  params: {
    computeBaseId: string
    organizationId: string
    limit?: number
  },
): Promise<{
  owned: boolean
  contract: WaverlessContractRates | null
  windows: Array<typeof computeBillingWindow.$inferSelect>
  customerLedger: Array<typeof computeCustomerLedgerEntry.$inferSelect>
  supplierCost: Array<typeof computeSupplierCostEntry.$inferSelect>
}> {
  const [owned] = await db
    .select({ id: computeBase.id })
    .from(computeBase)
    .where(
      and(
        eq(computeBase.id, params.computeBaseId),
        eq(computeBase.organizationId, params.organizationId),
      ),
    )
    .limit(1)

  if (!owned) {
    return {
      owned: false,
      contract: null,
      windows: [],
      customerLedger: [],
      supplierCost: [],
    }
  }

  const limit = params.limit ?? 50
  const [contract, windows, customerLedger, supplierCost] = await Promise.all([
    getBillingContractSnapshot(db, params.computeBaseId),
    listBillingWindowsForEndpoint(db, { ...params, limit }),
    listCustomerLedgerForEndpoint(db, { ...params, limit }),
    listSupplierCostForEndpoint(db, { ...params, limit }),
  ])

  return { owned: true, contract, windows, customerLedger, supplierCost }
}
