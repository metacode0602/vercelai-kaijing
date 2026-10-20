"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { useStore } from "@/components/console-store"
import {
  type AppCategory,
  type ApplicationTemplate,
  filterApplications,
  getApplicationById,
  getBillingLabel,
  getCommitmentById,
  getPricePerHour,
  getRegionLabel,
  type CommitmentId,
  type DeployTypeId,
} from "@/lib/apps-data"
import { useLocaleRouter } from "@/lib/i18n/navigation"
import { trpc } from "@/trpc/client"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { AppsBanner } from "./_components/apps-banner"
import { AppsGrid } from "./_components/apps-grid"
import { AppsToolbar } from "./_components/apps-toolbar"
import { CommitmentSelector } from "./_components/commitment-selector"
import { DeployFooter } from "./_components/deploy-footer"
import { DeployTypeSelector } from "./_components/deploy-type-selector"
import { GpuRegionBar } from "./_components/gpu-region-bar"

const PAGE_CONTENT = {
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
    { id: "all" as const, label: "所有模型" },
    { id: "llm" as const, label: "LLM" },
    { id: "image" as const, label: "图像" },
    { id: "audio" as const, label: "音频" },
    { id: "video" as const, label: "视频" },
  ],
  deployTypes: [
    {
      id: "instance" as const,
      name: "实例",
      description: "具备完全控制权的专用 GPU 实例。最适合长时间运行的工作负载。",
      features: ["SSH 访问", "持久化存储", "按小时付费"],
    },
    {
      id: "serverless" as const,
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
      id: "onDemand" as const,
      name: "按需",
      description: "按量付费，费用基于实际使用时长。",
    },
    {
      id: "monthly" as const,
      name: "订阅",
      description: "支付一次性固定费用，以长期承诺预留稳定的专用资源。",
    },
    {
      id: "spot" as const,
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
    category: "all" as AppCategory,
    applicationId: "",
    deployType: "instance" as DeployTypeId,
    commitment: "onDemand" as CommitmentId,
    regionId: "af-za-01",
  },
}

function mapTemplateToApp(t: {
  id: string
  name: string
  imageRef: string
  minGPU: string | null
  minMemoryGB: number | null
  deployType: string
  category: string
}): ApplicationTemplate {
  return {
    id: t.id,
    applicationId: parseInt(t.id) || 0,
    name: t.name,
    image: t.imageRef,
    gpuType: t.minGPU ?? "Any GPU",
    vramGb: t.minMemoryGB ?? 8,
    pricePerHour: 0,
    deployTypeLabel: t.deployType === "serverless" ? "Serverless" : "实例",
    categories: ["all", t.category as AppCategory],
  }
}

export default function AppsPage() {
  const router = useLocaleRouter()
  const { addInstance } = useStore()

  const [bannerVisible, setBannerVisible] = useState(true)
  const [category, setCategory] = useState<AppCategory>(PAGE_CONTENT.defaults.category)
  const [search, setSearch] = useState("")
  const [selectedAppId, setSelectedAppId] = useState(PAGE_CONTENT.defaults.applicationId)
  const [deployType, setDeployType] = useState<DeployTypeId>(PAGE_CONTENT.defaults.deployType)
  const [commitment, setCommitment] = useState<CommitmentId>(PAGE_CONTENT.defaults.commitment)
  const [regionId, setRegionId] = useState(PAGE_CONTENT.defaults.regionId)
  const [deploying, setDeploying] = useState(false)

  const templatesQuery = trpc.applicationTemplate.list.useQuery({
    pageSize: 100,
  })

  const isLoading = templatesQuery.isLoading || templatesQuery.isPending

  const applications = useMemo(
    () => (templatesQuery.data?.items ?? []).map(mapTemplateToApp),
    [templatesQuery.data?.items],
  )

  const filteredApps = useMemo(
    () => filterApplications(applications, { category, search }),
    [applications, category, search],
  )

  const selectedApp = useMemo(
    () => (applications.length > 0 ? getApplicationById(applications, selectedAppId) : undefined),
    [applications, selectedAppId],
  )

  const selectedCommitment = useMemo(
    () => getCommitmentById(PAGE_CONTENT.commitments, commitment),
    [commitment],
  )

  const pricePerHour = useMemo(
    () => (selectedApp ? getPricePerHour(selectedApp.pricePerHour, commitment) : 0),
    [commitment, selectedApp],
  )

  const regionLabel = useMemo(
    () => getRegionLabel(PAGE_CONTENT.regions, regionId),
    [regionId],
  )

  function handleDeploy() {
    if (!selectedApp) return

    if (deployType === "serverless") {
      toast.info("Serverless 即将推出，请使用实例部署")
      return
    }

    setDeploying(true)
    setTimeout(() => {
      const inst = addInstance({
        name: selectedApp.name,
        type: "instance",
        gpu: selectedApp.gpuType,
        gpuCount: 1,
        region: regionLabel,
        billing: getBillingLabel(commitment),
        image: selectedApp.image,
        pricePerHour,
        sshEnabled: true,
        diskSize: 100,
        volumeId: null,
        ports: "8888,22",
      })
      toast.success("应用实例已开始部署")
      router.push(`/console/instances/${inst.id}?new=1`)
      setDeploying(false)
    }, 1200)
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-6">
      <div className="flex flex-col gap-6">
        {bannerVisible && (
          <AppsBanner
            banner={PAGE_CONTENT.banner}
            onDismiss={() => setBannerVisible(false)}
          />
        )}

        <div>
          <h1 className="mb-2 text-2xl font-semibold">{PAGE_CONTENT.title}</h1>
          <p className="text-sm text-muted-foreground">{PAGE_CONTENT.subtitle}</p>
        </div>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-medium">{PAGE_CONTENT.selectAppTitle}</h2>
          <AppsToolbar
            categories={PAGE_CONTENT.categories}
            category={category}
            search={search}
            searchPlaceholder={PAGE_CONTENT.searchPlaceholder}
            onCategoryChange={setCategory}
            onSearchChange={setSearch}
          />

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <span className="text-sm text-muted-foreground">加载中...</span>
            </div>
          ) : applications.length === 0 ? (
            <Empty className="border py-16">
              <EmptyHeader>
                <EmptyTitle>暂无可用应用</EmptyTitle>
                <EmptyDescription>
                  暂无可部署的应用模板，请稍后重试。
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <AppsGrid
              applications={filteredApps}
              selectedAppId={selectedAppId}
              viewDetailsLabel={PAGE_CONTENT.viewDetailsLabel}
              onSelectApp={setSelectedAppId}
            />
          )}
        </section>

        {selectedApp && (
          <>
            <section className="flex flex-col gap-4">
              <h2 className="text-lg font-medium">{PAGE_CONTENT.selectDeployTypeTitle}</h2>
              <DeployTypeSelector
                deployTypes={PAGE_CONTENT.deployTypes}
                deployType={deployType}
                onDeployTypeChange={setDeployType}
              />
            </section>

            <GpuRegionBar
              selectedApp={selectedApp}
              regions={PAGE_CONTENT.regions}
              regionId={regionId}
              currentSelectionTitle={PAGE_CONTENT.currentSelectionTitle}
              currentSelectionHint={PAGE_CONTENT.currentSelectionHint}
              gpuTypeLabel={PAGE_CONTENT.gpuTypeLabel}
              vramLabel={PAGE_CONTENT.vramLabel}
              onRegionChange={setRegionId}
            />

            <CommitmentSelector
              commitments={PAGE_CONTENT.commitments}
              commitment={commitment}
              title={PAGE_CONTENT.commitmentTitle}
              onCommitmentChange={setCommitment}
            />

            <DeployFooter
              selectedCommitment={selectedCommitment}
              pricePerHour={pricePerHour}
              diskTotalLabel={PAGE_CONTENT.diskTotalLabel}
              diskPricePerDay={PAGE_CONTENT.diskPricePerDay}
              deployCtaLabel={PAGE_CONTENT.deployCtaLabel}
              deploying={deploying}
              onDeploy={handleDeploy}
            />
          </>
        )}
      </div>
    </div>
  )
}
