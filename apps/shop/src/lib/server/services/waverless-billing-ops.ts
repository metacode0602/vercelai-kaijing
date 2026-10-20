/**
 * Ops-only helpers (no tRPC). Settle still refuses without snapshot.
 */

import { eq } from "drizzle-orm"
import { computeBase, serverlessDetail } from "@workspace/db"

import { lookupPriceSnapshot } from "@/lib/server/services/billing"
import {
  createBillingContractSnapshot,
  getBillingContractSnapshot,
} from "@/lib/server/services/waverless-billing"

type DB = any

/**
 * Backfill missing create-time contract snapshot for a waverless endpoint.
 * Uses current platform_card_price_record (ops recovery only — not used on settle fallback).
 */
export async function backfillWaverlessContractSnapshot(
  db: DB,
  computeBaseId: string,
): Promise<{ ok: boolean; error?: string; snapshotId?: string }> {
  const existing = await getBillingContractSnapshot(db, computeBaseId)
  if (existing) {
    return { ok: true, snapshotId: existing.snapshotId, error: "already_exists" }
  }

  const [row] = await db
    .select({
      organizationId: computeBase.organizationId,
      tenantId: computeBase.tenantId,
      resourceSpec: computeBase.resourceSpec,
      commitment: computeBase.commitment,
      orchestratorType: serverlessDetail.orchestratorType,
    })
    .from(computeBase)
    .innerJoin(serverlessDetail, eq(computeBase.id, serverlessDetail.computeBaseId))
    .where(eq(computeBase.id, computeBaseId))
    .limit(1)

  if (!row || row.orchestratorType !== "waverless") {
    return { ok: false, error: "not_waverless_endpoint" }
  }

  const spec = (row.resourceSpec ?? {}) as Record<string, unknown>
  const gpuCardTypeId = String(spec.gpuCardTypeId ?? "")
  if (!gpuCardTypeId) {
    return { ok: false, error: "missing_gpu_card_type" }
  }

  const price = await lookupPriceSnapshot(db, {
    gpuCardTypeId,
    productLine: "serverless",
    billingUnit: "hour",
  })
  if (!price || !(price.sellPrice > 0)) {
    return { ok: false, error: "no_platform_price" }
  }

  const snap = await createBillingContractSnapshot(db, {
    computeBaseId,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    purchaseType: row.commitment === "on_demand" ? "on_demand" : row.commitment,
    sellPricePerGpuHour: price.sellPrice,
    priceRecordId: price.priceRecordId,
    gpuCardTypeId,
    metadata: { backfill: true, backfillAt: new Date().toISOString() },
  })

  return { ok: true, snapshotId: snap.snapshotId }
}
