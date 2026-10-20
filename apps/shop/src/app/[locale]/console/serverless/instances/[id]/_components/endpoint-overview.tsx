"use client"

import { useState } from "react"
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Container,
  Copy,
  Cpu,
  Globe,
  HardDrive,
  Lock,
  Zap,
} from "lucide-react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import type { Instance } from "@/components/console-store"
import { formatUSD } from "@/lib/gpu-data"
import { getRegistrySourceLabel } from "../../../deploy/_components/types"
import type { WorkerConfigValues } from "../../../deploy/_components/types"

export interface EndpointOverviewProps {
  endpoint: Instance
  workerConfig: WorkerConfigValues
  pricePerHour: number
  endpointUrl: string
  onCopy: (text: string, label: string) => void
}

export function EndpointOverview({
  endpoint,
  workerConfig,
  pricePerHour,
  endpointUrl,
  onCopy,
}: EndpointOverviewProps) {
  const [showCurl, setShowCurl] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard icon={Cpu} label="GPU" value={`${endpoint.gpuCount} × ${endpoint.gpu}`} />
        <MetricCard icon={Globe} label="区域" value={endpoint.region} />
        <MetricCard icon={Activity} label="计费" value={endpoint.billing} />
        <MetricCard icon={HardDrive} label="价格" value={`${formatUSD(pricePerHour)}/hr`} />
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">API 端点</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          向此 URL 发送 POST 请求以触发推理，Worker 将按负载自动扩缩容。
        </p>
        <div className="mt-3 flex items-center gap-2">
          <code className="flex-1 truncate rounded-lg border border-border bg-muted/40 px-3 py-2.5 font-mono text-xs text-foreground">
            {endpointUrl}
          </code>
          <Button
            variant="outline"
            size="icon"
            className="size-9 shrink-0"
            onClick={() => onCopy(endpointUrl, "端点 URL")}
            aria-label="复制端点 URL"
          >
            <Copy className="size-3.5" />
          </Button>
        </div>
        <button
          type="button"
          onClick={() => setShowCurl((v) => !v)}
          className="mt-3 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {showCurl ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          {showCurl ? "收起" : "查看"} cURL 示例
        </button>
        {showCurl && (
          <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {`curl -X POST ${endpointUrl} \\\n  -H "Authorization: Bearer $API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"input": {"prompt": "Hello"}}'`}
          </pre>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Zap className="size-4 text-primary" />
            扩缩容策略
          </h3>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Worker 范围</dt>
              <dd className="font-medium text-foreground">
                {workerConfig.minWorkers} – {workerConfig.maxWorkers}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">空闲超时</dt>
              <dd className="font-medium text-foreground">{workerConfig.idleTimeout}s</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">最大并发</dt>
              <dd className="font-medium text-foreground">{workerConfig.maxConcurrency}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">队列超时</dt>
              <dd className="font-medium text-foreground">{workerConfig.requestTimeout}s</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Container className="size-4 text-primary" />
            容器镜像
            <Badge variant="outline" className="gap-1 text-[10px] font-normal">
              <Lock className="size-2.5" />
              不可修改
            </Badge>
          </h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">模板</dt>
              <dd className="font-medium text-foreground">
                {endpoint.templateLabel ?? "—"}
              </dd>
            </div>
            {endpoint.templateMode === "custom" && endpoint.registrySource && (
              <div>
                <dt className="text-xs text-muted-foreground">镜像来源</dt>
                <dd className="font-medium text-foreground">
                  {getRegistrySourceLabel(endpoint.registrySource)}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-muted-foreground">镜像地址</dt>
              <dd>
                <code className="mt-0.5 block break-all rounded-md bg-muted/50 px-2 py-1.5 font-mono text-xs text-foreground">
                  {endpoint.image}
                </code>
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </span>
      <p className="mt-1 truncate text-sm font-medium text-foreground">{value}</p>
    </div>
  )
}
