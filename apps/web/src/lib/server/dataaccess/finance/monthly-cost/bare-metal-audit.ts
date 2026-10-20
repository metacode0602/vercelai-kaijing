import { db } from '@/lib/db'
import {
  amortizeBareMetalDevicesForMonth,
  type BareMetalAmortizationAggregate,
  type BareMetalOrderDeviceInput,
} from '@/lib/monthly-cost/bare-metal-monthly-amortization'
import { isBaremetalPayStatusPaid } from '@/lib/server/dataaccess/finance/baremetal-order-parse'
import { bareMetalOrder, bareMetalOrderDevice } from '@workspace/db/schema'
import { and, eq, gt, inArray, isNotNull, lt } from 'drizzle-orm'

function monthEndExclusiveDate(usageMonth: string): string {
  const [y, m] = usageMonth.split('-').map(Number)
  const nextMonth =
    m === 12 ? `${y! + 1}-01-01` : `${y}-${String(m! + 1).padStart(2, '0')}-01`
  return nextMonth
}

export async function loadBareMetalAmortizationForMonth(input: {
  usageMonth: string
  tenantPlatformIds: string[]
}): Promise<Map<string, BareMetalAmortizationAggregate>> {
  const platformIds = [...new Set(input.tenantPlatformIds.filter(Boolean))]
  if (platformIds.length === 0) return new Map()

  const windowStart = new Date(`${input.usageMonth}-01T00:00:00+08:00`)
  const windowEndExclusive = new Date(`${monthEndExclusiveDate(input.usageMonth)}T00:00:00+08:00`)

  const rows = await db
    .select({
      tenantPlatformId: bareMetalOrder.platformTenantId,
      dataCenterId: bareMetalOrder.dataCenterId,
      gpuCardTypeId: bareMetalOrderDevice.gpuCardTypeId,
      payStatus: bareMetalOrder.payStatus,
      finalAmount: bareMetalOrder.finalAmount,
      couponAmount: bareMetalOrder.couponAmount,
      rentStartsAt: bareMetalOrderDevice.rentStartsAt,
      rentEndsAt: bareMetalOrderDevice.rentEndsAt,
      durationHours: bareMetalOrderDevice.durationHours,
      gpuCount: bareMetalOrderDevice.gpuCount,
    })
    .from(bareMetalOrder)
    .innerJoin(
      bareMetalOrderDevice,
      eq(bareMetalOrderDevice.bareMetalOrderId, bareMetalOrder.id),
    )
    .where(
      and(
        inArray(bareMetalOrder.platformTenantId, platformIds),
        isNotNull(bareMetalOrderDevice.rentStartsAt),
        isNotNull(bareMetalOrderDevice.rentEndsAt),
        lt(bareMetalOrderDevice.rentStartsAt, windowEndExclusive),
        gt(bareMetalOrderDevice.rentEndsAt, windowStart),
      ),
    )

  const devices: BareMetalOrderDeviceInput[] = rows.map((r) => ({
    tenantPlatformId: r.tenantPlatformId,
    dataCenterId: r.dataCenterId,
    gpuCardTypeId: r.gpuCardTypeId,
    payStatus: r.payStatus,
    finalAmount: r.finalAmount,
    couponAmount: r.couponAmount,
    rentStartsAt: r.rentStartsAt,
    rentEndsAt: r.rentEndsAt,
    durationHours: r.durationHours,
    gpuCount: r.gpuCount,
  }))

  return amortizeBareMetalDevicesForMonth({
    usageMonth: input.usageMonth,
    devices,
    isPaid: isBaremetalPayStatusPaid,
  })
}
