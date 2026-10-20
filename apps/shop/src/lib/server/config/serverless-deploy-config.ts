/**
 * Serverless deploy product parameters (regions, defaults, Gongji SKU map).
 * Loaded from env JSON — no hardcoded AZ/SKU/worker defaults in application code.
 *
 * Primary: SERVERLESS_DEPLOY_CONFIG (JSON string)
 * Overrides: WAVERLESS_LOGICAL_AZ_JSON, WAVERLESS_GONGJI_PROVIDER_SKU_MAP
 */

import { z } from "zod"

const capabilitySchema = z.enum([
  "gpu-serverless-worker",
  "scale",
  "worker-terminate",
])

export const logicalAzBindingSchema = z.object({
  logicalAzId: z.string().min(1),
  displayName: z.string().min(1),
  complianceDomain: z.enum(["domestic", "overseas"]),
  providerId: z.literal("gongji"),
  physicalRegionId: z.string().min(1),
  capabilities: z.array(capabilitySchema).min(1),
  schedulable: z.boolean(),
})

export type LogicalAzBinding = z.infer<typeof logicalAzBindingSchema>

const regionOptionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  supportsStorage: z.boolean(),
  orchestratorType: z.enum(["skypilot", "waverless"]),
  complianceDomain: z.string().optional(),
})

const gpuTypeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  brand: z.string().min(1),
  vram: z.number().nonnegative(),
  onDemandPrice: z.number().nonnegative(),
})

const logicalRegionOptionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  complianceDomain: z.enum(["domestic", "overseas"]).optional(),
  schedulable: z.boolean().default(true),
})

export type LogicalRegionOption = z.infer<typeof logicalRegionOptionSchema>

const deployDefaultsSchema = z.object({
  gpuId: z.string().min(1),
  gpuCount: z.number().int().min(1).max(32),
  /** Legacy SkyPilot default region; omit or empty for waverless auto placement */
  region: z.string().optional(),
  commitment: z
    .enum(["spot", "on-demand", "daily", "weekly", "monthly"])
    .default("on-demand"),
  minWorkers: z.number().int().min(0).max(1000),
  maxWorkers: z.number().int().min(1).max(1000),
  idleTimeout: z.number().int().min(1).max(3600),
  maxConcurrency: z.number().int().min(1).max(1000),
  requestTimeout: z.number().int().min(0).max(3600),
  /** When omitted, UI/API use requestTimeout for scale-up wait mapping */
  scaleUpWaitSeconds: z.number().int().min(0).max(3600).optional(),
})

const serverlessDeployConfigSchema = z.object({
  /** Default placement for new endpoints (§10.19 M1) */
  placementMode: z.enum(["auto", "pin"]).default("auto"),
  /** When unset, waverless auto creates use this orchestrator if region is empty */
  defaultOrchestratorType: z.enum(["skypilot", "waverless"]).default("waverless"),
  defaults: deployDefaultsSchema,
  gpuCountOptions: z.array(z.number().int().min(1).max(32)).min(1),
  skypilotRegions: z.array(regionOptionSchema),
  waverlessLogicalAzs: z.array(logicalAzBindingSchema),
  /**
   * Tenant-facing logical region options for optional allowlist multi-select.
   * When omitted, derived from schedulable waverlessLogicalAzs.
   */
  logicalRegions: z.array(logicalRegionOptionSchema).optional(),
  gongjiProviderSkuByGpuId: z.record(z.string(), z.string()),
  gpuTypes: z.array(gpuTypeSchema).optional(),
})

export type ServerlessDeployConfig = z.infer<typeof serverlessDeployConfigSchema>
export type ServerlessDeployDefaults = z.infer<typeof deployDefaultsSchema>
export type ServerlessDeployRegionOption = z.infer<typeof regionOptionSchema>

let cached: ServerlessDeployConfig | null | undefined

function parseJsonEnv<T>(raw: string | undefined, label: string): T | undefined {
  const trimmed = raw?.trim()
  if (!trimmed) return undefined
  try {
    return JSON.parse(trimmed) as T
  } catch {
    throw new Error(`${label} 不是合法 JSON`)
  }
}

function mergeSkuMaps(
  base: Record<string, string>,
  override?: Record<string, string>,
): Record<string, string> {
  if (!override) return base
  return { ...base, ...override }
}

/**
 * Returns parsed deploy config, or null when SERVERLESS_DEPLOY_CONFIG is unset.
 * Throws on malformed JSON or schema validation failure.
 */
export function getServerlessDeployConfig(): ServerlessDeployConfig | null {
  if (cached !== undefined) return cached

  const raw = process.env.SERVERLESS_DEPLOY_CONFIG?.trim()
  if (!raw) {
    cached = null
    return cached
  }

  const parsed = parseJsonEnv<unknown>(raw, "SERVERLESS_DEPLOY_CONFIG")
  const base = serverlessDeployConfigSchema.parse(parsed)

  const azOverride = parseJsonEnv<unknown>(
    process.env.WAVERLESS_LOGICAL_AZ_JSON,
    "WAVERLESS_LOGICAL_AZ_JSON",
  )
  const waverlessLogicalAzs = azOverride
    ? z.array(logicalAzBindingSchema).parse(azOverride)
    : base.waverlessLogicalAzs

  const skuOverride = parseJsonEnv<Record<string, string>>(
    process.env.WAVERLESS_GONGJI_PROVIDER_SKU_MAP,
    "WAVERLESS_GONGJI_PROVIDER_SKU_MAP",
  )

  cached = {
    ...base,
    waverlessLogicalAzs,
    gongjiProviderSkuByGpuId: mergeSkuMaps(
      base.gongjiProviderSkuByGpuId,
      skuOverride,
    ),
  }
  return cached
}

export function requireServerlessDeployConfig(): ServerlessDeployConfig {
  const cfg = getServerlessDeployConfig()
  if (!cfg) {
    throw new Error(
      "SERVERLESS_DEPLOY_CONFIG 未设置，无法加载 Serverless 部署参数",
    )
  }
  return cfg
}

export function listSchedulableLogicalAzsFromConfig(): LogicalAzBinding[] {
  const cfg = getServerlessDeployConfig()
  if (!cfg) return []
  return cfg.waverlessLogicalAzs.filter((az) => az.schedulable)
}

/** UI allowlist options (configurable; no hardcoded region ids). */
export function listLogicalRegionOptionsFromConfig(): LogicalRegionOption[] {
  const cfg = getServerlessDeployConfig()
  if (!cfg) return []
  if (cfg.logicalRegions?.length) {
    return cfg.logicalRegions.filter((r) => r.schedulable)
  }
  return cfg.waverlessLogicalAzs
    .filter((az) => az.schedulable)
    .map((az) => ({
      id: az.logicalAzId,
      name: az.displayName,
      complianceDomain: az.complianceDomain,
      schedulable: true,
    }))
}

export function resolvePlacementModeFromConfig(): "auto" | "pin" {
  return getServerlessDeployConfig()?.placementMode ?? "auto"
}

export function isSkypilotRegionId(regionId: string): boolean {
  const cfg = getServerlessDeployConfig()
  if (!cfg) return false
  return cfg.skypilotRegions.some((r) => r.id === regionId)
}

export function getLogicalAzBindingFromConfig(
  logicalAzId: string,
): LogicalAzBinding | undefined {
  const cfg = getServerlessDeployConfig()
  if (!cfg) return undefined
  return cfg.waverlessLogicalAzs.find((az) => az.logicalAzId === logicalAzId)
}

function envSkuOverrideKey(gpuCardTypeId: string): string {
  return `WAVERLESS_GONGJI_PROVIDER_SKU_${gpuCardTypeId.replace(/-/g, "_").toUpperCase()}`
}

export function resolveGongjiProviderSkuId(gpuCardTypeId: string): string {
  const perGpu = process.env[envSkuOverrideKey(gpuCardTypeId)]?.trim()
  if (perGpu) return perGpu

  const cfg = getServerlessDeployConfig()
  const fromMap = cfg?.gongjiProviderSkuByGpuId[gpuCardTypeId]?.trim()
  if (fromMap) return fromMap

  throw new Error(
    `未配置 Gongji providerSkuId：GPU 型号 ${gpuCardTypeId}。请在 SERVERLESS_DEPLOY_CONFIG.gongjiProviderSkuByGpuId、WAVERLESS_GONGJI_PROVIDER_SKU_MAP 或 ${envSkuOverrideKey(gpuCardTypeId)} 中配置`,
  )
}

/** Reset cache (tests only). */
export function resetServerlessDeployConfigCache(): void {
  cached = undefined
}
