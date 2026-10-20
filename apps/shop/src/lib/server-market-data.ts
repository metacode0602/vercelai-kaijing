export type BillingMethod = "on-demand" | "daily" | "weekly" | "monthly" | "night"

export type SortMode = "default" | "price-asc" | "price-desc"

export type ViewMode = "grid" | "list"

export interface MarketOffering {
  id: string
  gpuModelKey: string
  displayName: string
  region: string
  gpuCount: number
  vcpu: number
  memoryGb: number
  systemDiskGb: number
  dataDiskGb: number
  expandableDiskGb?: number
  pricing: {
    hourly: number
    daily: number
    weekly: number
    monthly: number
  }
  inStock: boolean
}

export const BILLING_OPTIONS: { id: BillingMethod; label: string }[] = [
  { id: "on-demand", label: "按量计费" },
  { id: "daily", label: "包日" },
  { id: "weekly", label: "包周" },
  { id: "monthly", label: "包月" },
  { id: "night", label: "包夜" },
]

export const REGION_OPTIONS = [
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

export const GPU_MODEL_OPTIONS = [
  "全部",
  "A100-SXM4-40GB",
  "A100-SXM4-80GB",
  "CLOUD CPU",
  "CPU",
  "RTX 3060",
  "RTX 3090",
  "RTX 4090",
  "RTX 4090 Lite",
  "RTX 4090-48G",
  "RTX 5090",
] as const

export const GPU_COUNT_OPTIONS = [1, 2, 4, 8] as const

export const MARKET_OFFERINGS: MarketOffering[] = [
  {
    id: "cpu-sichuan",
    gpuModelKey: "CPU",
    displayName: "CPU",
    region: "四川",
    gpuCount: 1,
    vcpu: 40,
    memoryGb: 200,
    systemDiskGb: 30,
    dataDiskGb: 50,
    expandableDiskGb: 2252,
    pricing: { hourly: 0.6, daily: 12, weekly: 80, monthly: 340 },
    inStock: true,
  },
  {
    id: "cloud-cpu-hainan",
    gpuModelKey: "CLOUD CPU",
    displayName: "CLOUD CPU",
    region: "海南",
    gpuCount: 1,
    vcpu: 12,
    memoryGb: 42,
    systemDiskGb: 30,
    dataDiskGb: 50,
    expandableDiskGb: 1599,
    pricing: { hourly: 0.6, daily: 12, weekly: 80, monthly: 340 },
    inStock: true,
  },
  {
    id: "a100-40gb-jiangsu",
    gpuModelKey: "A100-SXM4-40GB",
    displayName: "A100-SXM4-40GB / 40 GB",
    region: "江苏",
    gpuCount: 1,
    vcpu: 30,
    memoryGb: 100,
    systemDiskGb: 30,
    dataDiskGb: 50,
    expandableDiskGb: 835,
    pricing: { hourly: 2.39, daily: 55, weekly: 370, monthly: 1400 },
    inStock: true,
  },
  {
    id: "rtx4090-xinjiang",
    gpuModelKey: "RTX 4090",
    displayName: "RTX 4090 / 24 GB",
    region: "新疆",
    gpuCount: 1,
    vcpu: 15,
    memoryGb: 100,
    systemDiskGb: 30,
    dataDiskGb: 50,
    expandableDiskGb: 145,
    pricing: { hourly: 1.46, daily: 35, weekly: 230, monthly: 880 },
    inStock: true,
  },
  {
    id: "rtx4090-hainan",
    gpuModelKey: "RTX 4090",
    displayName: "RTX 4090 / 24 GB",
    region: "海南",
    gpuCount: 1,
    vcpu: 15,
    memoryGb: 100,
    systemDiskGb: 30,
    dataDiskGb: 50,
    expandableDiskGb: 147,
    pricing: { hourly: 1.28, daily: 30, weekly: 210, monthly: 750 },
    inStock: true,
  },
  {
    id: "rtx4090-jiangsu2",
    gpuModelKey: "RTX 4090",
    displayName: "RTX 4090 / 24 GB",
    region: "江苏2区",
    gpuCount: 1,
    vcpu: 20,
    memoryGb: 28,
    systemDiskGb: 30,
    dataDiskGb: 50,
    pricing: { hourly: 1.08, daily: 24, weekly: 160, monthly: 620 },
    inStock: false,
  },
  {
    id: "rtx4090-fujian",
    gpuModelKey: "RTX 4090",
    displayName: "RTX 4090 / 24 GB",
    region: "福建",
    gpuCount: 1,
    vcpu: 23,
    memoryGb: 58,
    systemDiskGb: 30,
    dataDiskGb: 50,
    pricing: { hourly: 1.28, daily: 30, weekly: 210, monthly: 750 },
    inStock: true,
  },
  {
    id: "rtx3090-sichuan",
    gpuModelKey: "RTX 3090",
    displayName: "RTX 3090 / 24 GB",
    region: "四川",
    gpuCount: 1,
    vcpu: 20,
    memoryGb: 100,
    systemDiskGb: 30,
    dataDiskGb: 50,
    expandableDiskGb: 2252,
    pricing: { hourly: 0.99, daily: 23, weekly: 150, monthly: 580 },
    inStock: true,
  },
  {
    id: "rtx4090-48g-xinjiang",
    gpuModelKey: "RTX 4090-48G",
    displayName: "RTX 4090-48G / 48 GB",
    region: "新疆",
    gpuCount: 1,
    vcpu: 14,
    memoryGb: 90,
    systemDiskGb: 30,
    dataDiskGb: 50,
    expandableDiskGb: 160,
    pricing: { hourly: 1.89, daily: 45, weekly: 300, monthly: 1100 },
    inStock: true,
  },
  {
    id: "rtx4090-lite-xinjiang",
    gpuModelKey: "RTX 4090 Lite",
    displayName: "RTX 4090 Lite / 24 GB",
    region: "新疆",
    gpuCount: 1,
    vcpu: 13,
    memoryGb: 60,
    systemDiskGb: 30,
    dataDiskGb: 50,
    expandableDiskGb: 170,
    pricing: { hourly: 1.28, daily: 30, weekly: 210, monthly: 750 },
    inStock: true,
  },
  {
    id: "a100-80gb-shanghai",
    gpuModelKey: "A100-SXM4-80GB",
    displayName: "A100-SXM4-80GB / 80 GB",
    region: "上海1区",
    gpuCount: 1,
    vcpu: 28,
    memoryGb: 200,
    systemDiskGb: 30,
    dataDiskGb: 50,
    pricing: { hourly: 4.8, daily: 110, weekly: 750, monthly: 2900 },
    inStock: false,
  },
  {
    id: "rtx3060-jiangsu2",
    gpuModelKey: "RTX 3060",
    displayName: "RTX 3060 / 12 GB",
    region: "江苏2区",
    gpuCount: 1,
    vcpu: 16,
    memoryGb: 50,
    systemDiskGb: 30,
    dataDiskGb: 50,
    pricing: { hourly: 0.7, daily: 16, weekly: 105, monthly: 400 },
    inStock: false,
  },
  {
    id: "rtx5090-liaoning",
    gpuModelKey: "RTX 5090",
    displayName: "RTX 5090 / 32 GB",
    region: "辽宁",
    gpuCount: 1,
    vcpu: 18,
    memoryGb: 60,
    systemDiskGb: 30,
    dataDiskGb: 50,
    pricing: { hourly: 1.89, daily: 45, weekly: 300, monthly: 1100 },
    inStock: false,
  },
  {
    id: "rtx5090-anhui",
    gpuModelKey: "RTX 5090",
    displayName: "RTX 5090 / 32 GB",
    region: "安徽",
    gpuCount: 1,
    vcpu: 18,
    memoryGb: 60,
    systemDiskGb: 30,
    dataDiskGb: 50,
    expandableDiskGb: 1965,
    pricing: { hourly: 1.89, daily: 45, weekly: 300, monthly: 1100 },
    inStock: true,
  },
]

export function formatCNY(amount: number) {
  const formatted = Number.isInteger(amount) ? amount.toString() : amount.toFixed(2)
  return `¥${formatted}`
}

export function getSortPrice(
  offering: MarketOffering,
  billing: BillingMethod,
): number {
  switch (billing) {
    case "daily":
      return offering.pricing.daily
    case "weekly":
      return offering.pricing.weekly
    case "monthly":
      return offering.pricing.monthly
    case "night":
      return offering.pricing.daily * 0.5
    case "on-demand":
    default:
      return offering.pricing.hourly
  }
}

export function getBillingHighlightLabel(billing: BillingMethod) {
  switch (billing) {
    case "daily":
      return "包日"
    case "weekly":
      return "包周"
    case "monthly":
      return "包月"
    case "night":
      return "包夜"
    case "on-demand":
    default:
      return "按量"
  }
}

export type DeployBillingMethod =
  | "on-demand"
  | "daily"
  | "weekly"
  | "monthly"
  | "voucher"

export const DEPLOY_BILLING_OPTIONS: { id: DeployBillingMethod; label: string }[] =
  [
    { id: "on-demand", label: "按量计费" },
    { id: "daily", label: "包日" },
    { id: "weekly", label: "包周" },
    { id: "monthly", label: "包月" },
    { id: "voucher", label: "兑换券" },
  ]

export type ImageCategory = "base" | "community" | "custom"

export const IMAGE_CATEGORIES: { id: ImageCategory; label: string }[] = [
  { id: "base", label: "基础镜像" },
  { id: "community", label: "社区镜像" },
  { id: "custom", label: "我的镜像" },
]

export const BASE_IMAGES = [
  {
    id: "pytorch",
    label: "PyTorch",
    versions: [
      "2.11.0-cuda12.8-py3.12.3-devel (2026-05-12)",
      "2.10.0-cuda12.4-py3.11-devel (2026-03-01)",
      "2.9.0-cuda12.1-py3.10-devel (2026-01-15)",
    ],
  },
  {
    id: "tensorflow",
    label: "TensorFlow",
    versions: [
      "2.16.1-gpu (2026-04-20)",
      "2.15.0-gpu (2026-02-10)",
    ],
  },
  {
    id: "miniconda",
    label: "Miniconda",
    versions: ["py312_24.11.1-0 (2026-05-01)"],
  },
  {
    id: "ubuntu",
    label: "Ubuntu",
    versions: [
      "22.04-cuda12.4 (2026-05-12)",
      "20.04-cuda11.8 (2025-12-01)",
    ],
  },
] as const

export const DISK_EXPAND_RATE_PER_GB_DAY = 0.01

export interface ServerInstanceBillingInput {
  id: string
  status: "running" | "deploying" | "stopping" | "stopped"
  billing: DeployBillingMethod
  gpuCount: number
  diskExpandEnabled: boolean
  extraDiskGb: number
  createdAt: string
}

function hashSeed(input: string) {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function getServerGpuPricePerHour(
  offering: MarketOffering,
  billing: DeployBillingMethod,
  gpuCount: number,
) {
  const gpuCountFactor = gpuCount / offering.gpuCount
  switch (billing) {
    case "daily":
      return (offering.pricing.daily * gpuCountFactor) / 24
    case "weekly":
      return (offering.pricing.weekly * gpuCountFactor) / (24 * 7)
    case "monthly":
      return (offering.pricing.monthly * gpuCountFactor) / (24 * 30)
    case "voucher":
      return 0
    case "on-demand":
    default:
      return offering.pricing.hourly * gpuCountFactor
  }
}

export function getServerInstanceConsumedBilling(
  inst: ServerInstanceBillingInput,
  offering: MarketOffering,
) {
  const hours = Math.max(
    0,
    (Date.now() - new Date(inst.createdAt).getTime()) / 3_600_000,
  )

  const expandDiskGb = inst.diskExpandEnabled ? inst.extraDiskGb : 0
  const storagePricePerDay = expandDiskGb * DISK_EXPAND_RATE_PER_GB_DAY
  const storagePricePerHour = storagePricePerDay / 24
  const storageCost = storagePricePerHour * hours

  const gpuPricePerHour = getServerGpuPricePerHour(
    offering,
    inst.billing,
    inst.gpuCount,
  )

  const gpuUptimeRatio =
    inst.status === "stopped"
      ? 0.25 + (hashSeed(inst.id) % 20) / 100
      : inst.status === "running"
        ? 0.7 + (hashSeed(inst.id) % 25) / 100
        : 0.45

  const gpuCost =
    inst.billing === "voucher"
      ? 0
      : gpuPricePerHour * hours * gpuUptimeRatio

  return {
    gpuCost,
    storageCost,
    totalCost: gpuCost + storageCost,
    gpuPricePerHour,
    storagePricePerDay,
  }
}

export function getOfferingById(id: string) {
  return MARKET_OFFERINGS.find((offering) => offering.id === id)
}

export function getDeployBillingLabel(billing: DeployBillingMethod) {
  return (
    DEPLOY_BILLING_OPTIONS.find((option) => option.id === billing)?.label ??
    "按量计费"
  )
}

export function getDeployPrice(
  offering: MarketOffering,
  billing: DeployBillingMethod,
) {
  switch (billing) {
    case "daily":
      return { amount: offering.pricing.daily, unit: "日" }
    case "weekly":
      return { amount: offering.pricing.weekly, unit: "周" }
    case "monthly":
      return { amount: offering.pricing.monthly, unit: "月" }
    case "voucher":
      return { amount: 0, unit: "兑换券" }
    case "on-demand":
    default:
      return { amount: offering.pricing.hourly, unit: "时" }
  }
}

export function parseBillingMethod(value: string | null): BillingMethod {
  if (
    value === "daily" ||
    value === "weekly" ||
    value === "monthly" ||
    value === "night"
  ) {
    return value
  }
  return "on-demand"
}

export function toDeployBilling(billing: BillingMethod): DeployBillingMethod {
  if (billing === "night") return "on-demand"
  return billing
}

export type ComputeVoucherType = "fixed" | "hours"

export interface ComputeVoucher {
  id: string
  name: string
  type: ComputeVoucherType
  /** fixed: 抵扣金额（元）；hours: 免费小时数 */
  value: number
  minSpend?: number
  applicableBilling?: DeployBillingMethod[]
  expiresAt: string
  tag?: string
}

export const COMPUTE_VOUCHERS: ComputeVoucher[] = [
  {
    id: "new-user-10",
    name: "新人 10 元算力券",
    type: "fixed",
    value: 10,
    expiresAt: "2026-12-31",
    tag: "通用",
  },
  {
    id: "trial-2h",
    name: "2 小时体验券",
    type: "hours",
    value: 2,
    applicableBilling: ["on-demand"],
    expiresAt: "2026-08-01",
    tag: "按量专享",
  },
  {
    id: "monthly-50",
    name: "包月满 300 减 50",
    type: "fixed",
    value: 50,
    minSpend: 300,
    applicableBilling: ["monthly"],
    expiresAt: "2026-09-30",
    tag: "包月专享",
  },
  {
    id: "weekly-20",
    name: "包周 20 元券",
    type: "fixed",
    value: 20,
    applicableBilling: ["weekly"],
    expiresAt: "2026-07-15",
    tag: "包周专享",
  },
]

export function isComputeVoucherApplicable(
  voucher: ComputeVoucher,
  billing: DeployBillingMethod,
  priceAmount: number,
) {
  if (billing === "voucher") return false
  if (
    voucher.applicableBilling?.length &&
    !voucher.applicableBilling.includes(billing)
  ) {
    return false
  }
  if (voucher.minSpend != null && priceAmount < voucher.minSpend) {
    return false
  }
  return true
}

export function getComputeVoucherDeduction(
  voucher: ComputeVoucher | null,
  price: { amount: number; unit: string },
  hourlyRate: number,
) {
  if (!voucher) {
    return { deduction: 0, summary: "" }
  }

  if (voucher.type === "hours") {
    if (price.unit !== "时") {
      return { deduction: 0, summary: "" }
    }
    const deduction = Math.min(voucher.value * hourlyRate, price.amount)
    return {
      deduction,
      summary: `抵扣 ${voucher.value} 小时（${formatCNY(deduction)}）`,
    }
  }

  const deduction = Math.min(voucher.value, price.amount)
  return {
    deduction,
    summary: `抵扣 ${formatCNY(deduction)}`,
  }
}

export function formatVoucherValue(voucher: ComputeVoucher) {
  if (voucher.type === "hours") {
    return `${voucher.value} 小时`
  }
  return formatCNY(voucher.value)
}
