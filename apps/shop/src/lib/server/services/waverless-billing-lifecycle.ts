/**
 * Waverless billing suspension, admission gate, and drain automation.
 * Ops on compute_base.metadata.waverlessBilling (no waverless wallet access).
 */

import { eq } from "drizzle-orm"
import { computeBase } from "@workspace/db"

import { appendComputeTaskEvent } from "@/lib/server/dataaccess/compute/serverless"
import {
  getWaverlessEndpointRuntime,
  isWaverlessConfigured,
  listWaverlessWorkers,
  scaleWaverlessEndpoint,
  terminateWaverlessWorker,
  type WaverlessWorker,
} from "@/lib/server/services/waverless"
import {
  parseWaverlessBillingMeta,
  type WaverlessBillingMeta,
} from "@/lib/server/services/waverless-billing-math"

type DB = any

const DRAINABLE_STATUSES = new Set(["READY", "BUSY", "DRAINING", "STARTING"])

export async function readWaverlessBillingMeta(
  db: DB,
  computeBaseId: string,
): Promise<WaverlessBillingMeta> {
  const [row] = await db
    .select({ metadata: computeBase.metadata })
    .from(computeBase)
    .where(eq(computeBase.id, computeBaseId))
    .limit(1)
  return parseWaverlessBillingMeta(
    (row?.metadata ?? {}) as Record<string, unknown>,
  )
}

export async function patchWaverlessBillingMeta(
  db: DB,
  computeBaseId: string,
  patch: Partial<WaverlessBillingMeta>,
): Promise<WaverlessBillingMeta> {
  const [row] = await db
    .select({ metadata: computeBase.metadata })
    .from(computeBase)
    .where(eq(computeBase.id, computeBaseId))
    .limit(1)

  const baseMeta = (row?.metadata ?? {}) as Record<string, unknown>
  const current = parseWaverlessBillingMeta(baseMeta)
  const next: WaverlessBillingMeta = {
    ...current,
    ...patch,
    drain: patch.drain !== undefined ? patch.drain : current.drain,
  }

  await db
    .update(computeBase)
    .set({
      metadata: { ...baseMeta, waverlessBilling: next },
      updatedAt: new Date(),
    })
    .where(eq(computeBase.id, computeBaseId))

  return next
}

export async function recordIngestCursor(
  db: DB,
  computeBaseId: string,
  windowEnd: Date,
): Promise<void> {
  await patchWaverlessBillingMeta(db, computeBaseId, {
    lastIngestWindowEnd: windowEnd.toISOString(),
  })
}

/**
 * Insufficient reserved balance: suspend billing, block scale-up/admission, drain workers.
 * Idempotent per endpoint while status remains billing_suspended.
 */
export async function applyBillingSuspensionAndDrain(
  db: DB,
  params: {
    computeBaseId: string
    organizationId: string
    tenantId: string
    waverlessEndpointId: string
    reason: string
    triggeredBy?: string
    windowId?: string
  },
): Promise<{ suspended: boolean; drainWorkers: number; errors: string[] }> {
  const errors: string[] = []
  const prior = await readWaverlessBillingMeta(db, params.computeBaseId)
  const nowIso = new Date().toISOString()

  if (prior.status !== "billing_suspended") {
    await patchWaverlessBillingMeta(db, params.computeBaseId, {
      status: "billing_suspended",
      suspendedAt: nowIso,
      suspendReason: params.reason,
      admissionBlocked: true,
    })

    await appendComputeTaskEvent({
      computeBaseId: params.computeBaseId,
      eventType: "billing_suspended",
      previousStatus: null,
      newStatus: "billing_suspended",
      description: `计费暂停：${params.reason}`,
      detail: {
        reason: params.reason,
        windowId: params.windowId ?? null,
        path: "waverless",
      },
      triggeredBy: params.triggeredBy ?? "waverless-billing-cron",
    })
  }

  let drainWorkers = 0
  if (!isWaverlessConfigured()) {
    errors.push("waverless_not_configured")
    return { suspended: true, drainWorkers: 0, errors }
  }

  const externalId = params.waverlessEndpointId

  try {
    const runtime = await getWaverlessEndpointRuntime(externalId)
    const clamp = Math.max(
      0,
      runtime.readyReplicas ?? runtime.observedReplicas ?? 0,
    )
    await scaleWaverlessEndpoint(externalId, clamp, clamp, {
      idempotencyKey: `billing-suspend-scale-${params.computeBaseId}`,
    })
    await patchWaverlessBillingMeta(db, params.computeBaseId, {
      drain: {
        initiatedAt: nowIso,
        workerIds: prior.drain?.workerIds ?? [],
        scaleClampReplicas: clamp,
      },
    })
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err))
  }

  let workers: WaverlessWorker[] = []
  try {
    const page = await listWaverlessWorkers(externalId, { page: 1, pageSize: 100 })
    workers = page.items ?? []
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err))
    return { suspended: true, drainWorkers: 0, errors }
  }

  const terminatedIds: string[] = [...(prior.drain?.workerIds ?? [])]

  for (const worker of workers) {
    if (!DRAINABLE_STATUSES.has(worker.status)) continue
    if (terminatedIds.includes(worker.workerId)) continue

    try {
      await terminateWaverlessWorker({
        externalEndpointId: externalId,
        workerId: worker.workerId,
        idempotencyKey: `billing-suspend-drain:${params.computeBaseId}:${worker.workerId}`,
        reasonCode: "billing_suspended",
        reason: params.reason,
        actor: {
          type: "tenant_user",
          id: params.triggeredBy ?? "waverless-billing-cron",
          tenantId: params.tenantId,
        },
        source: "gpus-billing-cron",
        drainTimeoutSeconds: 120,
        inFlightPolicy: "failed_retryable",
      })
      terminatedIds.push(worker.workerId)
      drainWorkers++
    } catch (err) {
      errors.push(
        `worker ${worker.workerId}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  await patchWaverlessBillingMeta(db, params.computeBaseId, {
    drain: {
      initiatedAt: prior.drain?.initiatedAt ?? nowIso,
      workerIds: terminatedIds,
      scaleClampReplicas: prior.drain?.scaleClampReplicas,
    },
  })

  return { suspended: true, drainWorkers, errors }
}

/** Clear suspension after a successful wallet consume (funds restored). */
export async function clearBillingSuspensionAfterSettle(
  db: DB,
  params: {
    computeBaseId: string
    reason?: string
    triggeredBy?: string
  },
): Promise<boolean> {
  const prior = await readWaverlessBillingMeta(db, params.computeBaseId)
  if (prior.status !== "billing_suspended") return false

  await patchWaverlessBillingMeta(db, params.computeBaseId, {
    status: "active",
    admissionBlocked: false,
    suspendReason: undefined,
    suspendedAt: undefined,
  })

  await appendComputeTaskEvent({
    computeBaseId: params.computeBaseId,
    eventType: "billing_resumed",
    previousStatus: "billing_suspended",
    newStatus: "active",
    description: params.reason ?? "计费恢复：结算成功且余额充足",
    detail: { path: "waverless", auto: true },
    triggeredBy: params.triggeredBy ?? "waverless-billing-cron",
  })

  return true
}
