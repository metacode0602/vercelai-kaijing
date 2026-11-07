/**
 * 库区类型与 ID 工具。主路径已切到 tRPC `wms.listZones` /
 * `commerce_warehouse_zones` + `commerce_bins.zone_code`，不再使用 localStorage Demo。
 */

export type WarehouseZone = {
  id: string
  warehouseCode: string
  code: string
  name: string
  purpose: string
  status: '启用' | '停用'
  note: string
}

/** 稳定合成 ID：仓库编码:库区编码（兼容 wms.getZone 的历史链接） */
export function zoneRecordId(warehouseCode: string, code: string) {
  return `${warehouseCode}:${code}`
}

export function parseZoneRecordId(id: string): { warehouseCode: string; code: string } | null {
  const idx = id.indexOf(':')
  if (idx <= 0) return null
  return { warehouseCode: id.slice(0, idx), code: id.slice(idx + 1) }
}
