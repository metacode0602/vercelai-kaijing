'use client'

import type { ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import { Textarea } from '@workspace/ui/components/textarea'
import { Switch } from '@workspace/ui/components/switch'
import { Checkbox } from '@workspace/ui/components/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'
import {
  BANDWIDTH_TYPE_OPTIONS,
  BANDWIDTH_UNIT_OPTIONS,
  ISP_OPTIONS,
  IPV6_OPTIONS,
  PORT_TYPE_OPTIONS,
  RAID_LEVEL_OPTIONS,
  STORAGE_TYPE_OPTIONS,
  STORAGE_UNIT_OPTIONS,
  VLAN_OPTIONS,
  type DatacenterInfrastructureForm,
} from '@/lib/supplier/datacenter-infrastructure-config-utils'

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-sm font-semibold text-foreground">{children}</h3>
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-sm">
        {required ? <span className="text-destructive mr-1">*</span> : null}
        {label}
      </Label>
      {children}
    </div>
  )
}

function QuantityInput({
  value,
  onChange,
  min = 0,
  max = 999,
}: {
  value: string
  onChange: (value: string) => void
  min?: number
  max?: number
}) {
  const num = parseInt(value, 10) || 0
  const adjust = (delta: number) => {
    const next = Math.max(min, Math.min(max, num + delta))
    onChange(String(next))
  }
  return (
    <div className="flex w-fit items-center overflow-hidden rounded-md border border-input">
      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-none" onClick={() => adjust(-1)}>
        <Minus className="h-4 w-4" />
      </Button>
      <Input
        className="h-9 w-16 rounded-none border-0 border-x text-center"
        value={value}
        readOnly
      />
      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-none" onClick={() => adjust(1)}>
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  )
}

function UnitNumberInput({
  value,
  unit,
  onValueChange,
  onUnitChange,
  unitOptions,
}: {
  value: string
  unit: string
  onValueChange: (v: string) => void
  onUnitChange: (v: string) => void
  unitOptions: readonly { value: string; label: string }[]
}) {
  return (
    <div className="flex gap-2">
      <Input
        type="number"
        className="flex-1"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
      />
      <Select value={unit} onValueChange={onUnitChange}>
        <SelectTrigger className="w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {unitOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

type DatacenterInfrastructureEditDialogFormProps = {
  value: DatacenterInfrastructureForm
  onChange: (value: DatacenterInfrastructureForm) => void
}

export function DatacenterInfrastructureEditDialogForm({
  value,
  onChange,
}: DatacenterInfrastructureEditDialogFormProps) {
  const updateBandwidth = (patch: Partial<DatacenterInfrastructureForm['bandwidth']>) => {
    onChange({ ...value, bandwidth: { ...value.bandwidth, ...patch } })
  }
  const updateNetwork = (patch: Partial<DatacenterInfrastructureForm['network']>) => {
    onChange({ ...value, network: { ...value.network, ...patch } })
  }
  const updateStorage = (patch: Partial<DatacenterInfrastructureForm['storage']>) => {
    onChange({ ...value, storage: { ...value.storage, ...patch } })
  }

  const toggleIsp = (isp: string, checked: boolean) => {
    const next = checked
      ? [...value.bandwidth.isps, isp]
      : value.bandwidth.isps.filter((item) => item !== isp)
    updateBandwidth({ isps: next })
  }

  return (
    <div className="space-y-8 py-2">
      <section className="space-y-4">
        <SectionTitle>带宽配置</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="带宽类型" required>
            <Select
              value={value.bandwidth.bandwidthType || undefined}
              onValueChange={(v) => updateBandwidth({ bandwidthType: v })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="请选择" />
              </SelectTrigger>
              <SelectContent>
                {BANDWIDTH_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="带宽大小" required>
            <UnitNumberInput
              value={value.bandwidth.bandwidthSize}
              unit={value.bandwidth.bandwidthUnit}
              onValueChange={(v) => updateBandwidth({ bandwidthSize: v })}
              onUnitChange={(v) =>
                updateBandwidth({ bandwidthUnit: v as DatacenterInfrastructureForm['bandwidth']['bandwidthUnit'] })
              }
              unitOptions={BANDWIDTH_UNIT_OPTIONS}
            />
          </Field>
        </div>

        <Field label="运营商" required>
          <div className="flex flex-wrap gap-3">
            {ISP_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={value.bandwidth.isps.includes(opt.value)}
                  onCheckedChange={(checked) => toggleIsp(opt.value, checked === true)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </Field>

        {value.bandwidth.isps.includes('其他') ? (
          <Field label="自定义运营商">
            <Input
              value={value.bandwidth.customIspName}
              onChange={(e) => updateBandwidth({ customIspName: e.target.value })}
              placeholder="供应商名称"
            />
          </Field>
        ) : null}

        <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
          <span className="text-sm">带宽扩展</span>
          <Switch
            checked={value.bandwidth.bandwidthExpandable}
            onCheckedChange={(checked) => updateBandwidth({ bandwidthExpandable: checked })}
          />
        </div>

        {value.bandwidth.bandwidthExpandable ? (
          <div className="grid gap-4 rounded-md border border-dashed border-border bg-muted/20 p-4 sm:grid-cols-3">
            <Field label="最大总带宽">
              <UnitNumberInput
                value={value.bandwidth.maxBandwidth}
                unit={value.bandwidth.maxBandwidthUnit}
                onValueChange={(v) => updateBandwidth({ maxBandwidth: v })}
                onUnitChange={(v) =>
                  updateBandwidth({
                    maxBandwidthUnit: v as DatacenterInfrastructureForm['bandwidth']['maxBandwidthUnit'],
                  })
                }
                unitOptions={BANDWIDTH_UNIT_OPTIONS}
              />
            </Field>
            <Field label="扩展单元数">
              <Input
                type="number"
                value={value.bandwidth.bandwidthExpandCount}
                onChange={(e) => updateBandwidth({ bandwidthExpandCount: e.target.value })}
              />
            </Field>
            <Field label="每单元带宽">
              <UnitNumberInput
                value={value.bandwidth.bandwidthExpandStep}
                unit={value.bandwidth.bandwidthExpandStepUnit}
                onValueChange={(v) => updateBandwidth({ bandwidthExpandStep: v })}
                onUnitChange={(v) =>
                  updateBandwidth({
                    bandwidthExpandStepUnit:
                      v as DatacenterInfrastructureForm['bandwidth']['bandwidthExpandStepUnit'],
                  })
                }
                unitOptions={BANDWIDTH_UNIT_OPTIONS}
              />
            </Field>
          </div>
        ) : null}

        <Field label="附加线路">
          <QuantityInput
            value={value.bandwidth.extraBandwidthLines}
            onChange={(v) => updateBandwidth({ extraBandwidthLines: v })}
            max={20}
          />
        </Field>

        <Field label="带宽备注">
          <Textarea
            rows={2}
            value={value.bandwidth.remark}
            onChange={(e) => updateBandwidth({ remark: e.target.value })}
          />
        </Field>
      </section>

      <section className="space-y-4">
        <SectionTitle>网络配置</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="IPv4 数量" required>
            <QuantityInput
              value={value.network.ipv4Count}
              onChange={(v) => updateNetwork({ ipv4Count: v })}
              min={0}
              max={256}
            />
          </Field>
          <Field label="IPv6">
            <Select
              value={value.network.ipv6Option}
              onValueChange={(v) =>
                updateNetwork({ ipv6Option: v as DatacenterInfrastructureForm['network']['ipv6Option'] })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IPV6_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="端口数量" required>
            <Input
              type="number"
              value={value.network.portCount}
              onChange={(e) => updateNetwork({ portCount: e.target.value })}
            />
          </Field>
          <Field label="端口类型">
            <Select
              value={value.network.portType}
              onValueChange={(v) =>
                updateNetwork({ portType: v as DatacenterInfrastructureForm['network']['portType'] })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PORT_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="VLAN">
            <Select
              value={value.network.vlanConfig}
              onValueChange={(v) =>
                updateNetwork({ vlanConfig: v as DatacenterInfrastructureForm['network']['vlanConfig'] })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VLAN_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {value.network.vlanConfig === 'multi' ? (
            <Field label="VLAN 数量">
              <Input
                type="number"
                value={value.network.vlanCount}
                onChange={(e) => updateNetwork({ vlanCount: e.target.value })}
              />
            </Field>
          ) : null}
        </div>

        <Field label="内网 IP 段">
          <Input
            value={value.network.internalIpRange}
            onChange={(e) => updateNetwork({ internalIpRange: e.target.value })}
            placeholder="如 10.0.0.0/16"
          />
        </Field>

        <Field label="网络备注">
          <Textarea
            rows={2}
            value={value.network.remark}
            onChange={(e) => updateNetwork({ remark: e.target.value })}
          />
        </Field>
      </section>

      <section className="space-y-4">
        <SectionTitle>存储配置</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="存储类型" required>
            <Select
              value={value.storage.storageType || undefined}
              onValueChange={(v) => updateStorage({ storageType: v })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="请选择" />
              </SelectTrigger>
              <SelectContent>
                {STORAGE_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="容量" required>
            <UnitNumberInput
              value={value.storage.storageCapacity}
              unit={value.storage.storageUnit}
              onValueChange={(v) => updateStorage({ storageCapacity: v })}
              onUnitChange={(v) =>
                updateStorage({ storageUnit: v as DatacenterInfrastructureForm['storage']['storageUnit'] })
              }
              unitOptions={STORAGE_UNIT_OPTIONS}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="RAID">
            <Select
              value={value.storage.raidLevel}
              onValueChange={(v) =>
                updateStorage({ raidLevel: v as DatacenterInfrastructureForm['storage']['raidLevel'] })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RAID_LEVEL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="硬盘数量">
            <QuantityInput
              value={value.storage.diskCount}
              onChange={(v) => updateStorage({ diskCount: v })}
              min={1}
              max={48}
            />
          </Field>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
          <span className="text-sm">存储扩展</span>
          <Switch
            checked={value.storage.storageExpandable}
            onCheckedChange={(checked) => updateStorage({ storageExpandable: checked })}
          />
        </div>

        {value.storage.storageExpandable ? (
          <div className="grid gap-4 rounded-md border border-dashed border-border bg-muted/20 p-4 sm:grid-cols-3">
            <Field label="最大容量">
              <UnitNumberInput
                value={value.storage.maxStorageCapacity}
                unit={value.storage.maxStorageUnit}
                onValueChange={(v) => updateStorage({ maxStorageCapacity: v })}
                onUnitChange={(v) =>
                  updateStorage({
                    maxStorageUnit: v as DatacenterInfrastructureForm['storage']['maxStorageUnit'],
                  })
                }
                unitOptions={STORAGE_UNIT_OPTIONS}
              />
            </Field>
            <Field label="扩展硬盘数">
              <Input
                type="number"
                value={value.storage.storageExpandDiskCount}
                onChange={(e) => updateStorage({ storageExpandDiskCount: e.target.value })}
              />
            </Field>
            <Field label="每块容量">
              <UnitNumberInput
                value={value.storage.storageExpandDiskSize}
                unit={value.storage.storageExpandDiskUnit}
                onValueChange={(v) => updateStorage({ storageExpandDiskSize: v })}
                onUnitChange={(v) =>
                  updateStorage({
                    storageExpandDiskUnit:
                      v as DatacenterInfrastructureForm['storage']['storageExpandDiskUnit'],
                  })
                }
                unitOptions={STORAGE_UNIT_OPTIONS}
              />
            </Field>
          </div>
        ) : null}

        <Field label="存储备注">
          <Textarea
            rows={2}
            value={value.storage.remark}
            onChange={(e) => updateStorage({ remark: e.target.value })}
          />
        </Field>
      </section>
    </div>
  )
}
