'use client'

import { useEffect, useRef, useState } from 'react'
import { FileText, Plus, Trash2, Upload, X } from 'lucide-react'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@workspace/ui/components/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'
import { Label } from '@workspace/ui/components/label'
import { Textarea } from '@workspace/ui/components/textarea'
import { Card } from '@workspace/ui/components/card'
import type { Supplier, SupplierContract } from '@/lib/data/types'
import { trpc } from '@/lib/trpc/client'
import {
  SITE_NODE_TIERS,
  PRODUCT_LINE_OPTIONS,
  downloadSiteBomXlsx,
  type SiteNodeTier,
  type ProductLine,
} from '@/lib/supplier/contract-site-bom'

const contractTypeNames: Record<SupplierContract['type'], string> = {
  cooperation: '合作协议',
  supplement: '补充协议',
  renewal: '续签协议',
}

const ACCEPT_CONTRACT_FILE =
  '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

type CapacityLineForm = {
  dataCenterId: string
  gpuCardTypeId: string
  cooperationType: 'idle_time' | 'whole_rent'
  deviceQuantity: number
  gpuQuantity: number
  startDate: string
  endDate: string
}

type CreateContractForm = {
  type: SupplierContract['type']
  startDate: string
  endDate: string
  terms: string
  minCommitHours: string
  settlementCycle: '' | 'monthly' | 'quarterly'
  signerStaffId: string
  siteNodeCount: string
  siteNodeTier: SiteNodeTier | ''
  productLines: ProductLine[]
  publicIpCount: string
  supplierProvidesCpuHosts: boolean
  cooperationMode: 'idle_time' | 'whole_rent'
}

const emptyCapacityLine = (defaults?: Partial<CapacityLineForm>): CapacityLineForm => ({
  dataCenterId: '',
  gpuCardTypeId: '',
  cooperationType: 'idle_time',
  deviceQuantity: 1,
  gpuQuantity: 1,
  startDate: '',
  endDate: '',
  ...defaults,
})

const defaultCreateForm = (): CreateContractForm => ({
  type: 'cooperation',
  startDate: '',
  endDate: '',
  terms: '',
  minCommitHours: '',
  settlementCycle: '',
  signerStaffId: '',
  siteNodeCount: '',
  siteNodeTier: '',
  productLines: [],
  publicIpCount: '3',
  supplierProvidesCpuHosts: true,
  cooperationMode: 'idle_time',
})

interface CreateSupplierContractDialogProps {
  supplier: Supplier
  onCreated: (contract: SupplierContract) => void
}

export function CreateSupplierContractDialog({
  supplier,
  onCreated,
}: CreateSupplierContractDialogProps) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<CreateContractForm>(defaultCreateForm)
  const [capacityLines, setCapacityLines] = useState<CapacityLineForm[]>([emptyCapacityLine()])
  const [contractFile, setContractFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const fileObjectUrlRef = useRef<string | null>(null)
  const utils = trpc.useUtils()

  const { data: activeStaff = [] } = trpc.crm.staff.listActive.useQuery(undefined, {
    enabled: open,
  })
  const { data: datacenters } = trpc.supplier.listAllDataCenters.useQuery(
    { supplierId: supplier.id, pageSize: 100 },
    { enabled: open },
  )
  const { data: cardTypes } = trpc.supplier.gpuCardTypes.listActive.useQuery(undefined, {
    enabled: open,
  })

  const createMutation = trpc.supplier.contract.create.useMutation({
    onSuccess: (data) => {
      void utils.supplier.listContracts.invalidate({ supplierId: supplier.id })
      void utils.supplier.contract.list.invalidate()

      // 新合同默认继承供应商的计价方式；合作模式取表单选择的 idle_time / whole_rent。
      const pricingMode = supplier.pricingMode

      const contract: SupplierContract = {
        id: data.id,
        contractNo: data.contractNo,
        supplierId: supplier.id,
        supplierName: supplier.name,
        type: form.type,
        status: 'draft',
        cooperationMode: form.cooperationMode,
        pricingMode,
        revenueShareRatio:
          pricingMode === 'revenue_share' || pricingMode === 'tiered_revenue_share'
            ? supplier.revenueShareRatio
            : undefined,
        minCommitHours: form.minCommitHours ? parseInt(form.minCommitHours, 10) : undefined,
        settlementCycle: form.settlementCycle || undefined,
        startDate: form.startDate,
        endDate: form.endDate || form.startDate,
        terms: form.terms.trim(),
        signerName: form.signerStaffId
          ? activeStaff.find((s) => s.id === form.signerStaffId)?.display_name
          : undefined,
        siteNodeCount: form.siteNodeCount
          ? parseInt(form.siteNodeCount, 10) || undefined
          : undefined,
        siteNodeTier: form.siteNodeTier || undefined,
        productLines: form.productLines.length ? form.productLines : undefined,
        publicIpCount: form.publicIpCount
          ? parseInt(form.publicIpCount, 10) || undefined
          : undefined,
        supplierProvidesCpuHosts: form.supplierProvidesCpuHosts,
        createdAt: new Date().toISOString().slice(0, 10),
      }

      onCreated(contract)
      setOpen(false)
    },
    onError: (err) => {
      setSubmitError(err.message || '创建合同失败')
    },
  })

  const resetForm = () => {
    setForm(defaultCreateForm())
    setCapacityLines([emptyCapacityLine()])
    setContractFile(null)
    setFileError(null)
    setSubmitError(null)
    if (fileObjectUrlRef.current) {
      URL.revokeObjectURL(fileObjectUrlRef.current)
      fileObjectUrlRef.current = null
    }
  }

  useEffect(() => {
    if (!open) {
      resetForm()
    }
  }, [open])

  useEffect(() => {
    return () => {
      if (fileObjectUrlRef.current) {
        URL.revokeObjectURL(fileObjectUrlRef.current)
      }
    }
  }, [])

  const updateForm = <K extends keyof CreateContractForm>(key: K, value: CreateContractForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setSubmitError(null)
  }

  const updateLine = (index: number, field: keyof CapacityLineForm, value: string | number) => {
    setCapacityLines((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value } as CapacityLineForm
      return next
    })
    setSubmitError(null)
  }

  const addLine = () => {
    setCapacityLines((prev) => [
      ...prev,
      emptyCapacityLine({
        cooperationType: form.cooperationMode,
        startDate: form.startDate,
        endDate: form.endDate,
      }),
    ])
  }

  const removeLine = (index: number) => {
    setCapacityLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  const handleFileChange = (file: File | null) => {
    setFileError(null)
    setSubmitError(null)
    if (!file) {
      setContractFile(null)
      return
    }
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]
    const ext = file.name.split('.').pop()?.toLowerCase()
    const okExt = ext === 'pdf' || ext === 'doc' || ext === 'docx'
    if (!allowed.includes(file.type) && !okExt) {
      setFileError('仅支持 PDF、DOC、DOCX 格式')
      setContractFile(null)
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setFileError('文件大小不能超过 20MB')
      setContractFile(null)
      return
    }
    setContractFile(file)
  }

  const handleSubmit = () => {
    if (!form.startDate) {
      setSubmitError('请填写合同开始日期')
      return
    }
    if (form.endDate && form.startDate > form.endDate) {
      setSubmitError('结束日期不能早于开始日期')
      return
    }
    if (
      capacityLines.some(
        (l) => !l.dataCenterId || !l.gpuCardTypeId || !l.startDate || !l.endDate || l.deviceQuantity < 1 || l.gpuQuantity < 1,
      )
    ) {
      setSubmitError('请完整填写至少一行产能明细（机房、卡型、数量、起止日期）')
      return
    }
    if (fileError) {
      return
    }

    // 新合同默认继承供应商的计价方式；合作模式取表单选择的 idle_time / whole_rent。
    const pricingMode = supplier.pricingMode

    // 文件上传流程暂未接入；优先保证合同 + BOM + 产能落库（contractFileUri 可选）
    void contractFile

    createMutation.mutate({
      supplierId: supplier.id,
      type: form.type,
      pricingMode,
      cooperationMode: form.cooperationMode,
      startDate: form.startDate,
      endDate: form.endDate || undefined,
      terms: form.terms.trim() || undefined,
      minCommitHours: form.minCommitHours || undefined,
      settlementCycle: form.settlementCycle || undefined,
      signerName: form.signerStaffId
        ? activeStaff.find((s) => s.id === form.signerStaffId)?.display_name
        : undefined,
      siteNodeCount: form.siteNodeCount
        ? parseInt(form.siteNodeCount, 10) || undefined
        : undefined,
      siteNodeTier: form.siteNodeTier || undefined,
      productLines: form.productLines.length ? form.productLines : undefined,
      publicIpCount: form.publicIpCount
        ? parseInt(form.publicIpCount, 10) || undefined
        : undefined,
      supplierProvidesCpuHosts: form.supplierProvidesCpuHosts,
      capacityLines: capacityLines.map((l) => ({
        dataCenterId: l.dataCenterId,
        gpuCardTypeId: l.gpuCardTypeId,
        cooperationType: l.cooperationType,
        deviceQuantity: Number(l.deviceQuantity),
        gpuQuantity: Number(l.gpuQuantity),
        startDate: l.startDate,
        endDate: l.endDate,
      })),
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          新增合同
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>新增合同</DialogTitle>
          <DialogDescription>
            为 {supplier.name} 创建商务合同（含站点 BOM 与至少一行产能明细）。合同编号由系统自动生成。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>供应商</Label>
              <Input value={supplier.name} disabled className="bg-muted/50" />
            </div>
            <div className="grid gap-2">
              <Label>合同类型</Label>
              <Select
                value={form.type}
                onValueChange={(v) => updateForm('type', v as SupplierContract['type'])}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(contractTypeNames).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>合作模式 *</Label>
              <Select
                value={form.cooperationMode}
                onValueChange={(v) => updateForm('cooperationMode', v as 'idle_time' | 'whole_rent')}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="idle_time">闲时合作</SelectItem>
                  <SelectItem value="whole_rent">整租合作</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>结算周期</Label>
              <Select
                value={form.settlementCycle || 'none'}
                onValueChange={(v) =>
                  updateForm('settlementCycle', v === 'none' ? '' : (v as 'monthly' | 'quarterly'))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="可选" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不指定</SelectItem>
                  <SelectItem value="monthly">按月结算</SelectItem>
                  <SelectItem value="quarterly">按季结算</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>开始日期 *</Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => updateForm('startDate', e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>结束日期（空=无固定期限）</Label>
              <Input
                type="date"
                value={form.endDate}
                onChange={(e) => updateForm('endDate', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>签署人</Label>
              <Select
                value={form.signerStaffId || 'none'}
                onValueChange={(v) => updateForm('signerStaffId', v === 'none' ? '' : v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择签署人" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不指定</SelectItem>
                  {activeStaff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.display_name}
                      {s.employee_no ? ` (${s.employee_no})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>最低承诺卡时</Label>
              <Input
                type="number"
                min={0}
                placeholder="可选"
                value={form.minCommitHours}
                onChange={(e) => updateForm('minCommitHours', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">站点 BOM（GW-P0）</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  void downloadSiteBomXlsx({
                    siteNodeTier: form.siteNodeTier || null,
                    siteNodeCount: form.siteNodeCount
                      ? parseInt(form.siteNodeCount, 10) || null
                      : null,
                    productLines: form.productLines,
                    publicIpCount: form.publicIpCount
                      ? parseInt(form.publicIpCount, 10) || null
                      : null,
                    supplierProvidesCpuHosts: form.supplierProvidesCpuHosts,
                    supplierName: supplier?.name,
                  })
                }
              >
                下载 BOM Excel
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>规模分档</Label>
                <Select
                  value={form.siteNodeTier || 'none'}
                  onValueChange={(v) =>
                    updateForm('siteNodeTier', v === 'none' ? '' : (v as SiteNodeTier))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择分档" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">未设定</SelectItem>
                    {SITE_NODE_TIERS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>精确台数（可选）</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="例如 30"
                  value={form.siteNodeCount}
                  onChange={(e) => updateForm('siteNodeCount', e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>产品线</Label>
              <div className="flex flex-wrap gap-3">
                {PRODUCT_LINE_OPTIONS.map((p) => {
                  const checked = form.productLines.includes(p.value)
                  return (
                    <label key={p.value} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...form.productLines, p.value]
                            : form.productLines.filter((x) => x !== p.value)
                          updateForm('productLines', next)
                        }}
                      />
                      {p.label}
                    </label>
                  )
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>公网 IP 数量</Label>
                <Input
                  type="number"
                  min={0}
                  max={64}
                  placeholder="最低 3、推荐 5"
                  value={form.publicIpCount}
                  onChange={(e) => updateForm('publicIpCount', e.target.value)}
                />
              </div>
              <div className="flex items-end gap-2 pb-6">
                <input
                  type="checkbox"
                  id="dashSupplierProvidesCpuHosts"
                  className="h-4 w-4"
                  checked={form.supplierProvidesCpuHosts}
                  onChange={(e) => updateForm('supplierProvidesCpuHosts', e.target.checked)}
                />
                <Label htmlFor="dashSupplierProvidesCpuHosts" className="font-normal cursor-pointer">
                  供应商提供 CPU 主机
                </Label>
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>合同条款摘要</Label>
            <Textarea
              rows={3}
              placeholder="简述合作范围、结算方式、特殊约定..."
              value={form.terms}
              onChange={(e) => updateForm('terms', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">产能明细 *</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="mr-1 h-4 w-4" />
                新增行
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">至少一行：机房、卡型、数量与日期</p>

            {capacityLines.map((line, index) => (
              <Card key={index} className="p-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">机房 *</Label>
                    <Select
                      value={line.dataCenterId}
                      onValueChange={(v) => updateLine(index, 'dataCenterId', v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择机房" />
                      </SelectTrigger>
                      <SelectContent>
                        {datacenters?.items?.map((dc: { id: string; name: string }) => (
                          <SelectItem key={dc.id} value={dc.id}>
                            {dc.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">GPU 卡型 *</Label>
                    <Select
                      value={line.gpuCardTypeId}
                      onValueChange={(v) => updateLine(index, 'gpuCardTypeId', v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择卡型" />
                      </SelectTrigger>
                      <SelectContent>
                        {cardTypes?.map((ct: { id: string; name: string }) => (
                          <SelectItem key={ct.id} value={ct.id}>
                            {ct.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">合作模式</Label>
                    <Select
                      value={line.cooperationType}
                      onValueChange={(v) => updateLine(index, 'cooperationType', v)}
                    >
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

          <div className="grid gap-2">
            <Label>合同文件（可选）</Label>
            <div
              className={`rounded-lg border border-dashed p-4 transition-colors ${
                contractFile ? 'border-primary/50 bg-primary/5' : 'border-border'
              }`}
            >
              {contractFile ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {contractFile.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(contractFile.size / 1024).toFixed(1)} KB（暂未上传至存储，仅本地记录）
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleFileChange(null)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-4">
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground text-center">
                    可选上传合同扫描件（PDF / DOC / DOCX）；优先保证合同与产能落库
                  </p>
                  <Button type="button" variant="outline" size="sm" asChild>
                    <label className="cursor-pointer">
                      选择文件
                      <input
                        type="file"
                        className="sr-only"
                        accept={ACCEPT_CONTRACT_FILE}
                        onChange={(e) => {
                          handleFileChange(e.target.files?.[0] ?? null)
                          e.target.value = ''
                        }}
                      />
                    </label>
                  </Button>
                </div>
              )}
            </div>
            {fileError && <p className="text-sm text-destructive">{fileError}</p>}
          </div>

          {submitError && <p className="text-sm text-destructive">{submitError}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={createMutation.isPending}>
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
