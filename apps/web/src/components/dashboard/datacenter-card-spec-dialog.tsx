'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import { Textarea } from '@workspace/ui/components/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { Separator } from '@workspace/ui/components/separator'
import { trpc } from '@/lib/trpc/client'
import type { GPUCardTypeRole } from '@/lib/data/types'
import {
  CAPACITY_UNIT_OPTIONS,
  CPU_MODEL_OPTIONS,
  DATA_DISK_TYPE_OPTIONS,
  DISK_INTERFACE_OPTIONS,
  MEMORY_TYPE_OPTIONS,
  NIC_PORT_OPTIONS,
  NIC_SPEED_OPTIONS,
  RAID_OPTIONS,
  SYSTEM_DISK_TYPE_OPTIONS,
  type DeviceSpecFields,
  formatDeviceSpec,
  resolveDeviceSpecFields,
  deviceSpecPreviewLines,
} from '@/lib/supplier/device-spec-utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'

export type DatacenterCardSpecFormValues = {
  deviceSpecFields: DeviceSpecFields
}

type DatacenterCardSpecDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  dataCenterId: string
  dataCenterName: string
  gpuCardTypeId: string
  gpuCardTypeName: string
  cardsPerMachine?: number
  deviceRole?: GPUCardTypeRole
  onSuccess?: () => void
}

function DeviceSpecFieldRow({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function DeviceSpecFieldsForm({
  fields,
  onChange,
  disabled,
  showGpu = true,
  gpuAutoFilled,
}: {
  fields: DeviceSpecFields
  onChange: (fields: DeviceSpecFields) => void
  disabled?: boolean
  showGpu?: boolean
  gpuAutoFilled?: boolean
}) {
  const update = (patch: Partial<DeviceSpecFields>) => {
    onChange({ ...fields, ...patch })
  }

  const preview = useMemo(() => formatDeviceSpec(fields), [fields])

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <DeviceSpecFieldRow label="CPU 线程数">
          <Input
            placeholder="如 128"
            value={fields.cpuThreads}
            disabled={disabled}
            onChange={(e) => update({ cpuThreads: e.target.value })}
          />
        </DeviceSpecFieldRow>
        <DeviceSpecFieldRow label="CPU 数量">
          <Input
            placeholder="如 2"
            value={fields.cpuCount}
            disabled={disabled}
            onChange={(e) => update({ cpuCount: e.target.value })}
          />
        </DeviceSpecFieldRow>
        <DeviceSpecFieldRow label="CPU 型号">
          <Select
            value={fields.cpuModel || undefined}
            disabled={disabled}
            onValueChange={(v) => update({ cpuModel: v, cpuModelCustom: v === 'other' ? fields.cpuModelCustom : '' })}
          >
            <SelectTrigger>
              <SelectValue placeholder="选择型号" />
            </SelectTrigger>
            <SelectContent>
              {CPU_MODEL_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DeviceSpecFieldRow>
      </div>

      {fields.cpuModel === 'other' ? (
        <DeviceSpecFieldRow label="CPU 型号（自定义）">
          <Input
            placeholder="输入 CPU 型号"
            value={fields.cpuModelCustom}
            disabled={disabled}
            onChange={(e) => update({ cpuModelCustom: e.target.value })}
          />
        </DeviceSpecFieldRow>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <DeviceSpecFieldRow label="内存总量 (GB)">
          <Input
            placeholder="如 512"
            value={fields.memoryTotalGb}
            disabled={disabled}
            onChange={(e) => update({ memoryTotalGb: e.target.value })}
          />
        </DeviceSpecFieldRow>
        <DeviceSpecFieldRow label="内存类型">
          <Select
            value={fields.memoryType || undefined}
            disabled={disabled}
            onValueChange={(v) => update({ memoryType: v as DeviceSpecFields['memoryType'] })}
          >
            <SelectTrigger>
              <SelectValue placeholder="选择类型" />
            </SelectTrigger>
            <SelectContent>
              {MEMORY_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DeviceSpecFieldRow>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <DeviceSpecFieldRow label="内存条数量">
          <Input
            placeholder="如 8"
            value={fields.memoryModuleCount}
            disabled={disabled}
            onChange={(e) => update({ memoryModuleCount: e.target.value })}
          />
        </DeviceSpecFieldRow>
        <DeviceSpecFieldRow label="单条容量 (GB)">
          <Input
            placeholder="如 64"
            value={fields.memoryModuleSizeGb}
            disabled={disabled}
            onChange={(e) => update({ memoryModuleSizeGb: e.target.value })}
          />
        </DeviceSpecFieldRow>
      </div>

      <div className="space-y-3 rounded-md border border-border p-3">
        <p className="text-sm font-medium text-foreground">系统盘</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <DeviceSpecFieldRow label="数量">
            <Input
              value={fields.systemDiskCount}
              disabled={disabled}
              onChange={(e) => update({ systemDiskCount: e.target.value })}
            />
          </DeviceSpecFieldRow>
          <DeviceSpecFieldRow label="盘类型">
            <Select
              value={fields.systemDiskType || undefined}
              disabled={disabled}
              onValueChange={(v) => update({ systemDiskType: v })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择类型" />
              </SelectTrigger>
              <SelectContent>
                {SYSTEM_DISK_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </DeviceSpecFieldRow>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <DeviceSpecFieldRow label="单盘容量">
            <div className="flex gap-2">
              <Input
                value={fields.systemDiskCapacity}
                disabled={disabled}
                onChange={(e) => update({ systemDiskCapacity: e.target.value })}
              />
              <Select
                value={fields.systemDiskCapacityUnit}
                disabled={disabled}
                onValueChange={(v) =>
                  update({ systemDiskCapacityUnit: v as DeviceSpecFields['systemDiskCapacityUnit'] })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAPACITY_UNIT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </DeviceSpecFieldRow>
          <DeviceSpecFieldRow label="RAID">
            <Select
              value={fields.systemDiskRaid}
              disabled={disabled}
              onValueChange={(v) =>
                update({ systemDiskRaid: v as DeviceSpecFields['systemDiskRaid'] })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RAID_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </DeviceSpecFieldRow>
        </div>
      </div>

      <div className="space-y-3 rounded-md border border-border p-3">
        <p className="text-sm font-medium text-foreground">数据本地盘</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <DeviceSpecFieldRow label="数量">
            <Input
              value={fields.dataDiskCount}
              disabled={disabled}
              onChange={(e) => update({ dataDiskCount: e.target.value })}
            />
          </DeviceSpecFieldRow>
          <DeviceSpecFieldRow label="盘类型">
            <Select
              value={fields.dataDiskType || undefined}
              disabled={disabled}
              onValueChange={(v) => update({ dataDiskType: v })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择类型" />
              </SelectTrigger>
              <SelectContent>
                {DATA_DISK_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </DeviceSpecFieldRow>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <DeviceSpecFieldRow label="单盘容量">
            <div className="flex gap-2">
              <Input
                value={fields.dataDiskCapacity}
                disabled={disabled}
                onChange={(e) => update({ dataDiskCapacity: e.target.value })}
              />
              <Select
                value={fields.dataDiskCapacityUnit}
                disabled={disabled}
                onValueChange={(v) =>
                  update({ dataDiskCapacityUnit: v as DeviceSpecFields['dataDiskCapacityUnit'] })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAPACITY_UNIT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </DeviceSpecFieldRow>
          <DeviceSpecFieldRow label="接口">
            <Select
              value={fields.dataDiskInterface || undefined}
              disabled={disabled}
              onValueChange={(v) => update({ dataDiskInterface: v })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择接口" />
              </SelectTrigger>
              <SelectContent>
                {DISK_INTERFACE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </DeviceSpecFieldRow>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <DeviceSpecFieldRow label="网卡数量">
          <Input
            value={fields.nicCount}
            disabled={disabled}
            onChange={(e) => update({ nicCount: e.target.value })}
          />
        </DeviceSpecFieldRow>
        <DeviceSpecFieldRow label="网卡速率">
          <Select
            value={fields.nicSpeed || undefined}
            disabled={disabled}
            onValueChange={(v) => update({ nicSpeed: v })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="选择速率" />
            </SelectTrigger>
            <SelectContent>
              {NIC_SPEED_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DeviceSpecFieldRow>
        <DeviceSpecFieldRow label="端口类型">
          <Select
            value={fields.nicPortType || undefined}
            disabled={disabled}
            onValueChange={(v) => update({ nicPortType: v })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="选择端口" />
            </SelectTrigger>
            <SelectContent>
              {NIC_PORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DeviceSpecFieldRow>
      </div>

      {showGpu ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <DeviceSpecFieldRow
            label="GPU 数量"
            hint={gpuAutoFilled ? '已从卡型成本配置自动推断，可按需修改' : undefined}
          >
            <Input
              placeholder="如 8"
              value={fields.gpuCount}
              disabled={disabled}
              onChange={(e) => update({ gpuCount: e.target.value })}
            />
          </DeviceSpecFieldRow>
          <DeviceSpecFieldRow
            label="GPU 型号"
            hint={gpuAutoFilled ? '已从系统卡型名称自动填充' : undefined}
          >
            <Input
              placeholder="如 RTX 5090"
              value={fields.gpuModel}
              disabled={disabled}
              onChange={(e) => update({ gpuModel: e.target.value })}
            />
          </DeviceSpecFieldRow>
        </div>
      ) : null}

      <DeviceSpecFieldRow label="设备备注">
        <Textarea
          rows={2}
          placeholder="补充说明（可选）"
          value={fields.remark}
          disabled={disabled}
          onChange={(e) => update({ remark: e.target.value })}
        />
      </DeviceSpecFieldRow>
    </div>
  )
}

export function DatacenterCardSpecDialog({
  open,
  onOpenChange,
  dataCenterId,
  dataCenterName,
  gpuCardTypeId,
  gpuCardTypeName,
  cardsPerMachine,
  deviceRole,
  onSuccess,
}: DatacenterCardSpecDialogProps) {
  const utils = trpc.useUtils()
  const [form, setForm] = useState<DatacenterCardSpecFormValues>({
    deviceSpecFields: resolveDeviceSpecFields(null, {
      cardTypeName: gpuCardTypeName,
      cardsPerMachine,
      deviceRole,
    }),
  })

  const inferCtx = useMemo(
    () => ({
      cardTypeName: gpuCardTypeName,
      cardsPerMachine,
      deviceRole,
    }),
    [gpuCardTypeName, cardsPerMachine, deviceRole],
  )

  const showGpu = deviceRole !== 'infra'

  const { data: existing, isFetching } = trpc.supplier.datacenterCardSpecs.get.useQuery(
    { dataCenterId, gpuCardTypeId },
    { enabled: open && Boolean(dataCenterId && gpuCardTypeId) },
  )

  useEffect(() => {
    if (!open) return
    if (isFetching) return

    setForm({
      deviceSpecFields: resolveDeviceSpecFields(existing?.deviceSpec, inferCtx),
    })
  }, [open, existing, isFetching, inferCtx])

  const upsertMutation = trpc.supplier.datacenterCardSpecs.upsert.useMutation({
    onSuccess: async () => {
      toast.success('机房卡型设备配置已保存')
      onOpenChange(false)
      await utils.supplier.datacenterCardSpecs.get.invalidate({ dataCenterId, gpuCardTypeId })
      await utils.supplier.gpuCardTypes.getDatacenterDetail.invalidate()
      onSuccess?.()
    },
    onError: (e) => toast.error(e.message || '保存失败，请稍后重试'),
  })

  const handleSubmit = () => {
    upsertMutation.mutate({
      dataCenterId,
      gpuCardTypeId,
      deviceSpec: formatDeviceSpec(form.deviceSpecFields),
      remark: form.deviceSpecFields.remark,
    })
  }

  const devicePreview = useMemo(
    () => deviceSpecPreviewLines(formatDeviceSpec(form.deviceSpecFields)),
    [form.deviceSpecFields],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>机房卡型设备配置</DialogTitle>
          <DialogDescription>
            {dataCenterName} · {gpuCardTypeName} — 维护本机房该卡型的设备参数
          </DialogDescription>
        </DialogHeader>

        {isFetching ? (
          <p className="py-8 text-center text-sm text-muted-foreground">加载配置…</p>
        ) : (
          <div className="space-y-6 py-2">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">设备配置</h3>
              <DeviceSpecFieldsForm
                fields={form.deviceSpecFields}
                showGpu={showGpu}
                gpuAutoFilled={showGpu}
                disabled={upsertMutation.isPending}
                onChange={(deviceSpecFields) =>
                  setForm((prev) => ({ ...prev, deviceSpecFields }))
                }
              />
            </section>

            {devicePreview.length > 0 ? (
              <div className="rounded-md border border-border bg-muted/20 p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">设备配置展示效果</p>
                <div className="space-y-0.5 text-sm text-foreground">
                  {devicePreview.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={upsertMutation.isPending}
          >
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={upsertMutation.isPending || isFetching}>
            {upsertMutation.isPending ? '保存中…' : '保存设备配置'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
