/**
 * Bare metal auto-renewal cron job.
 *
 * Runs every hour (via Vercel cron or external scheduler).
 *
 * Flow:
 * 1. Scan running orders where auto_renew=true and next_billing_at <= now
 * 2. For each: check balance → deduct → extend period
 * 3. On failure: increment overdue_retries → mark overdue after 3 retries
 * 4. Process newly overdue orders (stop devices, notify tenant)
 * 5. Scan for pre-expiry reminders
 *
 * Design: bare-metal-order-commercialization.md §3, §4, §9
 */

import { NextResponse, type NextRequest } from "next/server"
import {
  scanAndRenewOrders,
  processOverdueOrders,
  scanForReminders,
} from "@/lib/server/services/metal-order"

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startTime = Date.now()

  try {
    // 1. Auto-renewal scan
    const renewalResults = await scanAndRenewOrders()
    const renewed = renewalResults.filter((r) => r.status === "renewed").length
    const overdue = renewalResults.filter((r) => r.status === "overdue").length
    const skipped = renewalResults.filter((r) => r.status === "skipped").length
    const errors = renewalResults.filter((r) => r.status === "error").length

    // 2. Process newly overdue orders
    const overdueActions = await processOverdueOrders()

    // 3. Pre-expiry reminders
    const reminders = await scanForReminders()

    const duration = Date.now() - startTime
    console.log(
      `[metal-renewal-cron] Done: ${renewalResults.length} scanned, ` +
        `${renewed} renewed, ${overdue} overdue, ${skipped} skipped, ${errors} errors, ` +
        `${overdueActions.length} overdue actions, ${reminders.length} reminders (${duration}ms)`,
    )

    return NextResponse.json({
      ok: true,
      renewal: {
        scanned: renewalResults.length,
        renewed,
        overdue,
        skipped,
        errors,
      },
      overdueActions: overdueActions.length,
      reminders: reminders.length,
      duration,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error("[metal-renewal-cron] Fatal error:", err)
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 },
    )
  }
}
