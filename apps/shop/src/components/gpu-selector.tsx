"use client"

import { Check, Cpu, MemoryStick, HardDrive, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { GPUS, formatUSD, type Gpu, type GpuTier } from "@/lib/gpu-data"
import { Badge } from "@workspace/ui/components/badge"

const tierColor: Record<GpuTier, string> = {
  low: "bg-primary/10 text-primary",
  mid: "bg-chart-4/15 text-chart-4",
  high: "bg-chart-5/15 text-chart-5",
  na: "bg-muted text-muted-foreground",
}

export function GpuSelector({
  value,
  onChange,
  billing,
  billingLabel,
  priceOverride,
}: {
  value: string
  onChange: (id: string) => void
  billing: "on-demand" | "spot"
  billingLabel?: string
  priceOverride?: number
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {GPUS.map((gpu) => (
        <GpuCard
          key={gpu.id}
          gpu={gpu}
          selected={value === gpu.id}
          onSelect={() => gpu.available && onChange(gpu.id)}
          billing={billing}
          billingLabel={billingLabel}
          priceOverride={priceOverride}
        />
      ))}
    </div>
  )
}

function GpuCard({
  gpu,
  selected,
  onSelect,
  billing,
  billingLabel,
  priceOverride,
}: {
  gpu: Gpu
  selected: boolean
  onSelect: () => void
  billing: "on-demand" | "spot"
  billingLabel?: string
  priceOverride?: number
}) {
  const price =
    priceOverride ?? (billing === "spot" ? gpu.spot : gpu.onDemand)
  const label =
    billingLabel ?? (billing === "spot" ? "Spot" : "按需")
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!gpu.available}
      className={cn(
        "relative flex flex-col rounded-xl border bg-card p-4 text-left transition-all",
        gpu.available ? "hover:border-primary/60 hover:shadow-sm" : "cursor-not-allowed opacity-55",
        selected ? "border-primary ring-2 ring-primary/30" : "border-border",
      )}
    >
      {selected && (
        <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-primary">
          <Check className="size-3 text-primary-foreground" />
        </span>
      )}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{gpu.brand}</span>
        {gpu.secure && (
          <Badge variant="secondary" className="h-5 gap-1 px-1.5 text-[10px]">
            <ShieldCheck className="size-3" />
            安全云
          </Badge>
        )}
      </div>
      <h3 className="mt-1 text-sm font-semibold leading-tight text-foreground">{gpu.name}</h3>
      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <span>Max CUDA {gpu.maxCuda}</span>
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", tierColor[gpu.tier])}>
          {gpu.tierLabel} VRAM
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
        <Spec icon={MemoryStick} label="VRAM" value={`${gpu.vram} GB`} />
        <Spec icon={Cpu} label="vCPU" value={`${gpu.vcpu}`} />
        <Spec icon={HardDrive} label="RAM" value={`${gpu.ram}GB`} />
      </div>

      <div className="mt-3 flex items-end justify-between border-t border-border pt-3">
        <span className="text-xs text-muted-foreground">{label}</span>
        {gpu.available ? (
          <span className="text-sm font-semibold text-foreground">
            {formatUSD(price)}
            <span className="text-xs font-normal text-muted-foreground">/hr</span>
          </span>
        ) : (
          <span className="text-xs font-medium text-muted-foreground">暂无库存</span>
        )}
      </div>
    </button>
  )
}

function Spec({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  )
}
