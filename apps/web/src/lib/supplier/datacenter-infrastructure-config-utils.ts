import type { DataCenter } from '@/lib/data/types'

export const BANDWIDTH_TYPE_OPTIONS = [
  { value: 'dedicated', label: '独享带宽' },
  { value: 'shared', label: '共享带宽' },
  { value: 'bgp', label: 'BGP多线' },
  { value: 'dual-line', label: '双线' },
] as const

export const BANDWIDTH_UNIT_OPTIONS = [
  { value: 'Mbps', label: 'Mbps' },
  { value: 'Gbps', label: 'Gbps' },
] as const

export const ISP_OPTIONS = [
  { value: '中国电信', label: '电信' },
  { value: '中国联通', label: '联通' },
  { value: '中国移动', label: '移动' },
  { value: 'BGP多线', label: 'BGP多线' },
  { value: '其他', label: '其他' },
] as const

export const IPV6_OPTIONS = [
  { value: 'none', label: '不需要' },
  { value: 'single', label: '单个地址' },
  { value: 'subnet64', label: '/64 子网' },
  { value: 'subnet48', label: '/48 子网' },
] as const

export const PORT_TYPE_OPTIONS = [
  { value: 'rj45', label: 'RJ45 千兆' },
  { value: 'sfp-plus', label: 'SFP+ 万兆' },
  { value: 'qsfp28', label: 'QSFP28 100G' },
] as const

export const VLAN_OPTIONS = [
  { value: 'none', label: '不需要' },
  { value: 'single', label: '单VLAN' },
  { value: 'multi', label: '多VLAN' },
] as const

export const STORAGE_TYPE_OPTIONS = [
  { value: 'ssd', label: 'SSD' },
  { value: 'nvme', label: 'NVMe' },
  { value: 'hdd-sas', label: 'HDD SAS' },
] as const

export const STORAGE_UNIT_OPTIONS = [
  { value: 'GB', label: 'GB' },
  { value: 'TB', label: 'TB' },
] as const

export const RAID_LEVEL_OPTIONS = [
  { value: 'none', label: '无' },
  { value: 'raid1', label: 'RAID 1' },
  { value: 'raid5', label: 'RAID 5' },
  { value: 'raid10', label: 'RAID 10' },
] as const

export type BandwidthConfigForm = {
  bandwidthType: string
  bandwidthSize: string
  bandwidthUnit: 'Mbps' | 'Gbps'
  isps: string[]
  customIspName: string
  bandwidthExpandable: boolean
  maxBandwidth: string
  maxBandwidthUnit: 'Mbps' | 'Gbps'
  bandwidthExpandCount: string
  bandwidthExpandStep: string
  bandwidthExpandStepUnit: 'Mbps' | 'Gbps'
  extraBandwidthLines: string
  remark: string
}

export type NetworkConfigForm = {
  ipv4Count: string
  ipv6Option: 'none' | 'single' | 'subnet64' | 'subnet48'
  portCount: string
  portType: 'rj45' | 'sfp-plus' | 'qsfp28'
  vlanConfig: 'none' | 'single' | 'multi'
  vlanCount: string
  internalIpRange: string
  remark: string
}

export type StorageConfigForm = {
  storageType: string
  storageCapacity: string
  storageUnit: 'GB' | 'TB'
  raidLevel: 'none' | 'raid1' | 'raid5' | 'raid10'
  diskCount: string
  storageExpandable: boolean
  maxStorageCapacity: string
  maxStorageUnit: 'GB' | 'TB'
  storageExpandDiskCount: string
  storageExpandDiskSize: string
  storageExpandDiskUnit: 'GB' | 'TB'
  remark: string
}

export type DatacenterInfrastructureForm = {
  bandwidth: BandwidthConfigForm
  network: NetworkConfigForm
  storage: StorageConfigForm
}

function labelOf<T extends { value: string; label: string }>(
  options: readonly T[],
  value: string,
): string {
  return options.find((o) => o.value === value)?.label ?? value
}

export function buildDefaultInfrastructureForm(
  dataCenter: Pick<DataCenter, 'internalNetworkCidr' | 'publicIpCount' | 'networkFee'>,
): DatacenterInfrastructureForm {
  return {
    bandwidth: {
      bandwidthType: 'dedicated',
      bandwidthSize: '100',
      bandwidthUnit: 'Gbps',
      isps: ['中国电信'],
      customIspName: '',
      bandwidthExpandable: false,
      maxBandwidth: '500',
      maxBandwidthUnit: 'Gbps',
      bandwidthExpandCount: '4',
      bandwidthExpandStep: '100',
      bandwidthExpandStepUnit: 'Gbps',
      extraBandwidthLines: '0',
      remark: `网络月费 ¥${dataCenter.networkFee.toLocaleString()}`,
    },
    network: {
      ipv4Count: dataCenter.publicIpCount != null ? String(dataCenter.publicIpCount) : '1',
      ipv6Option: 'none',
      portCount: '2',
      portType: 'qsfp28',
      vlanConfig: 'none',
      vlanCount: '3',
      internalIpRange: dataCenter.internalNetworkCidr ?? '10.0.0.0/16',
      remark: '',
    },
    storage: {
      storageType: 'nvme',
      storageCapacity: '500',
      storageUnit: 'GB',
      raidLevel: 'raid1',
      diskCount: '2',
      storageExpandable: false,
      maxStorageCapacity: '2000',
      maxStorageUnit: 'GB',
      storageExpandDiskCount: '8',
      storageExpandDiskSize: '250',
      storageExpandDiskUnit: 'GB',
      remark: '',
    },
  }
}

export function formatBandwidthSummary(b: BandwidthConfigForm): string {
  const lines: string[] = []
  if (b.bandwidthType) {
    lines.push(`类型: ${labelOf(BANDWIDTH_TYPE_OPTIONS, b.bandwidthType)}`)
  }
  if (b.bandwidthSize) {
    lines.push(`带宽: ${b.bandwidthSize} ${b.bandwidthUnit}`)
  }
  if (b.isps.length > 0) {
    const ispText = b.isps
      .map((isp) => (isp === '其他' && b.customIspName.trim() ? b.customIspName.trim() : isp))
      .join(' + ')
    lines.push(`运营商: ${ispText}`)
  }
  if (b.bandwidthExpandable) {
    lines.push(
      `扩展: 最大 ${b.maxBandwidth}${b.maxBandwidthUnit}，${b.bandwidthExpandCount} 单元 × ${b.bandwidthExpandStep}${b.bandwidthExpandStepUnit}`,
    )
  } else {
    lines.push('扩展: 不支持')
  }
  if (parseInt(b.extraBandwidthLines, 10) > 0) {
    lines.push(`附加线路: ${b.extraBandwidthLines} 条`)
  }
  if (b.remark.trim()) lines.push(`备注: ${b.remark.trim()}`)
  return lines.join('\n')
}

export function formatNetworkSummary(n: NetworkConfigForm): string {
  const lines: string[] = []
  lines.push(`IPv4: ${n.ipv4Count} 个`)
  if (n.ipv6Option !== 'none') {
    lines.push(`IPv6: ${labelOf(IPV6_OPTIONS, n.ipv6Option)}`)
  }
  lines.push(`端口: ${n.portCount} × ${labelOf(PORT_TYPE_OPTIONS, n.portType)}`)
  if (n.vlanConfig !== 'none') {
    lines.push(
      n.vlanConfig === 'multi'
        ? `VLAN: 多VLAN（${n.vlanCount} 个）`
        : 'VLAN: 单VLAN',
    )
  }
  if (n.internalIpRange.trim()) lines.push(`内网网段: ${n.internalIpRange.trim()}`)
  if (n.remark.trim()) lines.push(`备注: ${n.remark.trim()}`)
  return lines.join('\n')
}

export function formatStorageSummary(s: StorageConfigForm): string {
  const lines: string[] = []
  if (s.storageType) {
    lines.push(`类型: ${labelOf(STORAGE_TYPE_OPTIONS, s.storageType)}`)
  }
  if (s.storageCapacity) {
    lines.push(`容量: ${s.storageCapacity} ${s.storageUnit}`)
  }
  lines.push(`RAID: ${labelOf(RAID_LEVEL_OPTIONS, s.raidLevel)}`)
  lines.push(`硬盘数量: ${s.diskCount} 块`)
  if (s.storageExpandable) {
    lines.push(
      `扩展: 最大 ${s.maxStorageCapacity}${s.maxStorageUnit}，最多 ${s.storageExpandDiskCount} 块 × ${s.storageExpandDiskSize}${s.storageExpandDiskUnit}`,
    )
  } else {
    lines.push('扩展: 不支持')
  }
  if (s.remark.trim()) lines.push(`备注: ${s.remark.trim()}`)
  return lines.join('\n')
}

export function formatInfrastructureSummary(form: DatacenterInfrastructureForm): string {
  return [
    '【带宽】',
    formatBandwidthSummary(form.bandwidth),
    '',
    '【网络】',
    formatNetworkSummary(form.network),
    '',
    '【存储】',
    formatStorageSummary(form.storage),
  ].join('\n')
}

export function summaryToLines(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter(Boolean)
}
