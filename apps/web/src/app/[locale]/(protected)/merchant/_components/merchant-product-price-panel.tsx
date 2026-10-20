"use client"

import { useState } from "react"
import { trpc } from "@/lib/trpc/client"
import { platformProductLineNames } from "@/lib/types/platform-pricing"
import { PRODUCT_LINES } from "@/app/[locale]/(protected)/supplier/components/platform-pricing/platform-pricing-utils"
import { formatMoney } from "./merchant-utils"
import { toast } from "sonner"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

type PricingModel = "revenue_share" | "fixed_price"

type FormState = {
  productLine: string
  pricingModel: PricingModel
  commissionRate: string
  fixedUnitPrice: string
  billingUnit: string
  effectiveFrom: string
  remark: string
}

const today = () => new Date().toISOString().slice(0, 10)

const emptyForm = (): FormState => ({
  productLine: PRODUCT_LINES[0] ?? 'elastic_service',
  pricingModel: "revenue_share",
  commissionRate: "",
  fixedUnitPrice: "",
  billingUnit: "hour",
  effectiveFrom: today(),
  remark: "",
})

function lineName(productLine: string): string {
  const names = platformProductLineNames as Record<string, string | undefined>
  return names[productLine] ?? productLine
}

function pricingModelLabel(model: PricingModel): string {
  return model === "revenue_share" ? "分成" : "固定价"
}

export function MerchantProductPricePanel({
  merchantId,
}: {
  merchantId: string
}) {
  const utils = trpc.useUtils()
  const listQuery = trpc.merchant.pricing.productList.useQuery({ merchantId })
  const [form, setForm] = useState<FormState | null>(null)

  const upsertMutation = trpc.merchant.pricing.productUpsert.useMutation({
    onSuccess: async () => {
      toast.success("已保存产品线进货价")
      setForm(null)
      await utils.merchant.pricing.productList.invalidate({ merchantId })
    },
    onError: (error) => toast.error(error.message || "保存失败"),
  })

  const archiveMutation = trpc.merchant.pricing.productArchive.useMutation({
    onSuccess: async () => {
      toast.success("已归档")
      await utils.merchant.pricing.productList.invalidate({ merchantId })
    },
    onError: (error) => toast.error(error.message || "归档失败"),
  })

  const submit = () => {
    if (!form) return
    const commissionRate = form.commissionRate.trim()
    const fixedUnitPrice = form.fixedUnitPrice.trim()
    if (form.pricingModel === "revenue_share") {
      const rate = Number(commissionRate)
      if (!(rate > 0 && rate <= 1)) {
        toast.error("分成比例需在 (0, 1] 区间内，例如 0.85 表示 85%")
        return
      }
    } else {
      const unit = Number(fixedUnitPrice)
      if (!(unit > 0)) {
        toast.error("固定单价必须大于 0")
        return
      }
    }
    upsertMutation.mutate({
      merchantId,
      productLine: form.productLine,
      pricingModel: form.pricingModel,
      commissionRate:
        form.pricingModel === "revenue_share" ? Number(commissionRate) : null,
      fixedUnitPrice:
        form.pricingModel === "fixed_price" ? Number(fixedUnitPrice) : null,
      billingUnit: form.billingUnit || "hour",
      effectiveFrom: form.effectiveFrom,
      remark: form.remark.trim() ? form.remark.trim() : null,
    })
  }

  if (listQuery.isLoading) {
    return <p className="py-8 text-muted-foreground">加载中…</p>
  }

  if (listQuery.isError) {
    return (
      <p className="py-8 text-muted-foreground">
        {listQuery.error.message || "加载失败"}
      </p>
    )
  }

  const rows = listQuery.data ?? []
  const configured = new Set(rows.map((r) => r.productLine))
  const missingLines = PRODUCT_LINES.filter((pl) => !configured.has(pl))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>非卡时（按产品线）进货价，用于毛利结算。</span>
          {missingLines.length > 0 ? (
            <Badge variant="outline" className="text-xs">
              未配置：{missingLines.map((pl) => lineName(pl)).join("、")}
            </Badge>
          ) : null}
        </div>
        {form ? (
          <Button variant="outline" size="sm" onClick={() => setForm(null)}>
            收起
          </Button>
        ) : (
          <Button size="sm" onClick={() => setForm(emptyForm())}>
            新增进货价
          </Button>
        )}
      </div>

      {form ? (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>产品线</Label>
                <NativeSelect
                  value={form.productLine}
                  onChange={(e) =>
                    setForm({ ...form, productLine: e.target.value })
                  }
                >
                  {PRODUCT_LINES.map((pl) => (
                    <NativeSelectOption key={pl} value={pl}>
                      {lineName(pl)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label>定价模型</Label>
                <NativeSelect
                  value={form.pricingModel}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      pricingModel: e.target.value as PricingModel,
                    })
                  }
                >
                  <NativeSelectOption value="revenue_share">
                    分成
                  </NativeSelectOption>
                  <NativeSelectOption value="fixed_price">
                    固定价
                  </NativeSelectOption>
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label>计费单位</Label>
                <NativeSelect
                  value={form.billingUnit}
                  onChange={(e) =>
                    setForm({ ...form, billingUnit: e.target.value })
                  }
                >
                  <NativeSelectOption value="hour">按小时</NativeSelectOption>
                  <NativeSelectOption value="month">按月</NativeSelectOption>
                </NativeSelect>
              </div>

              {form.pricingModel === "revenue_share" ? (
                <div className="space-y-1.5">
                  <Label>分成比例（0~1]，如 0.85 = 85%</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    min="0"
                    max="1"
                    value={form.commissionRate}
                    onChange={(e) =>
                      setForm({ ...form, commissionRate: e.target.value })
                    }
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>固定单价（元）</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={form.fixedUnitPrice}
                    onChange={(e) =>
                      setForm({ ...form, fixedUnitPrice: e.target.value })
                    }
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label>生效开始</Label>
                <Input
                  type="date"
                  value={form.effectiveFrom}
                  onChange={(e) =>
                    setForm({ ...form, effectiveFrom: e.target.value })
                  }
                />
              </div>

              <div className="space-y-1.5 sm:col-span-3">
                <Label>备注</Label>
                <Input
                  value={form.remark}
                  onChange={(e) => setForm({ ...form, remark: e.target.value })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setForm(null)}>
                取消
              </Button>
              <Button
                size="sm"
                onClick={submit}
                disabled={upsertMutation.isPending}
              >
                {upsertMutation.isPending ? "保存中…" : "保存"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>产品线</TableHead>
                <TableHead>模型</TableHead>
                <TableHead className="text-right">分成比例</TableHead>
                <TableHead className="text-right">固定单价</TableHead>
                <TableHead>计费单位</TableHead>
                <TableHead>生效开始</TableHead>
                <TableHead>备注</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-10 text-center text-muted-foreground"
                  >
                    暂无配置；缺价日期将不出毛利并触发站内信提醒。
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-sm">
                      {lineName(row.productLine)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {pricingModelLabel(row.pricingModel)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.commissionRate != null
                        ? `${(row.commissionRate * 100).toFixed(2)}%`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.fixedUnitPrice != null
                        ? `¥${formatMoney(row.fixedUnitPrice)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm">{row.billingUnit}</TableCell>
                    <TableCell className="text-sm">
                      {row.effectiveFrom}
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">
                      {row.remark || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setForm({
                              productLine: row.productLine,
                              pricingModel: row.pricingModel,
                              commissionRate:
                                row.commissionRate != null
                                  ? String(row.commissionRate)
                                  : "",
                              fixedUnitPrice:
                                row.fixedUnitPrice != null
                                  ? String(row.fixedUnitPrice)
                                  : "",
                              billingUnit: row.billingUnit,
                              effectiveFrom: row.effectiveFrom,
                              remark: row.remark ?? "",
                            })
                          }
                        >
                          编辑
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          disabled={archiveMutation.isPending}
                          onClick={() =>
                            archiveMutation.mutate({
                              merchantId,
                              productLine: row.productLine,
                            })
                          }
                        >
                          归档
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
