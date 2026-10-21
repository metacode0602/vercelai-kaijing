'use client'

import * as React from 'react'
import { Calculator, ChevronDown, Sparkles } from 'lucide-react'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@workspace/ui/components/collapsible'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'
import { Slider } from '@workspace/ui/components/slider'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { ToggleGroup, ToggleGroupItem } from '@workspace/ui/components/toggle-group'
import { cn } from '@workspace/ui/lib/utils'
import {
  computeLandedCost,
  getFormulaDocs,
  TARIFF_PROFILES,
  type CostCalculatorInput,
  type CostCalculatorResult,
  type FreightMode,
  type TariffProfileId,
} from '@/lib/crossborder/cost-calculator'
import {
  clearCostCalcDraft,
  consumePendingCostCalcActions,
  readCostCalcDraft,
  subscribeCostCalcActions,
  type CostCalcBridgeAction,
} from '@/lib/crossborder/cost-calculator-bridge'
import {
  getCostCalcPreset,
  MOCK_COST_CALC_PRESETS,
  type MockCostCalcPreset,
} from '@/lib/crossborder/mock-data'
import { useConsoleCopilot } from '@/components/console/console-copilot-provider'

function presetToInput(preset: MockCostCalcPreset, overrides?: Partial<CostCalculatorInput>): CostCalculatorInput {
  return {
    sku: preset.sku,
    title: preset.title,
    fobUnit: preset.fobUnit,
    units: preset.units,
    firstMileTotal: preset.firstMileTotal,
    firstMileInCif: false,
    insuranceTotal: 0,
    cartonLcm: preset.cartonLcm,
    cartonWcm: preset.cartonWcm,
    cartonHcm: preset.cartonHcm,
    unitsPerCarton: preset.unitsPerCarton,
    kgPerCarton: preset.kgPerCarton,
    freightMode: 'LCL',
    tariffProfileId: preset.tariffProfileId,
    clearanceMiscTotal: preset.clearanceMiscTotal,
    targetNetMarginPct: preset.defaultMarginPct,
    platformCommissionPct: preset.platformCommissionPct,
    paymentFeePct: preset.paymentFeePct,
    adsPct: 0,
    lastMileUnit: preset.lastMileUnit,
    ...overrides,
  }
}

function formatUsd(n: number, digits = 2) {
  return `${n.toFixed(digits)} USD`
}

function applyBridgeAction(
  prev: CostCalculatorInput,
  action: CostCalcBridgeAction,
  source?: string,
): { next: CostCalculatorInput; hint: string } {
  let next = { ...prev }
  let hint = source === 'copilot' ? '已从助手驱动成本测算工作台' : ''
  switch (action.type) {
    case 'open':
    case 'open_dialog':
      if (action.sku) next = presetToInput(getCostCalcPreset(action.sku))
      hint = source === 'copilot' ? `已打开测算 · ${next.sku}` : hint
      break
    case 'apply_sku':
      next = presetToInput(getCostCalcPreset(action.sku))
      hint = `已套用 SKU ${action.sku} 的箱规与 FOB 预设`
      break
    case 'set_freight':
      next = { ...prev, freightMode: action.mode }
      hint = `已切换海运模式为 ${action.mode}`
      break
    case 'set_margin':
      next = { ...prev, targetNetMarginPct: action.pct }
      hint = `已设定目标净利率 ${action.pct}%`
      break
    case 'set_tariff':
      next = { ...prev, tariffProfileId: action.profileId }
      hint = `已套用税率档「${TARIFF_PROFILES[action.profileId].labelZh}」（示例·待复核）`
      break
    case 'compare_lcl_fcl':
      next = { ...prev, freightMode: prev.freightMode === 'LCL' ? 'FCL20' : 'LCL' }
      hint = '已切换 LCL / FCL 以便对比；右侧对比表始终展示三种模式'
      break
    case 'compute':
      hint = '已按当前输入重新测算'
      break
    default:
      break
  }
  return { next, hint }
}

type CostCalculatorWorkbenchProps = {
  /** page = full recalculate route; dialog = form-only entry CTA */
  variant?: 'page' | 'dialog'
  open?: boolean
  onOpenChange?: (open: boolean) => void
  initialSku?: string
  /** Dialog: called when user clicks 一键测算 (navigate + handoff) */
  onDialogCompute?: (input: CostCalculatorInput) => void
}

export function CostCalculatorWorkbench({
  variant = 'page',
  open: openProp = true,
  onOpenChange: _onOpenChange,
  initialSku,
  onDialogCompute,
}: CostCalculatorWorkbenchProps) {
  const isDialog = variant === 'dialog'
  const open = isDialog ? openProp : true
  const { setOpen: setCopilotOpen } = useConsoleCopilot()
  const [input, setInput] = React.useState<CostCalculatorInput>(() =>
    presetToInput(getCostCalcPreset(initialSku ?? 'TEE-001')),
  )
  const [result, setResult] = React.useState<CostCalculatorResult | null>(() =>
    isDialog ? null : computeLandedCost(presetToInput(getCostCalcPreset(initialSku ?? 'TEE-001'))),
  )
  const [formulasOpen, setFormulasOpen] = React.useState(true)
  const [copilotHint, setCopilotHint] = React.useState<string | null>(null)

  const applySku = React.useCallback((sku: string, extras?: Partial<CostCalculatorInput>) => {
    const preset = getCostCalcPreset(sku)
    setInput(presetToInput(preset, extras))
  }, [])

  const runCompute = React.useCallback(
    (next?: CostCalculatorInput) => {
      const src = next ?? input
      if (isDialog && onDialogCompute) {
        onDialogCompute(src)
        return
      }
      setResult(computeLandedCost(src))
    },
    [input, isDialog, onDialogCompute],
  )

  // Prefill when host passes a new initialSku (dialog open / route sku)
  const lastSkuRef = React.useRef<string | undefined>(undefined)
  React.useEffect(() => {
    if (!open || !initialSku) return
    if (lastSkuRef.current === initialSku) return
    lastSkuRef.current = initialSku
    const next = presetToInput(getCostCalcPreset(initialSku))
    setInput(next)
    if (!isDialog) setResult(computeLandedCost(next))
  }, [open, initialSku, isDialog])

  React.useEffect(() => {
    if (!open) lastSkuRef.current = undefined
  }, [open])

  // Page: consume dialog draft + pending copilot actions once on mount
  React.useEffect(() => {
    if (isDialog) return
    const draft = readCostCalcDraft()
    if (draft && (!initialSku || draft.sku === initialSku)) {
      const base = presetToInput(getCostCalcPreset(draft.sku), draft)
      setInput(base)
      if (draft.autoCompute !== false) {
        setResult(computeLandedCost(base))
      }
      clearCostCalcDraft()
      lastSkuRef.current = draft.sku
    }
    const pending = consumePendingCostCalcActions()
    if (pending.length > 0) {
      setInput((prev) => {
        let cur = prev
        let lastHint = ''
        for (const action of pending) {
          const { next, hint } = applyBridgeAction(cur, action, 'copilot')
          cur = next
          lastHint = hint
        }
        setCopilotHint(lastHint || null)
        setResult(computeLandedCost(cur))
        return cur
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount handoff only
  }, [])

  // Page: live Copilot / bridge updates (do not open dialog)
  React.useEffect(() => {
    if (isDialog) return
    return subscribeCostCalcActions(({ action, source }) => {
      if (action.type === 'open_dialog') return
      setInput((prev) => {
        const { next, hint } = applyBridgeAction(prev, action, source)
        setCopilotHint(hint || null)
        setResult(computeLandedCost(next))
        return next
      })
    })
  }, [isDialog])

  // Smooth auto-recalc when controls change (after first result; page only)
  React.useEffect(() => {
    if (isDialog || !open || result === null) return
    const t = window.setTimeout(() => setResult(computeLandedCost(input)), 120)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional debounce on input
  }, [input, open, isDialog])

  const formulas = result ? getFormulaDocs(result.tax.rates) : null
  const tariff = TARIFF_PROFILES[input.tariffProfileId]

  const formPanel = (
    <CostCalculatorFormPanel
      input={input}
      setInput={setInput}
      applySku={applySku}
      tariff={tariff}
      onCompute={() => runCompute()}
      onOpenCopilot={() => setCopilotOpen(true)}
      copilotHint={copilotHint}
      computeLabel={isDialog ? '一键测算' : '一键测算'}
      showCopilotButton={!isDialog}
    />
  )

  if (isDialog) {
    return <div className="space-y-4">{formPanel}</div>
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Calculator className="size-4 text-primary" />
        <span>
          {input.title} · 税率表 {result?.meta.tariffTableVersion ?? 'v2026.10-mock'} · 汇率{' '}
          {result?.meta.fxRateDate ?? '2026-10-21'} · 估算·需报关/法务复核
        </span>
        <Badge variant="secondary">示例</Badge>
        <Badge variant="outline">待复核</Badge>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">{formPanel}</div>
        <div className="space-y-4">
          <CostCalculatorResultsPanel
            input={input}
            result={result}
            formulas={formulas}
            formulasOpen={formulasOpen}
            onFormulasOpenChange={setFormulasOpen}
          />
        </div>
      </div>
    </div>
  )
}

function CostCalculatorFormPanel({
  input,
  setInput,
  applySku,
  tariff,
  onCompute,
  onOpenCopilot,
  copilotHint,
  computeLabel,
  showCopilotButton,
}: {
  input: CostCalculatorInput
  setInput: React.Dispatch<React.SetStateAction<CostCalculatorInput>>
  applySku: (sku: string) => void
  tariff: (typeof TARIFF_PROFILES)[TariffProfileId]
  onCompute: () => void
  onOpenCopilot: () => void
  copilotHint: string | null
  computeLabel: string
  showCopilotButton: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">输入（少打字 · 预设优先）</CardTitle>
        <CardDescription className="text-xs">
          从 MOCK SKU 选择即可预填 FOB / 箱规 / HS 档
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>SKU</Label>
          <Select
            value={input.sku}
            onValueChange={(sku) => {
              if (sku) applySku(sku)
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="选择 SKU" />
            </SelectTrigger>
            <SelectContent>
              {MOCK_COST_CALC_PRESETS.map((p) => (
                <SelectItem key={p.sku} value={p.sku}>
                  {p.sku} · {p.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>海运模式</Label>
          <ToggleGroup
            type="single"
            value={input.freightMode}
            onValueChange={(v) => {
              if (v === 'LCL' || v === 'FCL20' || v === 'FCL40') {
                setInput((s) => ({ ...s, freightMode: v as FreightMode }))
              }
            }}
            variant="outline"
            size="sm"
            spacing={0}
            className="flex flex-wrap"
          >
            <ToggleGroupItem value="LCL" className="px-3 text-xs">
              LCL 拼柜
            </ToggleGroupItem>
            <ToggleGroupItem value="FCL20" className="px-3 text-xs">
              FCL 20&apos;
            </ToggleGroupItem>
            <ToggleGroupItem value="FCL40" className="px-3 text-xs">
              FCL 40&apos;
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label>HS / 税率档</Label>
            <Badge variant="outline" className="text-[10px]">
              示例·待复核
            </Badge>
          </div>
          <ToggleGroup
            type="single"
            value={input.tariffProfileId}
            onValueChange={(v) => {
              if (v === 'apparel' || v === 'electronics' || v === 'home_sports') {
                setInput((s) => ({ ...s, tariffProfileId: v as TariffProfileId }))
              }
            }}
            variant="outline"
            size="sm"
            spacing={0}
            className="flex flex-wrap"
          >
            {(Object.keys(TARIFF_PROFILES) as TariffProfileId[]).map((id) => (
              <ToggleGroupItem key={id} value={id} className="px-2.5 text-xs">
                {TARIFF_PROFILES[id].labelZh}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-[11px] text-muted-foreground">
            HS 示意 {tariff.hsHint} · Customs {(tariff.customs * 100).toFixed(0)}% / CESS{' '}
            {(tariff.cess * 100).toFixed(0)}% / PAL {(tariff.pal * 100).toFixed(0)}% / VAT{' '}
            {(tariff.vat * 100).toFixed(0)}% / SSCL {(tariff.sscl * 100).toFixed(1)}%
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>目标净利率 {input.targetNetMarginPct}%</Label>
            <div className="flex gap-1">
              {[15, 20, 25].map((pct) => (
                <Button
                  key={pct}
                  type="button"
                  size="sm"
                  variant={input.targetNetMarginPct === pct ? 'default' : 'secondary'}
                  className="h-7 px-2 text-xs"
                  onClick={() => setInput((s) => ({ ...s, targetNetMarginPct: pct }))}
                >
                  {pct}%
                </Button>
              ))}
            </div>
          </div>
          <Slider
            min={5}
            max={40}
            step={1}
            value={[input.targetNetMarginPct]}
            onValueChange={(v) =>
              setInput((s) => ({ ...s, targetNetMarginPct: v[0] ?? s.targetNetMarginPct }))
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="fob">FOB / 件 (USD)</Label>
            <Input
              id="fob"
              type="number"
              step="0.01"
              min={0}
              value={input.fobUnit}
              onChange={(e) =>
                setInput((s) => ({ ...s, fobUnit: Number(e.target.value) || 0 }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="units">件数</Label>
            <Input
              id="units"
              type="number"
              step="1"
              min={1}
              value={input.units}
              onChange={(e) =>
                setInput((s) => ({
                  ...s,
                  units: Math.max(1, Math.floor(Number(e.target.value) || 1)),
                }))
              }
            />
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          箱规已预填：{input.cartonLcm}×{input.cartonWcm}×{input.cartonHcm} cm ·{' '}
          {input.unitsPerCarton} 件/箱 · 头程 {input.firstMileTotal} USD · 清关杂费{' '}
          {input.clearanceMiscTotal} USD
        </p>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onCompute}>
            {computeLabel}
          </Button>
          {showCopilotButton ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={onOpenCopilot}
            >
              <Sparkles className="size-3.5" />
              打开助手
            </Button>
          ) : null}
        </div>
        {copilotHint ? (
          <p className="rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
            {copilotHint}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function CostCalculatorResultsPanel({
  input,
  result,
  formulas,
  formulasOpen,
  onFormulasOpenChange,
}: {
  input: CostCalculatorInput
  result: CostCalculatorResult | null
  formulas: ReturnType<typeof getFormulaDocs> | null
  formulasOpen: boolean
  onFormulasOpenChange: (open: boolean) => void
}) {
  if (!result) {
    return (
      <Card>
        <CardContent className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          点击「一键测算」查看到仓瀑布与建议售价
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Kpi label="到仓 / 件" value={formatUsd(result.landedUnit, 2)} />
        <Kpi
          label="建议售价"
          value={result.suggestPrice != null ? formatUsd(result.suggestPrice) : '—'}
          hint={result.suggestPriceError ?? undefined}
        />
        <Kpi
          label="净利率"
          value={result.netMarginPct != null ? `${result.netMarginPct}%` : '—'}
        />
        <Kpi label="海运模式" value={input.freightMode} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">到仓成本瀑布</CardTitle>
          <CardDescription className="text-xs">
            单件 → 合计 · CIF {formatUsd(result.tax.cifTotalUsd)}（
            {result.tax.cifTotalLkr.toLocaleString()} LKR）
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>项</TableHead>
                <TableHead className="text-right">/件</TableHead>
                <TableHead className="text-right">合计</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.waterfall.map((line) => (
                <TableRow key={line.id}>
                  <TableCell className="text-xs">
                    <span className="font-medium">{line.labelZh}</span>
                    <span className="ml-1 text-muted-foreground">({line.labelEn})</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {line.unitUsd.toFixed(3)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {line.totalUsd.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-medium">
                <TableCell className="text-xs">到仓合计 landed</TableCell>
                <TableCell className="text-right tabular-nums text-xs">
                  {result.landedUnit.toFixed(3)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-xs">
                  {result.landedTotal.toFixed(2)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">LCL vs FCL 对比</CardTitle>
          <CardDescription className="text-xs">{result.comparison.noteZh}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>模式</TableHead>
                <TableHead className="text-right">运费合计</TableHead>
                <TableHead className="text-right">/件</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(
                [
                  ['LCL', result.comparison.lclOceanTotal],
                  ['FCL20', result.comparison.fcl20OceanTotal],
                  ['FCL40', result.comparison.fcl40OceanTotal],
                ] as const
              ).map(([mode, total]) => (
                <TableRow
                  key={mode}
                  className={cn(mode === result.comparison.preferred && 'bg-primary/5')}
                >
                  <TableCell className="text-xs font-medium">
                    {mode}
                    {mode === result.comparison.preferred ? (
                      <Badge variant="secondary" className="ml-2 text-[10px]">
                        更优
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {total.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {(total / result.input.units).toFixed(3)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {result.grossMarginOnLandedPct != null ? (
        <p className="text-[11px] text-muted-foreground">
          毛利率（相对 landed、未扣平台费）{result.grossMarginOnLandedPct}% · 净利率（经营主口径）
          {result.netMarginPct}% · CBM {result.cbmTotal.toFixed(3)} · {result.cartons} 箱
        </p>
      ) : null}

      {formulas ? (
        <Collapsible open={formulasOpen} onOpenChange={onFormulasOpenChange}>
          <Card>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div>
                  <p className="text-sm font-semibold">{formulas.titleZh}</p>
                  <p className="text-xs text-muted-foreground">
                    税叠顺序与建议售价公式 · 决策透明
                  </p>
                </div>
                <ChevronDown
                  className={cn(
                    'size-4 shrink-0 text-muted-foreground transition-transform',
                    formulasOpen && 'rotate-180',
                  )}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-2 border-t pt-3">
                {formulas.lines.map((line) => (
                  <div key={line.en} className="rounded-md bg-muted/50 px-2 py-1.5">
                    <p className="text-xs">{line.zh}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">{line.en}</p>
                  </div>
                ))}
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  {result.meta.disclaimerZh}
                </p>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      ) : null}
    </>
  )
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <Card>
      <CardHeader className="pb-1 pt-3">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="pb-3">
        <p className="text-lg font-semibold tabular-nums leading-none">{value}</p>
        {hint ? <p className="mt-1 text-[10px] text-destructive">{hint}</p> : null}
      </CardContent>
    </Card>
  )
}
