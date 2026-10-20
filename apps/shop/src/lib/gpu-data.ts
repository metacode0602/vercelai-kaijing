export type GpuTier = "low" | "mid" | "high" | "na"

export interface Gpu {
  id: string
  name: string
  brand: string
  secure?: boolean
  vram: number
  vcpu: number
  ram: number
  maxCuda: string
  tier: GpuTier
  tierLabel: string
  onDemand: number
  spot: number
  available: boolean
}

export const GPUS: Gpu[] = [
  {
    id: "h100-sxm",
    name: "H100 SXM 80GB",
    brand: "NVIDIA",
    vram: 80,
    vcpu: 16,
    ram: 128,
    maxCuda: "13.0",
    tier: "low",
    tierLabel: "低",
    onDemand: 18.65,
    spot: 11.16,
    available: true,
  },
  {
    id: "rtx-4090",
    name: "RTX 4090 24GB",
    brand: "NVIDIA",
    secure: true,
    vram: 24,
    vcpu: 16,
    ram: 125,
    maxCuda: "13.0",
    tier: "mid",
    tierLabel: "中",
    onDemand: 4.82,
    spot: 2.81,
    available: true,
  },
  {
    id: "rtx-5090",
    name: "GeForce RTX 5090 32GB",
    brand: "NVIDIA",
    secure: true,
    vram: 32,
    vcpu: 16,
    ram: 58,
    maxCuda: "13.0",
    tier: "high",
    tierLabel: "高",
    onDemand: 4.32,
    spot: 2.52,
    available: true,
  },
  {
    id: "l40s",
    name: "L40S 48GB",
    brand: "NVIDIA",
    secure: true,
    vram: 48,
    vcpu: 22,
    ram: 125,
    maxCuda: "—",
    tier: "na",
    tierLabel: "不可用",
    onDemand: 3.96,
    spot: 2.23,
    available: false,
  },
  {
    id: "a100-sxm",
    name: "A100 SXM 80GB",
    brand: "NVIDIA",
    vram: 80,
    vcpu: 16,
    ram: 128,
    maxCuda: "12.4",
    tier: "low",
    tierLabel: "低",
    onDemand: 13.61,
    spot: 7.92,
    available: true,
  },
  {
    id: "a6000",
    name: "RTX A6000 48GB",
    brand: "NVIDIA",
    secure: true,
    vram: 48,
    vcpu: 14,
    ram: 100,
    maxCuda: "12.4",
    tier: "mid",
    tierLabel: "中",
    onDemand: 5.47,
    spot: 3.24,
    available: true,
  },
]

export interface Region {
  id: string
  name: string
  /** 该区域是否支持 S3 网络卷等持久化存储 */
  supportsStorage: boolean
}

export const REGIONS: Region[] = [
  { id: "any", name: "任何区域", supportsStorage: false },
  { id: "cn-beijing", name: "北京 / 原生阿里云 (CN-BEIJING)", supportsStorage: true },
  { id: "cn-guangzhou", name: "广州 / 原生阿里云 (CN-GUANGZHOU)", supportsStorage: true },
  { id: "us-guangzhou", name: "广州 / 原生阿里云 (US-GUANGZHOU)", supportsStorage: true },
]

export const BILLING_MODES = [
  { id: "on-demand", name: "按量计费" },
]

export type CommitmentType =
  | "spot"
  | "on-demand"
  | "daily"
  | "weekly"
  | "monthly"

export const PACKAGE_DISCOUNTS = {
  daily: 0.98,
  weekly: 0.92,
  monthly: 0.85,
} as const

export const BILLING_METHOD_OPTIONS: {
  id: CommitmentType
  name: string
  description: string
  hint: string
  badge?: string
}[] = [
  {
    id: "spot",
    name: "抢占",
    description: "使用闲时算力，价格更低，可能随时被中断",
    hint: "Spot 算力价格低廉，适合可容错中断的任务。",
    badge: "低至 6 折",
  },
  {
    id: "on-demand",
    name: "按量",
    description: "按实际运行秒数计费，无长期承诺",
    hint: "灵活按秒计费，用多少付多少。适合流量波动或短期任务，随时启停。",
  },
  {
    id: "daily",
    name: "包日",
    description: "预付 1 天，锁定资源与优惠单价",
    hint: "预付 24 小时承诺期，享受更优单价。",
  },
  {
    id: "weekly",
    name: "包周",
    description: "预付 7 天，锁定资源与优惠单价",
    hint: "预付 7 天承诺期，单价优于包日。",
  },
  {
    id: "monthly",
    name: "包月",
    description: "预付 30 天，锁定资源与最低单价",
    hint: "预付 30 天承诺期，单价最低，适合长期稳定服务。",
  },
]

export const COMMITMENT_OPTIONS = BILLING_METHOD_OPTIONS

export function normalizeCommitment(
  commitment?: CommitmentType | "subscription",
  subscriptionDays?: number,
): CommitmentType {
  if (commitment === "subscription") {
    if (subscriptionDays === 1) return "daily"
    if (subscriptionDays === 30) return "monthly"
    return "weekly"
  }
  if (
    commitment === "spot" ||
    commitment === "on-demand" ||
    commitment === "daily" ||
    commitment === "weekly" ||
    commitment === "monthly"
  ) {
    return commitment
  }
  return "on-demand"
}

export function getCommitmentLabel(commitment: CommitmentType) {
  return (
    BILLING_METHOD_OPTIONS.find((option) => option.id === commitment)?.name ??
    "按量"
  )
}

export function getGpuUnitPrice(gpu: Gpu, commitment: CommitmentType) {
  switch (commitment) {
    case "spot":
      return gpu.spot
    case "daily":
      return gpu.onDemand * PACKAGE_DISCOUNTS.daily
    case "weekly":
      return gpu.onDemand * PACKAGE_DISCOUNTS.weekly
    case "monthly":
      return gpu.onDemand * PACKAGE_DISCOUNTS.monthly
    case "on-demand":
    default:
      return gpu.onDemand
  }
}

export const VCPU_OPTIONS = [4, 8, 16, 24, 48, 80, 100]

export interface Template {
  id: string
  name: string
  image: string
  desc: string
  category: string
  featured?: boolean
}

export const TEMPLATES: Template[] = [
  {
    id: "pytorch",
    name: "PyTorch 2.4",
    image: "pytorch/pytorch:2.4.0-cuda12.4-cudnn9-runtime",
    desc: "官方 PyTorch 运行时镜像，预装 CUDA 12.4。",
    category: "开发环境",
    featured: true,
  },
  {
    id: "comfyui",
    name: "ComfyUI",
    image: "gpurun/comfyui:latest",
    desc: "图形化 Stable Diffusion 工作流，开箱即用。",
    category: "图像生成",
    featured: true,
  },
  {
    id: "ollama",
    name: "Ollama",
    image: "ollama/ollama:latest",
    desc: "本地大模型推理服务，兼容 OpenAI API。",
    category: "LLM 推理",
  },
  {
    id: "vllm",
    name: "vLLM OpenAI Server",
    image: "vllm/vllm-openai:latest",
    desc: "高吞吐 LLM 推理，支持连续批处理。",
    category: "LLM 推理",
    featured: true,
  },
  {
    id: "tensorflow",
    name: "TensorFlow 2.16",
    image: "tensorflow/tensorflow:2.16.1-gpu",
    desc: "TensorFlow GPU 镜像，适合训练任务。",
    category: "开发环境",
  },
  {
    id: "ubuntu",
    name: "Ubuntu 22.04 + CUDA",
    image: "nvidia/cuda:12.4.0-devel-ubuntu22.04",
    desc: "纯净的 CUDA 开发基础镜像。",
    category: "基础镜像",
  },
]

export function formatCNY(n: number) {
  return `¥${n.toFixed(2)}`
}

export function formatCNYDetail(n: number) {
  if (n === 0) return "¥0.00"
  if (n < 0.01) return `¥${n.toFixed(4)}`
  return formatCNY(n)
}

/** @deprecated Use formatCNY instead */
export const formatUSD = formatCNY
/** @deprecated Use formatCNYDetail instead */
export const formatUSDDetail = formatCNYDetail

export const FREE_DISK_GB = 60
export const DISK_OVERAGE_RATE_PER_GB_HR = 0.0001

export function getDiskOveragePrice(diskSizeGb: number) {
  return diskSizeGb > FREE_DISK_GB
    ? (diskSizeGb - FREE_DISK_GB) * DISK_OVERAGE_RATE_PER_GB_HR
    : 0
}

export function genId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`
}

export const PLATFORM_REGISTRY = {
  host: "registry.gongji.cloud",
  name: "平台镜像仓库",
  description: "平台提供的容器镜像仓库，镜像拉取无需额外认证，延迟更低。",
  loginHint: "docker login registry.gongji.cloud",
} as const
