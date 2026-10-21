/**
 * Lightweight event bridge between console Copilot mock and cost calculator Demo.
 * No real LLM — suggestion chips / mock replies dispatch these actions.
 */

import type { FreightMode, TariffProfileId } from '@/lib/crossborder/cost-calculator'

export const COST_CALC_EVENT = 'open-shop:cost-calculator'

export type CostCalcBridgeAction =
  | { type: 'open'; sku?: string }
  | { type: 'apply_sku'; sku: string }
  | { type: 'set_freight'; mode: FreightMode }
  | { type: 'set_margin'; pct: number }
  | { type: 'set_tariff'; profileId: TariffProfileId }
  | { type: 'compare_lcl_fcl' }
  | { type: 'compute' }

export type CostCalcBridgeDetail = {
  action: CostCalcBridgeAction
  /** Optional assistant explanation already shown in Copilot */
  source?: 'copilot' | 'ui'
}

export function dispatchCostCalcAction(
  action: CostCalcBridgeAction,
  source: CostCalcBridgeDetail['source'] = 'ui',
) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<CostCalcBridgeDetail>(COST_CALC_EVENT, {
      detail: { action, source },
    }),
  )
}

export function subscribeCostCalcActions(
  handler: (detail: CostCalcBridgeDetail) => void,
): () => void {
  if (typeof window === 'undefined') return () => {}
  const listener = (e: Event) => {
    const ce = e as CustomEvent<CostCalcBridgeDetail>
    if (ce.detail) handler(ce.detail)
  }
  window.addEventListener(COST_CALC_EVENT, listener)
  return () => window.removeEventListener(COST_CALC_EVENT, listener)
}
