"use client"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { LocaleLink } from "@/lib/i18n/navigation"
import {
  ArrowRight,
  BrainCircuit,
  Cpu,
  HardDrive,
  Image as ImageIcon,
  LayoutGrid,
  Music2,
  Sparkles,
  Video,
  type LucideIcon,
} from "lucide-react"
import { useState } from "react"
import {
  categoryLabels,
  templates,
  type TemplateCategory,
} from "../_lib/templates"

type CategoryFilter = TemplateCategory | "all"

type CategoryMeta = {
  label: string
  eyebrow: string
  icon: LucideIcon
  iconClass: string
  badgeClass: string
  panelClass: string
  borderClass: string
  activeClass: string
  dotClass: string
}

const categoryMeta: Record<TemplateCategory, CategoryMeta> = {
  llm: {
    label: categoryLabels.llm,
    eyebrow: "TEXT / REASONING",
    icon: BrainCircuit,
    iconClass: "bg-chart-3/10 text-chart-3 ring-chart-3/20",
    badgeClass: "bg-chart-3/10 text-chart-3 ring-chart-3/20",
    panelClass: "from-chart-3/20 via-card/30 to-transparent",
    borderClass: "hover:border-chart-3/40",
    activeClass: "border-chart-3/30 bg-chart-3/20 text-chart-3",
    dotClass: "bg-chart-3",
  },
  image: {
    label: categoryLabels.image,
    eyebrow: "IMAGE / CREATIVE",
    icon: ImageIcon,
    iconClass: "bg-chart-5/10 text-chart-5 ring-chart-5/20",
    badgeClass: "bg-chart-5/10 text-chart-5 ring-chart-5/20",
    panelClass: "from-chart-5/20 via-card/30 to-transparent",
    borderClass: "hover:border-chart-5/40",
    activeClass: "border-chart-5/30 bg-chart-5/20 text-chart-5",
    dotClass: "bg-chart-5",
  },
  video: {
    label: categoryLabels.video,
    eyebrow: "VIDEO / MOTION",
    icon: Video,
    iconClass: "bg-chart-2/10 text-chart-2 ring-chart-2/20",
    badgeClass: "bg-chart-2/10 text-chart-2 ring-chart-2/20",
    panelClass: "from-chart-2/20 via-card/30 to-transparent",
    borderClass: "hover:border-chart-2/40",
    activeClass: "border-chart-2/30 bg-chart-2/20 text-chart-2",
    dotClass: "bg-chart-2",
  },
  audio: {
    label: categoryLabels.audio,
    eyebrow: "AUDIO / VOICE",
    icon: Music2,
    iconClass: "bg-chart-4/10 text-chart-4 ring-chart-4/20",
    badgeClass: "bg-chart-4/10 text-chart-4 ring-chart-4/20",
    panelClass: "from-chart-4/20 via-card/30 to-transparent",
    borderClass: "hover:border-chart-4/40",
    activeClass: "border-chart-4/30 bg-chart-4/20 text-chart-4",
    dotClass: "bg-chart-4",
  },
}

const filterItems: Array<{
  key: CategoryFilter
  label: string
  icon: LucideIcon
  count: number
  activeClass: string
}> = [
  {
    key: "all",
    label: "全部模板",
    icon: LayoutGrid,
    count: templates.length,
    activeClass: "border-primary/30 bg-primary/20 text-primary",
  },
  ...Object.entries(categoryMeta).map(([key, meta]) => ({
    key: key as TemplateCategory,
    label: meta.label,
    icon: meta.icon,
    count: templates.filter((template) => template.category === key).length,
    activeClass: meta.activeClass,
  })),
]

export function AppsTemplatesSection() {
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("all")

  const filteredTemplates =
    activeCategory === "all"
      ? templates
      : templates.filter((template) => template.category === activeCategory)

  return (
    <section className="relative w-full overflow-hidden py-20 md:py-28">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-24 left-1/2 size-[520px] -translate-x-1/2 rounded-full bg-primary/5 blur-3xl"
      />
      <div className="relative mx-auto max-w-7xl px-5">
        <div className="mb-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 flex items-center gap-2 text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
              <Sparkles className="size-4 text-primary" />
              Template library
            </div>
            <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl md:text-5xl">
              为你的工作负载选择模板
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">
              从推理、创作到语音处理，选择经过预配置的镜像，几分钟内启动你的 AI
              服务。
            </p>
          </div>

          <div className="flex items-center gap-4 rounded-2xl border border-border/50 bg-card/45 px-4 py-3 backdrop-blur-md">
            <div>
              <div className="text-lg font-semibold text-foreground">
                {filteredTemplates.length}
              </div>
              <div className="text-[11px] text-muted-foreground">当前模板</div>
            </div>
            <div className="h-8 w-px bg-border/60" />
            <div>
              <div className="text-lg font-semibold text-foreground">
                {Object.keys(categoryMeta).length}
              </div>
              <div className="text-[11px] text-muted-foreground">
                工作负载类型
              </div>
            </div>
          </div>
        </div>

        <div className="mb-8 rounded-2xl border border-border/50 bg-card/35 p-2 backdrop-blur-md">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-foreground">
              <LayoutGrid className="size-4 text-primary" />
              按工作负载浏览
            </div>
            <div
              className="flex flex-1 flex-wrap gap-2"
              role="group"
              aria-label="模板分类"
            >
              {filterItems.map((item) => {
                const active = activeCategory === item.key
                const Icon = item.icon

                return (
                  <Button
                    key={item.key}
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-pressed={active}
                    className={cn(
                      "rounded-full border border-transparent px-4 py-2 text-muted-foreground transition-colors",
                      active
                        ? item.activeClass
                        : "hover:border-border hover:bg-muted hover:text-foreground"
                    )}
                    onClick={() => setActiveCategory(item.key)}
                  >
                    <Icon className="size-3.5" />
                    {item.label}
                    <span className="text-[10px] opacity-60">{item.count}</span>
                  </Button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredTemplates.map((template, index) => {
            const meta = categoryMeta[template.category]
            const Icon = meta.icon
            const port = template.ports?.[0] || "自动"

            return (
              <article
                key={template.slug}
                className={cn(
                  "group relative flex min-h-[330px] flex-col overflow-hidden rounded-2xl border border-border/50 bg-card/55 p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:bg-card/80 hover:shadow-xl",
                  meta.borderClass
                )}
              >
                <div
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-80 transition-opacity group-hover:opacity-100",
                    meta.panelClass
                  )}
                />

                <div className="relative flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex size-11 items-center justify-center rounded-xl ring-1 ring-inset",
                        meta.iconClass
                      )}
                    >
                      <Icon className="size-5" />
                    </div>
                    <div>
                      <div className="text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
                        {meta.eyebrow}
                      </div>
                      <div className="mt-1 text-sm font-medium text-foreground">
                        {meta.label}
                      </div>
                    </div>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground/70">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>

                <div className="relative mt-7 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="text-xl font-semibold tracking-tight text-foreground">
                      {template.title}
                    </h3>
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                      {template.summary}
                    </p>
                  </div>
                  <LocaleLink
                    href={`/apps/${template.slug}`}
                    aria-label={`查看 ${template.title} 详情`}
                    className="mt-1 shrink-0 rounded-full border border-border/60 p-2 text-muted-foreground transition-colors group-hover:border-primary/30 group-hover:text-primary"
                  >
                    <ArrowRight className="size-4" />
                  </LocaleLink>
                </div>

                <div className="relative mt-5 flex flex-wrap gap-2">
                  {template.tags.slice(0, 3).map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>

                <div className="relative mt-auto grid grid-cols-2 gap-3 border-t border-border/50 pt-5">
                  <div className="flex min-w-0 items-start gap-2">
                    <Cpu className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <div className="text-[11px] text-muted-foreground">
                        推荐 GPU
                      </div>
                      <div className="mt-1 truncate text-xs font-medium text-foreground">
                        {template.recommendedGpu}
                      </div>
                    </div>
                  </div>
                  <div className="flex min-w-0 items-start gap-2">
                    <HardDrive className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <div className="text-[11px] text-muted-foreground">
                        默认端口
                      </div>
                      <div className="mt-1 truncate font-mono text-xs font-medium text-foreground">
                        {port}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="relative mt-5 grid grid-cols-[1.1fr_0.9fr] gap-2">
                  <Button asChild size="sm" className="rounded-full">
                    <LocaleLink href={template.deployHref}>
                      一键部署
                      <ArrowRight className="size-3.5" />
                    </LocaleLink>
                  </Button>
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                  >
                    <LocaleLink href={`/apps/${template.slug}`}>
                      查看详情
                    </LocaleLink>
                  </Button>
                </div>
              </article>
            )
          })}
        </div>

        {filteredTemplates.length === 0 ? (
          <div className="glass-panel py-16 text-center text-muted-foreground">
            暂无该分类下的模板
          </div>
        ) : null}
      </div>
    </section>
  )
}
