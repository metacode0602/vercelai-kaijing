import { REGIONS, genId } from "@/lib/gpu-data"

export const MAX_PRELOAD_TASKS = 5
export const MAX_PRELOAD_SIZE_GB = 100

export type PreloadStatus = "downloading" | "ready" | "failed"

export interface PreloadTask {
  id: string
  imageName: string
  imageRef: string
  note: string
  regionId: string
  regionName: string
  status: PreloadStatus
  sizeGb: number
  progress: number
  createdAt: string
}

export interface PreloadFilters {
  query: string
  region: string
  status: string
}

export const PRELOAD_STATUS_OPTIONS = [
  { value: "all", label: "全部状态" },
  { value: "downloading", label: "预热中" },
  { value: "ready", label: "已完成" },
  { value: "failed", label: "失败" },
] as const

export const PRELOAD_STATUS_LABELS: Record<PreloadStatus, string> = {
  downloading: "预热中",
  ready: "已完成",
  failed: "失败",
}

export function getRegionOptions() {
  return REGIONS.filter((region) => region.id !== "any")
}

export interface PreloadGpuAvailability {
  available: string[]
  unavailable: string[]
}

const DEFAULT_PRELOAD_GPUS: PreloadGpuAvailability = {
  available: [
    "H100 SXM 80GB",
    "RTX 4090 24GB",
    "RTX 4090 24GB (High frequency)",
    "NVIDIA GeForce RTX 5090 32GB",
    "NVIDIA L40S 48GB",
  ],
  unavailable: [
    "RTX 5090 32GB (High frequency)",
    "RTX 3090 24GB",
    "A100 SXM 80GB",
  ],
}

const REGION_PRELOAD_GPUS: Record<string, PreloadGpuAvailability> = {
  "us-west": DEFAULT_PRELOAD_GPUS,
  "us-east": {
    available: [
      "H100 SXM 80GB",
      "RTX 4090 24GB",
      "NVIDIA GeForce RTX 5090 32GB",
    ],
    unavailable: [
      "RTX 4090 24GB (High frequency)",
      "RTX 5090 32GB (High frequency)",
      "RTX 3090 24GB",
      "A100 SXM 80GB",
      "NVIDIA L40S 48GB",
    ],
  },
  "eu-central": {
    available: ["RTX 4090 24GB", "NVIDIA GeForce RTX 5090 32GB"],
    unavailable: [
      "H100 SXM 80GB",
      "RTX 4090 24GB (High frequency)",
      "RTX 5090 32GB (High frequency)",
      "RTX 3090 24GB",
      "A100 SXM 80GB",
      "NVIDIA L40S 48GB",
    ],
  },
  "ap-southeast": {
    available: ["RTX 4090 24GB", "A100 SXM 80GB"],
    unavailable: [
      "H100 SXM 80GB",
      "RTX 4090 24GB (High frequency)",
      "NVIDIA GeForce RTX 5090 32GB",
      "RTX 5090 32GB (High frequency)",
      "RTX 3090 24GB",
      "NVIDIA L40S 48GB",
    ],
  },
}

export function getPreloadGpusForRegion(regionId: string): PreloadGpuAvailability {
  return REGION_PRELOAD_GPUS[regionId] ?? DEFAULT_PRELOAD_GPUS
}

export const REGISTRY_CREDENTIAL_OPTIONS = [
  { value: "none", label: "无需凭证" },
  { value: "dockerhub-demo", label: "Docker Hub · demo-user" },
  { value: "ghcr-demo", label: "GHCR · org-read-token" },
  { value: "harbor-demo", label: "Harbor · registry.example.com" },
] as const

export type RegistryCredentialId =
  (typeof REGISTRY_CREDENTIAL_OPTIONS)[number]["value"]

export function filterPreloadTasks(tasks: PreloadTask[], filters: PreloadFilters) {
  const query = filters.query.trim().toLowerCase()

  return tasks.filter((task) => {
    if (query) {
      const haystack = `${task.imageName} ${task.imageRef} ${task.note}`.toLowerCase()
      if (!haystack.includes(query)) return false
    }
    if (filters.region !== "all" && task.regionId !== filters.region) return false
    if (filters.status !== "all" && task.status !== filters.status) return false
    return true
  })
}

export function createPreloadTask(input: {
  imageRef: string
  note: string
  regionId: string
}): PreloadTask {
  const region = REGIONS.find((item) => item.id === input.regionId)
  const imageName = input.imageRef.split("/").pop()?.split(":")[0] ?? input.imageRef

  return {
    id: genId("preload"),
    imageName,
    imageRef: input.imageRef,
    note: input.note.trim(),
    regionId: input.regionId,
    regionName: region?.name ?? input.regionId,
    status: "downloading",
    sizeGb: Math.min(
      MAX_PRELOAD_SIZE_GB,
      Math.max(8, Math.round(input.imageRef.length * 1.7)),
    ),
    progress: 0,
    createdAt: new Date().toISOString(),
  }
}

export function formatPreloadDateTime(iso: string) {
  const date = new Date(iso)
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}
