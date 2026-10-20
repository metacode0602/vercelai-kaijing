import { SectionLabel } from "../../_components/section-label"
import {
  DollarSign,
  Zap,
  FileCode2,
  Globe,
  Database,
  Network,
  Shield,
  Headphones,
  Rocket,
  TrendingDown,
} from "lucide-react"

interface CapabilityCardProps {
  icon: React.ReactNode
  title: string
  description: string
}

function CapabilityCard({ icon, title, description }: CapabilityCardProps) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

export function ServerlessCapabilitiesSection() {
  const capabilities: CapabilityCardProps[] = [
    {
      icon: <DollarSign className="size-5" />,
      title: "节省高达 50% 的成本",
      description: "使用 Spot 竞价实例，以按需价格的一半运行工作负载",
    },
    {
      icon: <Zap className="size-5" />,
      title: "Serverless 自动扩展",
      description: "自动扩展到零、无限并发、按秒计费，仅为消耗的资源付费",
    },
    {
      icon: <FileCode2 className="size-5" />,
      title: "一键模板",
      description: "PyTorch、JAX 和 CUDA 镜像即开即用",
    },
    {
      icon: <Rocket className="size-5" />,
      title: "开发者优先",
      description: "REST、gRPC、Terraform 和强大的 CLI 工具",
    },
    {
      icon: <Globe className="size-5" />,
      title: "14 个全球区域",
      description: "低延迟骨干网络，支持私有对等互连",
    },
    {
      icon: <Database className="size-5" />,
      title: "托管存储",
      description: "POSIX、对象和并行文件系统支持",
    },
    {
      icon: <Network className="size-5" />,
      title: "私有网络",
      description: "每项目 VPC、对等互连和中转网关",
    },
    {
      icon: <Shield className="size-5" />,
      title: "成本控制",
      description: "预算、配额和按团队成本分摊",
    },
    {
      icon: <Headphones className="size-5" />,
      title: "7×24 支持",
      description: "企业计划提供专属技术客户经理",
    },
    {
      icon: <TrendingDown className="size-5" />,
      title: "即时部署",
      description: "预热后亚秒级启动",
    },
  ]

  return (
    <section className="marketing-section">
      <div className="marketing-container">
        <SectionLabel>平台能力</SectionLabel>

        <div className="mt-6 flex flex-col gap-4 py-4">
          <h2 className="marketing-heading">为生产 AI 工作负载打造</h2>
          <p className="marketing-subheading">
            从成本优化、自动扩展到全球部署和企业级支持，满足您的所有需求
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((capability, i) => (
            <CapabilityCard key={i} {...capability} />
          ))}
        </div>
      </div>
    </section>
  )
}
