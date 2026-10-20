/**
 * Periodic billing cron job for on-demand serverless instances.
 *
 * Runs every 5 minutes (via Vercel cron or external scheduler).
 * Deducts: pricePerHour × gpuCount × (5/60) from frozen reserved balance.
 *
 * Flow:
 * 1. Query all running on-demand serverless instances
 * 2. For each, look up price snapshot
 * 3. Calculate deduction: pricePerHour × gpuCount × 5/60
 * 4. Consume from reserved balance
 * 5. If insufficient, mark instance for forced stop
 *
 * Design: tenant-balance-unification.md §2, serverless-implementation.md §6
 */

import { NextResponse, type NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { computeBase, serverlessDetail } from "@workspace/db"
import { resolveTenantId, lookupPriceSnapshot, billServerlessPeriodicDeduction } from "@/lib/server/services/billing"
import { updateServerlessStatus } from "@/lib/server/dataaccess/compute"

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startTime = Date.now()
  let processed = 0
  let succeeded = 0
  let failed = 0

  try {
    // Query all running on-demand serverless instances
    const onDemandInstances = await db
      .select({
        computeBaseId: computeBase.id,
        organizationId: computeBase.organizationId,
        status: computeBase.status,
        commitment: computeBase.commitment,
        resourceSpec: computeBase.resourceSpec,
        createdAt: computeBase.createdAt,
        orchestratorType: serverlessDetail.orchestratorType,
      })
      .from(computeBase)
      .innerJoin(
        serverlessDetail,
        eq(computeBase.id, serverlessDetail.computeBaseId),
      )
      .where(
        and(
          eq(computeBase.status, "running"),
          eq(computeBase.commitment, "on_demand"),
        ),
      )

    processed = onDemandInstances.length

    for (const instance of onDemandInstances) {
      try {
        // Bypass legacy cron for waverless (dual-ledger / worker-interval path — follow-up)
        if (instance.orchestratorType === "waverless") {
          console.info(
            `[billing-cron] skip waverless instance ${instance.computeBaseId} (legacy cron bypass)`,
          )
          continue
        }

        const resourceSpec = instance.resourceSpec as Record<string, unknown> | null
        const gpuCardTypeId = resourceSpec?.gpuCardTypeId as string
        const gpuCount = (resourceSpec?.gpuCount as number) ?? 1

        if (!gpuCardTypeId) {
          console.warn(`[billing-cron] Instance ${instance.computeBaseId} missing gpuCardTypeId, skipping`)
          continue
        }

        // Resolve tenant
        const tenantId = await resolveTenantId(db, instance.organizationId)

        // Look up price
        const priceSnapshot = await lookupPriceSnapshot(db, {
          gpuCardTypeId,
          productLine: "serverless",
          billingUnit: "hour",
        })

        if (!priceSnapshot) {
          console.warn(`[billing-cron] No price found for ${gpuCardTypeId}, skipping`)
          continue
        }

        // Deduct
        const result = await billServerlessPeriodicDeduction(db, {
          organizationId: instance.organizationId,
          computeBaseId: instance.computeBaseId,
          tenantId,
          pricePerHour: priceSnapshot.sellPrice,
          gpuCount,
        })

        if ("error" in result) {
          console.error(`[billing-cron] Deduction failed for ${instance.computeBaseId}: ${result.error}`)
          // Mark instance for forced stop (balance depleted)
          await updateServerlessStatus(instance.computeBaseId, instance.organizationId, "error").catch(() => {})
          failed++
        } else {
          succeeded++
        }
      } catch (err) {
        console.error(`[billing-cron] Error processing ${instance.computeBaseId}:`, err)
        failed++
      }
    }
  } catch (err) {
    console.error("[billing-cron] Fatal error:", err)
    return NextResponse.json(
      { error: "Internal error", processed, succeeded, failed },
      { status: 500 },
    )
  }

  const duration = Date.now() - startTime
  console.log(`[billing-cron] Done: ${processed} processed, ${succeeded} succeeded, ${failed} failed (${duration}ms)`)

  return NextResponse.json({
    ok: true,
    processed,
    succeeded,
    failed,
    duration,
    timestamp: new Date().toISOString(),
  })
}
