/**
 * Usage event ingest API for waverless → Cloud.
 *
 * Auth: Bearer platform service key (WAVERLESS_SERVICE_API_KEY) OR CRON_SECRET.
 * Waverless (or ops) may push closed worker intervals; cron also polls workers.
 *
 * Body: { events: IngestUsageEventInput[] } (max 100)
 */

import { NextResponse, type NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ingestUsageEvent } from "@/lib/server/services/waverless-billing"
import { recordIngestCursor } from "@/lib/server/services/waverless-billing-lifecycle"

function authorize(request: NextRequest): boolean {
  const auth = request.headers.get("authorization") ?? ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
  if (!token) return false
  const allowed = [
    process.env.WAVERLESS_SERVICE_API_KEY?.trim(),
    process.env.WAVERLESS_SERVICE_SECRET?.trim(),
    process.env.CRON_SECRET?.trim(),
  ].filter(Boolean) as string[]
  return allowed.includes(token)
}

export async function POST(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const events = (body as { events?: unknown })?.events
  if (!Array.isArray(events) || events.length === 0) {
    return NextResponse.json({ error: "events[] required" }, { status: 400 })
  }
  if (events.length > 100) {
    return NextResponse.json({ error: "max 100 events per request" }, { status: 400 })
  }

  const results: Array<{ sourceEventId: string; id: string; inserted: boolean; error?: string }> =
    []

  for (const raw of events) {
    const e = raw as Record<string, unknown>
    const sourceEventId = String(e.sourceEventId ?? "")
    try {
      if (!sourceEventId || !e.computeBaseId || !e.workerId || !e.tenantId || !e.organizationId) {
        results.push({
          sourceEventId: sourceEventId || "(missing)",
          id: "",
          inserted: false,
          error: "missing required fields",
        })
        continue
      }
      if (!e.intervalStart || !e.intervalEnd) {
        results.push({
          sourceEventId,
          id: "",
          inserted: false,
          error: "intervalStart/intervalEnd required",
        })
        continue
      }

      const r = await ingestUsageEvent(db, {
        sourceEventId,
        eventVersion: e.eventVersion != null ? Number(e.eventVersion) : 1,
        tenantId: String(e.tenantId),
        organizationId: String(e.organizationId),
        computeBaseId: String(e.computeBaseId),
        workerId: String(e.workerId),
        providerId: e.providerId != null ? String(e.providerId) : "gongji",
        providerResourceId:
          e.providerResourceId != null ? String(e.providerResourceId) : null,
        logicalAzId: e.logicalAzId != null ? String(e.logicalAzId) : null,
        gpuCount: e.gpuCount != null ? Number(e.gpuCount) : 1,
        intervalStart: String(e.intervalStart),
        intervalEnd: String(e.intervalEnd),
        occurredAt: e.occurredAt != null ? String(e.occurredAt) : undefined,
        metadata: (e.metadata as Record<string, unknown>) ?? { ingest: "push_api" },
      })
      results.push({ sourceEventId, id: r.id, inserted: r.inserted })
    } catch (err) {
      results.push({
        sourceEventId,
        id: "",
        inserted: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const inserted = results.filter((r) => r.inserted).length
  const errors = results.filter((r) => r.error).length

  // Durable ingest cursor: max intervalEnd per computeBaseId (push path)
  const cursorByBase = new Map<string, Date>()
  for (const raw of events) {
    const e = raw as Record<string, unknown>
    const baseId = e.computeBaseId != null ? String(e.computeBaseId) : ""
    const endRaw = e.intervalEnd
    if (!baseId || !endRaw) continue
    const end = new Date(String(endRaw))
    const prev = cursorByBase.get(baseId)
    if (!prev || end > prev) cursorByBase.set(baseId, end)
  }
  for (const [computeBaseId, windowEnd] of cursorByBase) {
    await recordIngestCursor(db, computeBaseId, windowEnd).catch(() => {})
  }

  return NextResponse.json({
    ok: errors === 0,
    received: events.length,
    inserted,
    duplicates: results.filter((r) => !r.inserted && !r.error).length,
    errors,
    results,
  })
}
