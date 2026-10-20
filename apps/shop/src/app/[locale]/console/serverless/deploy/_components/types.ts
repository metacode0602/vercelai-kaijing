import type { CommitmentType } from "@/lib/gpu-data"
import { PLATFORM_REGISTRY } from "@/lib/gpu-data"

export type TemplateMode = "preset" | "custom"
export type RegistrySource = "platform" | "custom"

export interface RegistryCredentials {
  username: string
  password: string
}

export interface GpuRegionValues {
  gpuId: string
  gpuCount: string
  /** Optional logical region allowlist; empty = all regions (§10.19) */
  regionAllowlist: string[]
  /** Legacy SkyPilot single-region deploy (optional) */
  skypilotRegion?: string
  commitment: CommitmentType
}

export interface TemplateValues {
  mode: TemplateMode
  templateId: string
  registrySource: RegistrySource
  customImage: string
  registryHost: string
  registryCredentials: RegistryCredentials | null
  envVars: string
  startCommand: string
  ports: string
}

export interface SavedTemplate {
  id: string
  name: string
  image: string
  registrySource: RegistrySource
  registryHost: string
  registryUsername?: string
  envVars: string
  startCommand: string
  ports: string
}

export interface WorkerConfigValues {
  endpointName: string
  appName: string
  minWorkers: number
  maxWorkers: number
  idleTimeout: number
  maxConcurrency: number
  cudaVersion: string
  requestTimeout: number
}

export interface StorageValues {
  diskSize: number
  volumeId: string
}

export function generateEndpointName() {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let result = ""
  for (let i = 0; i < 11; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

export function buildCustomImageRef(
  values: Pick<TemplateValues, "registrySource" | "customImage" | "registryHost">,
): string {
  const image = values.customImage.trim()
  if (!image) return ""

  if (values.registrySource === "platform") {
    if (image.startsWith(PLATFORM_REGISTRY.host)) return image
    return `${PLATFORM_REGISTRY.host}/${image.replace(/^\//, "")}`
  }

  const host = values.registryHost.trim()
  if (!host) return image
  if (image.startsWith(host)) return image
  return `${host.replace(/\/$/, "")}/${image.replace(/^\//, "")}`
}

export function stripRegistryHost(host: string, image: string) {
  const normalizedHost = host.replace(/\/$/, "")
  const prefix = `${normalizedHost}/`
  if (image.startsWith(prefix)) return image.slice(prefix.length)
  return image
}

export function getRegistrySourceLabel(source: RegistrySource) {
  return source === "platform" ? PLATFORM_REGISTRY.name : "自定义镜像仓库"
}

export function isCustomImageConfigValid(values: TemplateValues) {
  if (values.mode !== "custom") return true
  if (!values.customImage.trim()) return false
  if (values.registrySource === "custom") {
    if (!values.registryHost.trim()) return false
    if (
      !values.registryCredentials?.username ||
      !values.registryCredentials.password
    ) {
      return false
    }
  }
  return true
}
