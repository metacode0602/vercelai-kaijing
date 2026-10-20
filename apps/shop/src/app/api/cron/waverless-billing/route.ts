/**
 * Waverless dual-ledger settlement cron (~5 minutes).
 *
 * Separate from legacy /api/cron/billing (SkyPilot path — known defects).
 * Only processes orchestratorType=waverless on_demand endpoints.
 *
 * Auth: Authorization: Bearer $CRON_SECRET
 */

import { NextResponse, type NextRequest } from "next/server"
import { db } from "@/lib/db"
import { runWaverlessBillingCron } from "@/lib/server/services/waverless-billing"

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startTime = Date.now()

  try {
    const result = await runWaverlessBillingCron(db)
    const duration = Date.now() - startTime

    console.log(
      `[waverless-billing-cron] endpoints=${result.endpoints} settled=${result.settled} ` +
        `failed=${result.failed} ingested=${result.ingested} (${duration}ms)`,
    )

    return NextResponse.json({
      ok: true,
      path: "waverless",
      ...result,
      duration,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error("[waverless-billing-cron] Fatal error:", err)
    return NextResponse.json(
      {
        error: "Internal error",
        message: err instanceof Error ? err.message : String(err),
        duration: Date.now() - startTime,
      },
      { status: 500 },
    )
  }
}
