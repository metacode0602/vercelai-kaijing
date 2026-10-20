import { Button } from "@workspace/ui/components/button"
import { LocaleLink } from "@/lib/i18n/navigation"
import { SectionLabel } from "../../_components/section-label"
import { Activity, Cpu, Layers, Server } from "lucide-react"

interface GpuCardProps {
  model: string
  nodes: string
  memory: string
  interconnect: string
  workloadNotes?: string[]
  price?: string
  badge?: string
  ctaLabel: string
  ctaHref: string
}

function GpuCard({
  model,
  nodes,
  memory,
  interconnect,
  workloadNotes,
  price,
  badge,
  ctaLabel,
  ctaHref,
}: GpuCardProps) {
  return (
    <div className="glass-panel relative flex flex-col gap-6 p-6">
      {badge && (
        <span className="absolute right-4 top-4 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-primary">
          {badge}
        </span>
      )}

      <div className="flex flex-col gap-3">
        <h3 className="pr-20 text-2xl font-semibold text-foreground">{model}</h3>
        <p className="text-sm text-muted-foreground">{nodes}</p>
      </div>

      <div className="flex flex-col gap-3 border-t border-border/30 pt-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-primary/10">
            <div className="size-2 rounded-full bg-primary/60" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground">显存</span>
            <span className="text-sm text-muted-foreground">{memory}</span>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-primary/10">
            <div className="size-2 rounded-full bg-primary/60" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground">互连</span>
            <span className="text-sm text-muted-foreground">{interconnect}</span>
          </div>
        </div>

        {workloadNotes && workloadNotes.length > 0 && (
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-primary/10">
              <div className="size-2 rounded-full bg-primary/60" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-foreground">特性</span>
              <ul className="flex flex-col gap-1">
                {workloadNotes.map((note, i) => (
                  <li key={i} className="text-sm text-muted-foreground">
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {price && (
        <div className="border-t border-border/30 pt-4">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-semibold text-foreground">{price}</span>
            <span className="text-sm text-muted-foreground">/GPU/小时</span>
          </div>
        </div>
      )}

      <div className="mt-auto">
        <Button asChild variant={price ? "default" : "outline"} className="w-full rounded-full">
          {ctaHref.startsWith("http") ? (
            <a href={ctaHref}>{ctaLabel}</a>
          ) : (
            <LocaleLink href={ctaHref}>{ctaLabel}</LocaleLink>
          )}
        </Button>
      </div>
    </div>
  )
}

interface SolutionSectionProps {
  icon: React.ReactNode
  title: string
  description: string
  gpus: GpuCardProps[]
}

function SolutionSection({ icon, title, description, gpus }: SolutionSectionProps) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-2xl font-semibold text-foreground">{title}</h3>
          <p className="text-base text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {gpus.map((gpu, i) => (
          <GpuCard key={i} {...gpu} />
        ))}
      </div>
    </div>
  )
}

export function BareMetalSolutionsSection() {
  const solutions: SolutionSectionProps[] = [
    {
      icon: <Layers className="size-6" />,
      title: "大模型训练",
      description: "为大规模语言模型训练提供强大算力支持，支持多卡并行和分布式训练",
      gpus: [
        {
          model: "NVIDIA H100 SXM",
          nodes: "8x NVIDIA H100 SXM per node",
          memory: "80 GB HBM3 per GPU · 640 GB total",
          interconnect: "NVLink 900 GB/s + RDMA",
          workloadNotes: ["1000+ GPU 线性扩展", "HPC 就绪"],
          price: "¥12.00",
          badge: "最佳性价比",
          ctaLabel: "立即租用",
          ctaHref: "/console/metal/list",
        },
        {
          model: "NVIDIA B200 SXM",
          nodes: "8x NVIDIA B200 SXM per node",
          memory: "192 GB HBM3e per GPU · 1,536 GB total",
          interconnect: "NVLink 第5代 1.8 TB/s + RDMA",
          workloadNotes: ["Blackwell 架构", "超大规模训练"],
          badge: "顶级性能",
          ctaLabel: "联系我们",
          ctaHref: "https://meetings-na2.hubspot.com/junyu",
        },
      ],
    },
    {
      icon: <Cpu className="size-6" />,
      title: "AI 推理",
      description: "LLM 服务、实时对话、多模态生成和智能体推理，低延迟、高吞吐",
      gpus: [
        {
          model: "NVIDIA H200 SXM",
          nodes: "8x NVIDIA H200 SXM per node",
          memory: "141 GB HBM3e per GPU · 1,128 GB total",
          interconnect: "NVLink 900 GB/s + RDMA",
          workloadNotes: ["比 H100 多 76% HBM", "大上下文/KV 缓存工作负载", "1000+ GPU 扩展"],
          badge: "大上下文",
          ctaLabel: "联系我们",
          ctaHref: "https://meetings-na2.hubspot.com/junyu",
        },
        {
          model: "NVIDIA RTX 5090",
          nodes: "8x NVIDIA RTX 5090 per node",
          memory: "32 GB GDDR7 per GPU · 256 GB total",
          interconnect: "PCIe 5.0",
          workloadNotes: ["Blackwell 架构", "AIGC 内容生成", "高性价比推理"],
          badge: "下一代",
          ctaLabel: "联系我们",
          ctaHref: "https://meetings-na2.hubspot.com/junyu",
        },
      ],
    },
    {
      icon: <Server className="size-6" />,
      title: "渲染与仿真",
      description: "3D 渲染、云游戏、自动驾驶仿真和数字孪生",
      gpus: [
        {
          model: "NVIDIA RTX 5090",
          nodes: "8x NVIDIA RTX 5090 per node",
          memory: "32 GB GDDR7 per GPU · 256 GB total",
          interconnect: "PCIe 5.0",
          workloadNotes: ["光线追踪 + DLSS 4", "云游戏", "下一代架构"],
          badge: "下一代",
          ctaLabel: "联系我们",
          ctaHref: "https://meetings-na2.hubspot.com/junyu",
        },
        {
          model: "NVIDIA RTX 4090",
          nodes: "8x NVIDIA RTX 4090 per node",
          memory: "24 GB GDDR6X per GPU · 192 GB total",
          interconnect: "PCIe 4.0 · Ada Lovelace",
          workloadNotes: ["久经考验", "广泛软件兼容性", "数字孪生/仿真"],
          badge: "久经考验",
          ctaLabel: "联系我们",
          ctaHref: "https://meetings-na2.hubspot.com/junyu",
        },
      ],
    },
    {
      icon: <Activity className="size-6" />,
      title: "科学计算",
      description: "GPU 加速动力学、远程建模和分子科学",
      gpus: [
        {
          model: "NVIDIA H100 SXM",
          nodes: "8x NVIDIA H100 SXM per node",
          memory: "80 GB HBM3 per GPU · 640 GB total",
          interconnect: "NVLink 900 GB/s + RDMA",
          workloadNotes: ["HPC 就绪", "双精度性能", "CUDA 完全支持"],
          price: "¥12.00",
          badge: "HPC 就绪",
          ctaLabel: "立即租用",
          ctaHref: "/console/metal/list",
        },
        {
          model: "NVIDIA H200 SXM",
          nodes: "8x NVIDIA H200 SXM per node",
          memory: "141 GB HBM3e per GPU · 1,128 GB total",
          interconnect: "NVLink 900 GB/s + RDMA",
          workloadNotes: ["最大显存", "大规模建模", "内存密集型计算"],
          badge: "最大显存",
          ctaLabel: "联系我们",
          ctaHref: "https://meetings-na2.hubspot.com/junyu",
        },
      ],
    },
  ]

  return (
    <section className="marketing-section">
      <div className="marketing-container">
        <SectionLabel>应用场景</SectionLabel>

        <div className="mt-6 flex flex-col gap-4 py-4">
          <h2 className="marketing-heading">适用于各类工作负载的 GPU</h2>
          <p className="marketing-subheading">
            四大核心 AI 场景，每个场景都配备专用裸金属 GPU 配置
          </p>
        </div>

        <div className="mt-12 flex flex-col gap-20">
          {solutions.map((solution, i) => (
            <SolutionSection key={i} {...solution} />
          ))}
        </div>
      </div>
    </section>
  )
}
