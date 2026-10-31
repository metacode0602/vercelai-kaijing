import { cn } from "@workspace/ui/lib/utils"
import {
  AppWindow,
  Code2,
  Globe,
  History,
  Monitor,
  ScanEye,
  type LucideIcon,
} from "lucide-react"
import { SectionLabel } from "./section-label"

const capabilities: {
  number: string
  icon: LucideIcon
  title: string
  description: string
}[] = [
  {
    number: "001",
    icon: Code2,
    title: "代码执行",
    description: "在安全沙盒中运行 Python、JavaScript、C++ 及其他语言。",
  },
  {
    number: "002",
    icon: Globe,
    title: "外部 APIs",
    description: "允许智能体按需访问外部 APIs 和在线数据。",
  },
  {
    number: "003",
    icon: AppWindow,
    title: "浏览器使用",
    description: "在沙盒内自动执行网页导航、表单填写和数据提取。",
  },
  {
    number: "004",
    icon: Monitor,
    title: "计算机使用",
    description:
      "控制完整的桌面环境，以进行输入、点击、滚动、截图和其他 GUI 操作。",
  },
  {
    number: "005",
    icon: History,
    title: "持久会话",
    description: "暂停和恢复长时间运行的智能体任务，且不丢失状态。",
  },
  {
    number: "006",
    icon: ScanEye,
    title: "实时会话视图",
    description:
      "使用 VNC 查看和流式传输沙盒会话，以进行交互式监控和调试。",
  },
]

export function CapabilitiesSection() {
  return (
    <section className="marketing-section">
      <div className="marketing-container">
        <SectionLabel>沙盒能力</SectionLabel>

        <div className="mt-6 flex max-w-[430px] flex-col gap-4">
          <h2 className="marketing-heading">核心运行时能力</h2>
          <p className="marketing-subheading">
            为智能体提供执行代码、与系统交互并在真实工作流中保持掌控所需的一切。
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-y-6 pt-10 sm:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((item, index) => {
            const Icon = item.icon

            return (
              <div
                key={item.number}
                className={cn(
                  "flex flex-col gap-6 border-border/30 p-4 md:pr-10 md:pb-4 md:pt-6",
                  "sm:border-l sm:pl-6",
                  index % 2 === 0 ? "sm:border-l-0 sm:pl-0" : "",
                  index % 3 === 0
                    ? "lg:border-l-0 lg:pl-0"
                    : "lg:border-l lg:pl-10",
                )}
              >
                <span className="font-mono text-sm leading-none text-muted-foreground">
                  {item.number}
                </span>
                <div className="flex h-[96px] items-end md:h-[116px]">
                  <div className="glass-surface rounded-xl border border-border/20 p-4">
                    <Icon
                      className="size-12 text-primary/80 md:size-14"
                      strokeWidth={1.25}
                      aria-hidden
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-5">
                  <h3 className="text-xl font-semibold leading-[26px] text-foreground md:text-2xl">
                    {item.title}
                  </h3>
                  <p className="text-[15px] leading-[22px] text-muted-foreground md:text-lg md:leading-[26px]">
                    {item.description}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
