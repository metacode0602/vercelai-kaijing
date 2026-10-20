"use client"

import { use } from "react"
import {
  ArrowLeft,
  BookOpen,
  Boxes,
  ChevronRight,
  Copy,
  Cpu,
  FileCode2,
  Globe,
  HardDrive,
  Layers,
  MemoryStick,
  Rocket,
} from "lucide-react"
import Image from "next/image"
import { notFound } from "next/navigation"
import { toast } from "sonner"
import { LocaleLink, useLocaleRouter } from "@/lib/i18n/navigation"
import { cn } from "@/lib/utils"
import { trpc } from "@/trpc/client"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"

const CATEGORY_LABELS: Record<string, string> = {
  llm: "LLM",
  image: "图像",
  audio: "音频",
  video: "视频",
  agent: "智能体",
  other: "其他",
}

const DEPLOY_TYPE_LABELS: Record<string, string> = {
  instance: "实例",
  serverless: "Serverless",
}

function CategoryBadge({ category }: { category: string }) {
  return <Badge variant="secondary">{CATEGORY_LABELS[category] ?? category}</Badge>
}

function DeployTypeBadge({ deployType }: { deployType: string }) {
  return <Badge variant="outline">{DEPLOY_TYPE_LABELS[deployType] ?? deployType}</Badge>
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType
  label: string
  value: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  )
}

function InfoRow({
  label,
  value,
  mono,
  className,
}: {
  label: string
  value: string
  mono?: boolean
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-sm text-foreground",
          mono && "break-all font-mono text-xs leading-relaxed",
        )}
      >
        {value}
      </span>
    </div>
  )
}

function Field({
  label,
  value,
  onCopy,
  mono,
}: {
  label: string
  value: string
  onCopy?: () => void
  mono?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <code
          className={cn(
            "flex-1 truncate rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground",
            mono && "font-mono leading-relaxed",
          )}
        >
          {value}
        </code>
        {onCopy && (
          <Button
            variant="outline"
            size="icon"
            className="size-9 shrink-0"
            onClick={onCopy}
            aria-label={`复制 ${label}`}
          >
            <Copy className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}

export default function AppTemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useLocaleRouter()

  const { data: template, isLoading } =
    trpc.applicationTemplate.getById.useQuery({ id })

  function copy(text: string, label: string) {
    navigator.clipboard?.writeText(text)
    toast.success(`${label}已复制`)
  }

  if (isLoading && !template) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-none">
          <div className="mx-auto w-full max-w-7xl px-5 py-6">
            <Skeleton className="mb-4 h-4 w-48" />
            <Skeleton className="mb-4 h-8 w-64" />
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="mt-4 h-40 w-full rounded-xl" />
            <Skeleton className="mt-4 h-40 w-full rounded-xl" />
          </div>
        </div>
      </div>
    )
  }

  if (!template) {
    notFound()
  }

  const appId = template.id
  const isServerless = template.deployType === "serverless"
  const latestVersion = template.versions.find((v) => v.isLatest)

  function handleDeploy() {
    if (isServerless) {
      router.push(`/console/serverless/deploy?template=${appId}`)
    } else {
      router.push("/console/apps")
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-none pb-4">
        <div className="mx-auto w-full max-w-7xl px-5 py-6">
          <Breadcrumb className="mb-4">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <LocaleLink href="/console/apps">应用</LocaleLink>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator>
                <ChevronRight className="size-3.5" />
              </BreadcrumbSeparator>
              <BreadcrumbItem>
                <BreadcrumbPage>{template.name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <LocaleLink
            href="/console/apps"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            返回应用列表
          </LocaleLink>

          {/* 应用概览 */}
          <Card className="gap-4 rounded-2xl p-4 ring-border/80">
            <div className="flex items-start gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent">
                {template.iconUrl ? (
                  <Image
                    src={template.iconUrl}
                    alt={template.name}
                    width={24}
                    height={24}
                    className="size-6 object-contain"
                  />
                ) : (
                  <Layers className="size-6 text-accent-foreground" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold text-foreground">
                    {template.name}
                  </h1>
                  {template.tier && <Badge variant="secondary">{template.tier}</Badge>}
                  {template.isFeatured && <Badge>精选</Badge>}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <CategoryBadge category={template.category} />
                  <DeployTypeBadge deployType={template.deployType} />
                  {template.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {template.description && (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {template.description}
              </p>
            )}

            <div className="grid grid-cols-2 gap-4 border-t border-dashed border-border pt-4 sm:grid-cols-4">
              <Stat icon={Boxes} label="下载" value={`${template.downloadCount} 次`} />
              <Stat
                icon={Cpu}
                label="最低 GPU"
                value={template.minGPU ?? "—"}
              />
              <Stat
                icon={MemoryStick}
                label="最低内存"
                value={template.minMemoryGB ? `${template.minMemoryGB} GB` : "—"}
              />
              <Stat
                icon={HardDrive}
                label="最低磁盘"
                value={template.minDiskGB ? `${template.minDiskGB} GB` : "—"}
              />
            </div>
          </Card>

          {/* 镜像信息 */}
          <Card className="mt-4 gap-4 rounded-2xl p-4 ring-border/80">
            <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Rocket className="size-4 text-primary" aria-hidden="true" />
              镜像信息
            </h2>
            <Field
              label="镜像地址"
              value={template.imageRef}
              mono
              onCopy={() => copy(template.imageRef, "镜像地址")}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoRow
                label="GPU 数量"
                value={template.minGPUCount ? `${template.minGPUCount}` : "—"}
              />
              <InfoRow
                label="默认端口"
                value={template.defaultPort ? String(template.defaultPort) : "—"}
              />
            </div>
          </Card>

          {/* 配置信息 */}
          <Card className="mt-4 gap-4 rounded-2xl p-4 ring-border/80">
            <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
              <FileCode2 className="size-4 text-primary" aria-hidden="true" />
              配置信息
            </h2>
            <div className="flex flex-col gap-3">
              {template.defaultCommand && (
                <InfoRow label="启动命令" value={template.defaultCommand} mono />
              )}
              {template.healthCheckPath && (
                <InfoRow label="健康检查路径" value={template.healthCheckPath} mono />
              )}
              {template.defaultEnvVars &&
              Object.keys(template.defaultEnvVars).length > 0 ? (
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">环境变量</span>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(template.defaultEnvVars).map(([key, value]) => (
                      <code
                        key={key}
                        className="rounded bg-muted px-1.5 py-1 font-mono text-[11px] text-muted-foreground"
                      >
                        {key}={String(value ?? "")}
                      </code>
                    ))}
                  </div>
                </div>
              ) : (
                <InfoRow label="环境变量" value="—" />
              )}
            </div>
          </Card>

          {/* 参考文档 */}
          {(template.docsUrl || template.sourceUrl) && (
            <Card className="mt-4 gap-4 rounded-2xl p-4 ring-border/80">
              <h2 className="text-sm font-bold text-foreground">参考文档</h2>
              <div className="flex flex-wrap gap-2">
                {template.docsUrl && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={template.docsUrl} target="_blank" rel="noreferrer">
                      <BookOpen className="size-3.5" />
                      官方文档
                    </a>
                  </Button>
                )}
                {template.sourceUrl && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={template.sourceUrl} target="_blank" rel="noreferrer">
                      <Globe className="size-3.5" />
                      项目源码
                    </a>
                  </Button>
                )}
              </div>
            </Card>
          )}

          {/* 版本记录 */}
          <Card className="mt-4 gap-4 rounded-2xl p-4 ring-border/80">
            <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Layers className="size-4 text-primary" aria-hidden="true" />
              版本记录
            </h2>
            {template.versions.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无版本记录</p>
            ) : (
              <div className="flex flex-col gap-3">
                {template.versions.map((version, index) => (
                  <div
                    key={version.id}
                    className="rounded-lg border border-border/70 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={version.isLatest ? "default" : "outline"}>
                          {version.versionTag}
                        </Badge>
                        {version.isLatest && (
                          <Badge variant="secondary">最新版本</Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {index === 0 ? "最新发布于 " : ""}
                        {new Date(version.createdAt).toLocaleDateString("zh-CN")}
                      </span>
                    </div>
                    <code className="mt-2 block truncate rounded bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
                      {version.imageRef}
                    </code>
                    {(version.changelog || version.command) && (
                      <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                        {version.changelog && <p>{version.changelog}</p>}
                        {version.command && (
                          <p>
                            <span className="text-muted-foreground">命令：</span>
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
                              {version.command}
                            </code>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* CTA 底栏 */}
      <div className="shrink-0 border-t bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-foreground">
                {template.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {latestVersion?.versionTag ?? template.deployType} ·{" "}
                {CATEGORY_LABELS[template.category] ?? template.category}
              </span>
            </div>
          </div>
          <Button className="min-w-40" onClick={handleDeploy}>
            <Rocket className="size-4" aria-hidden="true" />
            部署应用
          </Button>
        </div>
      </div>
    </div>
  )
}