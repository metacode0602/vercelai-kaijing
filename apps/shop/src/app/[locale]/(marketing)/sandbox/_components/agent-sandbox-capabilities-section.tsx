import { SectionLabel } from "../../_components/section-label"
import { Code2, Globe, Globe2, MonitorPlay, Eye, PauseCircle } from "lucide-react"

interface CapabilityItemProps {
  number: string
  icon: React.ReactNode
  title: string
  description: string
}

function CapabilityItem({ number, icon, title, description }: CapabilityItemProps) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-muted-foreground/60">{number}</span>
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        </div>
        <p className="text-base text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

export function AgentSandboxCapabilitiesSection() {
  const capabilities: CapabilityItemProps[] = [
    {
      number: "001",
      icon: <Code2 className="size-5" />,
      title: "代码执行",
      description: "在安全的沙盒中运行 Python、JavaScript、C++ 和其他语言",
    },
    {
      number: "002",
      icon: <Globe2 className="size-5" />,
      title: "外部 APIs",
      description: "允许智能体根据需要访问外部 APIs 和在线数据",
    },
    {
      number: "003",
      icon: <Globe className="size-5" />,
      title: "浏览器使用",
      description: "在沙盒内自动化网页导航、表单填写和数据提取",
    },
    {
      number: "004",
      icon: <MonitorPlay className="size-5" />,
      title: "计算机使用",
      description: "控制完整桌面环境以进行打字、点击、滚动、截屏和其他 GUI 操作",
    },
    {
      number: "005",
      icon: <PauseCircle className="size-5" />,
      title: "持久会话",
      description: "暂停和恢复长时运行的智能体任务而不丢失状态",
    },
    {
      number: "006",
      icon: <Eye className="size-5" />,
      title: "实时会话视图",
      description: "使用 VNC 查看和流式传输沙盒会话，用于交互式监控和调试",
    },
  ]

  return (
    <section className="marketing-section">
      <div className="marketing-container">
        <SectionLabel>沙盒能力</SectionLabel>

        <div className="mt-6 flex flex-col gap-4 py-4">
          <h2 className="marketing-heading">核心运行时能力</h2>
          <p className="marketing-subheading">
            智能体执行代码、与系统交互并在真实工作流中保持控制所需的一切
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-2">
          {capabilities.map((capability, i) => (
            <CapabilityItem key={i} {...capability} />
          ))}
        </div>
      </div>
    </section>
  )
}
