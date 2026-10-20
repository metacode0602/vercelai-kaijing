import type { DeviceCooperationType } from '@/lib/types/supplier-domain'
import { normalizeDeviceOpsStatus } from '@/lib/supplier/device-import-utils'

/** 整租线下交付占位卡型编码（全局种子 `gpu-card-type-whole-rent-placeholder.sql`） */
export const WHOLE_RENT_UNKNOWN_GPU_CARD_CODE = 'WHOLE-RENT-UNKNOWN'

/** gpu_card_type.device_role；varchar(16) */
export const WHOLE_RENT_PLACEHOLDER_DEVICE_ROLE = 'wr_placeholder'

export const WHOLE_RENT_OFFLINE_DELIVERY_OPS_STATUS = '线下裸金属交付中'

export function isWholeRentPlaceholderGpuCardCode(code: string | null | undefined): boolean {
  return code?.trim() === WHOLE_RENT_UNKNOWN_GPU_CARD_CODE
}

export function isWholeRentPlaceholderDeviceRole(deviceRole: string | null | undefined): boolean {
  return deviceRole === WHOLE_RENT_PLACEHOLDER_DEVICE_ROLE
}

/**
 * 整租线下交付设备（WROD）：运营状态 + 合作类型 + 内网 IP。
 * 显卡型号是否为空不作为判定条件。
 */
export function isWholeRentOfflineDeliveryDevice(input: {
  opsStatus: string
  cooperationType?: DeviceCooperationType | null
  internalIp?: string | null
}): boolean {
  return (
    normalizeDeviceOpsStatus(input.opsStatus) === WHOLE_RENT_OFFLINE_DELIVERY_OPS_STATUS &&
    (input.cooperationType ?? 'idle_time') === 'whole_rent' &&
    Boolean(input.internalIp?.trim())
  )
}

/** 库内设备是否为 WROD（用于排除对账 / 聚合） */
export function isWholeRentOfflineDeliveryDbDevice(input: {
  opsStatus: string
  cooperationType?: string | null
}): boolean {
  return (
    normalizeDeviceOpsStatus(input.opsStatus) === WHOLE_RENT_OFFLINE_DELIVERY_OPS_STATUS &&
    (input.cooperationType ?? 'idle_time') === 'whole_rent'
  )
}

/** 飞书 / Excel 中常见的「无卡型」占位文案，视为空卡型（WROD 可走占位入库） */
const EFFECTIVELY_EMPTY_GPU_RAW_EXACT = new Set([
  '-',
  '—',
  '－',
  '/',
  '无',
  '暂无',
  '空',
  'n/a',
  'na',
  'null',
  'none',
  '待补充',
  '待补',
  '未知',
  '待定',
  '无卡型',
  '未填写',
  '未配置',
])

/**
 * 归一化导入行显卡型号：空白与常见占位符 → 空字符串。
 */
export function normalizeGpuCardTypeRawForImport(raw: string | null | undefined): string {
  const trimmed = raw?.trim() ?? ''
  if (!trimmed) return ''
  const collapsed = trimmed.replace(/\s+/g, '')
  if (EFFECTIVELY_EMPTY_GPU_RAW_EXACT.has(trimmed)) return ''
  if (EFFECTIVELY_EMPTY_GPU_RAW_EXACT.has(collapsed)) return ''
  if (EFFECTIVELY_EMPTY_GPU_RAW_EXACT.has(trimmed.toLowerCase())) return ''
  return trimmed
}

export function isEffectivelyEmptyGpuCardTypeRaw(raw: string | null | undefined): boolean {
  return normalizeGpuCardTypeRawForImport(raw) === ''
}

export function isWholeRentCooperationType(
  cooperationType?: DeviceCooperationType | null,
): boolean {
  return (cooperationType ?? 'idle_time') === 'whole_rent'
}

export type InventoryClusterImportFields = {
  cluster_name?: string | null
  node_name?: string | null
  node_role?: string | null
  expected_service?: string | null
}

export function hasInventoryClusterImportFields(row: InventoryClusterImportFields): boolean {
  return Boolean(
    row.cluster_name?.trim() ||
      row.node_name?.trim() ||
      row.node_role?.trim() ||
      row.expected_service?.trim(),
  )
}

/** 整租设备不使用 K8s 集群 / 节点 / 角色列 */
export function clearWholeRentInventoryClusterFields<T extends InventoryClusterImportFields>(
  row: T,
): T {
  return {
    ...row,
    cluster_name: undefined,
    node_name: undefined,
    node_role: undefined,
    expected_service: undefined,
  }
}
