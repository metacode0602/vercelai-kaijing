"use client"

import { CircleHelp } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { MAX_PRELOAD_SIZE_GB, MAX_PRELOAD_TASKS } from "@/lib/preloaded-data"

interface QuotaIndicatorProps {
  used: number
  variant?: "page" | "dialog"
  compact?: boolean
}

export function QuotaIndicator({
  used,
  variant = "page",
  compact = false,
}: QuotaIndicatorProps) {
  const radius = 6
  const circumference = 2 * Math.PI * radius
  const progress = Math.min(used / MAX_PRELOAD_TASKS, 1)
  const offset = circumference * (1 - progress)
  const sizeLabel = variant === "dialog" ? "每个最高" : "每个最多"

  const content = (
    <>
      <svg
        width="15"
        height="15"
        viewBox="0 0 15 15"
        className="shrink-0 -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx="7.5"
          cy="7.5"
          r={radius}
          fill="none"
          stroke="var(--muted-foreground)"
          strokeWidth="3"
          opacity={0.35}
        />
        <circle
          cx="7.5"
          cy="7.5"
          r={radius}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <p className={compact ? "text-xs text-muted-foreground" : "text-sm text-muted-foreground"}>
        <span className="font-medium text-primary">{used}</span>
        <span>/{MAX_PRELOAD_TASKS} 已创建镜像预热任务，{sizeLabel} </span>
        <span className="font-medium text-foreground">{MAX_PRELOAD_SIZE_GB}GB</span>
      </p>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex size-4 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              aria-label="配额说明"
            >
              <CircleHelp className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs text-xs">
            每个账号最多同时存在 {MAX_PRELOAD_TASKS} 个镜像预热任务，单个镜像预热容量上限为{" "}
            {MAX_PRELOAD_SIZE_GB}GB。预热完成后在创建实例时可加速镜像拉取。
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </>
  )

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 rounded bg-muted px-2 py-2">
        {content}
      </div>
    )
  }

  return <div className="flex items-center gap-1">{content}</div>
}
