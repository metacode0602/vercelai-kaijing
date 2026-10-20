"use client"

import type { ComponentType } from "react"
import {
  BadgePercent,
  Calendar,
  CalendarCheck,
  CalendarDays,
  Check,
  Info,
  Timer,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Label } from "@workspace/ui/components/label"
import {
  BILLING_METHOD_OPTIONS,
  type CommitmentType,
} from "@/lib/gpu-data"
import { cn } from "@workspace/ui/lib/utils"

const BILLING_ICONS = {
  spot: BadgePercent,
  "on-demand": Timer,
  daily: Calendar,
  weekly: CalendarDays,
  monthly: CalendarCheck,
} satisfies Record<
  CommitmentType,
  ComponentType<{ className?: string }>
>

export interface BillingMethodSelectorProps {
  value: CommitmentType
  onChange: (value: CommitmentType) => void
  label?: string
  className?: string
}

export function BillingMethodSelector({
  value,
  onChange,
  label = "计费方式",
  className,
}: BillingMethodSelectorProps) {
  const selectedBilling =
    BILLING_METHOD_OPTIONS.find((item) => item.id === value) ??
    BILLING_METHOD_OPTIONS[1]

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label>{label}</Label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {BILLING_METHOD_OPTIONS.map((item) => {
          const selected = value === item.id
          const Icon = BILLING_ICONS[item.id]

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={cn(
                "relative flex flex-col rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/60 hover:shadow-sm",
                selected
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-border",
              )}
            >
              {selected && (
                <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-primary">
                  <Check className="size-3 text-primary-foreground" />
                </span>
              )}
              <div className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icon className="size-4 text-muted-foreground" />
                </span>
                <div className="flex min-w-0 flex-col gap-1 pr-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {item.name}
                    </span>
                    {item.badge && (
                      <Badge
                        variant="secondary"
                        className="h-5 border border-rose-100 bg-rose-50 px-1.5 text-[10px] text-rose-600"
                      >
                        {item.badge}
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {item.description}
                  </span>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      <Alert>
        <Info />
        <AlertTitle>{selectedBilling.name}</AlertTitle>
        <AlertDescription>{selectedBilling.hint}</AlertDescription>
      </Alert>
    </div>
  )
}
