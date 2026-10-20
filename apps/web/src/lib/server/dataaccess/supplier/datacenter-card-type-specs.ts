import { db } from '@/lib/db'
import { supplierLog } from '@/lib/server/dataaccess/supplier/logger'
import {
  dataCenter,
  gpuCardType,
  supplier,
  supplierDatacenterCardTypeSpec,
} from '@workspace/db/schema'
import { and, eq } from 'drizzle-orm'

function newId() {
  return crypto.randomUUID()
}

export type DatacenterCardTypeSpecRow = {
  id: string
  dataCenterId: string
  dataCenterName: string
  supplierId: string
  supplierName: string
  gpuCardTypeId: string
  gpuCardTypeCode: string
  gpuCardTypeName: string
  deviceSpec: string | null
  remark: string | null
  updatedByStaffId: string | null
  createdAt: string
  updatedAt: string
}

export type DatacenterCardTypeSpecUpsertInput = {
  dataCenterId: string
  gpuCardTypeId: string
  deviceSpec?: string | null
  remark?: string | null
  changedByStaffId?: string | null
}

function mapRow(row: {
  spec: typeof supplierDatacenterCardTypeSpec.$inferSelect
  dataCenterName: string
  supplierId: string
  supplierName: string
  gpuCardTypeCode: string
  gpuCardTypeName: string
}): DatacenterCardTypeSpecRow {
  return {
    id: row.spec.id,
    dataCenterId: row.spec.dataCenterId,
    dataCenterName: row.dataCenterName,
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    gpuCardTypeId: row.spec.gpuCardTypeId,
    gpuCardTypeCode: row.gpuCardTypeCode,
    gpuCardTypeName: row.gpuCardTypeName,
    deviceSpec: row.spec.deviceSpec,
    remark: row.spec.remark,
    updatedByStaffId: row.spec.updatedByStaffId,
    createdAt: row.spec.createdAt.toISOString(),
    updatedAt: row.spec.updatedAt.toISOString(),
  }
}

function normalizeText(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export const datacenterCardTypeSpecsDataAccess = {
  async get(
    dataCenterId: string,
    gpuCardTypeId: string,
  ): Promise<DatacenterCardTypeSpecRow | null> {
    const [row] = await db
      .select({
        spec: supplierDatacenterCardTypeSpec,
        dataCenterName: dataCenter.name,
        supplierId: dataCenter.supplierId,
        supplierName: supplier.shortName,
        gpuCardTypeCode: gpuCardType.code,
        gpuCardTypeName: gpuCardType.name,
      })
      .from(supplierDatacenterCardTypeSpec)
      .innerJoin(dataCenter, eq(supplierDatacenterCardTypeSpec.dataCenterId, dataCenter.id))
      .innerJoin(supplier, eq(dataCenter.supplierId, supplier.id))
      .innerJoin(gpuCardType, eq(supplierDatacenterCardTypeSpec.gpuCardTypeId, gpuCardType.id))
      .where(
        and(
          eq(supplierDatacenterCardTypeSpec.dataCenterId, dataCenterId),
          eq(supplierDatacenterCardTypeSpec.gpuCardTypeId, gpuCardTypeId),
        ),
      )
      .limit(1)

    return row ? mapRow(row) : null
  },

  async upsert(input: DatacenterCardTypeSpecUpsertInput): Promise<DatacenterCardTypeSpecRow> {
    const dc = await db.query.dataCenter.findFirst({
      where: eq(dataCenter.id, input.dataCenterId),
      columns: { id: true },
    })
    if (!dc) {
      throw new Error('机房不存在')
    }

    const card = await db.query.gpuCardType.findFirst({
      where: eq(gpuCardType.id, input.gpuCardTypeId),
      columns: { id: true },
    })
    if (!card) {
      throw new Error('卡型不存在')
    }

    const values = {
      deviceSpec: normalizeText(input.deviceSpec),
      remark: normalizeText(input.remark),
      updatedByStaffId: input.changedByStaffId ?? null,
    }

    const existing = await db.query.supplierDatacenterCardTypeSpec.findFirst({
      where: and(
        eq(supplierDatacenterCardTypeSpec.dataCenterId, input.dataCenterId),
        eq(supplierDatacenterCardTypeSpec.gpuCardTypeId, input.gpuCardTypeId),
      ),
    })

    if (existing) {
      await db
        .update(supplierDatacenterCardTypeSpec)
        .set(values)
        .where(eq(supplierDatacenterCardTypeSpec.id, existing.id))
    } else {
      await db.insert(supplierDatacenterCardTypeSpec).values({
        id: newId(),
        dataCenterId: input.dataCenterId,
        gpuCardTypeId: input.gpuCardTypeId,
        ...values,
      })
    }

    const row = await this.get(input.dataCenterId, input.gpuCardTypeId)
    if (!row) {
      throw new Error('保存机房卡型设备配置失败')
    }

    supplierLog('datacenter-card-type-specs', 'upsert', {
      dataCenterId: input.dataCenterId,
      gpuCardTypeId: input.gpuCardTypeId,
    })
    return row
  },
}
