import type { SupplierDevice } from '@/lib/types/supplier-domain'
import type { DeviceRetireParsedRow } from '@/lib/types/device-retire'
import { endpointMatches } from '@/lib/supplier/ip-endpoint-utils'

function normKey(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase()
}

export function findDeviceForRetire(
  devices: SupplierDevice[],
  row: Pick<DeviceRetireParsedRow, 'external_device_id' | 'asset_no' | 'external_ip' | 'internal_ip'>,
): SupplierDevice | undefined {
  if (row.external_device_id) {
    const hit = devices.find((d) => normKey(d.external_device_id) === normKey(row.external_device_id))
    if (hit) return hit
  }

  if (row.asset_no) {
    const hit = devices.find(
      (d) =>
        normKey(d.asset_no) === normKey(row.asset_no) || normKey(d.sn) === normKey(row.asset_no),
    )
    if (hit) return hit
  }

  if (row.external_ip) {
    const hit = devices.find((d) => endpointMatches(d.external_ip, row.external_ip))
    if (hit) return hit
  }

  if (row.internal_ip) {
    const hit = devices.find((d) => endpointMatches(d.internal_ip, row.internal_ip))
    if (hit) return hit
  }

  return undefined
}
