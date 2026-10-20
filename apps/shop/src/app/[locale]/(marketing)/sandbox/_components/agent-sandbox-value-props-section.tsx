import { Zap, Shield, TrendingUp } from "lucide-react"

interface ValuePropCardProps {
  icon: React.ReactNode
  title: string
  description: string
}

function ValuePropCard({ icon, title, description }: ValuePropCardProps) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-xl font-semibold text-foreground">{title}</h3>
        <p className="text-base text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

export function AgentSandboxValuePropsSection() {
  const valueProps: ValuePropCardProps[] = [
    {
      icon: <Zap className="size-8" />,
      title: "亚秒级启动",
      description: "沙盒实例平均在 200 毫秒内启动，针对突发和高频工作负载进行优化",
    },
    {
      icon: <Shield className="size-8" />,
      title: "安全隔离",
      description: "每个任务在具有系统级隔离的独立沙盒中运行，减少数据泄漏和未授权访问风险",
    },
    {
      icon: <TrendingUp className="size-8" />,
      title: "大规模高并发",
      description: "并行运行数千个沙盒实例，为高吞吐量智能体工作负载提供一致的低延迟",
    },
  ]

  return (
    <section className="marketing-section-alt">
      <div className="marketing-container">
        <div className="mb-12 flex flex-col items-center gap-4 text-center">
          <h2 className="marketing-heading">快速启动。强隔离。海量并发。</h2>
          <p className="marketing-subheading max-w-3xl">
            在毫秒内启动沙盒实例，隔离每个任务，并扩展到数千个并发执行以应对真实世界的智能体工作负载
          </p>
        </div>

        <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
          {valueProps.map((prop, i) => (
            <ValuePropCard key={i} {...prop} />
          ))}
        </div>
      </div>
    </section>
  )
}
