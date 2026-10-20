import { SectionLabel } from "../../_components/section-label"
import { Button } from "@workspace/ui/components/button"
import { LocaleLink } from "@/lib/i18n/navigation"
import { Rocket, FileCode, FolderOpen } from "lucide-react"

interface QuickStartCardProps {
  icon: React.ReactNode
  number: string
  title: string
  description: string
  linkText: string
  linkHref: string
}

function QuickStartCard({ icon, number, title, description, linkText, linkHref }: QuickStartCardProps) {
  return (
    <div className="glass-panel flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between">
        <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <span className="font-mono text-xs text-muted-foreground/40">{number}</span>
      </div>
      <div className="flex flex-col gap-3">
        <h3 className="text-xl font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Button asChild variant="outline" className="w-full rounded-full">
        {linkHref.startsWith("http") ? (
          <a href={linkHref} target="_blank" rel="noopener noreferrer">
            {linkText}
          </a>
        ) : (
          <LocaleLink href={linkHref}>{linkText}</LocaleLink>
        )}
      </Button>
    </div>
  )
}

export function AgentSandboxQuickStartSection() {
  const quickStartItems: QuickStartCardProps[] = [
    {
      icon: <Rocket className="size-6" />,
      number: "01",
      title: "快速入门",
      description: "几分钟内启动您的第一个沙盒实例",
      linkText: "查看文档",
      linkHref: "/docs/guides/introduction",
    },
    {
      icon: <FileCode className="size-6" />,
      number: "02",
      title: "模板",
      description: "定义可重用的沙盒环境，一次定义，跨工作负载使用",
      linkText: "浏览模板",
      linkHref: "/docs/guides/introduction",
    },
    {
      icon: <FolderOpen className="size-6" />,
      number: "03",
      title: "文件系统",
      description: "每个沙盒包含用于代码、数据和会话状态的隔离文件系统",
      linkText: "了解更多",
      linkHref: "/docs/guides/introduction",
    },
  ]

  return (
    <section className="marketing-section">
      <div className="marketing-container">
        <SectionLabel>使用 GPURun 构建</SectionLabel>

        <div className="mt-6 flex flex-col gap-4 py-4">
          <h2 className="marketing-heading">开始使用 Agent 沙盒构建</h2>
          <p className="marketing-subheading">
            从快速入门、可重用模板和隔离沙盒存储开始
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {quickStartItems.map((item, i) => (
            <QuickStartCard key={i} {...item} />
          ))}
        </div>

        <div className="glass-panel mt-12 p-8">
          <div className="flex flex-col items-center gap-6 text-center md:flex-row md:items-start md:text-left">
            <div className="flex flex-1 flex-col gap-3">
              <h3 className="text-2xl font-semibold text-foreground">企业版</h3>
              <p className="text-base text-muted-foreground">
                对于需要更高资源限制、自定义部署区域或专用基础设施的高级工作负载
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-3 md:items-end">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground">正常运行时间 SLA</span>
                  <span className="font-semibold text-foreground">99.95%</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground">每沙盒最大 vCPU</span>
                  <span className="font-semibold text-foreground">自定义</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground">部署区域</span>
                  <span className="font-semibold text-foreground">您选择</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground">并发实例</span>
                  <span className="font-semibold text-foreground">不限</span>
                </div>
              </div>
              <Button asChild size="lg" className="rounded-full px-8">
                <a href="https://meetings-na2.hubspot.com/junyu">
                  联系销售
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
