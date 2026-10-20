import { db } from '@/lib/db'
import { supplierLog } from '@/lib/server/dataaccess/supplier/logger'
import {
  buildDefaultInfrastructureForm,
  formatBandwidthSummary,
  formatNetworkSummary,
  formatStorageSummary,
  summaryToLines,
  type BandwidthConfigForm,
  type DatacenterInfrastructureForm,
  type NetworkConfigForm,
  type StorageConfigForm,
} from '@/lib/supplier/datacenter-infrastructure-config-utils'
import { dataCenter, supplierDatacenterInfrastructure } from '@workspace/db/schema'
import { eq } from 'drizzle-orm'

function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function newId() {
  return crypto.randomUUID()
}

export type DatacenterInfrastructureRow = {
  dataCenterId: string
  dataCenterName: string
  form: DatacenterInfrastructureForm
  bandwidthSummary: string
  networkSummary: string
  storageSummary: string
  bandwidthLines: string[]
  networkLines: string[]
  storageLines: string[]
  updatedAt: string | null
}

export type DatacenterInfrastructureUpsertInput = {
  dataCenterId: string
  bandwidth: BandwidthConfigForm
  network: NetworkConfigForm
  storage: StorageConfigForm
  changedByStaffId?: string | null
}

function mergeSection<T extends Record<string, unknown>>(defaults: T, saved: unknown): T {
  if (!saved || typeof saved !== 'object') return defaults
  return { ...defaults, ...(saved as Partial<T>) }
}

function resolveForm(
  saved: {
    bandwidthConfig: unknown
    networkConfig: unknown
    storageConfig: unknown
  } | null,
  dataCenter: {
    internalNetworkCidr: string | null
    publicIpCount: number | null
    networkFee: number
  },
): DatacenterInfrastructureForm {
  const defaults = buildDefaultInfrastructureForm({
    internalNetworkCidr: dataCenter.internalNetworkCidr ?? undefined,
    publicIpCount: dataCenter.publicIpCount ?? undefined,
    networkFee: dataCenter.networkFee,
  })

  if (!saved) return defaults

  return {
    bandwidth: mergeSection(defaults.bandwidth, saved.bandwidthConfig),
    network: mergeSection(defaults.network, saved.networkConfig),
    storage: mergeSection(defaults.storage, saved.storageConfig),
  }
}

function mapRow(
  dataCenterId: string,
  dataCenterName: string,
  form: DatacenterInfrastructureForm,
  updatedAt: Date | null,
): DatacenterInfrastructureRow {
  const bandwidthSummary = formatBandwidthSummary(form.bandwidth)
  const networkSummary = formatNetworkSummary(form.network)
  const storageSummary = formatStorageSummary(form.storage)

  return {
    dataCenterId,
    dataCenterName,
    form,
    bandwidthSummary,
    networkSummary,
    storageSummary,
    bandwidthLines: summaryToLines(bandwidthSummary),
    networkLines: summaryToLines(networkSummary),
    storageLines: summaryToLines(storageSummary),
    updatedAt: updatedAt?.toISOString() ?? null,
  }
}

export const datacenterInfrastructureDataAccess = {
  async get(dataCenterId: string): Promise<DatacenterInfrastructureRow | null> {
    const dc = await db.query.dataCenter.findFirst({
      where: eq(dataCenter.id, dataCenterId),
      columns: {
        id: true,
        name: true,
        internalNetworkCidr: true,
        publicIpCount: true,
        networkFeeMonthly: true,
      },
    })
    if (!dc) return null

    const infra = await db.query.supplierDatacenterInfrastructure.findFirst({
      where: eq(supplierDatacenterInfrastructure.dataCenterId, dataCenterId),
    })

    const form = resolveForm(
      infra
        ? {
            bandwidthConfig: infra.bandwidthConfig,
            networkConfig: infra.networkConfig,
            storageConfig: infra.storageConfig,
          }
        : null,
      {
        internalNetworkCidr: dc.internalNetworkCidr,
        publicIpCount: dc.publicIpCount,
        networkFee: toNumber(dc.networkFeeMonthly),
      },
    )

    supplierLog('datacenter-infrastructure', 'get', { dataCenterId, hasSaved: Boolean(infra) })
    return mapRow(dc.id, dc.name, form, infra?.updatedAt ?? null)
  },

  async upsert(input: DatacenterInfrastructureUpsertInput): Promise<DatacenterInfrastructureRow> {
    const dc = await db.query.dataCenter.findFirst({
      where: eq(dataCenter.id, input.dataCenterId),
      columns: {
        id: true,
        name: true,
        internalNetworkCidr: true,
        publicIpCount: true,
        networkFeeMonthly: true,
      },
    })
    if (!dc) {
      throw new Error('机房不存在')
    }

    const values = {
      bandwidthConfig: input.bandwidth,
      networkConfig: input.network,
      storageConfig: input.storage,
      updatedByStaffId: input.changedByStaffId ?? null,
    }

    const existing = await db.query.supplierDatacenterInfrastructure.findFirst({
      where: eq(supplierDatacenterInfrastructure.dataCenterId, input.dataCenterId),
    })

    if (existing) {
      await db
        .update(supplierDatacenterInfrastructure)
        .set(values)
        .where(eq(supplierDatacenterInfrastructure.id, existing.id))
    } else {
      await db.insert(supplierDatacenterInfrastructure).values({
        id: newId(),
        dataCenterId: input.dataCenterId,
        ...values,
      })
    }

    const row = await this.get(input.dataCenterId)
    if (!row) {
      throw new Error('保存机房基础设施配置失败')
    }

    supplierLog('datacenter-infrastructure', 'upsert', { dataCenterId: input.dataCenterId })
    return row
  },
}
