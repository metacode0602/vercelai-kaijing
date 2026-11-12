'use client'

import * as React from 'react'
import { useParams } from 'next/navigation'
import { DetailKpiRow } from '@/components/console/detail'
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { useStockAdjustmentDialog } from '@/components/console/stock-adjustment-create-dialog'
import { LocaleLink } from '@/lib/i18n/navigation'
import { buildCostRelayPath } from '@/lib/crossborder/ocean-cost-relay'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@workspace/ui/components/table'

export default function OceanContainerDetailPage() {
  const params = useParams<{ id: string }>()
  const id = decodeURIComponent(params.id)
  const utils = trpc.useUtils()
  const [notice, setNotice] = React.useState('')
  const [boxNo, setBoxNo] = React.useState('')
  const [leadRef, setLeadRef] = React.useState('')
  const [lineSku, setLineSku] = React.useState('')
  const [lineQty, setLineQty] = React.useState('100')
  const [lineCartonCount, setLineCartonCount] = React.useState('')
  const [lineCbm, setLineCbm] = React.useState('')
  const [boxCartonSpec, setBoxCartonSpec] = React.useState('')
  const [boxCbm, setBoxCbm] = React.useState('')
  const [boxWeight, setBoxWeight] = React.useState('')
  const [carrierDraft, setCarrierDraft] = React.useState('')

  const detailQuery = trpc.ocean.get.useQuery({ id }, { retry: false })
  const lot = detailQuery.data
  const bucketsQuery = trpc.ocean.inventoryBuckets.useQuery(
    { warehouse: lot?.warehouse || undefined },
    { enabled: Boolean(lot?.warehouse) },
  )
  const carriersQuery = trpc.carriers.list.useQuery({ page: 1, pageSize: 100, status: '启用' })
  const cartonSpecsQuery = trpc.cartonSpecs.list.useQuery({ page: 1, pageSize: 100, status: '启用' })
  const { openWith: openAdjustWith, dialog: adjustDialog, notice: adjustNotice } =
    useStockAdjustmentDialog()

  const invalidate = async () => {
    await Promise.all([
      utils.ocean.get.invalidate({ id }),
      utils.ocean.list.invalidate(),
      utils.ocean.stats.invalidate(),
      utils.ocean.inventoryBuckets.invalidate(),
    ])
  }

  const updateMutation = trpc.ocean.update.useMutation({
    onSuccess: async () => {
      await invalidate()
      setNotice('柜次头信息已保存')
    },
    onError: (e) => setNotice(e.message),
  })
  const advanceMutation = trpc.ocean.advance.useMutation({
    onSuccess: async (row) => {
      await invalidate()
      setNotice(`状态已推进 → ${row.status}`)
    },
    onError: (e) => setNotice(e.message),
  })
  const cancelMutation = trpc.ocean.cancel.useMutation({
    onSuccess: async () => {
      await invalidate()
      setNotice('柜次已取消')
    },
    onError: (e) => setNotice(e.message),
  })
  const upsertLineMutation = trpc.ocean.upsertLine.useMutation({
    onSuccess: async () => {
      await invalidate()
      setNotice('柜次行已保存')
      setLineSku('')
      setLineCartonCount('')
      setLineCbm('')
    },
    onError: (e) => setNotice(e.message),
  })
  const upsertBoxMutation = trpc.ocean.upsertBox.useMutation({
    onSuccess: async () => {
      await invalidate()
      setNotice('装箱明细已保存')
      setBoxNo('')
      setLeadRef('')
      setBoxCartonSpec('')
      setBoxCbm('')
      setBoxWeight('')
    },
    onError: (e) => setNotice(e.message),
  })
  const removeBoxMutation = trpc.ocean.removeBox.useMutation({
    onSuccess: async () => {
      await invalidate()
      setNotice('箱已删除')
    },
    onError: (e) => setNotice(e.message),
  })

  React.useEffect(() => {
    if (detailQuery.data?.carrierId != null) setCarrierDraft(detailQuery.data.carrierId || '')
  }, [detailQuery.data?.id, detailQuery.data?.carrierId])

  if (detailQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">加载柜次…</p>
  }

  if (!lot) {
    return (
      <div className="space-y-3">
        <p>未找到柜次 {id}</p>
        <p className="text-sm text-destructive">{detailQuery.error?.message}</p>
        <Button asChild variant="outline">
          <LocaleLink href="/console/ocean-containers">返回列表</LocaleLink>
        </Button>
      </div>
    )
  }

  const terminal = lot.status === '已入本地仓' || lot.status === '已取消'
  const canEditLines = lot.status === '草稿' || lot.status === '已订舱'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{lot.lotCode}</h1>
          <p className="text-sm text-muted-foreground">
            {lot.containerType} · {lot.containerNo || '无柜号'} · {lot.freightMode || '—'} ·{' '}
            {(carriersQuery.data?.items ?? []).find((c) => c.id === lot.carrierId)?.name ||
              (lot.carrierId ? '承运商已关联' : '未指定承运商')}{' '}
            · {lot.originPort} → {lot.destPort} → {lot.warehouse}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>{lot.status}</Badge>
          <Button asChild variant="outline" size="sm">
            <LocaleLink href="/console/ocean-containers">返回</LocaleLink>
          </Button>
          <Button
            size="sm"
            disabled={terminal || advanceMutation.isPending}
            onClick={() => advanceMutation.mutate({ id: lot.id })}
          >
            推进状态
          </Button>
          {(lot.status === '草稿' || lot.status === '已订舱') && (
            <Button
              size="sm"
              variant="outline"
              disabled={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate({ id: lot.id, reason: '控制台取消' })}
            >
              取消柜次
            </Button>
          )}
          {(lot.lines || []).some((l) => l.qtyDamaged > 0) ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const damaged = (lot.lines || []).find((l) => l.qtyDamaged > 0)
                openAdjustWith({
                  sku: damaged?.sku,
                  warehouse: lot.warehouse,
                  qtySystem: damaged?.qtyDamaged,
                })
              }}
            >
              发起报损调整
            </Button>
          ) : null}
        </div>
      </div>
      <DetailKpiRow
        items={[
          { label: 'ETA 港', value: lot.etaPort || '—' },
          { label: 'ETA 仓', value: lot.etaWarehouse || '—' },
          { label: '平台', value: lot.platform },
          { label: '行数', value: String(lot.lines?.length ?? 0) },
          { label: '箱数', value: String(lot.boxes?.length ?? 0) },
          { label: '成本版本', value: String(lot.costs?.length ?? 0) },
        ]}
      />

      {!terminal ? (
        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="text-sm font-medium">承运商</h3>
          <div className="flex flex-wrap items-end gap-2">
             <label className="space-y-1 text-sm">
               <span className="text-muted-foreground">选择承运商</span>
               <Select
                 value={carrierDraft === '' ? '__empty__' : carrierDraft}
                 onValueChange={(value) => setCarrierDraft(value === '__empty__' ? '' : value)}
               >
                 <SelectTrigger className="h-9 w-64">
                   <SelectValue />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="__empty__">不指定</SelectItem>
                   {(carriersQuery.data?.items ?? []).map((c) => (
                     <SelectItem key={c.id} value={c.id}>
                       {c.code} · {c.name}
                     </SelectItem>
                   ))}
                 </SelectContent>
               </Select>
             </label>
            <Button
              size="sm"
              variant="outline"
              disabled={updateMutation.isPending || carrierDraft === (lot.carrierId || '')}
              onClick={() =>
                updateMutation.mutate({ id: lot.id, carrierId: carrierDraft || null })
              }
            >
              保存承运商
            </Button>
          </div>
        </div>
      ) : null}
      <UedPrototypeNotice>
        状态流转：草稿 → 已订舱 → 在途 → 已到港 → 清关中 → 已入本地仓。开船、清关、到仓分别更新在途、清关中与在库余额，不把在途直接计入在库。
      </UedPrototypeNotice>

      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="text-sm font-medium">SKU 装箱行</h3>
        {canEditLines ? (
          <div className="flex flex-wrap gap-2">
            <Input
              className="w-44"
              placeholder="SKU 编码"
              value={lineSku}
              onChange={(e) => setLineSku(e.target.value)}
            />
            <Input
              className="w-28"
              placeholder="发运量"
              value={lineQty}
              onChange={(e) => setLineQty(e.target.value)}
            />
            <Input
              className="w-24"
              placeholder="箱数"
              value={lineCartonCount}
              onChange={(e) => setLineCartonCount(e.target.value)}
            />
            <Input
              className="w-24"
              placeholder="行 CBM"
              value={lineCbm}
              onChange={(e) => setLineCbm(e.target.value)}
            />
            <Button
              size="sm"
              disabled={upsertLineMutation.isPending || !lineSku.trim()}
              onClick={() =>
                upsertLineMutation.mutate({
                  shipmentId: lot.id,
                  sku: lineSku.trim(),
                  qtyShipped: Number(lineQty) || 0,
                  cartonCount: lineCartonCount.trim() ? Number(lineCartonCount) : undefined,
                  cbm: lineCbm.trim() ? Number(lineCbm) : undefined,
                })
              }
            >
              添加/更新行
            </Button>
          </div>
        ) : null}
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>名称</TableHead>
                <TableHead>发运</TableHead>
                <TableHead>箱数</TableHead>
                <TableHead>CBM</TableHead>
                <TableHead>实收</TableHead>
                <TableHead>残次</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(lot.lines || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">
                    暂无行；草稿/订舱阶段可添加。
                  </TableCell>
                </TableRow>
              ) : (
                (lot.lines || []).map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>{line.sku}</TableCell>
                    <TableCell>{line.name}</TableCell>
                    <TableCell className="tabular-nums">{line.qtyShipped}</TableCell>
                    <TableCell className="tabular-nums">{line.cartonCount ?? '—'}</TableCell>
                    <TableCell className="tabular-nums">{line.cbm ?? '—'}</TableCell>
                    <TableCell className="tabular-nums">{line.qtyReceived}</TableCell>
                    <TableCell className="tabular-nums">{line.qtyDamaged}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="text-sm font-medium">装箱明细（LCL leads / 箱）</h3>
        {!terminal ? (
          <div className="flex flex-wrap gap-2 items-end">
            <Input className="w-36" placeholder="箱号" value={boxNo} onChange={(e) => setBoxNo(e.target.value)} />
            <Input
              className="w-36"
              placeholder="Lead 引用"
              value={leadRef}
              onChange={(e) => setLeadRef(e.target.value)}
            />
             <label className="space-y-1 text-sm">
               <span className="text-muted-foreground">箱规</span>
               <Select
                 value={boxCartonSpec === '' ? '__empty__' : boxCartonSpec}
                 onValueChange={(code) => {
                   const nextCode = code === '__empty__' ? '' : code
                   setBoxCartonSpec(nextCode)
                   const spec = (cartonSpecsQuery.data?.items ?? []).find((s) => s.code === nextCode)
                   if (spec) {
                     const cbm = (spec.lengthCm * spec.widthCm * spec.heightCm) / 1_000_000
                     setBoxCbm(cbm > 0 ? String(Number(cbm.toFixed(4))) : '')
                     setBoxWeight(spec.grossWeightKg > 0 ? String(spec.grossWeightKg) : '')
                   }
                 }}
               >
                 <SelectTrigger className="h-9 w-48">
                   <SelectValue />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="__empty__">不引用箱规</SelectItem>
                   {(cartonSpecsQuery.data?.items ?? []).map((s) => (
                     <SelectItem key={s.id} value={s.code}>
                       {s.code} · {s.name}
                     </SelectItem>
                   ))}
                 </SelectContent>
               </Select>
             </label>
            <Input
              className="w-28"
              placeholder="CBM"
              value={boxCbm}
              onChange={(e) => setBoxCbm(e.target.value)}
            />
            <Input
              className="w-28"
              placeholder="重量 kg"
              value={boxWeight}
              onChange={(e) => setBoxWeight(e.target.value)}
            />
            <Button
              size="sm"
              disabled={upsertBoxMutation.isPending || !boxNo.trim()}
              onClick={() =>
                upsertBoxMutation.mutate({
                  shipmentId: lot.id,
                  boxNo: boxNo.trim(),
                  cartonSpecCode: boxCartonSpec.trim() || undefined,
                  leadRef: leadRef.trim() || undefined,
                  cbm: boxCbm.trim() ? Number(boxCbm) : lot.freightMode === 'LCL' ? 1.2 : null,
                  weightKg: boxWeight.trim() ? Number(boxWeight) : null,
                })
              }
            >
              添加箱
            </Button>
          </div>
        ) : null}
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>箱号</TableHead>
                <TableHead>箱规</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>CBM</TableHead>
                <TableHead>重量 kg</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(lot.boxes || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    无箱明细（FCL 可省略；LCL 建议维护 leads / 箱规）。
                  </TableCell>
                </TableRow>
              ) : (
                (lot.boxes || []).map((box) => (
                  <TableRow key={box.id}>
                    <TableCell>{box.boxNo}</TableCell>
                    <TableCell className="font-mono text-xs">{box.cartonSpecCode || '—'}</TableCell>
                    <TableCell>{box.leadRef || '—'}</TableCell>
                    <TableCell className="tabular-nums">{box.cbm ?? '—'}</TableCell>
                    <TableCell className="tabular-nums">{box.weightKg ?? '—'}</TableCell>
                    <TableCell>
                      {!terminal ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeBoxMutation.mutate({ shipmentId: lot.id, boxId: box.id })}
                        >
                          删除
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium">柜次成本版本（sku_costs）</h3>
          {(lot.costs || []).length ? (
            <Button size="sm" variant="outline" asChild>
              <LocaleLink href={buildCostRelayPath(lot.id, lot.platform)}>查看这些 SKU 的定价建议</LocaleLink>
            </Button>
          ) : null}
        </div>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>版本</TableHead>
                <TableHead>到仓单价</TableHead>
                <TableHead>币种</TableHead>
                <TableHead>费用模板版本</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(lot.costs || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">
                    暂无；可在成本测算工作台保存，或调用 ocean.saveCost。
                  </TableCell>
                </TableRow>
              ) : (
                (lot.costs || []).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.sku}</TableCell>
                    <TableCell>v{c.versionNo}</TableCell>
                    <TableCell className="tabular-nums">{c.landedUnitCost ?? c.amount}</TableCell>
                    <TableCell>{c.currency}</TableCell>
                    <TableCell className="font-mono text-xs">{c.feeTemplateVersionId || '—'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="text-sm font-medium">目的仓库存桶（inventory_balances）</h3>
        <p className="text-xs text-muted-foreground">
          按 {lot.warehouse} 过滤的在途 / 清关中 / 可用 / 残次桶；推进柜次时由 ledger:ocean_* 写入。
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-3">SKU</th>
                <th className="py-1 pr-3">仓</th>
                <th className="py-1 pr-3">在途</th>
                <th className="py-1 pr-3">清关中</th>
                <th className="py-1 pr-3">可用</th>
                <th className="py-1 pr-3">残次</th>
              </tr>
            </thead>
            <tbody>
              {(bucketsQuery.data ?? []).length === 0 ? (
                <tr>
                  <td className="py-2 text-muted-foreground" colSpan={6}>
                    暂无余额；推进柜次开船后出现在途数量。
                  </td>
                </tr>
              ) : (
                (bucketsQuery.data ?? []).map((b) => (
                  <tr key={b.id} className="border-t">
                    <td className="py-1 pr-3">{b.sku}</td>
                    <td className="py-1 pr-3">{b.warehouse}</td>
                    <td className="py-1 pr-3 tabular-nums">{b.inTransit}</td>
                    <td className="py-1 pr-3 tabular-nums">{b.customsClearing}</td>
                    <td className="py-1 pr-3 tabular-nums">{b.available}</td>
                    <td className="py-1 pr-3 tabular-nums">{b.damaged}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">{lot.notes}</p>
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      {adjustDialog}
      {adjustNotice ? <p role="status" className="text-sm text-muted-foreground">{adjustNotice}</p> : null}
    </div>
  )
}
