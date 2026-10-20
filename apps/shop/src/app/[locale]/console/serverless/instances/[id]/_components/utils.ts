import type { Instance } from "@/components/console-store"
import {
  FREE_DISK_GB,
  GPUS,
  REGIONS,
  getGpuUnitPrice,
  getDiskOveragePrice,
  getCommitmentLabel,
  normalizeCommitment,
} from "@/lib/gpu-data"
import type { ServerlessInstance } from "@/lib/server/dataaccess/compute"
import type {
  GpuRegionValues,
  StorageValues,
  WorkerConfigValues,
} from "../../../deploy/_components/types"
import type { RuntimeConfigValues } from "./runtime-config-step"

export function serverlessToStoreInstance(dto: ServerlessInstance): Instance {
  const spec = (dto.resourceSpec ?? {}) as Record<string, unknown>
  const gpuId = (spec.gpuCardTypeId as string) ?? "h100-sxm"
  const gpuCount = Number(spec.gpuCount ?? 1)
  const gpu = GPUS.find((g) => g.id === gpuId)?.name ?? dto.image ?? "GPU"
  const commitment = normalizeCommitment(
    (dto.commitment as Instance["commitment"]) ?? "on-demand",
    undefined,
  )
  const pricePerHour =
    getGpuUnitPrice(GPUS.find((g) => g.id === gpuId) ?? GPUS[0]!, commitment) *
      gpuCount +
    getDiskOveragePrice(FREE_DISK_GB)

  const envEntries = Object.entries((dto.envVars ?? {}) as Record<string, unknown>)

  const statusMap: Record<string, Instance["status"]> = {
    running: "running",
    deploying: "deploying",
    creating: "deploying",
    stopping: "stopping",
    stopped: "stopped",
  }

  return {
    id: dto.id,
    name: dto.name ?? dto.serviceName ?? dto.id,
    type: "serverless",
    gpu,
    gpuId,
    gpuCount,
    region:
      dto.regionAllowlist?.length
        ? `限定 ${dto.regionAllowlist.length} 个逻辑区`
        : dto.region ?? "不限区域（自动选址）",
    regionId: dto.region ?? undefined,
    regionAllowlist: dto.regionAllowlist ?? [],
    billing: getCommitmentLabel(commitment),
    commitment,
    image: dto.image ?? "",
    status: statusMap[dto.status] ?? "running",
    pricePerHour,
    createdAt: dto.createdAt.toISOString(),
    appName: dto.serviceName ?? dto.name ?? "",
    minWorkers: dto.minReplicas,
    maxWorkers: dto.maxReplicas,
    idleTimeout: 30,
    maxConcurrency: 1,
    cudaVersion: "12.4",
    requestTimeout: 120,
    diskSize: FREE_DISK_GB,
    volumeId: null,
    envVars: envEntries.map(([k, v]) => `${k}=${v}`).join("\n"),
    startCommand: dto.command ?? "",
    ports: dto.targetPort ? String(dto.targetPort) : "",
    templateLabel: "Serverless 端点",
    sshEnabled: false,
  }
}

export function instanceToGpuRegion(inst: Instance): GpuRegionValues {
  const gpuId = inst.gpuId ?? GPUS.find((g) => g.name === inst.gpu)?.id ?? "rtx-4090"
  const skypilotRegion =
    inst.regionId && REGIONS.some((r) => r.id === inst.regionId)
      ? inst.regionId
      : undefined

  return {
    gpuId,
    gpuCount: String(inst.gpuCount),
    regionAllowlist: inst.regionAllowlist ?? [],
    skypilotRegion,
    commitment: normalizeCommitment(inst.commitment, inst.subscriptionDays),
  }
}

export function instanceToWorkerConfig(inst: Instance): WorkerConfigValues {
  return {
    endpointName: inst.name,
    appName: inst.appName ?? "",
    minWorkers: inst.minWorkers ?? 0,
    maxWorkers: inst.maxWorkers ?? 1,
    idleTimeout: inst.idleTimeout ?? 60,
    maxConcurrency: inst.maxConcurrency ?? 1,
    cudaVersion: inst.cudaVersion ?? "",
    requestTimeout: inst.requestTimeout ?? 120,
  }
}

export function instanceToStorage(inst: Instance): StorageValues {
  return {
    diskSize: inst.diskSize ?? FREE_DISK_GB,
    volumeId: inst.volumeId ?? "none",
  }
}

export function instanceToRuntimeConfig(inst: Instance): RuntimeConfigValues {
  return {
    envVars: inst.envVars ?? "",
    startCommand: inst.startCommand ?? "",
    ports: inst.ports ?? "",
  }
}
