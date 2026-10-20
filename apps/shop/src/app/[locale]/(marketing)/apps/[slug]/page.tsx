import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { LocaleLink } from "@/lib/i18n/navigation"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Code2,
  Cpu,
  FileCode2,
  Gauge,
  HardDrive,
  Image as ImageIcon,
  Layers,
  MemoryStick,
  Music2,
  Rocket,
  Sparkles,
  Video,
  Waves,
  Zap,
  type LucideIcon,
} from "lucide-react"
import { MarketingFooter } from "../../_components/marketing-footer"
import { MarketingHeader } from "../../_components/marketing-header"
import {
  categoryLabels,
  getAllTemplateSlugs,
  getTemplateBySlug,
  getTemplateDetails,
  templates,
  type TemplateCategory,
} from "../_lib/templates"

export function generateStaticParams() {
  return getAllTemplateSlugs().map((slug) => ({
    slug,
  }))
}

interface TemplateDetailPageProps {
  params: Promise<{ slug: string }>
}

const categoryMeta: Record<
  TemplateCategory,
  {
    label: string
    eyebrow: string
    icon: LucideIcon
    iconClass: string
    panelClass: string
    dotClass: string
  }
> = {
  llm: {
    label: "大语言模型",
    eyebrow: "TEXT / REASONING",
    icon: BrainCircuit,
    iconClass: "bg-chart-3/10 text-chart-3 ring-chart-3/20",
    panelClass: "from-chart-3/20 via-card/60 to-background",
    dotClass: "bg-chart-3",
  },
  image: {
    label: "图像生成",
    eyebrow: "IMAGE / CREATIVE",
    icon: ImageIcon,
    iconClass: "bg-chart-5/10 text-chart-5 ring-chart-5/20",
    panelClass: "from-chart-5/20 via-card/60 to-background",
    dotClass: "bg-chart-5",
  },
  video: {
    label: "视频生成",
    eyebrow: "VIDEO / MOTION",
    icon: Video,
    iconClass: "bg-chart-2/10 text-chart-2 ring-chart-2/20",
    panelClass: "from-chart-2/20 via-card/60 to-background",
    dotClass: "bg-chart-2",
  },
  audio: {
    label: "音频处理",
    eyebrow: "AUDIO / VOICE",
    icon: Music2,
    iconClass: "bg-chart-4/10 text-chart-4 ring-chart-4/20",
    panelClass: "from-chart-4/20 via-card/60 to-background",
    dotClass: "bg-chart-4",
  },
}

function SectionHeading({
  icon: Icon,
  eyebrow,
  title,
  description,
}: {
  icon: LucideIcon
  eyebrow: string
  title: string
  description?: string
}) {
  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center gap-2 text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
        <Icon className="size-4 text-primary" aria-hidden="true" />
        {eyebrow}
      </div>
      <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  )
}

function DetailStat({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </div>
      <div className="truncate text-sm font-medium text-foreground">
        {value}
      </div>
    </div>
  )
}

function ParameterCard({
  label,
  value,
  index,
  dotClass,
}: {
  label: string
  value: string
  index: number
  dotClass: string
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/45 p-4 transition-colors hover:border-primary/30">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={`size-2 rounded-full ${dotClass}`}
          aria-hidden="true"
        />
        {label}
      </div>
      <div className="mt-3 font-mono text-sm text-foreground">{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground/70">
        PRESET {String(index + 1).padStart(2, "0")}
      </div>
    </div>
  )
}

function CapabilityBlock({
  title,
  values,
  dotClass,
}: {
  title: string
  values: string[]
  dotClass: string
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/35 p-5">
      <div className="mb-4 text-sm font-medium text-foreground">{title}</div>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/70 px-3 py-1.5 text-xs text-foreground"
          >
            <span
              className={`size-1.5 rounded-full ${dotClass}`}
              aria-hidden="true"
            />
            {value}
          </span>
        ))}
      </div>
    </div>
  )
}

function CodeBlock({ code, endpoint }: { code: string; endpoint: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-[#0b1512] shadow-inner">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-white/70">
          <Code2 className="size-4 text-chart-2" aria-hidden="true" />
          <span>快速开始</span>
        </div>
        <span className="rounded-full border border-white/10 px-2.5 py-1 font-mono text-[10px] tracking-wider text-white/50 uppercase">
          curl
        </span>
      </div>
      <pre className="overflow-x-auto p-5 text-xs leading-6 text-emerald-100/90">
        <code>{code}</code>
      </pre>
      <div className="flex flex-col gap-2 border-t border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-white/55 sm:flex-row sm:items-center sm:justify-between">
        <span>部署完成后的本地服务地址</span>
        <code className="font-mono text-emerald-200/80">{endpoint}</code>
      </div>
    </div>
  )
}

function RuntimeRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border/50 py-3 last:border-b-0">
      <Icon
        className="mt-0.5 size-4 shrink-0 text-primary"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
      </div>
    </div>
  )
}

export default async function TemplateDetailPage({
  params,
}: TemplateDetailPageProps) {
  const { slug } = await params
  const template = getTemplateBySlug(slug)

  if (!template) {
    notFound()
  }

  const details = getTemplateDetails(template)
  const meta = categoryMeta[template.category]
  const Icon = meta.icon
  const relatedTemplates = templates
    .filter(
      (item) =>
        item.category === template.category && item.slug !== template.slug
    )
    .slice(0, 4)
  const ports = template.ports?.join(", ") || "自动分配"
  const endpoint = template.ports?.[0]
    ? `http://localhost:${template.ports[0]}`
    : "服务启动后查看控制台端口"
  const versions = Object.entries(template.softwareVersions || {})

  return (
    <main className="marketing-glow relative max-w-full overflow-x-clip bg-background">
      <MarketingHeader />

      <div className="relative min-h-screen pt-28 pb-24">
        <div className="mx-auto max-w-7xl px-5">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <Button asChild variant="ghost" size="sm" className="-ml-3 gap-2">
              <LocaleLink href="/apps">
                <ArrowLeft className="size-4" />
                返回模板库
              </LocaleLink>
            </Button>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <LocaleLink
                href="/apps"
                className="transition-colors hover:text-foreground"
              >
                模型库
              </LocaleLink>
              <span>/</span>
              <span>{categoryLabels[template.category]}</span>
              <span>/</span>
              <span className="max-w-[180px] truncate text-foreground">
                {template.title}
              </span>
            </div>
          </div>

          <section className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/55 shadow-sm backdrop-blur-xl">
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${meta.panelClass}`}
            />
            <div className="relative grid lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="p-6 md:p-10 lg:p-12">
                <div className="mb-6 flex flex-wrap items-center gap-2">
                  <Badge className={meta.iconClass} variant="secondary">
                    {meta.label}
                  </Badge>
                  <Badge variant="outline">支持一键部署</Badge>
                  <span className="font-mono text-xs text-muted-foreground">
                    {meta.eyebrow}
                  </span>
                </div>
                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                  {template.title}
                </h1>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <code className="rounded-md bg-muted/70 px-2 py-1 font-mono text-xs text-foreground/80">
                    {template.slug}
                  </code>
                  <span className="text-border">•</span>
                  <span>GPU Cloud Template</span>
                </div>
                <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                  {template.summary}
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {template.tags.map((tag) => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Button asChild size="lg" className="rounded-full px-6">
                    <LocaleLink href={template.deployHref}>
                      一键部署
                      <ArrowRight className="size-4" />
                    </LocaleLink>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="rounded-full px-6"
                  >
                    <a href="#quickstart">查看使用示例</a>
                  </Button>
                </div>
                <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-border/50 pt-6 sm:grid-cols-4">
                  <DetailStat
                    icon={Cpu}
                    label="推荐 GPU"
                    value={template.recommendedGpu}
                  />
                  <DetailStat icon={HardDrive} label="默认端口" value={ports} />
                  <DetailStat icon={Layers} label="部署方式" value="GPU 实例" />
                  <DetailStat
                    icon={Gauge}
                    label="模板状态"
                    value="可在线部署"
                  />
                </div>
              </div>

              <div className="relative border-t border-border/50 p-6 md:p-8 lg:border-t-0 lg:border-l lg:p-10">
                <div className="flex h-full flex-col justify-between gap-10">
                  <div>
                    <div className="mb-6 flex size-14 items-center justify-center rounded-2xl ring-1 ring-inset">
                      <div
                        className={`flex size-14 items-center justify-center rounded-2xl ${meta.iconClass}`}
                      >
                        <Icon className="size-7" aria-hidden="true" />
                      </div>
                    </div>
                    <p className="mb-2 text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
                      Ready to build
                    </p>
                    <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                      准备好开始构建？
                    </h2>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                      模板已预置运行环境、常用依赖和默认端口，选择 GPU
                      后即可启动服务。
                    </p>
                  </div>
                  <div>
                    <Button asChild className="w-full rounded-full" size="lg">
                      <LocaleLink href={template.deployHref}>
                        立即部署
                        <Rocket className="size-4" />
                      </LocaleLink>
                    </Button>
                    <div className="mt-6 space-y-3 border-t border-border/50 pt-5">
                      <div className="flex items-center justify-between gap-4 text-xs">
                        <span className="text-muted-foreground">运行模式</span>
                        <span className="font-medium text-foreground">
                          按需 GPU 实例
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4 text-xs">
                        <span className="text-muted-foreground">环境准备</span>
                        <span className="font-medium text-foreground">
                          预装依赖
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4 text-xs">
                        <span className="text-muted-foreground">访问端口</span>
                        <span className="font-mono font-medium text-foreground">
                          {ports}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <nav
            className="mt-8 flex flex-wrap items-center gap-2 border-b border-border/50 pb-4 text-sm"
            aria-label="页面导航"
          >
            <a
              href="#overview"
              className="rounded-full bg-muted px-3 py-1.5 text-foreground transition-colors hover:bg-primary/10 hover:text-primary"
            >
              概览
            </a>
            <a
              href="#parameters"
              className="rounded-full px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              模型参数
            </a>
            <a
              href="#capabilities"
              className="rounded-full px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              能力支持
            </a>
            <a
              href="#quickstart"
              className="rounded-full px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              使用示例
            </a>
            <a
              href="#deployment"
              className="rounded-full px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              部署配置
            </a>
          </nav>

          <div className="mt-10 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-8">
              <section
                id="overview"
                className="glass-panel scroll-mt-28 p-6 md:p-8"
              >
                <SectionHeading
                  icon={Sparkles}
                  eyebrow="About this template"
                  title="模板概览"
                  description={template.longDescription}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  {template.features.map((feature) => (
                    <div
                      key={feature}
                      className="flex items-start gap-3 rounded-xl border border-border/50 bg-background/35 p-4"
                    >
                      <CheckCircle2
                        className="mt-0.5 size-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <span className="text-sm leading-relaxed text-foreground">
                        {feature}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section
                id="parameters"
                className="glass-panel scroll-mt-28 p-6 md:p-8"
              >
                <SectionHeading
                  icon={Gauge}
                  eyebrow="Model parameters"
                  title="模型参数"
                  description="以下是该模板推荐的默认配置，可以根据实例规格和应用场景继续调整。"
                />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {details.parameters.map((parameter, index) => (
                    <ParameterCard
                      key={parameter.label}
                      label={parameter.label}
                      value={parameter.value}
                      index={index}
                      dotClass={meta.dotClass}
                    />
                  ))}
                </div>
              </section>

              <section
                id="capabilities"
                className="glass-panel scroll-mt-28 p-6 md:p-8"
              >
                <SectionHeading
                  icon={Zap}
                  eyebrow="Supported functionality"
                  title="能力支持"
                  description="不同类型的模型拥有各自专用的输入输出方式，部署后可通过统一的服务地址进行访问。"
                />
                <div className="grid gap-4 md:grid-cols-2">
                  <CapabilityBlock
                    title="输入能力"
                    values={details.input}
                    dotClass={meta.dotClass}
                  />
                  <CapabilityBlock
                    title="输出能力"
                    values={details.output}
                    dotClass="bg-primary"
                  />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/50 pt-5 text-xs text-muted-foreground">
                  <span>部署包含：</span>
                  {["GPU 加速", "流式响应", "健康检查", "日志监控"].map(
                    (item) => (
                      <span
                        key={item}
                        className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1.5"
                      >
                        <CheckCircle2
                          className="size-3 text-primary"
                          aria-hidden="true"
                        />
                        {item}
                      </span>
                    )
                  )}
                </div>
              </section>

              <section
                id="quickstart"
                className="glass-panel scroll-mt-28 overflow-hidden p-6 md:p-8"
              >
                <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                  <SectionHeading
                    icon={Code2}
                    eyebrow="API usage"
                    title="快速开始"
                    description={`部署完成后，可使用默认端口调用 ${template.title} 服务。`}
                  />
                  <Badge variant="outline" className="mt-1">
                    {meta.eyebrow}
                  </Badge>
                </div>
                <CodeBlock code={details.usageExample} endpoint={endpoint} />
              </section>

              <section
                className="glass-panel scroll-mt-28 p-6 md:p-8"
                id="runtime"
              >
                <SectionHeading
                  icon={FileCode2}
                  eyebrow="Runtime configuration"
                  title="运行配置"
                  description="镜像中的软件版本、端口和硬件建议会随模板一起提供，减少首次部署的准备工作。"
                />
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="rounded-xl border border-border/60 bg-background/35 p-5">
                    <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                      <MemoryStick
                        className="size-4 text-primary"
                        aria-hidden="true"
                      />
                      软件版本
                    </div>
                    {versions.length > 0 ? (
                      <div className="divide-y divide-border/50">
                        {versions.map(([key, value]) => (
                          <div
                            key={key}
                            className="flex items-center justify-between gap-4 py-3 text-sm"
                          >
                            <span className="font-mono text-xs text-muted-foreground">
                              {key}
                            </span>
                            <span className="font-mono text-xs text-foreground">
                              {value}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        使用镜像中的最新稳定版本
                      </p>
                    )}
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background/35 p-5">
                    <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                      <Cpu className="size-4 text-primary" aria-hidden="true" />
                      资源与网络
                    </div>
                    <RuntimeRow
                      icon={Cpu}
                      label="推荐 GPU"
                      value={template.recommendedGpu}
                    />
                    <RuntimeRow
                      icon={HardDrive}
                      label="服务端口"
                      value={ports}
                    />
                    <RuntimeRow
                      icon={Layers}
                      label="部署类型"
                      value="GPU 云实例"
                    />
                  </div>
                </div>
              </section>
            </div>

            <aside id="deployment" className="scroll-mt-28 lg:sticky lg:top-24">
              <div className="glass-panel overflow-hidden p-6">
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Rocket className="size-5" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-xs tracking-[0.16em] text-muted-foreground uppercase">
                      Deployment
                    </div>
                    <h2 className="mt-0.5 text-lg font-semibold text-foreground">
                      一键部署
                    </h2>
                  </div>
                </div>
                <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
                  选择合适的 GPU
                  规格后，在控制台完成实例创建。模板会自动挂载端口并准备好运行环境。
                </p>
                <div className="space-y-4 border-y border-border/50 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-xs text-muted-foreground">
                      推荐 GPU
                    </span>
                    <span className="text-right text-sm font-medium text-foreground">
                      {template.recommendedGpu}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-xs text-muted-foreground">
                      默认端口
                    </span>
                    <span className="font-mono text-sm font-medium text-foreground">
                      {ports}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-xs text-muted-foreground">
                      部署方式
                    </span>
                    <span className="text-right text-sm font-medium text-foreground">
                      按需实例
                    </span>
                  </div>
                </div>
                <Button asChild className="mt-6 w-full rounded-full" size="lg">
                  <LocaleLink href={template.deployHref}>
                    进入部署控制台
                    <ArrowRight className="size-4" />
                  </LocaleLink>
                </Button>
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  无需手动安装依赖
                </p>
              </div>
              <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                  <Waves className="size-4 text-primary" aria-hidden="true" />
                  部署提示
                </div>
                <ul className="space-y-2 text-xs leading-relaxed text-muted-foreground">
                  <li>• 建议首次部署选择模板推荐的 GPU 规格。</li>
                  <li>• 服务启动后可通过默认端口访问健康检查接口。</li>
                  <li>• 可以在控制台查看日志、监控和公网访问配置。</li>
                </ul>
              </div>
            </aside>
          </div>

          {relatedTemplates.length > 0 ? (
            <section className="mt-20">
              <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="mb-3 text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
                    More templates
                  </div>
                  <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                    更多同类模板
                  </h2>
                </div>
                <Button asChild variant="ghost" className="gap-2">
                  <LocaleLink href="/apps">
                    查看全部
                    <ArrowRight className="size-4" />
                  </LocaleLink>
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {relatedTemplates.map((related) => (
                  <article
                    key={related.slug}
                    className="group flex min-h-[260px] flex-col rounded-xl border border-border/60 bg-card/60 p-5 transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
                  >
                    <div className="mb-5 flex items-center justify-between gap-3">
                      <Badge variant="secondary">
                        {categoryLabels[related.category]}
                      </Badge>
                      <LocaleLink
                        href={`/apps/${related.slug}`}
                        className="text-muted-foreground transition-colors group-hover:text-primary"
                        aria-label={`查看 ${related.title}`}
                      >
                        <ArrowRight className="size-4" />
                      </LocaleLink>
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {related.title}
                    </h3>
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                      {related.summary}
                    </p>
                    <div className="mt-auto pt-6">
                      <div className="mb-3 text-xs text-muted-foreground">
                        推荐 GPU：{related.recommendedGpu}
                      </div>
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="w-full"
                      >
                        <LocaleLink href={`/apps/${related.slug}`}>
                          查看模板
                        </LocaleLink>
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <MarketingFooter />
    </main>
  )
}
