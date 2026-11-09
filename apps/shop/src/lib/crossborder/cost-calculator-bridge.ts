/**
 * Lightweight event bridge between console Copilot suggestion chips and cost calculator.
 * Dispatches UI actions only (no LLM / no network).
 */

import type {
  CostCalculatorInput,
  FreightMode,
  TariffProfileId,
} from '@/lib/crossborder/cost-calculator'

export const COST_CALC_EVENT = 'open-shop:cost-calculator'

/** Dialog → recalculate page handoff (inputs for results). */
export const COST_CALC_DRAFT_KEY = 'open-shop:cost-calc-draft'

/** Copilot actions queued when navigating onto the recalculate page. */
export const COST_CALC_PENDING_KEY = 'open-shop:cost-calc-pending'

export type CostCalcBridgeAction =
  | { type: 'open_dialog'; sku?: string }
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

export type CostCalcDraft = Partial<CostCalculatorInput> & {
  sku: string
  /** When true, page should show computed results immediately */
  autoCompute?: boolean
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

export function writeCostCalcDraft(draft: CostCalcDraft) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(COST_CALC_DRAFT_KEY, JSON.stringify(draft))
  } catch {
    /* ignore quota / private mode */
  }
}

export function readCostCalcDraft(): CostCalcDraft | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(COST_CALC_DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CostCalcDraft
    if (!parsed || typeof parsed.sku !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

export function clearCostCalcDraft() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(COST_CALC_DRAFT_KEY)
  } catch {
    /* ignore */
  }
}

export function writePendingCostCalcActions(actions: CostCalcBridgeAction[]) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(COST_CALC_PENDING_KEY, JSON.stringify(actions))
  } catch {
    /* ignore */
  }
}

export function consumePendingCostCalcActions(): CostCalcBridgeAction[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.sessionStorage.getItem(COST_CALC_PENDING_KEY)
    window.sessionStorage.removeItem(COST_CALC_PENDING_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CostCalcBridgeAction[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Path without locale: `/console/costs/:sku/recalculate` */
export function matchCostRecalculatePath(pathname: string | null | undefined): string | null {
  if (!pathname) return null
  const m = pathname.match(/\/console\/costs\/([^/]+)\/recalculate\/?$/)
  return m?.[1] ?? null
}
