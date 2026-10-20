import { db } from '@/lib/db'
import { bareMetalOrderDevice } from '@workspace/db/schema'
import { and, eq, ne } from 'drizzle-orm'

export class BareMetalSupplierDeviceLinkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BareMetalSupplierDeviceLinkError'
  }
}

/** BM-17：一台供应设备同一时刻仅一条非 released 明细可引用 */
export async function assertSupplierDeviceAvailableForBareMetalLink(
  supplierDeviceId: string,
  excludeDeviceLineId?: string,
): Promise<void> {
  const conditions = [
    eq(bareMetalOrderDevice.supplierDeviceId, supplierDeviceId),
    ne(bareMetalOrderDevice.allocationStatus, 'released'),
  ]
  if (excludeDeviceLineId) {
    conditions.push(ne(bareMetalOrderDevice.id, excludeDeviceLineId))
  }

  const existing = await db
    .select({ id: bareMetalOrderDevice.id, bareMetalOrderId: bareMetalOrderDevice.bareMetalOrderId })
    .from(bareMetalOrderDevice)
    .where(and(...conditions))
    .limit(1)

  const row = existing[0]
  if (row) {
    throw new BareMetalSupplierDeviceLinkError(
      `供应设备已被裸金属明细占用（订单 ${row.bareMetalOrderId}，明细 ${row.id}）`,
    )
  }
}

export async function linkBareMetalOrderDeviceToSupplierDevice(input: {
  deviceLineId: string
  supplierDeviceId: string
}): Promise<void> {
  await assertSupplierDeviceAvailableForBareMetalLink(input.supplierDeviceId, input.deviceLineId)
  await db
    .update(bareMetalOrderDevice)
    .set({
      supplierDeviceId: input.supplierDeviceId,
      allocationStatus: 'linked',
      linkedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(bareMetalOrderDevice.id, input.deviceLineId))
}
