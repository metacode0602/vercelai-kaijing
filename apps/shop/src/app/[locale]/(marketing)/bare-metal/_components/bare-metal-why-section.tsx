import { SectionLabel } from "../../_components/section-label"
import { Shield, Zap, CheckCircle, Lock } from "lucide-react"

interface FeatureCardProps {
  icon: React.ReactNode
  title: string
  description: string
}

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className="glass-panel flex flex-col gap-4 p-6">
      <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="text-xl font-semibold text-foreground">{title}</h3>
      <p className="text-base text-muted-foreground">{description}</p>
    </div>
  )
}

export function BareMetalWhySection() {
  const features: FeatureCardProps[] = [
    {
      icon: <Zap className="size-6" />,
      title: "零虚拟化开销",
      description:
        "裸金属服务器直接访问硬件资源，无虚拟化层损耗，性能提升高达 10-15%，充分释放 GPU 算力",
    },
    {
      icon: <CheckCircle className="size-6" />,
      title: "开箱即用环境",
      description:
        "预装 CUDA、cuDNN、PyTorch、TensorFlow 等主流深度学习框架，配置完善的开发环境，快速开始训练任务",
    },
    {
      icon: <Shield className="size-6" />,
      title: "保障交付 SLA",
      description:
        "企业级 SLA 保障，承诺 99.9% 可用性，专属技术支持团队，7×24 小时响应，确保业务连续性",
    },
    {
      icon: <Lock className="size-6" />,
      title: "物理隔离安全",
      description:
        "独享物理服务器，完全隔离的网络环境，支持自定义安全策略，满足数据安全和合规要求",
    },
  ]

  return (
    <section className="marketing-section-alt">
      <div className="marketing-container">
        <SectionLabel>核心优势</SectionLabel>

        <div className="mt-6 flex flex-col gap-4 py-4">
          <h2 className="marketing-heading">为什么选择裸金属 GPU</h2>
          <p className="marketing-subheading">
            专为高性能计算设计，提供极致性能、完全控制和企业级可靠性
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, i) => (
            <FeatureCard key={i} {...feature} />
          ))}
        </div>
      </div>
    </section>
  )
}
