'use client'

import * as React from 'react'
import { Calculator } from 'lucide-react'
import { Button } from '@workspace/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { cn } from '@workspace/ui/lib/utils'
import { CostCalculatorWorkbench } from '@/components/console/cost-calculator-workbench'
import {
  dispatchCostCalcAction,
  subscribeCostCalcActions,
  writeCostCalcDraft,
} from '@/lib/crossborder/cost-calculator-bridge'
import type { CostCalculatorInput } from '@/lib/crossborder/cost-calculator'
import { useLocaleRouter } from '@/lib/i18n/navigation'

/**
 * Console-level Dialog host for the header「成本测算」CTA.
 * Form-only; 「一键测算」navigates to the recalculate page with a sessionStorage draft.
 * Copilot chips and list「测算」do not open this Dialog.
 */
export function CostCalculatorHost() {
  const router = useLocaleRouter()
  const [open, setOpen] = React.useState(false)
  const [sku, setSku] = React.useState<string | undefined>(undefined)

  React.useEffect(() => {
    return subscribeCostCalcActions(({ action }) => {
      if (action.type !== 'open_dialog') return
      if (action.sku) setSku(action.sku)
      setOpen(true)
    })
  }, [])

  const handleDialogCompute = React.useCallback(
    (input: CostCalculatorInput) => {
      writeCostCalcDraft({ ...input, autoCompute: true })
      setOpen(false)
      router.push(`/console/costs/${input.sku}/recalculate`)
    },
    [router],
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="min-w-[35vw] max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 pr-6">
            <Calculator className="size-4 text-primary" />
            <DialogTitle>成本测算</DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            填写左侧输入项后点「一键测算」，将跳转到完整测算页查看瀑布与建议售价。
          </DialogDescription>
        </DialogHeader>
        <CostCalculatorWorkbench
          variant="dialog"
          open={open}
          onOpenChange={setOpen}
          initialSku={sku}
          onDialogCompute={handleDialogCompute}
        />
      </DialogContent>
    </Dialog>
  )
}

/** Header CTA — opens the shared Dialog (form only). */
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
      onClick={() => dispatchCostCalcAction({ type: 'open_dialog', sku })}
    >
      <Calculator className="size-3.5" />
      {label}
    </Button>
  )
}
