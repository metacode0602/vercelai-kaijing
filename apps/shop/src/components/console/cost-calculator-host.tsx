'use client'

import * as React from 'react'
import { Calculator } from 'lucide-react'
import { Button } from '@workspace/ui/components/button'
import { cn } from '@workspace/ui/lib/utils'
import { CostCalculatorWorkbench } from '@/components/console/cost-calculator-workbench'
import {
  dispatchCostCalcAction,
  subscribeCostCalcActions,
} from '@/lib/crossborder/cost-calculator-bridge'

/**
 * Single console-level Sheet host so Copilot chips and page CTAs share one workbench.
 * Mount inside ConsoleCopilotProvider.
 */
export function CostCalculatorHost() {
  const [open, setOpen] = React.useState(false)
  const [sku, setSku] = React.useState<string | undefined>(undefined)

  React.useEffect(() => {
    return subscribeCostCalcActions(({ action }) => {
      if (action.type === 'open') {
        if (action.sku) setSku(action.sku)
        setOpen(true)
        return
      }
      if (action.type === 'apply_sku') {
        setSku(action.sku)
      }
      setOpen(true)
    })
  }, [])

  return (
    <CostCalculatorWorkbench
      open={open}
      onOpenChange={setOpen}
      initialSku={sku}
    />
  )
}

/** Page CTA — opens the shared host via bridge (no local Sheet). */
export function CostCalculatorEntry({
  sku,
  label = '成本测算',
  variant = 'default' as 'default' | 'outline' | 'secondary',
  size = 'sm' as 'sm' | 'default',
  className,
}: {
  sku?: string
  label?: string
  variant?: 'default' | 'outline' | 'secondary'
  size?: 'sm' | 'default'
  className?: string
}) {
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn('gap-1.5', className)}
      onClick={() => dispatchCostCalcAction({ type: 'open', sku })}
    >
      <Calculator className="size-3.5" />
      {label}
    </Button>
  )
}
