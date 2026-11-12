"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { Calculator, Copy, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Progress } from "@workspace/ui/components/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  defaultFormulaForCountry,
  formulasForCountry,
  FORMULA_LK_UPLIFT_V1,
} from "@workspace/freight"
import { LocaleLink, useLocaleRouter, useLocalePathname } from "@/lib/i18n/navigation"
import { trpc } from "@/lib/trpc/client"

const PLATFORMS = [
  { value: "daraz", label: "Daraz" },
  { value: "lazada", label: "Lazada" },
]

const COUNTRIES = [
  { value: "LK", label: "斯里兰卡" },
  { value: "MY", label: "马来西亚" },
  { value: "SG", label: "新加坡" },
  { value: "ID", label: "印度尼西亚" },
  { value: "TH", label: "泰国" },
  { value: "PH", label: "菲律宾" },
  { value: "VN", label: "越南" },
  { value: "PK", label: "巴基斯坦" },
  { value: "BD", label: "孟加拉" },
]

function money(value: number | null | undefined, currency: string, digits = 2) {
  if (value == null || Number.isNaN(value)) return "—"
  return `${value.toFixed(digits)} ${currency}`
}

export function PricingCalculatorWorkbench({ initialSku }: { initialSku?: string }) {
  const router = useLocaleRouter()
  const pathname = useLocalePathname()
  const searchParams = useSearchParams()
  const skuFromUrl = searchParams.get("sku") || initialSku || ""
  const [skuQuery, setSkuQuery] = React.useState(skuFromUrl)
  const [sku, setSku] = React.useState(skuFromUrl)
  const [platform, setPlatform] = React.useState(searchParams.get("platform") || "daraz")
  const [country, setCountry] = React.useState((searchParams.get("country") || "LK").toUpperCase())
  const [shopId, setShopId] = React.useState(searchParams.get("shopId") || "")
  const [marginText, setMarginText] = React.useState(searchParams.get("margin") || "")
  const [formulaVersion, setFormulaVersion] = React.useState<string | undefined>(
    searchParams.get("formula") || undefined,
  )
  const formulaOptions = formulasForCountry(country)
  const resolvedFormula =
    formulaVersion && formulaOptions.some((f) => f.id === formulaVersion)
      ? formulaVersion
      : (defaultFormulaForCountry(country) ?? undefined)
  const [useEstimate, setUseEstimate] = React.useState(searchParams.get("estimate") === "1")
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [showBreakdown, setShowBreakdown] = React.useState(false)
  const [tempWarehouse, setTempWarehouse] = React.useState("")
  const [tempCommission, setTempCommission] = React.useState("")
  const [tempPayout, setTempPayout] = React.useState("")
  const [applyTemp, setApplyTemp] = React.useState(false)
  const [gapHs, setGapHs] = React.useState("")
  const [gapWeight, setGapWeight] = React.useState("")
  const [gapCarton, setGapCarton] = React.useState("")

  const targetMarginPct = marginText.trim() ? Number(marginText) : undefined
  const temporaryFees = applyTemp
    ? {
        warehousePct: tempWarehouse.trim() ? Number(tempWarehouse) : undefined,
        commissionPct: tempCommission.trim() ? Number(tempCommission) : undefined,
        payoutPct: tempPayout.trim() ? Number(tempPayout) : undefined,
      }
    : undefined

  const suggestQuery = trpc.pricing.suggest.useQuery(
    {
      sku,
      platform,
      country,
      shopId: shopId || undefined,
      targetMarginPct: Number.isFinite(targetMarginPct) ? targetMarginPct : undefined,
      formulaVersion: resolvedFormula as typeof formulaOptions[number]["id"] | undefined,
      useFreightRateCardEstimate: useEstimate,
      temporaryFees,
    },
    { enabled: Boolean(sku), retry: false },
  )
  const search = trpc.pricing.searchSkus.useQuery(
    { q: skuQuery, page: 1, pageSize: 8 },
    { enabled: skuQuery.trim().length >= 1, staleTime: 10_000 },
  )
  const cartonQuery = trpc.cartonSpecs.list.useQuery({ page: 1, pageSize: 100, status: "启用" })
  const patchMutation = trpc.pricing.patchSkuMaster.useMutation({
    onSuccess: async () => {
      toast.success("已写回 SKU 主档并重算")
      await suggestQuery.refetch()
    },
    onError: (err) => toast.error(err.message),
  })
  const [attachTemplateId, setAttachTemplateId] = React.useState("")
  const historyQuery = trpc.pricing.listDraftHistory.useQuery(
    { sku, platform, site: country, includeArchived: false },
    { enabled: Boolean(sku) },
  )
  const saveDraftMutation = trpc.pricing.saveDraft.useMutation({
    onSuccess: async () => {
      toast.success("已保存为定价建议草稿，不会改刊登售价或发布到平台")
      await historyQuery.refetch()
    },
    onError: (err) => toast.error(err.message),
  })
  const archiveDraftsMutation = trpc.pricing.archiveDrafts.useMutation({
    onSuccess: async () => {
      toast.success("已归档该 SKU 在本站点的建议草稿（软删除，历史仍保留）")
      await historyQuery.refetch()
    },
    onError: (err) => toast.error(err.message),
  })
  const feeTemplatesQuery = trpc.feeTemplates.list.useQuery(
    { page: 1, pageSize: 100, type: "platform_fee" },
    { staleTime: 30_000 },
  )
  const addMatchRuleMutation = trpc.feeTemplates.addMatchRule.useMutation({
    onSuccess: async () => {
      toast.success("已添加匹配规则，正在重算")
      setDrawerOpen(false)
      await suggestQuery.refetch()
    },
    onError: (err) => toast.error(err.message),
  })
  const attachableTemplates = (feeTemplatesQuery.data?.items ?? []).filter(
    (item) =>
      item.platform.toLowerCase() === platform.toLowerCase() &&
      item.country.toUpperCase() === country.toUpperCase() &&
      item.status !== "disabled" &&
      String(item.statusLabel) !== "停用",
  )

  const data = suggestQuery.data
  React.useEffect(() => {
    if (!data) return
    setGapHs(data.sku.hsCode || "")
    setGapWeight(data.sku.netWeightGrams != null ? String(data.sku.netWeightGrams) : "")
    setGapCarton(data.sku.cartonSpecId || "")
    if (!marginText && data.context.targetMarginPct) {
      setMarginText(String(data.context.targetMarginPct))
    }
  }, [data, marginText])

  const syncUrl = React.useCallback(
    (next: { sku?: string; platform?: string; country?: string; shopId?: string }) => {
      const params = new URLSearchParams(searchParams.toString())
      const nextSku = next.sku ?? sku
      if (nextSku) params.set("sku", nextSku)
      params.set("platform", next.platform ?? platform)
      params.set("country", next.country ?? country)
      const sid = next.shopId ?? shopId
      if (sid) params.set("shopId", sid)
      else params.delete("shopId")
      router.replace(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams, sku, platform, country, shopId],
  )

  const copyPrice = async (value: number | null, currency: string) => {
    if (value == null) {
      toast.error("暂无可复制的建议价")
      return
    }
    await navigator.clipboard.writeText(value.toFixed(2))
    toast.success(`已复制 ${value.toFixed(2)} ${currency}`)
  }

  const ready = data?.readiness
  const primary = data?.primary
  const cost = data?.cost
  const sellCurrency = data?.context.sellCurrency ?? "LKR"
  const costCurrency = data?.context.costCurrency ?? "CNY"

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Calculator className="size-5 text-primary" />
          定价建议计算器
        </h2>
        <p className="text-sm text-muted-foreground">
          打开即算。费用来自本组织费用模板，不是平台实时同步。计税公式按所选平台站点的目的国选择，不会把斯里兰卡税栈套到其他国家。缺项会给出估算并标明，不会发布到平台。
        </p>
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-6 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1 xl:col-span-2">
            <Label>SKU</Label>
            <Input
              value={skuQuery}
              placeholder="搜索 SKU / 名称"
              onChange={(e) => setSkuQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && skuQuery.trim()) {
                  setSku(skuQuery.trim())
                  syncUrl({ sku: skuQuery.trim() })
                }
              }}
            />
            {search.data?.items?.length ? (
              <div className="rounded-md border bg-background text-sm">
                {search.data.items.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-muted"
                    onClick={() => {
                      setSkuQuery(item.sku)
                      setSku(item.sku)
                      syncUrl({ sku: item.sku })
                    }}
                  >
                    <span className="font-mono">{item.sku}</span>
                    <span className="truncate text-muted-foreground">{item.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label>平台</Label>
            <Select
              value={platform}
              onValueChange={(v) => {
                setPlatform(v)
                syncUrl({ platform: v })
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>站点</Label>
            <Select
              value={country}
              onValueChange={(v) => {
                setCountry(v)
                syncUrl({ country: v })
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>店铺</Label>
            <Select
              value={shopId || "__none__"}
              onValueChange={(v) => {
                const next = v === "__none__" ? "" : v
                setShopId(next)
                const shop = data?.shops.find((s) => s.id === next)
                if (shop?.platform) setPlatform(shop.platform.toLowerCase())
                if (shop?.country) setCountry(shop.country)
                syncUrl({ shopId: next, platform: shop?.platform?.toLowerCase(), country: shop?.country })
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="可选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">不指定店铺</SelectItem>
                {(data?.shops ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} · {s.platform} {s.country || ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>目标毛利 %</Label>
            <Input
              type="number"
              value={marginText}
              placeholder="来自费用模板，可改"
              onChange={(e) => setMarginText(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>公式</Label>
            <Select
              value={resolvedFormula ?? "__none__"}
              onValueChange={(v) => setFormulaVersion(v === "__none__" ? undefined : v)}
              disabled={formulaOptions.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={formulaOptions.length ? "选择公式" : "该目的国暂无计税公式"} />
              </SelectTrigger>
              <SelectContent>
                {formulaOptions.length === 0 ? (
                  <SelectItem value="__none__">该目的国暂无计税公式</SelectItem>
                ) : (
                  formulaOptions.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.labelZh}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 self-end text-sm">
            <input
              type="checkbox"
              checked={useEstimate}
              onChange={(e) => setUseEstimate(e.target.checked)}
            />
            无柜次时用运价卡估算海运
          </label>
        </CardContent>
      </Card>

      {!sku ? (
        <Alert>
          <AlertTitle>请选择 SKU</AlertTitle>
          <AlertDescription>从商品详情进入会自动带入；也可以在上方搜索选择。</AlertDescription>
        </Alert>
      ) : suggestQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">正在装载主档并计算…</p>
      ) : suggestQuery.error ? (
        <Alert variant="destructive">
          <AlertTitle>无法测算</AlertTitle>
          <AlertDescription>{suggestQuery.error.message}</AlertDescription>
        </Alert>
      ) : data ? (
        <>
          {resolvedFormula === FORMULA_LK_UPLIFT_V1 ? (
            <Alert>
              <AlertTitle>对照公式</AlertTitle>
              <AlertDescription>切换到 lk_uplift_v1 后结果会变，这不是平台官方报价，仅供对照。</AlertDescription>
            </Alert>
          ) : null}
          {data?.context.pendingOfficialDrafts && data.context.pendingOfficialDrafts.length > 0 ? (
            <Alert>
              <AlertTitle>来自官方费率同步草稿（待审核）</AlertTitle>
              <AlertDescription>
                该站点存在尚未发布的官方同步草稿，本次建议价仍{data.context.feeSourceNote}
              </AlertDescription>
            </Alert>
          ) : null}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                数据就绪 {ready?.readyCount ?? 0} / {ready?.readyTotal ?? 0} 已齐
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress
                value={
                  ready && ready.readyTotal > 0 ? (ready.readyCount / ready.readyTotal) * 100 : 0
                }
              />
              <p className="text-xs text-muted-foreground">
                汇率按组织有效汇率换算。{data.context.feeSourceNote}
                {data.fx.missing ? " 当前缺少结算汇率。" : data.fx.costToSellRate != null ? ` 1 ${costCurrency} = ${data.fx.costToSellRate.toFixed(4)} ${sellCurrency}。` : ""}
              </p>
              {ready?.gaps.length ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-amber-700">缺：</span>
                  {ready.gaps.map((gap) => (
                    <Badge key={gap.code} variant="secondary">
                      {gap.labelZh}
                    </Badge>
                  ))}
                  <Button size="sm" variant="outline" onClick={() => setDrawerOpen(true)}>
                    去补全
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">必填项已齐，结果可作上架前建议（仍需业务复核）。</p>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-3 md:grid-cols-5">
            {[
              { label: "采购成本", value: money(cost?.purchaseUnit, costCurrency) },
              { label: "海运分摊", value: money(cost?.freightUnit, costCurrency) },
              { label: "税金合计", value: cost?.tax && typeof cost.tax.taxTotal === "number" ? money(cost.tax.taxTotal, costCurrency) : "—" },
              { label: "到仓成本", value: money(cost?.fullLandedUnit, costCurrency) },
              { label: "成本币种", value: `${costCurrency} / ${sellCurrency}` },
            ].map((item) => (
              <Card key={item.label}>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{item.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            海运：{cost?.freightNote || "未分摊"}。有柜次实际成本时优先于运价卡估算。
            {cost?.purchaseFreightDuty != null ? ` 采购+海运+关税中间值 ${money(cost.purchaseFreightDuty, costCurrency)}。` : ""}
          </p>

          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  本平台建议（{primary?.labelZh}）
                  {primary?.isEstimate ? <Badge variant="secondary">估算</Badge> : <Badge>主结果</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">建议零售价</p>
                    <p className="text-2xl font-semibold tabular-nums">
                      {money(primary?.suggestedRetailSell ?? primary?.suggestedRetailCost, primary?.suggestedRetailSell != null ? sellCurrency : costCurrency)}
                    </p>
                    {primary?.suggestedRetailSell != null && primary.suggestedRetailCost != null ? (
                      <p className="text-xs text-muted-foreground">{money(primary.suggestedRetailCost, costCurrency)}</p>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      包邮建议价{primary?.freeShippingCapped ? "（已按上限回算）" : ""}
                    </p>
                    <p className="text-2xl font-semibold tabular-nums">
                      {money(primary?.suggestedFreeShippingSell ?? primary?.suggestedFreeShippingCost, primary?.suggestedFreeShippingSell != null ? sellCurrency : costCurrency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">预计毛利率</p>
                    <p className="text-lg font-medium tabular-nums">
                      {primary?.expectedMarginPct != null ? `${primary.expectedMarginPct.toFixed(1)}%` : "—"}
                      {primary?.expectedMarginPct != null && data.context.targetMarginPct
                        ? primary.expectedMarginPct + 0.05 >= data.context.targetMarginPct
                          ? " 达标"
                          : " 未达标"
                        : ""}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">预计回款</p>
                    <p className="text-lg font-medium tabular-nums">
                      {money(primary?.expectedPayoutSell ?? primary?.expectedPayoutCost, primary?.expectedPayoutSell != null ? sellCurrency : costCurrency)}
                    </p>
                  </div>
                </div>
                {primary?.error ? <p className="text-sm text-destructive">{primary.error}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyPrice(primary?.suggestedRetailSell ?? primary?.suggestedRetailCost ?? null, primary?.suggestedRetailSell != null ? sellCurrency : costCurrency)}
                  >
                    <Copy className="mr-1 size-3.5" />
                    复制建议价
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowBreakdown((v) => !v)}>
                    {showBreakdown ? "收起明细" : "看明细"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={saveDraftMutation.isPending || (primary?.suggestedRetailSell ?? primary?.suggestedRetailCost) == null}
                    onClick={() => {
                      const price = primary?.suggestedRetailSell ?? primary?.suggestedRetailCost
                      if (price == null) {
                        toast.error("暂无建议价可保存")
                        return
                      }
                      saveDraftMutation.mutate({
                        sku,
                        platform,
                        site: country,
                        suggestedRetail: price,
                        suggestedFreeShipping: primary?.suggestedFreeShippingSell ?? primary?.suggestedFreeShippingCost,
                        currency: primary?.suggestedRetailSell != null ? sellCurrency : costCurrency,
                        isEstimate: Boolean(primary?.isEstimate),
                        source: "calculator",
                        snapshot: {
                          formulaVersion: data?.context.formulaVersion,
                          gaps: data?.readiness.gaps ?? [],
                          feeTemplateCode: primary?.feeTemplateCode,
                          landedUnit: data?.cost.fullLandedUnit,
                        },
                      })
                    }}
                  >
                    保存为草稿
                  </Button>
                </div>
                {historyQuery.data?.length ? (
                  <div className="rounded-md border p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">本站点草稿历史</p>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={archiveDraftsMutation.isPending}
                        onClick={() => archiveDraftsMutation.mutate({ sku, platform, site: country })}
                      >
                        归档当前草稿
                      </Button>
                    </div>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {historyQuery.data.map((draft) => (
                        <li key={draft.id}>
                          v{draft.versionNo} · {draft.status === "current" ? "当前" : draft.status === "superseded" ? "已被替代" : "已归档"} · {draft.suggestedRetail.toFixed(2)} {draft.currency}
                          {draft.isEstimate ? " · 估算" : ""} · {draft.source === "listing_fill" ? "刊登填入" : draft.source === "batch" ? "批量" : "计算器"} · {new Date(draft.createdAt).toLocaleString("zh-CN")}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">尚未保存本站点草稿。保存后可在此查看历史，不会写入刊登售价。</p>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">其他平台对照</CardTitle>
              </CardHeader>
              <CardContent>
                {data.comparison.length === 0 ? (
                  <p className="text-sm text-muted-foreground">没有其他已配置费用模板的站点可对照。</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>站点</TableHead>
                        <TableHead>建议价</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.comparison.map((row) => (
                        <TableRow key={`${row.platform}-${row.country}`} className={row.suggestedRetail == null ? "text-muted-foreground" : undefined}>
                          <TableCell>
                            {row.labelZh}
                            {row.missingReasons.length ? (
                              <p className="text-xs text-amber-700">{row.missingReasons.join("；")}</p>
                            ) : null}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {row.suggestedRetail == null
                              ? "缺项"
                              : money(row.suggestedRetail, row.costCurrency)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <p className="mt-2 text-xs text-muted-foreground">各站点使用自己的费用模板与税则，互不套用。跨币种只并列、不加总。</p>
              </CardContent>
            </Card>
          </div>

          {showBreakdown ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">测算明细（{primary?.labelZh}）</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>步骤</TableHead>
                      <TableHead>输入 / 来源</TableHead>
                      <TableHead>结果</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.breakdown.map((step) => (
                      <TableRow key={step.id}>
                        <TableCell>{step.labelZh}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {[step.input, step.source, step.note].filter(Boolean).join(" · ")}
                        </TableCell>
                        <TableCell className="tabular-nums">{money(step.result, step.currency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>补全 {sku}</SheetTitle>
            <SheetDescription>能在本页改完的主档字段会写回 SKU 并立即重算。费用模板与税则、汇率请走原页面维护。</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-4">
            {data?.readiness.gaps.map((gap) => (
              <div key={gap.code} className="rounded-md border p-3 text-sm">
                <p className="font-medium">{gap.labelZh}</p>
                <p className="text-muted-foreground">{gap.detail}</p>
              </div>
            ))}
            <div className="space-y-1">
              <Label>HS 编码</Label>
              <Input value={gapHs} onChange={(e) => setGapHs(e.target.value)} placeholder="如 8507.60.90" />
            </div>
            <div className="space-y-1">
              <Label>净重（g）</Label>
              <Input type="number" value={gapWeight} onChange={(e) => setGapWeight(e.target.value)} />
              <p className="text-xs text-muted-foreground">单件毛重由箱规毛重 ÷ 每箱件数计算，不必另填毛重。</p>
            </div>
            <div className="space-y-1">
              <Label>默认箱规</Label>
              <Select value={gapCarton || "__none__"} onValueChange={(v) => setGapCarton(v === "__none__" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="选择箱规" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">不绑定</SelectItem>
                  {(cartonQuery.data?.items ?? []).map((spec) => (
                    <SelectItem key={spec.id} value={spec.id}>
                      {spec.code} · {spec.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                <LocaleLink href="/console/carton-specs" className="underline">
                  去维护箱规
                </LocaleLink>
              </p>
            </div>
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">费用模板</p>
              <p className="text-xs text-muted-foreground">
                无匹配模板时，可把当前品类（含祖先）或 HS（支持章节前缀）规则挂到同平台站点的组织费用模板上，后续同类 SKU 可复用。费率来自本组织模板，不是平台实时同步。也可仅对本次填写临时费率（不会写入模板）。
              </p>
              <div className="flex flex-wrap gap-2">
                <Select value={attachTemplateId || "__none__"} onValueChange={(v) => setAttachTemplateId(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="选择本站点费用模板" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">选择本站点费用模板</SelectItem>
                    {attachableTemplates.map((tpl) => (
                      <SelectItem key={tpl.id} value={tpl.id}>
                        {tpl.code} · {tpl.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    addMatchRuleMutation.isPending ||
                    !attachTemplateId ||
                    (!data?.sku.categoryId && !data?.sku.hsCode)
                  }
                  onClick={() =>
                    addMatchRuleMutation.mutate({
                      templateId: attachTemplateId,
                      categoryId: data?.sku.categoryId ?? undefined,
                      hsCodePattern: data?.sku.hsCode || undefined,
                      priority: 20,
                      note: `由定价计算器为 ${sku} 添加`,
                    })
                  }
                >
                  为当前品类 / HS 添加规则
                </Button>
              </div>
              <Button variant="outline" size="sm" asChild>
                <LocaleLink href="/console/fee-templates">去配置费用模板</LocaleLink>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <LocaleLink href="/console/costs/tariffs">维护 HS 税则</LocaleLink>
              </Button>
              <div className="grid grid-cols-3 gap-2">
                <Input placeholder="佣金 %" value={tempCommission} onChange={(e) => setTempCommission(e.target.value)} />
                <Input placeholder="回款 %" value={tempPayout} onChange={(e) => setTempPayout(e.target.value)} />
                <Input placeholder="仓杂 %" value={tempWarehouse} onChange={(e) => setTempWarehouse(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={applyTemp} onChange={(e) => setApplyTemp(e.target.checked)} />
                仅本次使用临时费率
              </label>
              {applyTemp ? (
                <p className="flex items-center gap-1 text-xs text-amber-700">
                  <AlertTriangle className="size-3.5" />
                  临时费率，未写入模板
                </p>
              ) : null}
            </div>
          </div>
          <SheetFooter>
            <Button
              disabled={patchMutation.isPending}
              onClick={() =>
                patchMutation.mutate({
                  sku,
                  hsCode: gapHs || undefined,
                  weightGrams: gapWeight.trim() ? Number(gapWeight) : undefined,
                  cartonSpecId: gapCarton || null,
                })
              }
            >
              保存并重算
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
