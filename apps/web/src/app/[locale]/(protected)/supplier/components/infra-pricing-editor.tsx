'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import { Separator } from '@workspace/ui/components/separator'

export interface InfraPricing {
  bandwidth?: {
    pricePerMbpsPerMonth: number
    includedMbps?: number
  }
  publicIp?: {
    pricePerIpPerMonth: number
    includedIps?: number
  }
  cpuDevice?: {
    pricePerCorePerMonth: number
  }
  storage?: {
    nas?: {
      pricePerGbPerMonth: number
      includedGb?: number
    }
    ceph?: {
      pricePerGbPerMonth: number
      includedGb?: number
    }
    gfs?: {
      pricePerGbPerMonth: number
      includedGb?: number
    }
  }
}

interface InfraPricingEditorProps {
  value?: InfraPricing
  onChange: (value: InfraPricing) => void
  cooperationMode: 'idle_time' | 'whole_rent'
}

export function InfraPricingEditor({ value, onChange, cooperationMode }: InfraPricingEditorProps) {
  const pricing = value ?? {}

  const updateBandwidth = (field: 'pricePerMbpsPerMonth' | 'includedMbps', val: number) => {
    onChange({
      ...pricing,
      bandwidth: { ...pricing.bandwidth, [field]: val } as InfraPricing['bandwidth'],
    })
  }

  const updatePublicIp = (field: 'pricePerIpPerMonth' | 'includedIps', val: number) => {
    onChange({
      ...pricing,
      publicIp: { ...pricing.publicIp, [field]: val } as InfraPricing['publicIp'],
    })
  }

  const updateCpuDevice = (val: number) => {
    onChange({
      ...pricing,
      cpuDevice: { pricePerCorePerMonth: val },
    })
  }

  const updateStorage = (
    type: 'nas' | 'ceph' | 'gfs',
    field: 'pricePerGbPerMonth' | 'includedGb',
    val: number,
  ) => {
    onChange({
      ...pricing,
      storage: {
        ...pricing.storage,
        [type]: { ...pricing.storage?.[type], [field]: val },
      },
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>基础设施费用 (InfraPricing)</CardTitle>
        <CardDescription>
          配置带宽、IP、CPU 设备、存储等基础设施的月度费用结构
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Bandwidth */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">带宽费用</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">价格 (元/Mbps/月) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="20"
                value={pricing.bandwidth?.pricePerMbpsPerMonth ?? ''}
                onChange={(e) => updateBandwidth('pricePerMbpsPerMonth', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">免费额度 (Mbps)</Label>
              <Input
                type="number"
                min="0"
                placeholder="100"
                value={pricing.bandwidth?.includedMbps ?? ''}
                onChange={(e) => updateBandwidth('includedMbps', parseInt(e.target.value, 10) || 0)}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Public IP */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">公网 IP 费用</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">价格 (元/IP/月) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="15"
                value={pricing.publicIp?.pricePerIpPerMonth ?? ''}
                onChange={(e) => updatePublicIp('pricePerIpPerMonth', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">免费 IP 数量</Label>
              <Input
                type="number"
                min="0"
                placeholder="2"
                value={pricing.publicIp?.includedIps ?? ''}
                onChange={(e) => updatePublicIp('includedIps', parseInt(e.target.value, 10) || 0)}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* CPU Device (仅整租模式) */}
        {cooperationMode === 'whole_rent' && (
          <>
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">CPU 设备费用（整租模式）</h4>
              <div className="space-y-2">
                <Label className="text-xs">价格 (元/核/月)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="50"
                  value={pricing.cpuDevice?.pricePerCorePerMonth ?? ''}
                  onChange={(e) => updateCpuDevice(parseFloat(e.target.value) || 0)}
                  className="max-w-xs"
                />
              </div>
            </div>
            <Separator />
          </>
        )}

        {/* Storage */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">存储费用</h4>

          {/* NAS */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">NAS 存储</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">价格 (元/GB/月)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.5"
                  value={pricing.storage?.nas?.pricePerGbPerMonth ?? ''}
                  onChange={(e) =>
                    updateStorage('nas', 'pricePerGbPerMonth', parseFloat(e.target.value) || 0)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">免费额度 (GB)</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="500"
                  value={pricing.storage?.nas?.includedGb ?? ''}
                  onChange={(e) => updateStorage('nas', 'includedGb', parseInt(e.target.value, 10) || 0)}
                />
              </div>
            </div>
          </div>

          {/* Ceph */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Ceph 存储</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">价格 (元/GB/月)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.3"
                  value={pricing.storage?.ceph?.pricePerGbPerMonth ?? ''}
                  onChange={(e) =>
                    updateStorage('ceph', 'pricePerGbPerMonth', parseFloat(e.target.value) || 0)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">免费额度 (GB)</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="2000"
                  value={pricing.storage?.ceph?.includedGb ?? ''}
                  onChange={(e) => updateStorage('ceph', 'includedGb', parseInt(e.target.value, 10) || 0)}
                />
              </div>
            </div>
          </div>

          {/* GFS */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">GFS 存储</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">价格 (元/GB/月)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.2"
                  value={pricing.storage?.gfs?.pricePerGbPerMonth ?? ''}
                  onChange={(e) =>
                    updateStorage('gfs', 'pricePerGbPerMonth', parseFloat(e.target.value) || 0)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">免费额度 (GB)</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="1000"
                  value={pricing.storage?.gfs?.includedGb ?? ''}
                  onChange={(e) => updateStorage('gfs', 'includedGb', parseInt(e.target.value, 10) || 0)}
                />
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
