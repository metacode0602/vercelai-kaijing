'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc/client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@workspace/ui/components/dialog'
import { Card } from '@workspace/ui/components/card'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'
import { Textarea } from '@workspace/ui/components/textarea'
import { Plus, Trash2 } from 'lucide-react'
import { InfraPricingEditor, type InfraPricing } from './infra-pricing-editor'
import {
  SITE_NODE_TIERS,
  PRODUCT_LINE_OPTIONS,
  downloadSiteBomXlsx,
  type SiteNodeTier,
  type ProductLine,
} from '@/lib/supplier/contract-site-bom'
import { contractPricingModeNames } from '@/lib/data/types'

interface ContractCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface CapacityLineForm {
  dataCenterId: string
  gpuCardTypeId: string
  cooperationType: 'idle_time' | 'whole_rent'
  deviceQuantity: number
  gpuQuantity: number
  startDate: string
  endDate: string
}

export function ContractCreateDialog({ open, onOpenChange }: ContractCreateDialogProps) {
  const utils = trpc.useUtils()

  const { data: suppliers } = trpc.supplier.list.useQuery({})
  const { data: datacenters } = trpc.supplier.listAllDataCenters.useQuery()
  const { data: cardTypes } = trpc.supplier.gpuCardTypes.listActive.useQuery()

  const createMutation = trpc.supplier.contract.create.useMutation({
    onSuccess: () => {
      utils.supplier.contract.list.invalidate()
      onOpenChange(false)
      resetForm()
    },
  })

  const [form, setForm] = useState({
    supplierId: '',
    type: 'cooperation' as string,
    pricingMode: 'card_time' as string,
    cooperationMode: 'idle_time' as string,
    startDate: '',
    endDate: '',
    unitPricePerHour: '',
    monthlyRentPrice: '',
    expectedListingTime: '',
    penaltyTerms: '',
    terms: '',
    siteNodeCount: 0,
    siteNodeTier: '' as SiteNodeTier | '',
    productLines: [] as ProductLine[],
    publicIpCount: 3,
    supplierProvidesCpuHosts: true,
  })

  const [infraPricing, setInfraPricing] = useState<InfraPricing | undefined>(undefined)

  const [capacityLines, setCapacityLines] = useState<CapacityLineForm[]>([
    {
      dataCenterId: '',
      gpuCardTypeId: '',
      cooperationType: 'idle_time',
      deviceQuantity: 1,
      gpuQuantity: 1,
      startDate: '',
      endDate: '',
    },
  ])

  const resetForm = () => {
    setForm({
      supplierId: '',
      type: 'cooperation',
      pricingMode: 'card_time',
      cooperationMode: 'idle_time',
      startDate: '',
      endDate: '',
      unitPricePerHour: '',
      monthlyRentPrice: '',
      expectedListingTime: '',
      penaltyTerms: '',
      terms: '',
      siteNodeCount: 0,
      siteNodeTier: '',
      productLines: [],
      publicIpCount: 3,
      supplierProvidesCpuHosts: true,
    })
    setInfraPricing(undefined)
    setCapacityLines([
      {
        dataCenterId: '',
        gpuCardTypeId: '',
        cooperationType: 'idle_time',
        deviceQuantity: 1,
        gpuQuantity: 1,
        startDate: '',
        endDate: '',
      },
    ])
  }

  const addLine = () => {
    setCapacityLines([
      ...capacityLines,
      {
        dataCenterId: '',
        gpuCardTypeId: '',
        cooperationType: form.cooperationMode as 'idle_time' | 'whole_rent',
        deviceQuantity: 1,
        gpuQuantity: 1,
        startDate: form.startDate,
        endDate: form.endDate,
      },
    ])
  }

  const removeLine = (index: number) => {
    if (capacityLines.length <= 1) return
    setCapacityLines(capacityLines.filter((_, i) => i !== index))
  }

  const updateLine = (index: number, field: keyof CapacityLineForm, value: any) => {
    const updated = [...capacityLines]
    updated[index] = { ...updated[index], [field]: value } as CapacityLineForm
    setCapacityLines(updated)
  }

  const handleSubmit = () => {
    if (!form.supplierId || !form.startDate) return
    if (capacityLines.some((l) => !l.dataCenterId || !l.gpuCardTypeId || !l.startDate || !l.endDate)) return

    createMutation.mutate({
      ...form,
      type: form.type as 'cooperation' | 'supplement' | 'renewal',
      pricingMode: form.pricingMode as
        | 'card_time'
        | 'revenue_share'
        | 'tiered_card_time'
        | 'tiered_revenue_share',
      cooperationMode: form.cooperationMode as 'idle_time' | 'whole_rent',
      infraPricing,
      siteNodeCount: form.siteNodeCount > 0 ? form.siteNodeCount : undefined,
      siteNodeTier: form.siteNodeTier || undefined,
      productLines: form.productLines.length ? form.productLines : undefined,
      publicIpCount: form.publicIpCount > 0 ? form.publicIpCount : undefined,
      supplierProvidesCpuHosts: form.supplierProvidesCpuHosts,
      capacityLines: capacityLines.map((l) => ({
        ...l,
        deviceQuantity: Number(l.deviceQuantity),
        gpuQuantity: Number(l.gpuQuantity),
      })),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>创建合同</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>供应商 *</Label>
              <Select value={form.supplierId} onValueChange={(v) => setForm({ ...form, supplierId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="选择供应商" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers?.items?.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.shortName ?? s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>合同类型 *</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cooperation">合作协议</SelectItem>
                  <SelectItem value="supplement">补充协议</SelectItem>
                  <SelectItem value="renewal">续签协议</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>计价方式 *</Label>
              <Select value={form.pricingMode} onValueChange={(v) => setForm({ ...form, pricingMode: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(contractPricingModeNames).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>合作模式 *</Label>
              <Select value={form.cooperationMode} onValueChange={(v) => setForm({ ...form, cooperationMode: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="idle_time">闲时合作</SelectItem>
                  <SelectItem value="whole_rent">整租合作</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>开始日期 *</Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>结束日期（空=无固定期限）</Label>
              <Input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </div>

          <div className="space-y-2">
            <Label>预期上架时间</Label>
            <Input
              type="date"
              value={form.expectedListingTime}
              onChange={(e) => setForm({ ...form, expectedListingTime: e.target.value })}
            />
          </div>

            {/* Site BOM Fields (GW-P0) */}
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-base font-semibold">站点 BOM（GW-P0）</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void downloadSiteBomXlsx({
                      siteNodeTier: form.siteNodeTier || null,
                      siteNodeCount: form.siteNodeCount || null,
                      productLines: form.productLines,
                      publicIpCount: form.publicIpCount || null,
                      supplierProvidesCpuHosts: form.supplierProvidesCpuHosts,
                    })
                  }
                >
                  下载 BOM Excel
                </Button>
              </div>
              <div className="space-y-2">
                <Label>规模分档</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.siteNodeTier}
                  onChange={(e) =>
                    setForm({ ...form, siteNodeTier: e.target.value as SiteNodeTier | '' })
                  }
                >
                  <option value="">未设定</option>
                  {SITE_NODE_TIERS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>精确台数（可选）</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.siteNodeCount}
                  onChange={(e) => setForm({ ...form, siteNodeCount: parseInt(e.target.value) || 0 })}
                  placeholder="0 表示未设定"
                />
              </div>
              <div className="space-y-2">
                <Label>产品线</Label>
                <div className="flex flex-wrap gap-3">
                  {PRODUCT_LINE_OPTIONS.map((p) => {
                    const checked = form.productLines.includes(p.value)
                    return (
                      <label key={p.value} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...form.productLines, p.value]
                              : form.productLines.filter((x) => x !== p.value)
                            setForm({ ...form, productLines: next })
                          }}
                        />
                        {p.label}
                      </label>
                    )
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <Label>公网 IP 数量</Label>
                <Input
                  type="number"
                  min="0"
                  max="64"
                  value={form.publicIpCount}
                  onChange={(e) => setForm({ ...form, publicIpCount: parseInt(e.target.value) || 0 })}
                  placeholder="最低 3、推荐 5"
                />
              </div>
              <div className="space-y-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="supplierProvidesCpuHosts"
                  checked={form.supplierProvidesCpuHosts}
                  onChange={(e) => setForm({ ...form, supplierProvidesCpuHosts: e.target.checked })}
                  className="h-4 w-4 rounded"
                />
                <Label htmlFor="supplierProvidesCpuHosts" className="font-normal cursor-pointer">
                  供应商提供 CPU 主机
                </Label>
              </div>
            </div>

            {(form.pricingMode === 'card_time' || form.pricingMode === 'tiered_card_time') && form.cooperationMode === 'idle_time' && (
              <div className="space-y-2">
                <Label>卡时单价 (元/小时)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.unitPricePerHour}
                  onChange={(e) => setForm({ ...form, unitPricePerHour: e.target.value })}
                />
              </div>
            )}

            {form.cooperationMode === 'whole_rent' && (
              <div className="space-y-2">
                <Label>月租价格 (元/月) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.monthlyRentPrice}
                  onChange={(e) => setForm({ ...form, monthlyRentPrice: e.target.value })}
                  placeholder="整租模式必填"
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>逾期罚则</Label>
            <Textarea
              value={form.penaltyTerms}
              onChange={(e) => setForm({ ...form, penaltyTerms: e.target.value })}
              placeholder="逾期交付的罚则说明..."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>合同条款</Label>
            <Textarea
              value={form.terms}
              onChange={(e) => setForm({ ...form, terms: e.target.value })}
              placeholder="合同条款说明..."
              rows={3}
            />
          </div>

          {/* Infrastructure Pricing */}
          <InfraPricingEditor
            value={infraPricing}
            onChange={setInfraPricing}
            cooperationMode={form.cooperationMode as 'idle_time' | 'whole_rent'}
          />

          {/* Capacity Lines */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">产能订单 *</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="mr-1 h-4 w-4" />
                新增行
              </Button>
            </div>

            {capacityLines.map((line, index) => (
              <Card key={index} className="p-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">机房 *</Label>
                    <Select value={line.dataCenterId} onValueChange={(v) => updateLine(index, 'dataCenterId', v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="选择机房" />
                      </SelectTrigger>
                      <SelectContent>
                        {datacenters?.items?.map((dc: any) => (
                          <SelectItem key={dc.id} value={dc.id}>
                            {dc.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">GPU 卡型 *</Label>
                    <Select value={line.gpuCardTypeId} onValueChange={(v) => updateLine(index, 'gpuCardTypeId', v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="选择卡型" />
                      </SelectTrigger>
                      <SelectContent>
                        {cardTypes?.map((ct: any) => (
                          <SelectItem key={ct.id} value={ct.id}>
                            {ct.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">合作模式</Label>
                    <Select value={line.cooperationType} onValueChange={(v) => updateLine(index, 'cooperationType', v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="idle_time">闲时</SelectItem>
                        <SelectItem value="whole_rent">整租</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">设备数量 *</Label>
                    <Input
                      type="number"
                      min={1}
                      value={line.deviceQuantity}
                      onChange={(e) => updateLine(index, 'deviceQuantity', Number(e.target.value))}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">GPU 总卡数 *</Label>
                    <Input
                      type="number"
                      min={1}
                      value={line.gpuQuantity}
                      onChange={(e) => updateLine(index, 'gpuQuantity', Number(e.target.value))}
                    />
                  </div>

                  <div className="flex items-end gap-1">
                    <div className="space-y-1 flex-1">
                      <Label className="text-xs">产能开始 *</Label>
                      <Input
                        type="date"
                        value={line.startDate}
                        onChange={(e) => updateLine(index, 'startDate', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1 flex-1">
                      <Label className="text-xs">产能结束 *</Label>
                      <Input
                        type="date"
                        value={line.endDate}
                        onChange={(e) => updateLine(index, 'endDate', e.target.value)}
                      />
                    </div>
                    {capacityLines.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="mb-0.5"
                        onClick={() => removeLine(index)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? '创建中...' : '创建合同'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
