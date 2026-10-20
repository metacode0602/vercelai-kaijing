import { SectionLabel } from "../../_components/section-label"
import { Code, Globe, MonitorPlay, Target, Workflow, Clock } from "lucide-react"

interface WorkloadCardProps {
  icon: React.ReactNode
  title: string
  description: string
  number: string
}

function WorkloadCard({ icon, title, description, number }: WorkloadCardProps) {
  return (
    <div className="glass-panel relative flex flex-col gap-4 p-6">
      <div className="absolute right-4 top-4 font-mono text-xs text-muted-foreground/40">
        {number}
      </div>
      <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-xl font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

export function AgentSandboxWorkloadsSection() {
  const workloads: WorkloadCardProps[] = [
    {
      icon: <Code className="size-6" />,
      title: "编码智能体",
      description: "在隔离的沙盒环境中运行智能体，编写、执行和迭代代码",
      number: "01",
    },
    {
      icon: <Globe className="size-6" />,
      title: "浏览器自动化",
      description: "为浏览网页、完成多步骤任务和提取结构化结果的智能体提供支持",
      number: "02",
    },
    {
      icon: <MonitorPlay className="size-6" />,
      title: "计算机使用",
      description: "使智能体能够与完整的桌面环境交互，执行基于 GUI 的工作流和类人操作",
      number: "03",
    },
    {
      icon: <Target className="size-6" />,
      title: "评估与强化学习",
      description: "在受控环境中运行可重复的评估和强化学习工作负载，用于测试、训练和迭代优化",
      number: "04",
    },
    {
      icon: <Workflow className="size-6" />,
      title: "AI 驱动的 CI/CD",
      description: "在 CI/CD 管道中的隔离沙盒中运行代码审查、测试生成和验证工作流",
      number: "05",
    },
    {
      icon: <Clock className="size-6" />,
      title: "长时运行工作流",
      description: "保持多步骤智能体任务跨扩展会话运行，不中断执行流程",
      number: "06",
    },
  ]

  return (
    <section className="marketing-section">
      <div className="marketing-container">
        <SectionLabel>专为 AI 原生工作负载打造</SectionLabel>

        <div className="mt-6 flex flex-col gap-4 py-4">
          <h2 className="marketing-heading">从智能体执行到评估与强化学习</h2>
          <p className="marketing-subheading">
            支持全范围的 AI 原生工作负载——从编码智能体和浏览器自动化到评估、强化学习环境和长时运行工作流
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {workloads.map((workload, i) => (
            <WorkloadCard key={i} {...workload} />
          ))}
        </div>
      </div>
    </section>
  )
}
