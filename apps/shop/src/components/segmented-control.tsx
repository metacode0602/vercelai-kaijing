"use client"

import { cn } from "@/lib/utils"
import {
  filterOptionActive,
  filterOptionInactive,
} from "../app/[locale]/console/server/_components/theme-styles"

interface SegmentedControlProps<T extends string> {
  options: { id: T; label: string }[]
  value: T
  onChange: (value: T) => void
  className?: string
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div className={cn("inline-flex flex-wrap", className)}>
      {options.map((option, index) => {
        const active = value === option.id
        const isFirst = index === 0
        const isLast = index === options.length - 1

        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={cn(
              "border px-3 py-1.5 text-sm font-medium transition-colors",
              isFirst && "rounded-l-lg",
              isLast && "rounded-r-lg",
              !isFirst && "border-l-0",
              active ? filterOptionActive : filterOptionInactive,
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
