'use client'

import * as React from 'react'
import { Suspense } from 'react'
import { PricingCalculatorWorkbench } from '@/components/console/pricing-calculator-workbench'

export default function PricingCalculatorPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">加载定价计算器…</p>}>
      <PricingCalculatorWorkbench />
    </Suspense>
  )
}
