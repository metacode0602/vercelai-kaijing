export type MetalBillingMethod = "hourly" | "daily" | "weekly" | "monthly"

export type MetalSortMode = "default" | "price-asc" | "price-desc"

export type MetalViewMode = "grid" | "list"

export type NetworkMode = "standalone" | "nvlink" | "infiniband" | "roce"

export interface MetalPricing {
  hourly: number
  daily: number
  weekly: number
  monthly: number
}

export interface MetalDevice {
  id: string
  /** 数据中心 ID（下单用） */
  dataCenterId?: string
  /** GPU 卡型 ID（下单用） */
  gpuCardTypeId?: string
  gpuModelKey: string
  displayName: string
  region: string
  networkMode: NetworkMode
  gpuCount: number
  maxCuda: string
  driverVersion: string
  vcpu: number
  memoryGb: number
  systemDiskGb: number
  dataDiskGb: number
  pricing: MetalPricing
  stock: number
  /** 可租用截止时间，如 2026-07-15 18:00 */
  availableUntil: string
  /** 单次最长可租小时数 */
  availableHours: number
}

export interface MetalOfferingVariant {
  deviceId: string
  gpuCount: number
  vcpu: number
  memoryGb: number
  systemDiskGb: number
  dataDiskGb: number
  stock: number
  availableUntil: string
  availableHours: number
  pricing: MetalPricing
}

export interface AggregatedMetalOffering {
  key: string
  region: string
  networkMode: NetworkMode
  gpuModelKey: string
  displayName: string
  maxCuda: string
  driverVersion: string
  variants: MetalOfferingVariant[]
  pricing: MetalPricing
  totalStock: number
  inStock: boolean
}

export const METAL_BILLING_OPTIONS: { id: MetalBillingMethod; label: string }[] = [
  { id: "hourly", label: "按小时" },
  { id: "daily", label: "包天" },
  { id: "weekly", label: "包周" },
  { id: "monthly", label: "包月" },
]

export const METAL_REGION_OPTIONS = [
  "全部",
  "江苏2区",
  "安徽",
  "辽宁",
  "江苏",
  "福建",
  "海南",
  "上海1区",
  "四川",
  "新疆",
] as const

export const METAL_GPU_MODEL_OPTIONS = [
  "全部",
  "A100-SXM4-80GB",
  "H100-SXM",
  "RTX 4090",
  "RTX 4090-48G",
  "RTX 5090",
] as const

export const NETWORK_MODE_OPTIONS: { id: NetworkMode | "全部"; label: string }[] = [
  { id: "全部", label: "全部" },
  { id: "standalone", label: "单机" },
  { id: "nvlink", label: "NVLink 组网" },
  { id: "infiniband", label: "InfiniBand" },
  { id: "roce", label: "RoCE 组网" },
]

export const NETWORK_MODE_LABELS: Record<NetworkMode, string> = {
  standalone: "单机",
  nvlink: "NVLink 组网",
  infiniband: "InfiniBand",
  roce: "RoCE 组网",
}

const METAL_GPU_RUNTIME: Record<string, { maxCuda: string; driverVersion: string }> = {
  "RTX 4090": { maxCuda: "13.0", driverVersion: "570.86.10" },
  "RTX 4090-48G": { maxCuda: "13.0", driverVersion: "570.86.10" },
  "RTX 5090": { maxCuda: "13.0", driverVersion: "580.65.06" },
  "A100-SXM4-80GB": { maxCuda: "12.4", driverVersion: "550.127.08" },
  "H100-SXM": { maxCuda: "13.0", driverVersion: "570.86.10" },
}

const DEFAULT_GPU_RUNTIME = { maxCuda: "12.4", driverVersion: "550.127.08" }

type MetalDeviceSeed = Omit<MetalDevice, "maxCuda" | "driverVersion">

const METAL_DEVICE_SEEDS: MetalDeviceSeed[] = [
  {
    id: "metal-4090-8x-nvlink-jiangsu2",
    gpuModelKey: "RTX 4090",
    displayName: "RTX 4090 / 24 GB",
    region: "江苏2区",
    networkMode: "nvlink",
    gpuCount: 8,
    vcpu: 128,
    memoryGb: 1024,
    systemDiskGb: 500,
    dataDiskGb: 2000,
    pricing: { hourly: 12.8, daily: 280, weekly: 1800, monthly: 6800 },
    stock: 3,
    availableUntil: "2026-07-20 23:59",
    availableHours: 720,
  },
  {
    id: "metal-4090-8x-nvlink-anhui",
    gpuModelKey: "RTX 4090",
    displayName: "RTX 4090 / 24 GB",
    region: "安徽",
    networkMode: "nvlink",
    gpuCount: 8,
    vcpu: 128,
    memoryGb: 1024,
    systemDiskGb: 500,
    dataDiskGb: 2000,
    pricing: { hourly: 11.6, daily: 260, weekly: 1680, monthly: 6400 },
    stock: 2,
    availableUntil: "2026-06-30 12:00",
    availableHours: 168,
  },
  {
    id: "metal-4090-8x-nvlink-fujian",
    gpuModelKey: "RTX 4090",
    displayName: "RTX 4090 / 24 GB",
    region: "福建",
    networkMode: "nvlink",
    gpuCount: 8,
    vcpu: 120,
    memoryGb: 960,
    systemDiskGb: 500,
    dataDiskGb: 1800,
    pricing: { hourly: 12.0, daily: 270, weekly: 1750, monthly: 6600 },
    stock: 1,
    availableUntil: "2026-07-05 18:00",
    availableHours: 336,
  },
  {
    id: "metal-4090-4x-standalone-sichuan",
    gpuModelKey: "RTX 4090",
    displayName: "RTX 4090 / 24 GB",
    region: "四川",
    networkMode: "standalone",
    gpuCount: 4,
    vcpu: 64,
    memoryGb: 512,
    systemDiskGb: 200,
    dataDiskGb: 1000,
    pricing: { hourly: 5.2, daily: 115, weekly: 750, monthly: 2800 },
    stock: 5,
    availableUntil: "2026-08-01 00:00",
    availableHours: 1440,
  },
  {
    id: "metal-4090-4x-standalone-hainan",
    gpuModelKey: "RTX 4090",
    displayName: "RTX 4090 / 24 GB",
    region: "海南",
    networkMode: "standalone",
    gpuCount: 4,
    vcpu: 64,
    memoryGb: 512,
    systemDiskGb: 200,
    dataDiskGb: 1000,
    pricing: { hourly: 4.8, daily: 108, weekly: 700, monthly: 2600 },
    stock: 4,
    availableUntil: "2026-07-10 08:00",
    availableHours: 240,
  },
  {
    id: "metal-4090-48g-8x-ib-xinjiang",
    gpuModelKey: "RTX 4090-48G",
    displayName: "RTX 4090-48G / 48 GB",
    region: "新疆",
    networkMode: "infiniband",
    gpuCount: 8,
    vcpu: 128,
    memoryGb: 1024,
    systemDiskGb: 500,
    dataDiskGb: 4000,
    pricing: { hourly: 18.5, daily: 420, weekly: 2700, monthly: 10200 },
    stock: 2,
    availableUntil: "2026-07-25 20:00",
    availableHours: 504,
  },
  {
    id: "metal-4090-48g-8x-ib-shanghai",
    gpuModelKey: "RTX 4090-48G",
    displayName: "RTX 4090-48G / 48 GB",
    region: "上海1区",
    networkMode: "infiniband",
    gpuCount: 8,
    vcpu: 128,
    memoryGb: 1024,
    systemDiskGb: 500,
    dataDiskGb: 4000,
    pricing: { hourly: 19.2, daily: 440, weekly: 2850, monthly: 10800 },
    stock: 1,
    availableUntil: "2026-06-28 23:59",
    availableHours: 72,
  },
  {
    id: "metal-a100-8x-nvlink-jiangsu",
    gpuModelKey: "A100-SXM4-80GB",
    displayName: "A100-SXM4-80GB / 80 GB",
    region: "江苏",
    networkMode: "nvlink",
    gpuCount: 8,
    vcpu: 128,
    memoryGb: 2048,
    systemDiskGb: 500,
    dataDiskGb: 4000,
    pricing: { hourly: 32.0, daily: 720, weekly: 4800, monthly: 18000 },
    stock: 2,
    availableUntil: "2026-09-01 00:00",
    availableHours: 2160,
  },
  {
    id: "metal-a100-8x-nvlink-liaoning",
    gpuModelKey: "A100-SXM4-80GB",
    displayName: "A100-SXM4-80GB / 80 GB",
    region: "辽宁",
    networkMode: "nvlink",
    gpuCount: 8,
    vcpu: 128,
    memoryGb: 2048,
    systemDiskGb: 500,
    dataDiskGb: 4000,
    pricing: { hourly: 30.5, daily: 690, weekly: 4600, monthly: 17200 },
    stock: 0,
    availableUntil: "2026-07-15 12:00",
    availableHours: 360,
  },
  {
    id: "metal-h100-8x-ib-shanghai",
    gpuModelKey: "H100-SXM",
    displayName: "H100-SXM / 80 GB",
    region: "上海1区",
    networkMode: "infiniband",
    gpuCount: 8,
    vcpu: 160,
    memoryGb: 2048,
    systemDiskGb: 500,
    dataDiskGb: 8000,
    pricing: { hourly: 58.0, daily: 1320, weekly: 8800, monthly: 33000 },
    stock: 1,
    availableUntil: "2026-07-08 06:00",
    availableHours: 120,
  },
  {
    id: "metal-h100-8x-ib-sichuan",
    gpuModelKey: "H100-SXM",
    displayName: "H100-SXM / 80 GB",
    region: "四川",
    networkMode: "infiniband",
    gpuCount: 8,
    vcpu: 160,
    memoryGb: 2048,
    systemDiskGb: 500,
    dataDiskGb: 8000,
    pricing: { hourly: 55.0, daily: 1250, weekly: 8400, monthly: 31500 },
    stock: 2,
    availableUntil: "2026-08-15 18:00",
    availableHours: 1680,
  },
  {
    id: "metal-5090-4x-roce-anhui",
    gpuModelKey: "RTX 5090",
    displayName: "RTX 5090 / 32 GB",
    region: "安徽",
    networkMode: "roce",
    gpuCount: 4,
    vcpu: 72,
    memoryGb: 576,
    systemDiskGb: 300,
    dataDiskGb: 1500,
    pricing: { hourly: 8.5, daily: 190, weekly: 1250, monthly: 4700 },
    stock: 3,
    availableUntil: "2026-07-12 23:59",
    availableHours: 288,
  },
  {
    id: "metal-5090-4x-roce-fujian",
    gpuModelKey: "RTX 5090",
    displayName: "RTX 5090 / 32 GB",
    region: "福建",
    networkMode: "roce",
    gpuCount: 4,
    vcpu: 72,
    memoryGb: 576,
    systemDiskGb: 300,
    dataDiskGb: 1500,
    pricing: { hourly: 8.8, daily: 198, weekly: 1300, monthly: 4900 },
    stock: 2,
    availableUntil: "2026-07-18 16:00",
    availableHours: 408,
  },
  {
    id: "metal-5090-2x-standalone-xinjiang",
    gpuModelKey: "RTX 5090",
    displayName: "RTX 5090 / 32 GB",
    region: "新疆",
    networkMode: "standalone",
    gpuCount: 2,
    vcpu: 36,
    memoryGb: 288,
    systemDiskGb: 200,
    dataDiskGb: 800,
    pricing: { hourly: 3.6, daily: 82, weekly: 540, monthly: 2000 },
    stock: 6,
    availableUntil: "2026-08-20 12:00",
    availableHours: 960,
  },
]

export const METAL_DEVICES: MetalDevice[] = METAL_DEVICE_SEEDS.map((device) => {
  const runtime = METAL_GPU_RUNTIME[device.gpuModelKey] ?? DEFAULT_GPU_RUNTIME
  return {
    ...device,
    maxCuda: runtime.maxCuda,
    driverVersion: runtime.driverVersion,
  }
})

function aggregateKey(device: MetalDevice) {
  return `${device.region}|${device.networkMode}|${device.gpuModelKey}`
}

function minPricing(pricingList: MetalPricing[]): MetalPricing {
  return {
    hourly: Math.min(...pricingList.map((p) => p.hourly)),
    daily: Math.min(...pricingList.map((p) => p.daily)),
    weekly: Math.min(...pricingList.map((p) => p.weekly)),
    monthly: Math.min(...pricingList.map((p) => p.monthly)),
  }
}

function toVariant(device: MetalDevice): MetalOfferingVariant {
  return {
    deviceId: device.id,
    gpuCount: device.gpuCount,
    vcpu: device.vcpu,
    memoryGb: device.memoryGb,
    systemDiskGb: device.systemDiskGb,
    dataDiskGb: device.dataDiskGb,
    stock: device.stock,
    availableUntil: device.availableUntil,
    availableHours: device.availableHours,
    pricing: device.pricing,
  }
}

export function aggregateMetalDevices(devices: MetalDevice[]): AggregatedMetalOffering[] {
  const groups = new Map<string, MetalDevice[]>()

  for (const device of devices) {
    const key = aggregateKey(device)
    const list = groups.get(key) ?? []
    list.push(device)
    groups.set(key, list)
  }

  return Array.from(groups.entries()).map(([key, groupDevices]) => {
    const representative = groupDevices[0]
    const variants = groupDevices
      .map(toVariant)
      .sort((a, b) => a.gpuCount - b.gpuCount)

    const totalStock = variants.reduce((sum, v) => sum + v.stock, 0)

    return {
      key,
      region: representative.region,
      networkMode: representative.networkMode,
      gpuModelKey: representative.gpuModelKey,
      displayName: representative.displayName,
      maxCuda: representative.maxCuda,
      driverVersion: representative.driverVersion,
      variants,
      pricing: minPricing(variants.map((v) => v.pricing)),
      totalStock,
      inStock: totalStock > 0,
    }
  })
}

export function filterMetalDevices(
  devices: MetalDevice[],
  region: string,
  gpuModel: string,
  networkMode: NetworkMode | "全部",
  inStockOnly: boolean,
): MetalDevice[] {
  return devices.filter((device) => {
    if (region !== "全部" && device.region !== region) return false
    if (gpuModel !== "全部" && device.gpuModelKey !== gpuModel) return false
    if (networkMode !== "全部" && device.networkMode !== networkMode) return false
    if (inStockOnly && device.stock <= 0) return false
    return true
  })
}

export function getMetalSortPrice(
  offering: AggregatedMetalOffering,
  billing: MetalBillingMethod,
): number {
  switch (billing) {
    case "daily":
      return offering.pricing.daily
    case "weekly":
      return offering.pricing.weekly
    case "monthly":
      return offering.pricing.monthly
    case "hourly":
    default:
      return offering.pricing.hourly
  }
}

export function getMetalBillingHighlightLabel(billing: MetalBillingMethod) {
  switch (billing) {
    case "daily":
      return "包天"
    case "weekly":
      return "包周"
    case "monthly":
      return "包月"
    case "hourly":
    default:
      return "按小时"
  }
}

export function getMetalDeployPrice(device: MetalDevice, billing: MetalBillingMethod) {
  switch (billing) {
    case "daily":
      return { amount: device.pricing.daily, unit: "天" }
    case "weekly":
      return { amount: device.pricing.weekly, unit: "周" }
    case "monthly":
      return { amount: device.pricing.monthly, unit: "月" }
    case "hourly":
    default:
      return { amount: device.pricing.hourly, unit: "时" }
  }
}

export const METAL_BILLING_HOURS_PER_UNIT: Record<MetalBillingMethod, number> = {
  hourly: 1,
  daily: 24,
  weekly: 168,
  monthly: 720,
}

export function getMetalRentalDurationLabel(billing: MetalBillingMethod) {
  switch (billing) {
    case "daily":
      return "天"
    case "weekly":
      return "周"
    case "monthly":
      return "月"
    case "hourly":
    default:
      return "小时"
  }
}

export function parseMetalAvailableUntil(until: string) {
  return new Date(until.replace(" ", "T"))
}

export function getHoursUntilAvailableUntil(until: string) {
  const end = parseMetalAvailableUntil(until).getTime()
  if (Number.isNaN(end)) return 0
  return Math.max(0, (end - Date.now()) / (1000 * 60 * 60))
}

export function rentalDurationToHours(billing: MetalBillingMethod, duration: number) {
  return duration * METAL_BILLING_HOURS_PER_UNIT[billing]
}

export function getMaxRentalDuration(device: MetalDevice, billing: MetalBillingMethod) {
  const hoursPerUnit = METAL_BILLING_HOURS_PER_UNIT[billing]
  const maxByHours = Math.floor(device.availableHours / hoursPerUnit)
  const maxByDeadline = Math.floor(getHoursUntilAvailableUntil(device.availableUntil) / hoursPerUnit)
  return Math.max(0, Math.min(maxByHours, maxByDeadline))
}

export interface MetalRentalValidation {
  valid: boolean
  message?: string
  rentalHours: number
  maxDuration: number
}

export function validateMetalRentalDuration(
  device: MetalDevice,
  billing: MetalBillingMethod,
  duration: number,
): MetalRentalValidation {
  const maxDuration = getMaxRentalDuration(device, billing)
  const rentalHours = rentalDurationToHours(billing, duration)
  const unitLabel = getMetalRentalDurationLabel(billing)

  if (duration <= 0) {
    return {
      valid: false,
      message: "租用数量至少为 1",
      rentalHours: 0,
      maxDuration,
    }
  }

  if (maxDuration <= 0) {
    return {
      valid: false,
      message: "当前设备暂无可租时段",
      rentalHours,
      maxDuration,
    }
  }

  if (duration > maxDuration) {
    return {
      valid: false,
      message: `超出可用时间，当前计费下最多可租 ${maxDuration} ${unitLabel}`,
      rentalHours,
      maxDuration,
    }
  }

  if (rentalHours > device.availableHours) {
    return {
      valid: false,
      message: `超出最长租用时长（${device.availableHours} 小时）`,
      rentalHours,
      maxDuration,
    }
  }

  const hoursLeft = getHoursUntilAvailableUntil(device.availableUntil)
  if (rentalHours > hoursLeft) {
    return {
      valid: false,
      message: `超出可租截止时间（${formatMetalAvailabilityShort(device.availableUntil)}）`,
      rentalHours,
      maxDuration,
    }
  }

  return { valid: true, rentalHours, maxDuration }
}

export function metalBillingToVoucherBilling(
  billing: MetalBillingMethod,
): "on-demand" | "daily" | "weekly" | "monthly" {
  if (billing === "hourly") return "on-demand"
  return billing
}

export function formatMetalCNY(amount: number) {
  const formatted = Number.isInteger(amount) ? amount.toString() : amount.toFixed(2)
  return `¥${formatted}`
}

export function formatMetalAvailability(until: string, hours: number) {
  const datePart = until.split(" ")[0]
  return `可租至 ${datePart} · 最长 ${hours}h`
}

export function formatMetalAvailabilityShort(until: string) {
  return until.replace(/-/g, ".").replace(" ", " ")
}

export function getMetalDeviceById(id: string) {
  return METAL_DEVICES.find((device) => device.id === id)
}

export function getMetalOfferingByKey(key: string) {
  return aggregateMetalDevices(METAL_DEVICES).find((offering) => offering.key === key)
}

export function pickDeployDeviceId(offering: AggregatedMetalOffering): string | undefined {
  const inStock = offering.variants.find((variant) => variant.stock > 0)
  return inStock?.deviceId ?? offering.variants[0]?.deviceId
}

// ---------------------------------------------------------------------------
// 裸金属预装环境模板
// 物理机出厂已预装 Ubuntu 24.04 + NVIDIA 驱动 + CUDA。
// 以下模板为可选的软件环境预装，下单后自动执行安装脚本。
// ---------------------------------------------------------------------------

export interface MetalEnvTemplate {
  id: string
  label: string
  description: string
  /** 预装耗时（分钟），用于给用户预期 */
  setupMinutes: number
  /** 包含的主要软件 */
  packages: string[]
}

export const METAL_ENV_TEMPLATES: MetalEnvTemplate[] = [
  {
    id: "pytorch",
    label: "PyTorch",
    description: "预装 PyTorch 2.11 + torchvision + torchaudio + CUDA toolkit",
    setupMinutes: 2,
    packages: ["PyTorch 2.11", "torchvision", "torchaudio", "CUDA toolkit"],
  },
  {
    id: "miniconda",
    label: "Miniconda",
    description: "预装 Miniconda3，方便管理 Python 虚拟环境和依赖包",
    setupMinutes: 1,
    packages: ["Miniconda3", "Python 3.12"],
  },
  {
    id: "cuda-dev",
    label: "CUDA 开发",
    description: "预装 CUDA development toolkit + cuDNN + NCCL，适合从源码编译 GPU 加速应用",
    setupMinutes: 3,
    packages: ["CUDA toolkit (devel)", "cuDNN", "NCCL", "build-essential"],
  },
  {
    id: "clean",
    label: "纯净 Ubuntu",
    description: "不预装额外软件，仅保留出厂环境（Ubuntu 24.04 + NVIDIA 驱动 + CUDA runtime）",
    setupMinutes: 0,
    packages: [],
  },
] as const

export function getMetalEnvTemplateById(id: string): MetalEnvTemplate | undefined {
  return METAL_ENV_TEMPLATES.find((t) => t.id === id)
}
