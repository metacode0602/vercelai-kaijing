export type AppCategory = "all" | "llm" | "image" | "audio" | "video"

export type DeployTypeId = "instance" | "serverless"

export type CommitmentId = "onDemand" | "monthly" | "spot"

export interface AppCategoryFilter {
  id: AppCategory
  label: string
}

export interface ApplicationTemplate {
  id: string
  applicationId: number
  name: string
  image: string
  gpuType: string
  vramGb: number
  pricePerHour: number
  deployTypeLabel: string
  categories: AppCategory[]
}

export interface DeployTypeOption {
  id: DeployTypeId
  name: string
  description: string
  features: string[]
  comingSoon?: boolean
  comingSoonLabel?: string
  serverlessDeployHref?: string
}

export interface CommitmentOption {
  id: CommitmentId
  name: string
  description: string
  spotTag?: string
}

export interface BannerSlide {
  title: string
  subtitlePrefix: string
  subtitleHighlight: string
  ctaLabel: string
  imageUrl: string
  gradient: string
}

export interface RegionOption {
  id: string
  label: string
}

export interface AppsPageContent {
  title: string
  subtitle: string
  selectAppTitle: string
  searchPlaceholder: string
  viewDetailsLabel: string
  selectDeployTypeTitle: string
  currentSelectionTitle: string
  currentSelectionHint: string
  gpuTypeLabel: string
  vramLabel: string
  commitmentTitle: string
  deployCtaLabel: string
  diskTotalLabel: string
  diskPricePerDay: string
  banner: BannerSlide
  categories: AppCategoryFilter[]
  applications: ApplicationTemplate[]
  deployTypes: DeployTypeOption[]
  commitments: CommitmentOption[]
  regions: RegionOption[]
  defaults: {
    category: AppCategory
    applicationId: string
    deployType: DeployTypeId
    commitment: CommitmentId
    regionId: string
  }
}

export interface AppsPageFilters {
  category: AppCategory
  search: string
}

export function filterApplications(
  applications: ApplicationTemplate[],
  filters: AppsPageFilters,
): ApplicationTemplate[] {
  const keyword = filters.search.trim().toLowerCase()
  return applications.filter((app) => {
    const matchesCategory =
      filters.category === "all" || app.categories.includes(filters.category)
    const matchesSearch =
      !keyword ||
      app.name.toLowerCase().includes(keyword) ||
      app.image.toLowerCase().includes(keyword)
    return matchesCategory && matchesSearch
  })
}

export function getApplicationById(
  applications: ApplicationTemplate[],
  applicationId: string,
): ApplicationTemplate {
  return (
    applications.find((app) => app.id === applicationId) ?? applications[0]!
  )
}

export function getCommitmentById(
  commitments: CommitmentOption[],
  commitmentId: CommitmentId,
): CommitmentOption {
  return commitments.find((item) => item.id === commitmentId) ?? commitments[0]!
}

export function getRegionLabel(
  regions: RegionOption[],
  regionId: string,
): string {
  return regions.find((region) => region.id === regionId)?.label ?? regions[0]!.label
}

export function getPricePerHour(
  basePrice: number,
  commitment: CommitmentId,
): number {
  if (commitment === "spot") return basePrice * 0.6
  return basePrice
}

export function getBillingLabel(commitment: CommitmentId): string {
  if (commitment === "spot") return "Spot"
  if (commitment === "monthly") return "订阅"
  return "按需"
}

export const APPS_PAGE_DATA: AppsPageContent = {
  title: "部署应用",
  subtitle: "选择一个应用并配置 GPU 资源以进行部署",
  selectAppTitle: "选择应用",
  searchPlaceholder: "搜索模板...",
  viewDetailsLabel: "查看详情",
  selectDeployTypeTitle: "选择部署类型",
  currentSelectionTitle: "当前已选择",
  currentSelectionHint: "根据当前选择，已为你随机选择了一个可用的",
  gpuTypeLabel: "GPU 类型",
  vramLabel: "VRAM",
  commitmentTitle: "承诺期",
  deployCtaLabel: "部署 >",
  diskTotalLabel: "总磁盘: 100 GB(免费120GB)",
  diskPricePerDay: "$0.000",
  banner: {
    title: "New GPURun-Application experience: speed up GPU app rollout",
    subtitlePrefix: "Find the instance creation page at ",
    subtitleHighlight: "GPUs → Deploy Instance",
    ctaLabel: "Deploy Now !",
    imageUrl: "",
    gradient: "linear-gradient(90deg, rgb(2, 70, 39) 0%, rgb(0, 5, 2) 100%)",
  },
  categories: [
    { id: "all", label: "所有模型" },
    { id: "llm", label: "LLM" },
    { id: "image", label: "图像" },
    { id: "audio", label: "音频" },
    { id: "video", label: "视频" },
  ],
  applications: [
    {
      id: "109571",
      applicationId: 109571,
      name: "Gemma 4 E4B",
      image: "gpurun/gemma-4-e4b-it:v0.01",
      gpuType: "NVIDIA GeForce RTX 5090 x 2",
      vramGb: 32,
      pricePerHour: 1.2,
      deployTypeLabel: "实例",
      categories: ["all", "llm"],
    },
    {
      id: "109570",
      applicationId: 109570,
      name: "Gemma 4 E2B",
      image: "gpurun/gemma-4-e2b-it:v0.01",
      gpuType: "NVIDIA GeForce RTX 4090 x 1",
      vramGb: 24,
      pricePerHour: 0.67,
      deployTypeLabel: "实例",
      categories: ["all", "llm"],
    },
    {
      id: "109567",
      applicationId: 109567,
      name: "Gemma 4 26B A4B",
      image: "gpurun/gemma-4-26b-a4b-it:v0.01",
      gpuType: "NVIDIA H100 80GB HBM3 x 1",
      vramGb: 80,
      pricePerHour: 2.59,
      deployTypeLabel: "实例",
      categories: ["all", "llm"],
    },
    {
      id: "109566",
      applicationId: 109566,
      name: "Gemma 4 31B",
      image: "gpurun/gemma-4-31b-it:v0.03",
      gpuType: "NVIDIA H100 80GB HBM3 x 1",
      vramGb: 80,
      pricePerHour: 2.59,
      deployTypeLabel: "实例",
      categories: ["all", "llm"],
    },
    {
      id: "109194",
      applicationId: 109194,
      name: "GLM-OCR",
      image: "gpurun/glm-ocr:v1.0",
      gpuType: "NVIDIA GeForce RTX 4090 x 1",
      vramGb: 24,
      pricePerHour: 0.67,
      deployTypeLabel: "实例",
      categories: ["all", "image"],
    },
    {
      id: "109148",
      applicationId: 109148,
      name: "PaddleOCR-VL-1.5",
      image: "gpurun/paddlex-paddleocr-vl-server:v2.3",
      gpuType: "NVIDIA GeForce RTX 4090 x 1",
      vramGb: 24,
      pricePerHour: 0.67,
      deployTypeLabel: "实例",
      categories: ["all", "image"],
    },
    {
      id: "109047",
      applicationId: 109047,
      name: "GLM-4.7-Flash",
      image: "gpurun/glm-4.7-flash:v0.02",
      gpuType: "NVIDIA GeForce RTX 4090 x 4",
      vramGb: 96,
      pricePerHour: 2.68,
      deployTypeLabel: "实例",
      categories: ["all", "llm"],
    },
    {
      id: "108996",
      applicationId: 108996,
      name: "GLM-Image",
      image: "gpurun/glm-image:v0.01",
      gpuType: "NVIDIA H100 80GB HBM3 x 1",
      vramGb: 80,
      pricePerHour: 2.59,
      deployTypeLabel: "实例",
      categories: ["all", "image"],
    },
    {
      id: "109782",
      applicationId: 109782,
      name: "Qwen3-30B-A3B",
      image: "gpurun/qwen3-30b-a3b-image:v0.01",
      gpuType: "NVIDIA H100 80GB HBM3 x 2",
      vramGb: 160,
      pricePerHour: 5.18,
      deployTypeLabel: "实例",
      categories: ["all", "llm", "image"],
    },
    {
      id: "108562",
      applicationId: 108562,
      name: "Langchain-Chatchat",
      image: "gpurun/langchain-chatchat:v0.1",
      gpuType: "NVIDIA GeForce RTX 5090 x 1",
      vramGb: 32,
      pricePerHour: 0.6,
      deployTypeLabel: "实例",
      categories: ["all", "llm"],
    },
    {
      id: "106787",
      applicationId: 106787,
      name: "Comfyui:Wan2.1-1.3B-t2v",
      image: "gpurun/comfyui:Wan2.1-1.3B-t2v",
      gpuType: "NVIDIA GeForce RTX 4090 x 1",
      vramGb: 24,
      pricePerHour: 0.67,
      deployTypeLabel: "实例",
      categories: ["all", "video"],
    },
    {
      id: "301",
      applicationId: 301,
      name: "Comfyui:flux1-fp8",
      image: "gpurun/comfyui:Flux1-fp8",
      gpuType: "NVIDIA GeForce RTX 4090 x 1",
      vramGb: 24,
      pricePerHour: 0.67,
      deployTypeLabel: "实例",
      categories: ["all", "image"],
    },
  ],
  deployTypes: [
    {
      id: "instance",
      name: "实例",
      description: "具备完全控制权的专用 GPU 实例。最适合长时间运行的工作负载。",
      features: ["SSH 访问", "持久化存储", "按小时付费"],
    },
    {
      id: "serverless",
      name: "Serverless",
      description: "自动扩缩容 GPU 端点。最适合流量可变的 API 服务。",
      features: ["自动扩缩容", "无闲置成本", "按请求付费"],
      comingSoon: true,
      comingSoonLabel: "即将推出",
      serverlessDeployHref: "/console/serverless/deploy",
    },
  ],
  commitments: [
    {
      id: "onDemand",
      name: "按需",
      description: "按量付费，费用基于实际使用时长。",
    },
    {
      id: "monthly",
      name: "订阅",
      description: "支付一次性固定费用，以长期承诺预留稳定的专用资源。",
    },
    {
      id: "spot",
      name: "Spot",
      description: "Spot 实例价格低廉，但可能随时被中断。",
      spotTag: "50% 优惠，可中断",
    },
  ],
  regions: [
    { id: "af-za-01", label: "AF-ZA-01 (South Africa)" },
    { id: "us-west-01", label: "US-WEST-01 (United States)" },
    { id: "eu-central-01", label: "EU-CENTRAL-01 (Europe)" },
    { id: "ap-southeast-01", label: "AP-SOUTHEAST-01 (Asia Pacific)" },
  ],
  defaults: {
    category: "all",
    applicationId: "109571",
    deployType: "instance",
    commitment: "onDemand",
    regionId: "af-za-01",
  },
}
