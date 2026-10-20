/** Pure helpers for waverless P0 billing (no DB / network). */

export const WAVERLESS_BILLING_WINDOW_MS = 5 * 60 * 1000

export function floorToWindowStart(d: Date): Date {
  const ms = d.getTime()
  return new Date(Math.floor(ms / WAVERLESS_BILLING_WINDOW_MS) * WAVERLESS_BILLING_WINDOW_MS)
}

export function windowEndFromStart(start: Date): Date {
  return new Date(start.getTime() + WAVERLESS_BILLING_WINDOW_MS)
}

/** Round half-up to 4 decimal places (money scale). */
export function roundMoney4(n: number): number {
  if (!Number.isFinite(n) || n === 0) return 0
  return Math.round(n * 10_000 + Number.EPSILON) / 10_000
}

export function gpuSecondsToAmount(gpuSeconds: number, pricePerHour: number): number {
  if (gpuSeconds <= 0 || pricePerHour <= 0) return 0
  return roundMoney4((pricePerHour * gpuSeconds) / 3600)
}

export function getGongjiCostRatePerGpuHour(
  envValue: string | undefined = process.env.WAVERLESS_GONGJI_COST_PER_GPU_HOUR,
): number {
  const raw = envValue?.trim()
  if (!raw) return 0
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export function windowIdempotencyKey(
  computeBaseId: string,
  windowStart: Date,
  windowEnd: Date,
): string {
  return `wvr-win:${computeBaseId}:${windowStart.toISOString()}:${windowEnd.toISOString()}`
}

/** Stable wallet consume key for a settled billing window (cron replay safe). */
export function windowConsumeIdempotencyKey(windowIdempotencyKeyValue: string): string {
  return `${windowIdempotencyKeyValue}:consume`
}

export type WaverlessBillingStatus = "active" | "billing_suspended"

export interface WaverlessBillingMeta {
  status: WaverlessBillingStatus
  suspendedAt?: string
  suspendReason?: string
  /** Last fully ingested UTC 5m window end (poll or push); durable ingest cursor */
  lastIngestWindowEnd?: string
  admissionBlocked?: boolean
  drain?: {
    initiatedAt: string
    workerIds: string[]
    scaleClampReplicas?: number
  }
}

export function parseWaverlessBillingMeta(
  computeMetadata: Record<string, unknown> | null | undefined,
): WaverlessBillingMeta {
  const raw = computeMetadata?.waverlessBilling
  if (!raw || typeof raw !== "object") {
    return { status: "active" }
  }
  const o = raw as Record<string, unknown>
  const status = o.status === "billing_suspended" ? "billing_suspended" : "active"
  return {
    status,
    suspendedAt: typeof o.suspendedAt === "string" ? o.suspendedAt : undefined,
    suspendReason: typeof o.suspendReason === "string" ? o.suspendReason : undefined,
    lastIngestWindowEnd:
      typeof o.lastIngestWindowEnd === "string" ? o.lastIngestWindowEnd : undefined,
    admissionBlocked: o.admissionBlocked === true,
    drain:
      o.drain && typeof o.drain === "object"
        ? (o.drain as WaverlessBillingMeta["drain"])
        : undefined,
  }
}

export function isBillingSuspended(meta: WaverlessBillingMeta): boolean {
  return meta.status === "billing_suspended" || meta.admissionBlocked === true
}

export function shouldRejectWaverlessScaleUp(
  meta: WaverlessBillingMeta,
  input: { minReplicas: number; maxReplicas: number },
  current: { minReplicas: number; maxReplicas: number },
): boolean {
  if (!isBillingSuspended(meta)) return false
  return (
    input.minReplicas > current.minReplicas || input.maxReplicas > current.maxReplicas
  )
}
