import { db } from '@/lib/db'
import { unitCostsDataAccess } from '@/lib/server/dataaccess/unit-costs/db'
import { dataCenter, gpuCardType, supplier, supplierPricingRecord } from '@workspace/db/schema'
import { and, eq } from 'drizzle-orm'
import { FinanceError } from '../errors'

export async function getTenantRegionGpuPricingContext(input: {
  dataCenterId: string
  gpuCardTypeId: string
}) {
  const dc = await db.query.dataCenter.findFirst({
    where: eq(dataCenter.id, input.dataCenterId),
    columns: { id: true, name: true, supplierId: true },
  })
  if (!dc) {
    throw new FinanceError('NOT_FOUND', '机房不存在')
  }

  const card = await db.query.gpuCardType.findFirst({
    where: eq(gpuCardType.id, input.gpuCardTypeId),
    columns: { id: true, name: true },
  })
  if (!card) {
    throw new FinanceError('NOT_FOUND', 'GPU 卡型不存在')
  }

  const supplierRow = await db.query.supplier.findFirst({
    where: eq(supplier.id, dc.supplierId),
    columns: { id: true, name: true, shortName: true },
  })
  if (!supplierRow) {
    throw new FinanceError('NOT_FOUND', '供应商不存在')
  }

  const pricingRecordRow = await db.query.supplierPricingRecord.findFirst({
    where: and(
      eq(supplierPricingRecord.dataCenterId, input.dataCenterId),
      eq(supplierPricingRecord.gpuCardTypeId, input.gpuCardTypeId),
    ),
    columns: { id: true },
  })

  const record = pricingRecordRow
    ? await unitCostsDataAccess.getRecordById(pricingRecordRow.id)
    : null

  return {
    supplierId: supplierRow.id,
    supplierName: supplierRow.name,
    supplierShortName: supplierRow.shortName,
    dataCenterId: dc.id,
    dataCenterName: dc.name,
    gpuCardTypeId: card.id,
    gpuCardTypeName: card.name,
    record,
  }
}
