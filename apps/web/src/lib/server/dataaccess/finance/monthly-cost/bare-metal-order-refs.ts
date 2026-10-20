import { db } from '@/lib/db'
import { normalizeBillingRegion } from '@/lib/server/dataaccess/finance/tenant-bill-pricing'
import { bareMetalOrder, bareMetalOrderDevice, dataCenter } from '@workspace/db/schema'
import { and, eq, gt, inArray, isNotNull, lt } from 'drizzle-orm'

function monthEndExclusiveDate(usageMonth: string): string {
  const [y, m] = usageMonth.split('-').map(Number)
  const nextMonth =
    m === 12 ? `${y! + 1}-01-01` : `${y}-${String(m! + 1).padStart(2, '0')}-01`
  return nextMonth
}

function orderRef(orderNo: string | null, platformOrderId: string | null): string | null {
  return orderNo?.trim() || platformOrderId?.trim() || null
}

/**
 * 按「平台租户 + 区域码」汇总结算月内相交的裸金属订单编号，供跑批告警展示。
 */
export async function loadBareMetalOrderRefsByTenantRegion(input: {
  usageMonth: string
  tenantPlatformIds: string[]
}): Promise<Map<string, string>> {
  const platformIds = [...new Set(input.tenantPlatformIds.filter(Boolean))]
  const map = new Map<string, string>()
  if (platformIds.length === 0) return map

  const windowStart = new Date(`${input.usageMonth}-01T00:00:00+08:00`)
  const windowEndExclusive = new Date(`${monthEndExclusiveDate(input.usageMonth)}T00:00:00+08:00`)

  const rows = await db
    .select({
      platformTenantId: bareMetalOrder.platformTenantId,
      orderNo: bareMetalOrder.orderNo,
      platformOrderId: bareMetalOrder.platformOrderId,
      idcCode: bareMetalOrder.idcCode,
      idcName: bareMetalOrder.idcName,
      bareMetalRegion: dataCenter.bareMetalRegion,
      containerInstanceRegion: dataCenter.containerInstanceRegion,
      dataCenterCode: dataCenter.code,
      dataCenterName: dataCenter.name,
    })
    .from(bareMetalOrder)
    .innerJoin(
      bareMetalOrderDevice,
      eq(bareMetalOrderDevice.bareMetalOrderId, bareMetalOrder.id),
    )
    .leftJoin(dataCenter, eq(dataCenter.id, bareMetalOrder.dataCenterId))
    .where(
      and(
        inArray(bareMetalOrder.platformTenantId, platformIds),
        isNotNull(bareMetalOrderDevice.rentStartsAt),
        isNotNull(bareMetalOrderDevice.rentEndsAt),
        lt(bareMetalOrderDevice.rentStartsAt, windowEndExclusive),
        gt(bareMetalOrderDevice.rentEndsAt, windowStart),
      ),
    )

  const grouped = new Map<string, Set<string>>()

  for (const row of rows) {
    const ref = orderRef(row.orderNo, row.platformOrderId)
    if (!ref) continue

    const regionCandidates = [
      row.bareMetalRegion,
      row.dataCenterCode,
      row.dataCenterName,
      row.containerInstanceRegion,
      row.idcCode,
      row.idcName,
    ]
      .map((v) => (v?.trim() ? normalizeBillingRegion(v) : null))
      .filter((v): v is string => Boolean(v))

    const uniqueRegions = [...new Set(regionCandidates)]
    for (const region of uniqueRegions) {
      const key = `${row.platformTenantId}::${region}`
      const set = grouped.get(key) ?? new Set<string>()
      set.add(ref)
      grouped.set(key, set)
    }
  }

  for (const [key, refs] of grouped) {
    map.set(key, [...refs].sort().join('、'))
  }

  return map
}
