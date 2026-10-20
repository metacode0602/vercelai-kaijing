/**
 * Serverless-specific data access layer.
 * Wraps compute_base + serverless_detail with domain-specific queries.
 */

import { eq, and, desc, count, type SQL } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  computeBase,
  serverlessDetail,
  computeTaskEvent,
} from "@workspace/db"
import type { OrchestratorType } from "@/lib/server/config/waverless-regions"
import {
  getServerlessDeployConfig,
  listLogicalRegionOptionsFromConfig,
  resolvePlacementModeFromConfig,
  type ServerlessDeployDefaults,
} from "@/lib/server/config/serverless-deploy-config"

export interface ServerlessInstance {
  id: string
  name: string | null
  status: string
  region: string | null
  image: string | null
  commitment: string
  createdAt: Date
  updatedAt: Date
  resourceSpec: Record<string, unknown>
  // serverless detail
  serviceName: string | null
  faultTolerance: string
  minReplicas: number
  maxReplicas: number
  targetPort: number | null
  command: string | null
  envVars: Record<string, unknown>
  publicUrl: string | null
  internalEndpoint: string | null
  endpointUrl: string | null
  skyServeId: string | null
  orchestratorType: OrchestratorType
  waverlessEndpointId: string | null
  logicalAzId: string | null
  providerId: string | null
  placementMode: string
  regionAllowlist: string[]
  scaleUpWaitSeconds: number
  desiredGeneration: number
  providerStatus: string | null
  lastSyncedAt: Date | null
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

function mapServerlessRow(
  base: typeof computeBase.$inferSelect,
  detail: typeof serverlessDetail.$inferSelect | null,
): ServerlessInstance {
  const orchestratorType =
    (detail?.orchestratorType as OrchestratorType | undefined) ?? "skypilot"

  return {
    id: base.id,
    name: base.name,
    status: base.status,
    region: base.region,
    image: base.image,
    commitment: base.commitment,
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
    resourceSpec: (base.resourceSpec as Record<string, unknown>) ?? {},
    serviceName: detail?.serviceName ?? null,
    faultTolerance: detail?.faultTolerance ?? "non_interruptible",
    minReplicas: detail?.minReplicas ?? 1,
    maxReplicas: detail?.maxReplicas ?? 1,
    targetPort: detail?.targetPort ?? null,
    command: detail?.command ?? null,
    envVars: (detail?.envVars as Record<string, unknown>) ?? {},
    publicUrl: detail?.publicUrl ?? null,
    internalEndpoint: detail?.internalEndpoint ?? null,
    endpointUrl: detail?.endpointUrl ?? null,
    skyServeId: detail?.skyServeId ?? null,
    orchestratorType,
    waverlessEndpointId: detail?.waverlessEndpointId ?? null,
    logicalAzId: detail?.logicalAzId ?? null,
    providerId: detail?.providerId ?? null,
    placementMode: detail?.placementMode ?? "auto",
    regionAllowlist: Array.isArray(detail?.regionAllowlist)
      ? (detail.regionAllowlist as string[])
      : [],
    scaleUpWaitSeconds: detail?.scaleUpWaitSeconds ?? 0,
    desiredGeneration: detail?.desiredGeneration ?? 0,
    providerStatus: detail?.providerStatus ?? null,
    lastSyncedAt: detail?.lastSyncedAt ?? null,
  }
}

/**
 * List serverless instances for an organization, with optional status filter.
 */
export async function listServerlessInstances(
  organizationId: string,
  filters?: {
    status?: string
    page?: number
    pageSize?: number
  },
): Promise<PaginatedResult<ServerlessInstance>> {
  const page = Math.max(1, filters?.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, filters?.pageSize ?? 20))

  const conditions: SQL[] = [
    eq(computeBase.organizationId, organizationId),
    eq(computeBase.productLine, "serverless"),
  ]
  if (filters?.status) {
    conditions.push(eq(computeBase.status, filters.status))
  }
  const where = and(...conditions)

  const [totalRow] = await db
    .select({ total: count() })
    .from(computeBase)
    .where(where)

  const total = Number(totalRow?.total ?? 0)
  const offset = (page - 1) * pageSize

  const bases = await db
    .select()
    .from(computeBase)
    .where(where)
    .orderBy(desc(computeBase.createdAt))
    .limit(pageSize)
    .offset(offset)

  if (bases.length === 0) {
    return { items: [], total, page, pageSize }
  }

  const baseIds = bases.map((b) => b.id)
  const details = await db
    .select()
    .from(serverlessDetail)
    .where(
      baseIds.length === 1
        ? eq(serverlessDetail.computeBaseId, baseIds[0])
        : undefined,
    )

  const detailMap = new Map(details.map((d) => [d.computeBaseId, d]))

  if (baseIds.length > 1 && details.length === 0) {
    const allDetails = await db.select().from(serverlessDetail)
    for (const d of allDetails) {
      if (baseIds.includes(d.computeBaseId)) {
        detailMap.set(d.computeBaseId, d)
      }
    }
  }

  const items = bases.map((b) => mapServerlessRow(b, detailMap.get(b.id) ?? null))

  return { items, total, page, pageSize }
}

/**
 * Get a single serverless instance by ID, scoped to organization (ownership).
 */
export async function getServerlessInstance(
  id: string,
  organizationId: string,
): Promise<ServerlessInstance | null> {
  const [base] = await db
    .select()
    .from(computeBase)
    .where(
      and(
        eq(computeBase.id, id),
        eq(computeBase.organizationId, organizationId),
        eq(computeBase.productLine, "serverless"),
      ),
    )
    .limit(1)

  if (!base) return null

  const [detail] = await db
    .select()
    .from(serverlessDetail)
    .where(eq(serverlessDetail.computeBaseId, id))
    .limit(1)

  return mapServerlessRow(base, detail ?? null)
}

/**
 * Create a new serverless instance (compute_base + serverless_detail).
 */
export async function createServerlessInstance(input: {
  id: string
  organizationId: string
  tenantId: string
  name: string
  region: string
  image: string
  commitment: string
  gpuCardTypeId: string
  gpuCount: number
  serviceName: string
  faultTolerance: string
  minReplicas: number
  maxReplicas: number
  targetPort: number | null
  command: string | null
  envVars: Record<string, unknown>
  orchestratorType?: OrchestratorType
  logicalAzId?: string | null
  providerId?: string | null
  placementMode?: string
  regionAllowlist?: string[]
  scaleUpWaitSeconds?: number
  waverlessEndpointId?: string | null
}): Promise<ServerlessInstance> {
  const now = new Date()
  const orchestratorType: OrchestratorType = input.orchestratorType ?? "skypilot"

  const [base] = await db
    .insert(computeBase)
    .values({
      id: input.id,
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      productLine: "serverless",
      billingMode: "postpaid",
      commitment: input.commitment === "on-demand" ? "on_demand" : input.commitment,
      name: input.name,
      status: "creating",
      region: input.region || null,
      idcName: input.region || null,
      resourceSpec: {
        gpuCardTypeId: input.gpuCardTypeId,
        gpuCount: input.gpuCount,
      },
      image: input.image,
    })
    .returning()

  const detailValues = {
    id: `sld-${input.id}`,
    computeBaseId: input.id,
    serviceName: input.serviceName,
    faultTolerance: input.faultTolerance,
    minReplicas: input.minReplicas,
    maxReplicas: input.maxReplicas,
    targetPort: input.targetPort,
    command: input.command,
    envVars: input.envVars,
    orchestratorType,
    waverlessEndpointId:
      input.waverlessEndpointId ??
      (orchestratorType === "waverless" ? input.id : null),
    logicalAzId: input.logicalAzId ?? null,
    providerId: input.providerId ?? null,
    placementMode: input.placementMode ?? "auto",
    regionAllowlist: input.regionAllowlist ?? [],
    scaleUpWaitSeconds: input.scaleUpWaitSeconds ?? 0,
    desiredGeneration: 0,
    providerStatus: null as string | null,
    lastSyncedAt: null as Date | null,
  }

  await db.insert(serverlessDetail).values(detailValues)

  return mapServerlessRow(base, {
    ...detailValues,
    publicUrl: null,
    internalEndpoint: null,
    endpointUrl: null,
    skyServeId: null,
    createdAt: now,
  })
}

/**
 * Update serverless instance status.
 */
export async function updateServerlessStatus(
  id: string,
  organizationId: string,
  status: string,
): Promise<void> {
  await db
    .update(computeBase)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(computeBase.id, id),
        eq(computeBase.organizationId, organizationId),
      ),
    )
}

/**
 * Update serverless detail fields (endpoint URL, sky serve ID, waverless fields, etc.).
 */
export async function updateServerlessDetail(
  computeBaseId: string,
  patch: Partial<{
    publicUrl: string
    internalEndpoint: string
    endpointUrl: string
    skyServeId: string
    serviceName: string
    faultTolerance: string
    minReplicas: number
    maxReplicas: number
    waverlessEndpointId: string
    logicalAzId: string
    providerId: string
    placementMode: string
    regionAllowlist: string[]
    scaleUpWaitSeconds: number
    desiredGeneration: number
    providerStatus: string | null
    lastSyncedAt: Date | null
  }>,
): Promise<void> {
  await db
    .update(serverlessDetail)
    .set(patch)
    .where(eq(serverlessDetail.computeBaseId, computeBaseId))
}

/**
 * Delete a serverless instance (cascade deletes detail).
 */
export async function deleteServerlessInstance(
  id: string,
  organizationId: string,
): Promise<void> {
  await db
    .delete(computeBase)
    .where(
      and(
        eq(computeBase.id, id),
        eq(computeBase.organizationId, organizationId),
      ),
    )
}

/**
 * Append an immutable compute task event (drain/terminate audit, etc.).
 */
export async function appendComputeTaskEvent(input: {
  computeBaseId: string
  eventType: string
  previousStatus?: string | null
  newStatus?: string | null
  description?: string
  detail?: Record<string, unknown>
  triggeredBy?: string
}): Promise<void> {
  const id = `cte-${Math.random().toString(36).slice(2, 10)}`
  await db.insert(computeTaskEvent).values({
    id,
    computeBaseId: input.computeBaseId,
    eventType: input.eventType,
    previousStatus: input.previousStatus ?? null,
    newStatus: input.newStatus ?? null,
    description: input.description ?? null,
    detail: input.detail ?? {},
    triggeredBy: input.triggeredBy ?? null,
    occurredAt: new Date(),
  })
}

/**
 * List available GPU types and regions for serverless deploy page.
 * Includes SkyPilot legacy regions + waverless logical AZs from static seed.
 */
export async function getServerlessDeployOptions(): Promise<{
  placementMode: "auto" | "pin"
  defaults: ServerlessDeployDefaults
  gpuCountOptions: number[]
  gpuTypes: Array<{
    id: string
    name: string
    brand: string
    vram: number
    onDemandPrice: number
  }>
  /** Optional logical region allowlist choices (§10.19) */
  logicalRegions: Array<{
    id: string
    name: string
    complianceDomain?: "domestic" | "overseas"
  }>
  /** Legacy SkyPilot single-region deploy */
  skypilotRegions: Array<{
    id: string
    name: string
    supportsStorage: boolean
    orchestratorType: OrchestratorType
    complianceDomain?: string
  }>
  regions: Array<{
    id: string
    name: string
    supportsStorage: boolean
    orchestratorType: OrchestratorType
    complianceDomain?: string
  }>
}> {
  const cfg = getServerlessDeployConfig()
  if (!cfg) {
    throw new Error(
      "SERVERLESS_DEPLOY_CONFIG 未设置，无法加载 Serverless 部署选项（参见 apps/gpus/config/serverless-deploy.example.json）",
    )
  }

  const waverlessRegions = cfg.waverlessLogicalAzs
    .filter((az) => az.schedulable)
    .map((az) => ({
      id: az.logicalAzId,
      name: az.displayName,
      supportsStorage: false,
      orchestratorType: "waverless" as const,
      complianceDomain: az.complianceDomain,
    }))

  const skypilotRegions = cfg.skypilotRegions.map((r) => ({
    ...r,
    orchestratorType: "skypilot" as const,
  }))

  const logicalRegions = listLogicalRegionOptionsFromConfig().map((r) => ({
    id: r.id,
    name: r.name,
    complianceDomain: r.complianceDomain,
  }))

  return {
    placementMode: resolvePlacementModeFromConfig(),
    defaults: cfg.defaults,
    gpuCountOptions: cfg.gpuCountOptions,
    gpuTypes: cfg.gpuTypes ?? [],
    logicalRegions,
    skypilotRegions,
    regions: [...skypilotRegions, ...waverlessRegions],
  }
}
