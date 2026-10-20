/**
 * Waverless control-plane HTTP client (server-side only).
 *
 * Auth: platform service API key from env — NEVER expose to tenants.
 * Gongji vendor credentials stay inside waverless (platform-managed for P0).
 *
 * Contract paths align with docs/waverless-cn-provider-implementation-plan.md §3.4.
 * Live waverless may be unavailable in CI; callers should treat network errors
 * as provisioning failures and keep Cloud state consistent.
 */

import {
  getLogicalAzBinding,
  resolveGongjiProviderSkuId,
  type OrchestratorType,
} from "@/lib/server/config/waverless-regions"
import { resolvePlacementModeFromConfig } from "@/lib/server/config/serverless-deploy-config"

/** Prefer WAVERLESS_BASE_URL; CONTROL_API_URL kept as alias from the plan. */
function resolveBaseUrl(): string {
  return (
    process.env.WAVERLESS_BASE_URL?.trim() ||
    process.env.WAVERLESS_CONTROL_API_URL?.trim() ||
    ""
  )
}

function resolveServiceApiKey(): string {
  return (
    process.env.WAVERLESS_SERVICE_API_KEY?.trim() ||
    process.env.WAVERLESS_SERVICE_SECRET?.trim() ||
    ""
  )
}

export class WaverlessConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WaverlessConfigError"
  }
}

export class WaverlessApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly body: string

  constructor(status: number, body: string, code?: string) {
    super(`Waverless API ${status}: ${body.slice(0, 400)}`)
    this.name = "WaverlessApiError"
    this.status = status
    this.code = code
    this.body = body
  }
}

export function assertWaverlessConfigured(): { baseUrl: string; apiKey: string } {
  const baseUrl = resolveBaseUrl()
  const apiKey = resolveServiceApiKey()
  if (!baseUrl) {
    throw new WaverlessConfigError(
      "WAVERLESS_BASE_URL (or WAVERLESS_CONTROL_API_URL) is not configured",
    )
  }
  if (!apiKey) {
    throw new WaverlessConfigError(
      "WAVERLESS_SERVICE_API_KEY is not configured (platform service key required)",
    )
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey }
}

export function isWaverlessConfigured(): boolean {
  try {
    assertWaverlessConfigured()
    return true
  } catch {
    return false
  }
}

interface WaverlessRequestInit extends RequestInit {
  timeoutMs?: number
  /** Stable key for POST lifecycle commands; never auto-retry without it. */
  idempotencyKey?: string
  requestId?: string
}

async function waverlessFetch<T>(
  path: string,
  options: WaverlessRequestInit = {},
): Promise<T> {
  const { baseUrl, apiKey } = assertWaverlessConfigured()
  const {
    timeoutMs = 30_000,
    idempotencyKey,
    requestId,
    headers: extraHeaders,
    ...init
  } = options

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(requestId ? { "X-Request-Id": requestId } : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        ...extraHeaders,
      },
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      let code: string | undefined
      try {
        code = (JSON.parse(body) as { code?: string }).code
      } catch {
        /* ignore */
      }
      throw new WaverlessApiError(res.status, body, code)
    }

    if (res.status === 204) {
      return undefined as T
    }
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Types (wire contract; keep in sync with waverless control API)
// ---------------------------------------------------------------------------

export interface WaverlessCreateEndpointRequest {
  externalEndpointId: string
  name: string
  image: string
  /** Platform logical image digest/ref (§10.19); defaults to image when omitted */
  logicalImage?: string
  placementMode?: "auto" | "pin"
  regionAllowlist?: string[]
  logicalAzId?: string
  providerId?: string
  physicalRegionId?: string
  /** Interim fallback until waverless Placement resolves SKU (M1 Hub) */
  providerSkuId?: string
  minReplicas: number
  maxReplicas: number
  scaleUpWaitSeconds: number
  targetPort?: number
  command?: string
  env?: Record<string, string>
  gpuSku?: string
  gpuType?: string
  gpuCount?: number
  billingMode?: string
  actor: {
    type: "tenant_user"
    id: string
    tenantId: string
  }
}

export interface WaverlessCreateEndpointResponse {
  externalEndpointId: string
  waverlessEndpointId?: string
  providerDeploymentId?: string
  status: string
  publicUrl?: string
  desiredReplicas?: number
  observedReplicas?: number
  readyReplicas?: number
}

export interface WaverlessEndpointRuntime {
  externalEndpointId: string
  status: string
  logicalAzId: string
  providerId: string
  physicalRegionId?: string
  desiredReplicas: number
  observedReplicas: number
  readyReplicas: number
  failedReplicas?: number
  desiredGeneration?: number
  pendingCount?: number
  oldestPendingAgeSeconds?: number | null
  publicUrl?: string
  lastProviderSyncAt?: string
  providerSyncStatus?: string
}

export type WaverlessWorkerStatus =
  | "READY"
  | "STARTING"
  | "BUSY"
  | "DRAINING"
  | "TERMINATING"
  | "TERMINATED"
  | "FAILED"
  | "UNKNOWN"

export interface WaverlessWorker {
  workerId: string
  endpointId: string
  status: WaverlessWorkerStatus
  logicalAzId: string
  providerId: string
  physicalRegionId?: string
  skuId?: string
  currentJobs: number
  lastHeartbeatAt?: string | null
  createdAt?: string
  readyAt?: string | null
  terminatedAt?: string | null
  failure?: { code: string; message: string } | null
}

export interface WaverlessLifecycleCommand {
  commandId: string
  state:
    | "accepted"
    | "draining"
    | "terminating"
    | "succeeded"
    | "failed"
    | "timed_out"
  workerId?: string
  externalEndpointId?: string
}

export interface TerminateWorkerParams {
  externalEndpointId: string
  workerId: string
  idempotencyKey: string
  reasonCode: string
  reason: string
  actor: {
    type: "tenant_user"
    id: string
    tenantId: string
  }
  source?: string
  requestId?: string
  /** Default drain: in-flight tasks → failed-retryable + event (product decision #9) */
  drainTimeoutSeconds?: number
  /** Product default: mark in-flight failed-retryable; never silent drop */
  inFlightPolicy?: "failed_retryable"
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

export async function createWaverlessEndpoint(
  req: WaverlessCreateEndpointRequest,
  opts?: { idempotencyKey?: string; requestId?: string },
): Promise<WaverlessCreateEndpointResponse> {
  const placementMode =
    req.placementMode ?? resolvePlacementModeFromConfig()

  const binding =
    req.logicalAzId ? getLogicalAzBinding(req.logicalAzId) : undefined
  if (placementMode === "pin" && req.logicalAzId && !binding) {
    throw new WaverlessConfigError(
      `Unknown logical AZ: ${req.logicalAzId} (not in region registry)`,
    )
  }

  const gpuType = req.gpuType ?? req.gpuSku
  let providerSkuId = req.providerSkuId
  if (!providerSkuId && gpuType) {
    try {
      providerSkuId = resolveGongjiProviderSkuId(gpuType)
    } catch {
      if (placementMode === "pin") {
        throw new WaverlessConfigError(
          "providerSkuId is required for pin placement (configure gongjiProviderSkuByGpuId)",
        )
      }
    }
  }

  const regionAllowlist = req.regionAllowlist ?? []
  const body: Record<string, unknown> = {
    ...req,
    placementMode,
    logicalImage: req.logicalImage ?? req.image,
    gpuType,
    regionAllowlist,
  }

  if (binding) {
    body.physicalRegionId = req.physicalRegionId || binding.physicalRegionId
    body.providerId = req.providerId || binding.providerId
    body.logicalAzId = binding.logicalAzId
  }

  if (providerSkuId) {
    body.providerSkuId = providerSkuId
  }

  return waverlessFetch<WaverlessCreateEndpointResponse>(
    "/control/v1/endpoints",
    {
      method: "POST",
      body: JSON.stringify(body),
      timeoutMs: 60_000,
      idempotencyKey: opts?.idempotencyKey,
      requestId: opts?.requestId,
    },
  )
}

export async function getWaverlessEndpointRuntime(
  externalEndpointId: string,
): Promise<WaverlessEndpointRuntime> {
  return waverlessFetch(
    `/control/v1/endpoints/${encodeURIComponent(externalEndpointId)}/runtime`,
  )
}

export async function listWaverlessWorkers(
  externalEndpointId: string,
  params?: { page?: number; pageSize?: number },
): Promise<{
  items: WaverlessWorker[]
  total: number
  page: number
  pageSize: number
}> {
  const page = params?.page ?? 1
  const pageSize = Math.min(100, params?.pageSize ?? 20)
  const qs = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  })
  return waverlessFetch(
    `/control/v1/endpoints/${encodeURIComponent(externalEndpointId)}/workers?${qs}`,
  )
}

export async function patchWaverlessEndpoint(
  externalEndpointId: string,
  patch: {
    regionAllowlist?: string[]
    minReplicas?: number
    maxReplicas?: number
    scaleUpWaitSeconds?: number
  },
  opts?: { idempotencyKey?: string; requestId?: string },
): Promise<void> {
  const body: Record<string, unknown> = {}
  if (patch.regionAllowlist !== undefined) {
    body.regionAllowlist = patch.regionAllowlist
  }
  if (patch.minReplicas !== undefined) body.minReplicas = patch.minReplicas
  if (patch.maxReplicas !== undefined) body.maxReplicas = patch.maxReplicas
  if (patch.scaleUpWaitSeconds !== undefined) {
    body.scaleUpWaitSeconds = patch.scaleUpWaitSeconds
  }

  await waverlessFetch(
    `/control/v1/endpoints/${encodeURIComponent(externalEndpointId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
      idempotencyKey: opts?.idempotencyKey,
      requestId: opts?.requestId,
    },
  )
}

export async function scaleWaverlessEndpoint(
  externalEndpointId: string,
  minReplicas: number,
  maxReplicas: number,
  opts?: { scaleUpWaitSeconds?: number; idempotencyKey?: string },
): Promise<void> {
  await waverlessFetch(
    `/control/v1/endpoints/${encodeURIComponent(externalEndpointId)}/scale`,
    {
      method: "POST",
      body: JSON.stringify({
        minReplicas,
        maxReplicas,
        scaleUpWaitSeconds: opts?.scaleUpWaitSeconds,
      }),
      idempotencyKey: opts?.idempotencyKey,
    },
  )
}

export async function deleteWaverlessEndpoint(
  externalEndpointId: string,
  opts?: { idempotencyKey?: string },
): Promise<void> {
  await waverlessFetch(
    `/control/v1/endpoints/${encodeURIComponent(externalEndpointId)}`,
    {
      method: "DELETE",
      idempotencyKey: opts?.idempotencyKey,
    },
  )
}

/**
 * Ownership must already be verified in gpus (computeBase + organization).
 * Drain → terminate; in-flight default = failed_retryable + audit event.
 */
export async function terminateWaverlessWorker(
  params: TerminateWorkerParams,
): Promise<WaverlessLifecycleCommand> {
  const {
    externalEndpointId,
    workerId,
    idempotencyKey,
    reasonCode,
    reason,
    actor,
    source = "gpus-console",
    requestId,
    drainTimeoutSeconds = 120,
    inFlightPolicy = "failed_retryable",
  } = params

  return waverlessFetch<WaverlessLifecycleCommand>(
    `/control/v1/endpoints/${encodeURIComponent(externalEndpointId)}/workers/${encodeURIComponent(workerId)}/terminate`,
    {
      method: "POST",
      body: JSON.stringify({
        idempotencyKey,
        reasonCode,
        reason,
        actor,
        source,
        requestId,
        drainTimeoutSeconds,
        inFlightPolicy,
      }),
      idempotencyKey,
      requestId,
      timeoutMs: 45_000,
    },
  )
}

export async function getWaverlessLifecycleCommand(
  commandId: string,
): Promise<WaverlessLifecycleCommand> {
  return waverlessFetch(
    `/control/v1/lifecycle-commands/${encodeURIComponent(commandId)}`,
  )
}

/** Build create payload from Cloud instance fields (§10.19 M1 auto placement). */
export function buildCreatePayload(input: {
  computeBaseId: string
  name: string
  image: string
  placementMode?: "auto" | "pin"
  regionAllowlist?: string[]
  logicalAzId?: string | null
  billingMode?: string
  minReplicas: number
  maxReplicas: number
  scaleUpWaitSeconds: number
  targetPort?: number | null
  command?: string | null
  envVars?: Record<string, string>
  gpuSku?: string
  gpuCount?: number
  userId: string
  tenantId: string
}): WaverlessCreateEndpointRequest {
  const placementMode =
    input.placementMode ?? resolvePlacementModeFromConfig()
  const regionAllowlist = input.regionAllowlist ?? []
  const gpuType = input.gpuSku
  if (!gpuType) {
    throw new WaverlessConfigError("gpuSku/gpuType is required for waverless create")
  }

  const base: WaverlessCreateEndpointRequest = {
    externalEndpointId: input.computeBaseId,
    name: input.name,
    image: input.image,
    logicalImage: input.image,
    placementMode,
    regionAllowlist,
    minReplicas: input.minReplicas,
    maxReplicas: input.maxReplicas,
    scaleUpWaitSeconds: input.scaleUpWaitSeconds,
    targetPort: input.targetPort ?? undefined,
    command: input.command ?? undefined,
    env: input.envVars,
    gpuSku: gpuType,
    gpuType,
    gpuCount: input.gpuCount,
    billingMode: input.billingMode,
    actor: {
      type: "tenant_user",
      id: input.userId,
      tenantId: input.tenantId,
    },
  }

  if (placementMode === "pin" && input.logicalAzId) {
    const binding = getLogicalAzBinding(input.logicalAzId)
    if (!binding) {
      throw new WaverlessConfigError(`Unknown logical AZ: ${input.logicalAzId}`)
    }
    let providerSkuId: string | undefined
    try {
      providerSkuId = resolveGongjiProviderSkuId(gpuType)
    } catch (err) {
      throw new WaverlessConfigError(
        err instanceof Error ? err.message : "无法解析 Gongji providerSkuId",
      )
    }
    return {
      ...base,
      logicalAzId: binding.logicalAzId,
      providerId: binding.providerId,
      physicalRegionId: binding.physicalRegionId,
      providerSkuId,
    }
  }

  try {
    const providerSkuId = resolveGongjiProviderSkuId(gpuType)
    return { ...base, providerSkuId }
  } catch {
    return base
  }
}

export type { OrchestratorType }
