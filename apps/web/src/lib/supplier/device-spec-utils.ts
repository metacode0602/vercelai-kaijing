import { DEFAULT_CARDS_PER_MACHINE } from '@/lib/supplier/monthly-rent-pricing'
import type { GPUCardTypeRole } from '@/lib/data/types'

export const CPU_MODEL_OPTIONS = [
  { value: '6530', label: 'Intel Xeon Gold 6530' },
  { value: '8480+', label: 'Intel Xeon Platinum 8480+' },
  { value: '9554', label: 'AMD EPYC 9554' },
  { value: '9654', label: 'AMD EPYC 9654' },
  { value: 'other', label: '其他（手动输入）' },
] as const

export const MEMORY_TYPE_OPTIONS = [
  { value: 'DDR4', label: 'DDR4' },
  { value: 'DDR5', label: 'DDR5' },
] as const

export const SYSTEM_DISK_TYPE_OPTIONS = [
  { value: 'sata', label: 'SATA 固态硬盘' },
  { value: 'nvme', label: 'NVMe 固态硬盘' },
  { value: 'sas', label: 'SAS 硬盘' },
] as const

export const DATA_DISK_TYPE_OPTIONS = [
  { value: 'nvme', label: 'NVMe SSD' },
  { value: 'u2-nvme', label: 'u.2 NVMe' },
  { value: 'sata-ssd', label: 'SATA SSD' },
  { value: 'hdd-sas', label: 'HDD SAS' },
] as const

export const DISK_INTERFACE_OPTIONS = [
  { value: 'u.2', label: 'u.2' },
  { value: 'm.2', label: 'm.2' },
  { value: 'sata', label: 'SATA' },
] as const

export const RAID_OPTIONS = [
  { value: 'none', label: '无' },
  { value: 'raid1', label: 'RAID 1' },
  { value: 'raid5', label: 'RAID 5' },
  { value: 'raid10', label: 'RAID 10' },
] as const

export const NIC_SPEED_OPTIONS = [
  { value: '1G', label: '1G' },
  { value: '10G', label: '10G' },
  { value: '25G', label: '25G' },
  { value: '100G', label: '100G' },
  { value: '200G', label: '200G' },
] as const

export const NIC_PORT_OPTIONS = [
  { value: '单口', label: '单口' },
  { value: '双口', label: '双口' },
] as const

export const CAPACITY_UNIT_OPTIONS = [
  { value: 'GB', label: 'GB' },
  { value: 'TB', label: 'TB' },
] as const

/** 机房卡型设备配置结构化字段（入库前序列化为 device_spec 文本） */
export type DeviceSpecFields = {
  cpuThreads: string
  cpuCount: string
  cpuModel: string
  cpuModelCustom: string
  memoryTotalGb: string
  memoryModuleCount: string
  memoryModuleSizeGb: string
  memoryType: '' | 'DDR4' | 'DDR5'
  systemDiskCount: string
  systemDiskCapacity: string
  systemDiskCapacityUnit: 'GB' | 'TB'
  systemDiskType: string
  systemDiskRaid: 'none' | 'raid1' | 'raid5' | 'raid10'
  dataDiskCount: string
  dataDiskCapacity: string
  dataDiskCapacityUnit: 'GB' | 'TB'
  dataDiskType: string
  dataDiskInterface: string
  nicCount: string
  nicSpeed: string
  nicPortType: string
  gpuCount: string
  gpuModel: string
  remark: string
}

export const emptyDeviceSpecFields = (): DeviceSpecFields => ({
  cpuThreads: '',
  cpuCount: '2',
  cpuModel: '',
  cpuModelCustom: '',
  memoryTotalGb: '',
  memoryModuleCount: '8',
  memoryModuleSizeGb: '64',
  memoryType: 'DDR5',
  systemDiskCount: '2',
  systemDiskCapacity: '960',
  systemDiskCapacityUnit: 'GB',
  systemDiskType: 'sata',
  systemDiskRaid: 'raid1',
  dataDiskCount: '2',
  dataDiskCapacity: '7.68',
  dataDiskCapacityUnit: 'TB',
  dataDiskType: 'u2-nvme',
  dataDiskInterface: 'u.2',
  nicCount: '1',
  nicSpeed: '100G',
  nicPortType: '双口',
  gpuCount: '',
  gpuModel: '',
  remark: '',
})

export type DeviceSpecInferContext = {
  cardTypeName: string
  cardsPerMachine?: number
  deviceRole?: GPUCardTypeRole
}

function trimField(value: string | undefined | null): string {
  return value?.trim() ?? ''
}

function hasText(value: string): boolean {
  return value.trim().length > 0
}

function labelOf<T extends { value: string; label: string }>(
  options: readonly T[],
  value: string,
): string {
  return options.find((o) => o.value === value)?.label ?? value
}

function raidLabel(raid: DeviceSpecFields['systemDiskRaid']): string {
  if (raid === 'none') return '无RAID'
  return labelOf(RAID_OPTIONS, raid)
}

/** 从卡型与成本配置推断 GPU 等可自动填充项 */
export function inferDeviceSpecDefaults(ctx: DeviceSpecInferContext): DeviceSpecFields {
  const isGpuCard = ctx.deviceRole !== 'infra'
  return {
    ...emptyDeviceSpecFields(),
    gpuCount: isGpuCard ? String(ctx.cardsPerMachine ?? DEFAULT_CARDS_PER_MACHINE) : '',
    gpuModel: isGpuCard ? trimField(ctx.cardTypeName) : '',
  }
}

export function formatMemoryModules(fields: DeviceSpecFields): string {
  const parts: string[] = []
  if (hasText(fields.memoryModuleCount) && hasText(fields.memoryModuleSizeGb)) {
    parts.push(`${fields.memoryModuleCount.trim()}*${fields.memoryModuleSizeGb.trim()}GB`)
  }
  if (fields.memoryType) parts.push(fields.memoryType)
  return parts.join(' ')
}

export function formatSystemDisk(fields: DeviceSpecFields): string {
  if (!hasText(fields.systemDiskCount) && !hasText(fields.systemDiskCapacity)) return ''
  const typeLabel = labelOf(SYSTEM_DISK_TYPE_OPTIONS, fields.systemDiskType) || fields.systemDiskType
  const capacity = fields.systemDiskCapacity.trim()
  const unit = fields.systemDiskCapacityUnit
  const raid = fields.systemDiskRaid !== 'none' ? `(${raidLabel(fields.systemDiskRaid)})` : ''
  const count = fields.systemDiskCount.trim() || '1'
  if (!capacity) return `${count}*${typeLabel}${raid}`.trim()
  return `${count}*${typeLabel} 容量${capacity}${unit}${raid}`.trim()
}

export function formatDataDisk(fields: DeviceSpecFields): string {
  if (!hasText(fields.dataDiskCount) && !hasText(fields.dataDiskCapacity)) return ''
  const count = fields.dataDiskCount.trim() || '1'
  const capacity = fields.dataDiskCapacity.trim()
  const unit = fields.dataDiskCapacityUnit
  const iface = fields.dataDiskInterface.trim()
  if (!capacity) return count
  return `${count}*${capacity}${unit}${iface ? iface : ''}`.trim()
}

export function formatNic(fields: DeviceSpecFields): string {
  if (!hasText(fields.nicCount) && !hasText(fields.nicSpeed)) return ''
  const count = fields.nicCount.trim() || '1'
  const speed = fields.nicSpeed.trim()
  const ports = fields.nicPortType.trim()
  return `${count}*${speed}${ports}`.trim()
}

export function formatCpuModel(fields: DeviceSpecFields): string {
  if (fields.cpuModel === 'other') return fields.cpuModelCustom.trim()
  return fields.cpuModel.trim()
}

/** 将结构化字段格式化为展示/入库文本 */
export function formatDeviceSpec(fields: DeviceSpecFields): string {
  const lines: string[] = []

  const cpuParts: string[] = []
  if (hasText(fields.cpuThreads)) cpuParts.push(`${fields.cpuThreads.trim()}线程`)
  const cpuModel = formatCpuModel(fields)
  if (hasText(fields.cpuCount) && cpuModel) {
    cpuParts.push(`${fields.cpuCount.trim()}*${cpuModel}`)
  } else if (cpuModel) {
    cpuParts.push(cpuModel)
  }
  if (cpuParts.length > 0) lines.push(`CPU: ${cpuParts.join('， ')}`)

  const memoryParts: string[] = []
  if (hasText(fields.memoryTotalGb)) memoryParts.push(`${fields.memoryTotalGb.trim()}GB`)
  const modules = formatMemoryModules(fields)
  if (modules) memoryParts.push(modules)
  if (memoryParts.length > 0) lines.push(`内存: ${memoryParts.join('  ')}`)

  const systemDisk = formatSystemDisk(fields)
  if (systemDisk) lines.push(`系统盘: ${systemDisk}`)

  const dataDisk = formatDataDisk(fields)
  if (dataDisk) lines.push(`数据本地盘: ${dataDisk}`)

  const nic = formatNic(fields)
  if (nic) lines.push(`网卡1: ${nic}`)

  if (hasText(fields.gpuCount) && hasText(fields.gpuModel)) {
    lines.push(`GPU: ${fields.gpuCount.trim()}*${fields.gpuModel.trim()}`)
  } else if (hasText(fields.gpuModel)) {
    lines.push(`GPU: ${fields.gpuModel.trim()}`)
  }

  if (hasText(fields.remark)) lines.push(`备注：${fields.remark.trim()}`)

  return lines.join('\n')
}

function extractLineValue(text: string, label: string): string | null {
  const pattern = new RegExp(`^${label}\\s*[:：]\\s*(.+)$`, 'im')
  const match = text.match(pattern)
  return match?.[1]?.trim() ?? null
}

/** 从已保存的 device_spec 文本解析为结构化字段（兼容旧格式） */
export function parseDeviceSpec(text: string | null | undefined): DeviceSpecFields {
  const fields = emptyDeviceSpecFields()
  const raw = trimField(text)
  if (!raw) return fields

  const cpuLine = extractLineValue(raw, 'CPU')
  if (cpuLine) {
    const threadsMatch = cpuLine.match(/(\d+)\s*线程/)
    if (threadsMatch) fields.cpuThreads = threadsMatch[1]!

    const countModelMatch = cpuLine.match(/(\d+)\s*\*\s*([^，,]+)/)
    if (countModelMatch) {
      fields.cpuCount = countModelMatch[1]!
      const model = countModelMatch[2]!.trim()
      const known = CPU_MODEL_OPTIONS.find((o) => o.value === model || o.label.includes(model))
      if (known && known.value !== 'other') {
        fields.cpuModel = known.value
      } else {
        fields.cpuModel = 'other'
        fields.cpuModelCustom = model
      }
    } else if (!threadsMatch) {
      fields.cpuModel = 'other'
      fields.cpuModelCustom = cpuLine
    }
  }

  const memoryLine = extractLineValue(raw, '内存')
  if (memoryLine) {
    const totalMatch = memoryLine.match(/(\d+(?:\.\d+)?)\s*GB/i)
    if (totalMatch) fields.memoryTotalGb = totalMatch[1]!

    const moduleMatch = memoryLine.match(/(\d+)\s*\*\s*(\d+(?:\.\d+)?)\s*GB/i)
    if (moduleMatch) {
      fields.memoryModuleCount = moduleMatch[1]!
      fields.memoryModuleSizeGb = moduleMatch[2]!
    }

    if (/DDR5/i.test(memoryLine)) fields.memoryType = 'DDR5'
    else if (/DDR4/i.test(memoryLine)) fields.memoryType = 'DDR4'
  }

  const systemDisk = extractLineValue(raw, '系统盘')
  if (systemDisk) {
    const countMatch = systemDisk.match(/^(\d+)\s*\*/)
    if (countMatch) fields.systemDiskCount = countMatch[1]!

    const capMatch = systemDisk.match(/容量\s*(\d+(?:\.\d+)?)\s*(GB|TB)/i)
    if (capMatch) {
      fields.systemDiskCapacity = capMatch[1]!
      fields.systemDiskCapacityUnit = capMatch[2]!.toUpperCase() as 'GB' | 'TB'
    }

    if (/sata/i.test(systemDisk)) fields.systemDiskType = 'sata'
    else if (/nvme/i.test(systemDisk)) fields.systemDiskType = 'nvme'
    else if (/sas/i.test(systemDisk)) fields.systemDiskType = 'sas'

    if (/raid\s*1/i.test(systemDisk)) fields.systemDiskRaid = 'raid1'
    else if (/raid\s*5/i.test(systemDisk)) fields.systemDiskRaid = 'raid5'
    else if (/raid\s*10/i.test(systemDisk)) fields.systemDiskRaid = 'raid10'

    if (!capMatch && !countMatch) fields.systemDiskType = ''
  }

  const dataDisk = extractLineValue(raw, '数据本地盘')
  if (dataDisk) {
    const countMatch = dataDisk.match(/^(\d+)\s*\*/)
    if (countMatch) fields.dataDiskCount = countMatch[1]!

    const capMatch = dataDisk.match(/\*\s*(\d+(?:\.\d+)?)\s*(GB|TB)/i)
    if (capMatch) {
      fields.dataDiskCapacity = capMatch[1]!
      fields.dataDiskCapacityUnit = capMatch[2]!.toUpperCase() as 'GB' | 'TB'
    }

    if (/u\.2/i.test(dataDisk)) {
      fields.dataDiskType = 'u2-nvme'
      fields.dataDiskInterface = 'u.2'
    } else if (/m\.2/i.test(dataDisk)) {
      fields.dataDiskInterface = 'm.2'
    } else if (/sata/i.test(dataDisk)) {
      fields.dataDiskType = 'sata-ssd'
      fields.dataDiskInterface = 'sata'
    }

    if (!capMatch && !countMatch) {
      fields.dataDiskCapacity = ''
      fields.dataDiskCount = ''
    }
  }

  const nic1 = extractLineValue(raw, '网卡1')
  if (nic1) {
    const nicMatch = nic1.match(/(\d+)\s*\*\s*(\d+G)(单口|双口)?/i)
    if (nicMatch) {
      fields.nicCount = nicMatch[1]!
      fields.nicSpeed = nicMatch[2]!.toUpperCase()
      if (nicMatch[3]) fields.nicPortType = nicMatch[3]!
    } else {
      fields.nicSpeed = nic1
    }
  }

  const gpuLine = extractLineValue(raw, 'GPU')
  if (gpuLine) {
    const gpuMatch = gpuLine.match(/(\d+)\s*\*\s*(.+)/)
    if (gpuMatch) {
      fields.gpuCount = gpuMatch[1]!
      fields.gpuModel = gpuMatch[2]!.trim()
    } else {
      fields.gpuModel = gpuLine
    }
  }

  const remark = extractLineValue(raw, '备注')
  if (remark) fields.remark = remark

  return fields
}

/** 解析已有文本，缺失项用推断默认值补齐 */
export function resolveDeviceSpecFields(
  savedText: string | null | undefined,
  ctx: DeviceSpecInferContext,
): DeviceSpecFields {
  const parsed = parseDeviceSpec(savedText)
  const defaults = inferDeviceSpecDefaults(ctx)

  return {
    ...defaults,
    ...parsed,
    gpuCount: parsed.gpuCount || defaults.gpuCount,
    gpuModel: parsed.gpuModel || defaults.gpuModel,
  }
}

export function deviceSpecPreviewLines(text: string | null | undefined): string[] {
  const raw = trimField(text)
  if (!raw) return []
  return raw.split('\n').map((line) => line.trim()).filter(Boolean)
}
