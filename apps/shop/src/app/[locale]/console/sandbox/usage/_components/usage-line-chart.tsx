"use client"

import { useEffect, useId, useRef, useState } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { cn } from "@workspace/ui/lib/utils"
import type { UsageChartPoint } from "@/lib/sandbox-usage/types"

interface UsageLineChartProps {
  data: UsageChartPoint[]
  className?: string
  tickFormatter?: (timestamp: string) => string
}

function parseChartHeight(className?: string): number {
  const match = className?.match(/h-\[(\d+)px\]/)
  return match ? Number(match[1]) : 180
}

export function UsageLineChart({
  data,
  className,
  tickFormatter,
}: UsageLineChartProps) {
  const gradientId = useId().replace(/:/g, "")
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const chartData = data.map((point) => ({
    timestamp: point.timestamp,
    value: point.value,
  }))
  const containerClass = className ?? "h-[180px] w-full"
  const chartHeight = parseChartHeight(containerClass)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    function updateWidth() {
      const nextWidth = element?.clientWidth ?? 0
      if (nextWidth > 0) {
        setWidth(nextWidth)
      }
    }

    updateWidth()

    const observer = new ResizeObserver(() => {
      updateWidth()
    })
    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  if (chartData.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center text-sm text-muted-foreground",
          containerClass,
        )}
      >
        暂无数据
      </div>
    )
  }

  return (
    <div ref={containerRef} className={cn(containerClass, "min-w-0")}>
      <AreaChart
        width={width}
        height={chartHeight}
        data={chartData}
        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/50" />
        <XAxis
          dataKey="timestamp"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tick={{ fontSize: 11 }}
          tickFormatter={(value: string) =>
            tickFormatter?.(value) ??
            new Date(value).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
              timeZone: "UTC",
            })
          }
        />
        <YAxis hide domain={[0, "auto"]} tick={{ fontSize: 11 }} />
        <Tooltip
          cursor={false}
          contentStyle={{
            borderRadius: "0.5rem",
            border: "1px solid var(--border)",
            background: "var(--background)",
            fontSize: "12px",
          }}
          labelFormatter={(value) =>
            tickFormatter?.(String(value)) ??
            new Date(String(value)).toLocaleString("en-US", {
              timeZone: "UTC",
            })
          }
          formatter={(value) => [Number(value).toLocaleString(), "Value"]}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="var(--color-primary)"
          fill={`url(#${gradientId})`}
          strokeWidth={2}
          dot={false}
        />
      </AreaChart>
    </div>
  )
}
