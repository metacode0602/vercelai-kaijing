/**
 * Waverless orchestrator resolution for serverless create.
 * Region bindings and Gongji SKU marks live in SERVERLESS_DEPLOY_CONFIG (see serverless-deploy-config.ts).
 */

import {
  getLogicalAzBindingFromConfig,
  getServerlessDeployConfig,
  isSkypilotRegionId,
  listSchedulableLogicalAzsFromConfig,
  resolveGongjiProviderSkuId,
  type LogicalAzBinding,
} from "@/lib/server/config/serverless-deploy-config"

export type OrchestratorType = "skypilot" | "waverless"

export type { LogicalAzBinding }

export { resolveGongjiProviderSkuId, listSchedulableLogicalAzsFromConfig as listSchedulableLogicalAzs }

export function getLogicalAzBinding(
  logicalAzId: string,
): LogicalAzBinding | undefined {
  return getLogicalAzBindingFromConfig(logicalAzId)
}

/**
 * Resolve orchestrator for a create request.
 * M1: empty region + allowlist → waverless auto; explicit skypilot region id → skypilot.
 */
export function resolveOrchestratorType(params: {
  region?: string
  orchestratorType?: OrchestratorType
  placementMode?: "auto" | "pin"
  regionAllowlist?: string[]
}): OrchestratorType {
  if (params.orchestratorType) return params.orchestratorType

  const region = params.region?.trim()
  if (region) {
    if (isSkypilotRegionId(region)) return "skypilot"
    const binding = getLogicalAzBinding(region)
    if (binding?.complianceDomain === "domestic" && binding.providerId === "gongji") {
      return "waverless"
    }
  }

  const cfg = getServerlessDeployConfig()
  const placementMode = params.placementMode ?? cfg?.placementMode ?? "auto"
  if (placementMode === "auto" && (!region || params.regionAllowlist !== undefined)) {
    return cfg?.defaultOrchestratorType ?? "waverless"
  }

  return cfg?.defaultOrchestratorType ?? "skypilot"
}

/** Validate allowlist ids against configured logical regions / AZ bindings. */
export function normalizeRegionAllowlist(ids: string[] | undefined): string[] {
  if (!ids?.length) return []
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
  const invalid = unique.filter((id) => !getLogicalAzBinding(id))
  if (invalid.length > 0) {
    throw new Error(`未知逻辑区域: ${invalid.join(", ")}`)
  }
  return unique
}

export function isWaverlessOrchestrator(
  orchestratorType: string | null | undefined,
): boolean {
  return orchestratorType === "waverless"
}
