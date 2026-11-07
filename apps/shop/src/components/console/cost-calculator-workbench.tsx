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
  type CostCalcRuntime,
  type CostCalculatorInput,
  type CostCalculatorResult,
  type FeeResolutionOverrides,
  type FreightMode,
  type TariffProfileId,
} from '@/lib/crossborder/cost-calculator'
import { adaptResolvedFromDto } from '@/lib/crossborder/fee-template-store'
import { trpc } from '@/lib/trpc/client'
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
    airVolumetricDivisor: 6000,
    airQuoteIncludesTax: true,
    freightMode: 'LCL',
    tariffProfileId: preset.tariffProfileId,
    platform: 'daraz',
    country: 'LK',
    fulfillmentPool: 'daraz_lk_sea_lot',
    fulfillmentLogistics: '',
    asOf: new Date().toISOString().slice(0, 10),
    clearanceMiscTotal: preset.clearanceMiscTotal,
    targetNetMarginPct: preset.defaultMarginPct,
    platformCommissionPct: preset.platformCommissionPct,
    paymentFeePct: preset.paymentFeePct,
    adsPct: 0,
    lastMileUnit: preset.lastMileUnit,
    manualFreightTotal: null,
    cartonSpecCode: '',
    cartonSpecSource: 'manual',
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
      hint = `已切换运输方案为 ${action.mode}`
      break
    case 'set_margin':
      next = { ...prev, targetNetMarginPct: action.pct }
      hint = `已设定目标净利率 ${action.pct}%`
      break
    case 'set_tariff':
      next = { ...prev, tariffProfileId: action.profileId }
      hint = `已套用税率档「${TARIFF_PROFILES[action.profileId].labelZh}」（费用模板 formulaProfile · 待复核）`
      break
    case 'compare_lcl_fcl':
      next = { ...prev, freightMode: prev.freightMode === 'LCL' ? 'FCL20' : 'LCL' }
      hint = '已切换 LCL / FCL；右侧对比运费口径可能不同，不可直接判优'
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
  const oceanLotsQuery = trpc.ocean.list.useQuery({ page: 1, pageSize: 50 })
  const oceanLots = oceanLotsQuery.data?.items ?? []
  const cartonSpecsQuery = trpc.cartonSpecs.list.useQuery({ page: 1, pageSize: 100, status: '启用' })
  const cartonSpecs = cartonSpecsQuery.data?.items ?? []
  const fxResolveQ = trpc.fxRates.resolve.useQuery(
    {
      baseCurrency: 'USD',
      quoteCurrency: 'LKR',
      asOf: input.asOf,
      platform: input.platform || undefined,
    },
    { retry: false },
  )
  const freightBundleQ = trpc.freightRateCards.resolveBundle.useQuery({ asOf: input.asOf })
  const [lotId, setLotId] = React.useState('')
  React.useEffect(() => {
    if (!lotId && oceanLots[0]?.id) setLotId(oceanLots[0].id)
  }, [oceanLots, lotId])

  const seedQuery = trpc.dashboard.costCalcSeed.useQuery(
    { sku: input.sku },
    { enabled: Boolean(input.sku) },
  )
  const seedAppliedRef = React.useRef<string>('')
  React.useEffect(() => {
    const seed = seedQuery.data
    if (!seed || seedAppliedRef.current === `${seed.sku}:${seed.fromSkuCost}`) return
    seedAppliedRef.current = `${seed.sku}:${seed.fromSkuCost}`
    if (!seed.fromSkuCost && seed.fobUnit <= 0) return
    setInput((prev) => ({
      ...prev,
      sku: seed.sku || prev.sku,
      title: seed.title || prev.title,
      fobUnit: seed.fobUnit > 0 ? seed.fobUnit : prev.fobUnit,
      platformCommissionPct:
        seed.platformCommissionPct != null ? seed.platformCommissionPct : prev.platformCommissionPct,
    }))
    setCopilotHint(seed.note)
  }, [seedQuery.data])
  const [saveHint, setSaveHint] = React.useState<string | null>(null)
  const saveOceanCostMutation = trpc.ocean.saveCost.useMutation({
    onSuccess: (row) => {
      setSaveHint(
        `已写入 DB ${row.id} · 到仓 ${row.landedUnitCost ?? row.amount} ${row.currency}/件 · 费用模板版本 ${row.feeTemplateVersionId ?? '—'}`,
      )
    },
    onError: (e) => setSaveHint(e.message),
  })
  const skuCostQuery = trpc.finance.getSkuCostBySku.useQuery(
    { sku: input.sku },
    { enabled: Boolean(input.sku), retry: false },
  )
  const skuVersions = (skuCostQuery.data?.versions ?? []).map((v) => ({
    id: v.id,
    versionNo: v.versionNo,
    lotCode: v.containerLotId || '—',
    landedUnitCost: v.landedUnitCost ?? v.amount,
    effectiveFrom: v.effectiveFrom,
  }))

  const logisticsForResolve = React.useMemo(() => {
    if (input.fulfillmentLogistics) return input.fulfillmentLogistics
    if (input.freightMode === 'AIR_DDP') return 'AIR_DDP'
    if (input.freightMode === 'LCL') return 'LCL'
    if (input.freightMode === 'FCL20' || input.freightMode === 'FCL40') return 'FCL'
    return 'FCL'
  }, [input.fulfillmentLogistics, input.freightMode])

  const resolveBase = {
    platform: input.platform || 'daraz',
    country: input.country || 'LK',
    fulfillmentPool: input.fulfillmentPool,
    fulfillmentLogistics: logisticsForResolve,
    asOf: input.asOf,
    formulaProfile: input.tariffProfileId,
  } as const

  const importResolveQ = trpc.feeTemplates.resolve.useQuery({
    ...resolveBase,
    type: 'import_tax' as const,
    templateCodeOrId: input.importTaxTemplateId,
  })
  const platformResolveQ = trpc.feeTemplates.resolve.useQuery({
    ...resolveBase,
    type: 'platform_fee' as const,
    templateCodeOrId: input.platformFeeTemplateId,
  })

  const feeOverrides = React.useMemo((): FeeResolutionOverrides | undefined => {
    const importTax = importResolveQ.data
      ? adaptResolvedFromDto(importResolveQ.data)
      : null
    const platformFee = platformResolveQ.data
      ? adaptResolvedFromDto(platformResolveQ.data)
      : null
    if (!importTax && !platformFee) return undefined
    return { importTax, platformFee }
  }, [importResolveQ.data, platformResolveQ.data])

  const feeOverridesRef = React.useRef(feeOverrides)
  React.useEffect(() => {
    feeOverridesRef.current = feeOverrides
  }, [feeOverrides])

  const runtime = React.useMemo((): CostCalcRuntime => {
    const fx = fxResolveQ.data
    return {
      fxUsdLkr: fx?.rate ?? null,
      fxRateDate: fx?.effectiveDate ?? null,
      fxRateId: fx?.id ?? null,
      freightRates: freightBundleQ.data?.bundle ?? null,
    }
  }, [fxResolveQ.data, freightBundleQ.data])
  const runtimeRef = React.useRef(runtime)
  React.useEffect(() => {
    runtimeRef.current = runtime
  }, [runtime])

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
      setResult(computeLandedCost(src, feeOverridesRef.current, runtimeRef.current))
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
    if (!isDialog) setResult(computeLandedCost(next, feeOverridesRef.current, runtimeRef.current))
  }, [open, initialSku, isDialog])

  React.useEffect(() => {
    if (!open) lastSkuRef.current = undefined
  }, [open])

  // Page: consume dialog draft（会话交接）+ pending copilot actions
  React.useEffect(() => {
    if (isDialog) return
    const draft = readCostCalcDraft()
    if (draft && (!initialSku || draft.sku === initialSku)) {
      const base = presetToInput(getCostCalcPreset(draft.sku), draft)
      setInput(base)
      if (draft.autoCompute !== false) {
        setResult(computeLandedCost(base, feeOverridesRef.current, runtimeRef.current))
      }
      clearCostCalcDraft()
      lastSkuRef.current = draft.sku
      setCopilotHint('已恢复会话草稿；正式成本仅写入 sku_costs（经 ocean.saveCost）')
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
        setResult(computeLandedCost(cur, feeOverridesRef.current, runtimeRef.current))
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
        setResult(computeLandedCost(next, feeOverridesRef.current, runtimeRef.current))
        return next
      })
    })
  }, [isDialog])

  // Smooth auto-recalc when controls change (after first result; page only)
  React.useEffect(() => {
    if (isDialog || !open || result === null) return
    const t = window.setTimeout(() => setResult(computeLandedCost(input, feeOverridesRef.current, runtimeRef.current)), 120)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional debounce on input / feeOverrides
  }, [input, open, isDialog, feeOverrides])

  const formulas = result ? getFormulaDocs(result.tax.rates) : null
  const tariff = TARIFF_PROFILES[input.tariffProfileId]

  const handleSaveVersion = React.useCallback(() => {
    if (!result || !lotId) {
      setSaveHint('请先测算并选择柜次')
      return
    }
    if (!result.meta.canPublishFormal) {
      setSaveHint(`不可发布正式成本：${result.meta.blockReasons.join('；')}`)
      return
    }
    const lot = oceanLots.find((row) => row.id === lotId)
    if (!lot) {
      setSaveHint('柜次不存在（请先创建海运柜次）')
      return
    }
    saveOceanCostMutation.mutate({
      shipmentId: lot.id,
      sku: input.sku,
      amount: result.landedUnit,
      landedUnitCost: result.landedUnit,
      currency: 'USD',
      feeTemplateVersionId: result.meta.feeTemplateVersionId,
      taxTemplateCode: result.meta.feeTemplateCode,
      taxBreakdown: {
        pal: result.tax.pal,
        cess: result.tax.cess,
        vat: result.tax.vat,
        sscl: result.tax.sscl,
        customs: result.tax.customs,
      },
      calculatorSnapshot: {
        freightMode: input.freightMode,
        waterfall: result.waterfall,
        components: result.meta.componentsSnapshot,
        fxRateId: result.meta.fxRateId,
        fxUsdLkr: result.meta.fxUsdLkr,
        freightSource: result.meta.freightSource,
        cartonSpecCode: input.cartonSpecCode || null,
        cartonSpecSource: result.meta.cartonSpecSource,
      },
      note: `柜次 ${lot.lotCode} 正式成本`,
      fxRateId: result.meta.fxRateId,
    })
  }, [input, result, lotId, oceanLots, saveOceanCostMutation])

  const formPanel = (
    <CostCalculatorFormPanel
      input={input}
      setInput={setInput}
      applySku={applySku}
      tariff={tariff}
      cartonSpecs={cartonSpecs}
      fxHint={
        fxResolveQ.data
          ? `汇率 ${fxResolveQ.data.effectiveDate} · 1 USD = ${fxResolveQ.data.rate} LKR`
          : fxResolveQ.isError
            ? '缺少有效 USD→LKR 汇率（设置/汇率配置）'
            : '加载汇率…'
      }
      freightHint={
        freightBundleQ.data?.bundle?.code
          ? `运价卡 ${freightBundleQ.data.bundle.versionLabel}`
          : '未配置运价卡（可填手工运费总额）'
      }
      onCompute={() => runCompute()}
      onOpenCopilot={() => setCopilotOpen(true)}
      copilotHint={copilotHint}
      computeLabel="一键测算"
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
          {input.title} · 费用模板 {result?.meta.feeTemplateCode ?? result?.meta.tariffTableVersion ?? '未解析'} · 汇率{' '}
          {result?.meta.fxRateDate ?? '—'}
          {result?.meta.fxUsdLkr ? `（1 USD = ${result.meta.fxUsdLkr} LKR）` : ''}
        </span>
        {result?.meta.canPublishFormal ? (
          <Badge variant="secondary">可发布正式成本</Badge>
        ) : (
          <Badge variant="outline">草稿 · 不可正式保存</Badge>
        )}
        <Badge variant="outline">需报关/法务复核</Badge>
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
            lotId={lotId}
            onLotIdChange={setLotId}
            oceanLots={oceanLots}
            onSaveVersion={handleSaveVersion}
            saveHint={saveHint}
            versions={skuVersions}
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
  cartonSpecs,
  fxHint,
  freightHint,
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
  cartonSpecs: Array<{
    id: string
    code: string
    name: string
    lengthCm: number | string
    widthCm: number | string
    heightCm: number | string
    grossWeightKg: number | string
    unitsPerCarton: number
  }>
  fxHint: string
  freightHint: string
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
            选择 SKU 预填 FOB / 箱规 / 公式档案；正式保存需费用模板 + 汇率 + 运价卡/手工运费
          </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-muted-foreground">
          正式成本仅经「保存柜次成本」写入 sku_costs。未命中费用模板或缺汇率/运价时只能草稿测算，不可发布。
        </div>
        <div className="space-y-1.5">
          <Label>货号 SKU</Label>
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
          <Label>运输情景</Label>
          <ToggleGroup
            type="single"
            value={input.freightMode}
            onValueChange={(v) => {
              if (v === 'AIR_DDP' || v === 'LCL' || v === 'FCL20' || v === 'FCL40') {
                setInput((s) => ({ ...s, freightMode: v as FreightMode }))
              }
            }}
            variant="outline"
            size="sm"
            spacing={0}
            className="flex flex-wrap"
          >
            <ToggleGroupItem value="AIR_DDP" className="px-3 text-xs">
              空运 DDP
            </ToggleGroupItem>
            <ToggleGroupItem value="LCL" className="px-3 text-xs">
              海运 LCL
            </ToggleGroupItem>
            <ToggleGroupItem value="FCL20" className="px-3 text-xs">
              海运 FCL 20&apos;
            </ToggleGroupItem>
            <ToggleGroupItem value="FCL40" className="px-3 text-xs">
              海运 FCL 40&apos;
            </ToggleGroupItem>
          </ToggleGroup>
          <div className="rounded-md border bg-muted/30 p-2 text-[11px] text-muted-foreground">
            {input.freightMode === 'AIR_DDP'
              ? '空运 DDP：按实重/材积重较高者与最低收费；含税范围以运价卡/货代报价为准。'
              : input.freightMode === 'LCL'
                ? '海运 LCL：按 CBM/计费吨取高并加附加费（运价卡）；不含进口税费。'
                : '海运 FCL：按整柜价及 THC 分摊（运价卡）；不含进口税费，需检查柜容。'}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label>HS / 税率档（费用模板 formulaProfile）</Label>
            <Badge variant="outline" className="text-[10px]">
              费用模板·待复核
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
            HS 示意 {tariff.hsHint} · 关税 {(tariff.customs * 100).toFixed(0)}% / CESS{' '}
            {(tariff.cess * 100).toFixed(0)}% / PAL {(tariff.pal * 100).toFixed(0)}% / VAT{' '}
            {(tariff.vat * 100).toFixed(0)}% / SSCL {(tariff.sscl * 100).toFixed(1)}%
            （按平台+国家+履约+asOf 解析费用模板版本）
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">平台</Label>
              <Select
                value={input.platform}
                onValueChange={(v) => {
                  if (v) setInput((s) => ({ ...s, platform: v }))
                }}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daraz">Daraz</SelectItem>
                  <SelectItem value="lazada">Lazada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">国家</Label>
              <Select
                value={input.country}
                onValueChange={(v) => {
                  if (v) setInput((s) => ({ ...s, country: v }))
                }}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LK">LK</SelectItem>
                  <SelectItem value="MY">MY</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-[11px]">履约池</Label>
              <Select
                value={input.fulfillmentPool}
                onValueChange={(v) => {
                  if (v) setInput((s) => ({ ...s, fulfillmentPool: v }))
                }}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daraz_lk_sea_lot">daraz_lk_sea_lot</SelectItem>
                  <SelectItem value="lazada_cn_spot_xmn">lazada_cn_spot_xmn</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
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
            <Label htmlFor="fob">FOB 单价（USD / 件）</Label>
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

        {input.freightMode === 'AIR_DDP' ? (
          <div className="space-y-3 rounded-md border p-3">
            <div className="space-y-1.5">
              <Label htmlFor="air-divisor">材积系数（必须以货代/运价卡为准）</Label>
              <Input id="air-divisor" type="number" min={1} step={1} value={input.airVolumetricDivisor} onChange={(event) => setInput((s) => ({ ...s, airVolumetricDivisor: Math.max(1, Number(event.target.value) || 1) }))} />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={input.airQuoteIncludesTax} onChange={(event) => setInput((s) => ({ ...s, airQuoteIncludesTax: event.target.checked }))} />
              DDP 报价已含进口税（开关；须核对运价卡/货代真实范围）
            </label>
          </div>
        ) : null}

        <p className="text-[11px] text-muted-foreground">
          箱规已预填：{input.cartonLcm}×{input.cartonWcm}×{input.cartonHcm} cm ·{' '}
          {input.unitsPerCarton} 件/箱 · 头程 {input.firstMileTotal} USD · 清关杂费{' '}
          {input.clearanceMiscTotal} USD
        </p>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onCompute}>

      <div className="space-y-2 rounded-md border p-3">
        <p className="text-xs text-muted-foreground">{fxHint}</p>
        <p className="text-xs text-muted-foreground">{freightHint}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>箱规主档</Label>
            <Select
              value={input.cartonSpecCode || '__manual__'}
              onValueChange={(value) => {
                if (value === '__manual__') {
                  setInput((prev) => ({ ...prev, cartonSpecCode: '', cartonSpecSource: 'manual' }))
                  return
                }
                const spec = cartonSpecs.find((c) => c.code === value)
                if (!spec) return
                setInput((prev) => ({
                  ...prev,
                  cartonSpecCode: spec.code,
                  cartonSpecSource: 'master',
                  cartonLcm: Number(spec.lengthCm) || prev.cartonLcm,
                  cartonWcm: Number(spec.widthCm) || prev.cartonWcm,
                  cartonHcm: Number(spec.heightCm) || prev.cartonHcm,
                  kgPerCarton: Number(spec.grossWeightKg) || prev.kgPerCarton,
                  unitsPerCarton: Number(spec.unitsPerCarton) || prev.unitsPerCarton,
                }))
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择箱规或手工" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__manual__">手工录入尺寸</SelectItem>
                {cartonSpecs.map((c) => (
                  <SelectItem key={c.id} value={c.code}>
                    {c.code} · {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {input.cartonSpecSource === 'manual' ? (
              <p className="text-[11px] text-amber-700">手工尺寸（未引用箱规主档）</p>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="manual-freight">手工运费总额 USD（可选）</Label>
            <Input
              id="manual-freight"
              type="number"
              step="0.01"
              value={input.manualFreightTotal ?? ''}
              placeholder="留空则用运价卡"
              onChange={(e) => {
                const v = e.target.value
                setInput((prev) => ({
                  ...prev,
                  manualFreightTotal: v === '' ? null : Number(v),
                }))
              }}
            />
          </div>
        </div>
      </div>

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
  lotId,
  onLotIdChange,
  oceanLots,
  onSaveVersion,
  saveHint,
  versions,
}: {
  input: CostCalculatorInput
  result: CostCalculatorResult | null
  formulas: ReturnType<typeof getFormulaDocs> | null
  formulasOpen: boolean
  onFormulasOpenChange: (open: boolean) => void
  lotId: string
  onLotIdChange: (id: string) => void
  oceanLots: Array<{ id: string; lotCode: string; status: string; containerNo: string }>
  onSaveVersion: () => void
  saveHint: string | null
  versions: Array<{
    id: string
    versionNo: number
    lotCode: string
    landedUnitCost: number
    effectiveFrom: string
  }>
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
      <div className="grid grid-cols-4 gap-2">
        <Kpi label="到仓成本 / 件" value={formatUsd(result.landedUnit, 2)} hint={result.meta.canPublishFormal ? "可正式保存" : "草稿"} />
        <Kpi
          label="建议售价"
          value={result.suggestPrice != null ? formatUsd(result.suggestPrice) : '—'}
          hint={result.suggestPriceError ?? undefined}
        />
        <Kpi
          label="经营净利率（估算）"
          value={result.netMarginPct != null ? `${result.netMarginPct}%` : '—'}
        />
        <Kpi label="运输情景" value={input.freightMode} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">保存为柜次成本版本（F32）</CardTitle>
          <CardDescription className="text-xs">
            主路径写入 PostgreSQL sku_costs（container_lot_id）；并保留本机快照便于成本页浏览
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">关联海运柜次</Label>
            <Select value={lotId} onValueChange={onLotIdChange}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="选择柜次" />
              </SelectTrigger>
              <SelectContent>
                {oceanLots.map((lot) => (
                  <SelectItem key={lot.id} value={lot.id}>
                    {lot.lotCode} · {lot.status} · {lot.containerNo || '无柜号'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={onSaveVersion} disabled={!lotId || !result.meta.canPublishFormal}>
              保存正式柜次成本
            </Button>
            {!result.meta.canPublishFormal ? (
              <Badge variant="outline">缺：{result.meta.blockReasons[0] || '条件未满足'}</Badge>
            ) : null}
          </div>
          {saveHint ? <p role="status" className="text-xs text-muted-foreground">{saveHint}</p> : null}
          {versions.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>版本</TableHead>
                    <TableHead>柜次</TableHead>
                    <TableHead className="text-right">到仓/件</TableHead>
                    <TableHead>生效</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {versions.slice(0, 5).map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-mono text-xs">v{v.versionNo}</TableCell>
                      <TableCell className="text-xs">{v.lotCode}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{v.landedUnitCost.toFixed(2)}</TableCell>
                      <TableCell className="text-xs">{v.effectiveFrom}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">该 SKU 尚无柜次成本版本。</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">费用瀑布</CardTitle>
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
                <TableCell className="text-xs">到仓成本合计 landed</TableCell>
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
          <CardTitle className="text-sm">空运 DDP / 海运 LCL / 海运 FCL 对比</CardTitle>
          <CardDescription className="text-xs">{result.comparison.noteZh} {result.comparison.nonComparableReason}</CardDescription>
        </CardHeader>
        <CardContent className="pt-0 text-xs text-muted-foreground">
          空运 DDP 计费重 {result.chargeableWeightKg.toFixed(2)} kg · {result.freightIncludesTax ? '当前情景将税项设为已包含，避免重复计算' : '当前情景不假设运价含税'} · 运费来源 {result.meta.freightSource}。
          {result.comparison.exceedsFcl20 || result.comparison.exceedsFcl40 ? ` 当前体积 ${result.cbmTotal.toFixed(2)} CBM 超过柜容，FCL 金额已按${result.comparison.fcl20Containers}个20尺柜 / ${result.comparison.fcl40Containers}个40尺柜估算。` : ''}
          {' '}表内 FCL20/FCL40 金额均按整批多柜数量计算；未含其他港口/清关费用。
        </CardContent>
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
                  ['AIR_DDP', result.comparison.airDdpTotal, result.comparison.airDdpUnit],
                  ['LCL', result.comparison.lclOceanTotal, result.comparison.lclOceanUnit],
                  ['FCL20', result.comparison.fcl20OceanTotal, result.comparison.fcl20OceanUnit],
                  ['FCL40', result.comparison.fcl40OceanTotal, result.comparison.fcl40OceanUnit],
                ] as const
              ).map(([mode, total, perUnit]) => (
                <TableRow
                  key={mode}
                  className={cn(result.comparison.comparable && mode === result.comparison.preferred && 'bg-primary/5')}
                >
                  <TableCell className="text-xs font-medium">
                    {mode === 'AIR_DDP' ? '空运 DDP' : mode === 'LCL' ? '海运 LCL' : mode === 'FCL20' ? '海运 FCL 20尺' : '海运 FCL 40尺'}
                    {mode === 'AIR_DDP' ? <Badge variant="outline" className="ml-2 text-[10px]">可含税</Badge> : <Badge variant="outline" className="ml-2 text-[10px]">税费另计</Badge>}
                    {mode === 'FCL20' && result.comparison.exceedsFcl20 ? <Badge variant="secondary" className="ml-2 text-[10px]">{result.comparison.fcl20Containers} 柜</Badge> : null}
                    {mode === 'FCL40' && result.comparison.exceedsFcl40 ? <Badge variant="secondary" className="ml-2 text-[10px]">{result.comparison.fcl40Containers} 柜</Badge> : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {total.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {perUnit.toFixed(3)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {result.grossMarginOnLandedPct != null ? (
        <p className="text-[11px] text-muted-foreground">
          毛利率（相对到仓成本、未扣平台费）{result.grossMarginOnLandedPct}% · 经营净利率（估算）
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
    <Card size="sm">
      <CardHeader className="pb-0">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-base font-semibold tabular-nums leading-tight">{value}</p>
        {hint ? <p className="mt-0.5 text-[10px] text-destructive">{hint}</p> : null}
      </CardContent>
    </Card>
  )
}
