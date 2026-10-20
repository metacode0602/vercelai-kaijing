'use client'

import { cn } from '@workspace/ui/lib/utils'

interface DividerWithTextProps {
  label: string
  className?: string
}

export function DividerWithText({ label, className }: DividerWithTextProps) {
  return (
    <div className={cn('relative flex items-center gap-2', className)}>
      <div className="flex-1 border-t" />
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex-1 border-t" />
    </div>
  )
}
