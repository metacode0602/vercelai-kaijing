/**
 * 机房 SLA 读模型 — 概览 / 详情 / 月度报告（方案 A：查询时组装）
 */

import { db } from '@/lib/db'
import { supplierError, supplierLog } from '@/lib/server/dataaccess/supplier/logger'
import {
  dataCenter,
  gpuCardType,
  slaDatacenterCardTypeMonthly,
  slaDatacenterMonthly,
  slaDeviceMonthly,
  slaFaultCardHoursDaily,
  slaFaultCountDaily,
  slaMonthlyReportCompensation,
  slaOpsFaultIncident,
  slaOpsFaultIncidentDevice,
  slaSupplyDaily,
  supplier,
  supplierDevice,
} from '@workspace/db/schema'
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'

const SLA_TARGET = 0.995
const DEFAULT_DEVICE_SERVICE_FEE = 11_000

function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function toNumberOrNull(value: string | number | null | undefined): number | null {
  if (value == null) return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function computeSlaRate(supply: number, fault: number): number | null {
  if (supply <= 0) return null
  return Math.max(0, (supply - fault) / supply)
}

/** 与前端 format-sla.getCompensationTier 一致 */
function getCompensationTier(slaRate: number): number {
  if (slaRate >= 0.995) return 0
  if (slaRate >= 0.99) return 0.1
  if (slaRate >= 0.95) return 0.25
  if (slaRate >= 0.9) return 0.5
  return 1
}

function monthDateRange(slaMonth: string): { start: string; end: string } {
  const [y, m] = slaMonth.split('-').map(Number)
  const start = `${slaMonth}-01`
  const lastDay = new Date(y!, m!, 0).getDate()
  const end = `${slaMonth}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

function formatTs(d: Date | null | undefined): string {
  if (!d) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export type SlaOverviewRow = {
  dataCenterId: string
  dataCenterCode: string
  dataCenterName: string
  supplierId: string
  supplierName: string
  location: string
  faultSlaRate: number | null
  slaMet: boolean | null
  newFaultCount: number
  newFaultDeviceCount: number
  carryoverFaultCountEnd: number
  carryoverFaultDeviceCountEnd: number
  contractCardHours: number
  totalSupplyCardHours: number
}

export type SlaCardTypeMonthlyRow = {
  gpuCardTypeId: string
  gpuCardTypeCode: string
  gpuCardTypeName: string
  contractCardHours: number
  totalSupplyCardHours: number
  onboardingLossCardHours: number
  supplyAvailabilityRate: number | null
  faultSlaRate: number | null
  slaMet: boolean | null
  newFaultCount: number
  carryoverFaultCountEnd: number
  closedFaultCount: number
  newFaultDeviceCount: number
  carryoverFaultDeviceCountEnd: number
  externalFaultCardHours: number
  internalFaultCardHours: number
  actualUsageCardHours: number
  idleCardHours: number
  idleRateAvg: number | null
  wasteCardHours: number
  wasteRateAvg: number | null
  internalUsageCardHours: number
  onboardingLossEventCount: number
  compensationAmountTotal: number
  exemptIncidentCount: number
}

export type SlaDailyTrendPoint = {
  statDate: string
  label: string
  faultSlaRate: number | null
  newFaultCount: number
  externalFaultCardHours: number
}

export type SlaDeviceMonthlyRow = {
  deviceId: string
  deviceSn: string
  deviceAssetNo: string
  gpuCardTypeName: string
  supplyCardHours: number
  faultCardHours: number
  faultSlaRate: number
  slaMet: boolean
  serviceFee: number
  compensationTier: number
  compensationAmount: number
}

export type SlaDatacenterMonthlyDetail = {
  dataCenterId: string
  dataCenterCode: string
  dataCenterName: string
  supplierId: string
  supplierName: string
  location: string
  slaMonth: string
  contractCardHours: number
  totalSupplyCardHours: number
  totalSupplyMachineHours: number
  onboardingLossCardHours: number
  supplyAvailabilityRate: number | null
  faultSlaRate: number | null
  slaMet: boolean | null
  newFaultCount: number
  carryoverFaultCountEnd: number
  closedFaultCount: number
  newFaultDeviceCount: number
  carryoverFaultDeviceCountEnd: number
  externalFaultCardHours: number
  internalFaultCardHours: number
  actualUsageCardHours: number
  idleCardHours: number
  idleRateAvg: number | null
  wasteCardHours: number
  wasteRateAvg: number | null
  internalUsageCardHours: number
  onboardingLossEventCount: number
  platformOfflineIncidentCount: number
  platformOnlineIncidentCount: number
  compensationAmountTotal: number
  exemptIncidentCount: number
  cardTypes: SlaCardTypeMonthlyRow[]
  dailyTrend: SlaDailyTrendPoint[]
  devices: SlaDeviceMonthlyRow[]
  rollupAt: string | null
}

export type SlaReportImpactScope = '全平台' | '单台设备'

export type SlaReportIncidentRow = {
  id: string
  groupId: string
  recordedAt: string
  resolvedAt: string
  faultType: string
  impactMinutes: number
  impactScope: SlaReportImpactScope
  affectedDeviceCount: number
  review: string
  instanceAvailability: number | null
  compensationTier: number | null
  serviceFee: number | null
  compensationAmount: number | null
  compensationNote?: string
  isGroupHead: boolean
  groupRowSpan: number
}

export type SlaMonthlyReport = {
  dataCenterId: string
  dataCenterName: string
  supplierName: string
  slaMonth: string
  incidents: SlaReportIncidentRow[]
  totalCompensation: number
  summaryFaultSlaRate: number | null
  summarySupplyCardHours: number
  summaryFaultCardHours: number
}

async function listAvailableMonths(): Promise<string[]> {
  const fromDb = await db
    .selectDistinct({ slaMonth: slaDatacenterMonthly.slaMonth })
    .from(slaDatacenterMonthly)
    .orderBy(desc(slaDatacenterMonthly.slaMonth))
    .limit(24)
  const dbMonths = fromDb.map((r) => r.slaMonth)
  // 始终包含近 12 个自然月，便于无 rollup 时也能选月
  const recent: string[] = []
  const d = new Date()
  d.setDate(1)
  for (let i = 0; i < 12; i++) {
    recent.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    )
    d.setMonth(d.getMonth() - 1)
  }
  return [...new Set([...dbMonths, ...recent])].sort((a, b) => b.localeCompare(a))
}

async function getOverviewRows(slaMonth: string): Promise<(SlaOverviewRow & { hasRollup: boolean })[]> {
  const activeDcs = await db
    .select({
      dataCenterId: dataCenter.id,
      dataCenterCode: dataCenter.code,
      dataCenterName: dataCenter.name,
      supplierId: supplier.id,
      supplierName: supplier.name,
      location: dataCenter.location,
    })
    .from(dataCenter)
    .innerJoin(supplier, eq(dataCenter.supplierId, supplier.id))
    .where(eq(dataCenter.cooperationStatus, 'active'))
    .orderBy(asc(dataCenter.name))

  const monthlyRows = await db
    .select()
    .from(slaDatacenterMonthly)
    .where(
      and(eq(slaDatacenterMonthly.slaMonth, slaMonth), eq(slaDatacenterMonthly.slaScope, 'all')),
    )
  const monthlyByDc = new Map(monthlyRows.map((r) => [r.dataCenterId, r]))

  return activeDcs
    .map((dc) => {
      const m = monthlyByDc.get(dc.dataCenterId)
      if (!m) {
        return {
          dataCenterId: dc.dataCenterId,
          dataCenterCode: dc.dataCenterCode,
          dataCenterName: dc.dataCenterName,
          supplierId: dc.supplierId,
          supplierName: dc.supplierName,
          location: dc.location ?? '',
          faultSlaRate: null,
          slaMet: null,
          newFaultCount: 0,
          newFaultDeviceCount: 0,
          carryoverFaultCountEnd: 0,
          carryoverFaultDeviceCountEnd: 0,
          contractCardHours: 0,
          totalSupplyCardHours: 0,
          hasRollup: false,
        }
      }
      const supply = toNumber(m.totalSupplyCardHours)
      const fault = toNumber(m.externalFaultCardHours)
      const faultSlaRate =
        toNumberOrNull(m.faultSlaRate) ?? computeSlaRate(supply, fault)
      const slaMet =
        m.slaMet ?? (faultSlaRate != null ? faultSlaRate >= SLA_TARGET : null)
      return {
        dataCenterId: dc.dataCenterId,
        dataCenterCode: dc.dataCenterCode,
        dataCenterName: dc.dataCenterName,
        supplierId: dc.supplierId,
        supplierName: dc.supplierName,
        location: dc.location ?? '',
        faultSlaRate,
        slaMet,
        newFaultCount: m.newFaultCount,
        newFaultDeviceCount: m.newFaultDeviceCount,
        carryoverFaultCountEnd: m.carryoverFaultCountEnd,
        carryoverFaultDeviceCountEnd: m.carryoverFaultDeviceCountEnd,
        contractCardHours: toNumber(m.contractCardHours),
        totalSupplyCardHours: supply,
        hasRollup: true,
      }
    })
    .sort((a, b) => {
      if (a.hasRollup !== b.hasRollup) return a.hasRollup ? -1 : 1
      return (a.faultSlaRate ?? 2) - (b.faultSlaRate ?? 2)
    })
}

async function buildDailyTrend(
  dataCenterId: string,
  slaMonth: string,
): Promise<SlaDailyTrendPoint[]> {
  const { start, end } = monthDateRange(slaMonth)
  const [y, m] = slaMonth.split('-').map(Number)

  const supplyRows = await db
    .select({
      statDate: slaSupplyDaily.statDate,
      totalCardHours: sql<string>`sum(${slaSupplyDaily.totalCardHours})::text`,
    })
    .from(slaSupplyDaily)
    .where(
      and(
        eq(slaSupplyDaily.dataCenterId, dataCenterId),
        eq(slaSupplyDaily.slaScope, 'all'),
        gte(slaSupplyDaily.statDate, start),
        lte(slaSupplyDaily.statDate, end),
      ),
    )
    .groupBy(slaSupplyDaily.statDate)
    .orderBy(asc(slaSupplyDaily.statDate))

  const faultRows = await db
    .select({
      statDate: slaFaultCardHoursDaily.statDate,
      faultCardHours: sql<string>`sum(${slaFaultCardHoursDaily.faultCardHours})::text`,
    })
    .from(slaFaultCardHoursDaily)
    .where(
      and(
        eq(slaFaultCardHoursDaily.dataCenterId, dataCenterId),
        eq(slaFaultCardHoursDaily.slaScope, 'all'),
        eq(slaFaultCardHoursDaily.impactSide, 'external'),
        gte(slaFaultCardHoursDaily.statDate, start),
        lte(slaFaultCardHoursDaily.statDate, end),
      ),
    )
    .groupBy(slaFaultCardHoursDaily.statDate)

  const countRows = await db
    .select({
      statDate: slaFaultCountDaily.statDate,
      newFaultCount: sql<number>`sum(${slaFaultCountDaily.newFaultCount})::int`,
    })
    .from(slaFaultCountDaily)
    .where(
      and(
        eq(slaFaultCountDaily.dataCenterId, dataCenterId),
        eq(slaFaultCountDaily.slaScope, 'all'),
        gte(slaFaultCountDaily.statDate, start),
        lte(slaFaultCountDaily.statDate, end),
      ),
    )
    .groupBy(slaFaultCountDaily.statDate)

  const faultMap = new Map(faultRows.map((r) => [r.statDate, toNumber(r.faultCardHours)]))
  const countMap = new Map(countRows.map((r) => [r.statDate, Number(r.newFaultCount) || 0]))

  return supplyRows.map((r) => {
    const supply = toNumber(r.totalCardHours)
    const fault = faultMap.get(r.statDate) ?? 0
    const day = Number(String(r.statDate).slice(-2))
    return {
      statDate: r.statDate,
      label: `${m}/${day}`,
      faultSlaRate: computeSlaRate(supply, fault),
      newFaultCount: countMap.get(r.statDate) ?? 0,
      externalFaultCardHours: fault,
    }
  })
}

async function getDatacenterDetail(
  dataCenterId: string,
  slaMonth: string,
): Promise<(SlaDatacenterMonthlyDetail & { hasRollup: boolean }) | null> {
  const [dc] = await db
    .select({
      dataCenterId: dataCenter.id,
      dataCenterCode: dataCenter.code,
      dataCenterName: dataCenter.name,
      location: dataCenter.location,
      supplierId: supplier.id,
      supplierName: supplier.name,
    })
    .from(dataCenter)
    .innerJoin(supplier, eq(dataCenter.supplierId, supplier.id))
    .where(eq(dataCenter.id, dataCenterId))
    .limit(1)

  if (!dc) return null

  const [header] = await db
    .select({
      row: slaDatacenterMonthly,
    })
    .from(slaDatacenterMonthly)
    .where(
      and(
        eq(slaDatacenterMonthly.dataCenterId, dataCenterId),
        eq(slaDatacenterMonthly.slaMonth, slaMonth),
        eq(slaDatacenterMonthly.slaScope, 'all'),
      ),
    )
    .limit(1)

  if (!header) {
    return {
      dataCenterId: dc.dataCenterId,
      dataCenterCode: dc.dataCenterCode,
      dataCenterName: dc.dataCenterName,
      supplierId: dc.supplierId,
      supplierName: dc.supplierName,
      location: dc.location ?? '',
      slaMonth,
      contractCardHours: 0,
      totalSupplyCardHours: 0,
      totalSupplyMachineHours: 0,
      onboardingLossCardHours: 0,
      supplyAvailabilityRate: null,
      faultSlaRate: null,
      slaMet: null,
      newFaultCount: 0,
      carryoverFaultCountEnd: 0,
      closedFaultCount: 0,
      newFaultDeviceCount: 0,
      carryoverFaultDeviceCountEnd: 0,
      externalFaultCardHours: 0,
      internalFaultCardHours: 0,
      actualUsageCardHours: 0,
      idleCardHours: 0,
      idleRateAvg: null,
      wasteCardHours: 0,
      wasteRateAvg: null,
      internalUsageCardHours: 0,
      onboardingLossEventCount: 0,
      platformOfflineIncidentCount: 0,
      platformOnlineIncidentCount: 0,
      compensationAmountTotal: 0,
      exemptIncidentCount: 0,
      cardTypes: [],
      dailyTrend: [],
      devices: [],
      rollupAt: null,
      hasRollup: false,
    }
  }

  const m = header.row
  const supply = toNumber(m.totalSupplyCardHours)
  const externalFault = toNumber(m.externalFaultCardHours)
  const faultSlaRate = toNumberOrNull(m.faultSlaRate) ?? computeSlaRate(supply, externalFault)
  const availabilityRate =
    toNumberOrNull(m.availabilityRate) ??
    (toNumber(m.contractCardHours) > 0 ? supply / toNumber(m.contractCardHours) : null)

  const cardTypeRows = await db
    .select({
      row: slaDatacenterCardTypeMonthly,
      gpuCardTypeCode: gpuCardType.code,
      gpuCardTypeName: gpuCardType.name,
    })
    .from(slaDatacenterCardTypeMonthly)
    .innerJoin(gpuCardType, eq(slaDatacenterCardTypeMonthly.gpuCardTypeId, gpuCardType.id))
    .where(
      and(
        eq(slaDatacenterCardTypeMonthly.dataCenterId, dataCenterId),
        eq(slaDatacenterCardTypeMonthly.slaMonth, slaMonth),
        eq(slaDatacenterCardTypeMonthly.slaScope, 'all'),
      ),
    )
    .orderBy(asc(gpuCardType.name))

  const cardTypes: SlaCardTypeMonthlyRow[] = cardTypeRows.map(({ row, gpuCardTypeCode, gpuCardTypeName }) => {
    const ctSupply = toNumber(row.totalSupplyCardHours)
    const ctFault = toNumber(row.externalFaultCardHours)
    const ctContract = toNumber(row.contractCardHours)
    const ctFaultSla = toNumberOrNull(row.faultSlaRate) ?? computeSlaRate(ctSupply, ctFault)
    return {
      gpuCardTypeId: row.gpuCardTypeId,
      gpuCardTypeCode,
      gpuCardTypeName,
      contractCardHours: ctContract,
      totalSupplyCardHours: ctSupply,
      onboardingLossCardHours: toNumber(row.onboardingLossCardHours),
      supplyAvailabilityRate:
        toNumberOrNull(row.availabilityRate) ??
        (ctContract > 0 ? ctSupply / ctContract : null),
      faultSlaRate: ctFaultSla,
      slaMet: row.slaMet ?? (ctFaultSla != null ? ctFaultSla >= SLA_TARGET : null),
      newFaultCount: row.newFaultCount,
      carryoverFaultCountEnd: row.carryoverFaultCountEnd,
      closedFaultCount: row.closedFaultCount,
      newFaultDeviceCount: row.newFaultDeviceCount,
      carryoverFaultDeviceCountEnd: row.carryoverFaultDeviceCountEnd,
      externalFaultCardHours: ctFault,
      internalFaultCardHours: toNumber(row.internalFaultCardHours),
      actualUsageCardHours: toNumber(row.actualUsageCardHours),
      idleCardHours: toNumber(row.idleCardHours),
      idleRateAvg: toNumberOrNull(row.idleRateAvg),
      wasteCardHours: toNumber(row.wasteCardHours),
      wasteRateAvg: toNumberOrNull(row.wasteRateAvg),
      internalUsageCardHours: toNumber(row.internalUsageCardHours),
      onboardingLossEventCount: row.onboardingLossEventCount,
      compensationAmountTotal: toNumber(row.compensationAmountTotal),
      exemptIncidentCount: row.exemptIncidentCount,
    }
  })

  const deviceRows = await db
    .select({
      row: slaDeviceMonthly,
      deviceAssetNo: supplierDevice.assetNo,
      gpuCardTypeName: gpuCardType.name,
    })
    .from(slaDeviceMonthly)
    .leftJoin(supplierDevice, eq(slaDeviceMonthly.supplierDeviceId, supplierDevice.id))
    .innerJoin(gpuCardType, eq(slaDeviceMonthly.gpuCardTypeId, gpuCardType.id))
    .where(
      and(
        eq(slaDeviceMonthly.dataCenterId, dataCenterId),
        eq(slaDeviceMonthly.slaMonth, slaMonth),
      ),
    )
    .orderBy(asc(slaDeviceMonthly.deviceSlaRate))

  const devices: SlaDeviceMonthlyRow[] = deviceRows.map(({ row, deviceAssetNo, gpuCardTypeName }) => {
    const deviceSupply = toNumber(row.supplyCardHours)
    const deviceFault = toNumber(row.externalFaultCardHours)
    const deviceSla =
      toNumberOrNull(row.deviceSlaRate) ?? computeSlaRate(deviceSupply, deviceFault) ?? 1
    const tier = getCompensationTier(deviceSla)
    return {
      deviceId: row.supplierDeviceId ?? row.deviceSn,
      deviceSn: row.deviceSn,
      deviceAssetNo: deviceAssetNo ?? row.deviceSn,
      gpuCardTypeName,
      supplyCardHours: deviceSupply,
      faultCardHours: deviceFault,
      faultSlaRate: deviceSla,
      slaMet: row.slaMet ?? deviceSla >= SLA_TARGET,
      serviceFee: DEFAULT_DEVICE_SERVICE_FEE,
      compensationTier: tier,
      compensationAmount: Math.round(DEFAULT_DEVICE_SERVICE_FEE * tier),
    }
  })

  const dailyTrend = await buildDailyTrend(dataCenterId, slaMonth)

  return {
    dataCenterId,
    dataCenterCode: dc.dataCenterCode,
    dataCenterName: dc.dataCenterName,
    supplierId: dc.supplierId,
    supplierName: dc.supplierName,
    location: dc.location ?? '',
    slaMonth,
    contractCardHours: toNumber(m.contractCardHours),
    totalSupplyCardHours: supply,
    totalSupplyMachineHours: toNumber(m.totalSupplyMachineHours),
    onboardingLossCardHours: toNumber(m.onboardingLossCardHours),
    supplyAvailabilityRate: availabilityRate,
    faultSlaRate,
    slaMet: m.slaMet ?? (faultSlaRate != null ? faultSlaRate >= SLA_TARGET : null),
    newFaultCount: m.newFaultCount,
    carryoverFaultCountEnd: m.carryoverFaultCountEnd,
    closedFaultCount: m.closedFaultCount,
    newFaultDeviceCount: m.newFaultDeviceCount,
    carryoverFaultDeviceCountEnd: m.carryoverFaultDeviceCountEnd,
    externalFaultCardHours: externalFault,
    internalFaultCardHours: toNumber(m.internalFaultCardHours),
    actualUsageCardHours: toNumber(m.actualUsageCardHours),
    idleCardHours: toNumber(m.idleCardHours),
    idleRateAvg: toNumberOrNull(m.idleRateAvg),
    wasteCardHours: toNumber(m.wasteCardHours),
    wasteRateAvg: toNumberOrNull(m.wasteRateAvg),
    internalUsageCardHours: toNumber(m.internalUsageCardHours),
    onboardingLossEventCount: m.onboardingLossEventCount,
    platformOfflineIncidentCount: m.platformOfflineIncidentCount,
    platformOnlineIncidentCount: m.platformOnlineIncidentCount,
    compensationAmountTotal: toNumber(m.compensationAmountTotal),
    exemptIncidentCount: m.exemptIncidentCount,
    cardTypes,
    dailyTrend,
    devices,
    rollupAt: m.rollupAt?.toISOString() ?? null,
    hasRollup: true,
  }
}

async function getMonthlyReport(
  dataCenterId: string,
  slaMonth: string,
): Promise<SlaMonthlyReport | null> {
  const detail = await getDatacenterDetail(dataCenterId, slaMonth)
  if (!detail) return null

  const { start, end } = monthDateRange(slaMonth)

  const compensationRows = await db
    .select()
    .from(slaMonthlyReportCompensation)
    .where(
      and(
        eq(slaMonthlyReportCompensation.dataCenterId, dataCenterId),
        eq(slaMonthlyReportCompensation.slaMonth, slaMonth),
      ),
    )
  const compensationMap = new Map(compensationRows.map((r) => [r.groupKey, r]))

  const incidents = await db
    .select()
    .from(slaOpsFaultIncident)
    .where(
      and(
        eq(slaOpsFaultIncident.dataCenterId, dataCenterId),
        eq(slaOpsFaultIncident.impactSide, 'external'),
        lte(slaOpsFaultIncident.startedAt, new Date(`${end}T23:59:59+08:00`)),
        sql`(${slaOpsFaultIncident.endedAt} IS NULL OR ${slaOpsFaultIncident.endedAt} >= ${new Date(`${start}T00:00:00+08:00`)})`,
      ),
    )
    .orderBy(asc(slaOpsFaultIncident.startedAt))

  const deviceLinks = incidents.length
    ? await db
        .select({
          incidentId: slaOpsFaultIncidentDevice.incidentId,
          deviceSn: slaOpsFaultIncidentDevice.deviceSn,
          impactMinutes: slaOpsFaultIncidentDevice.impactMinutes,
        })
        .from(slaOpsFaultIncidentDevice)
        .where(
          inArray(
            slaOpsFaultIncidentDevice.incidentId,
            incidents.map((i) => i.id),
          ),
        )
    : []

  const devicesByIncident = new Map<string, typeof deviceLinks>()
  for (const link of deviceLinks) {
    const list = devicesByIncident.get(link.incidentId) ?? []
    list.push(link)
    devicesByIncident.set(link.incidentId, list)
  }

  const deviceSlaMap = new Map(detail.devices.map((d) => [d.deviceSn, d]))
  const reportRows: SlaReportIncidentRow[] = []

  // 平台组：scope_label = platform
  const platformIncidents = incidents.filter((i) => i.scopeLabel === 'platform')
  if (platformIncidents.length > 0) {
    const groupId = 'g_platform'
    const override = compensationMap.get('platform')
    const availability = detail.faultSlaRate
    const tier =
      toNumberOrNull(override?.compensationTier) ??
      (availability != null ? getCompensationTier(availability) : null)
    const serviceFee =
      toNumberOrNull(override?.serviceFee) ??
      Math.round(detail.totalSupplyCardHours > 0 ? detail.contractCardHours * 0.4 : 0)
    const amount =
      toNumberOrNull(override?.compensationAmount) ??
      (tier != null ? Math.round(serviceFee * tier) : null)

    platformIncidents.forEach((inc, idx) => {
      const links = devicesByIncident.get(inc.id) ?? []
      const impactMinutes =
        inc.impactMinutes ??
        links.reduce((s, l) => s + (l.impactMinutes ?? 0), 0) ??
        0
      reportRows.push({
        id: inc.id,
        groupId,
        recordedAt: formatTs(inc.discoveredAt ?? inc.startedAt),
        resolvedAt: formatTs(inc.endedAt),
        faultType: inc.faultType,
        impactMinutes,
        impactScope: '全平台',
        affectedDeviceCount: Math.max(inc.affectedDeviceCount, links.length),
        review: (inc.postmortem ?? inc.remediation ?? '').trim() || '—',
        instanceAvailability: availability,
        compensationTier: override?.compensationNote ? null : tier,
        serviceFee,
        compensationAmount: amount,
        compensationNote: override?.compensationNote ?? undefined,
        isGroupHead: idx === 0,
        groupRowSpan: platformIncidents.length,
      })
    })
  }

  // 单机组：非 platform，按 device_sn 分组
  const singleIncidents = incidents.filter((i) => i.scopeLabel !== 'platform')
  const byDevice = new Map<string, typeof incidents>()
  for (const inc of singleIncidents) {
    const links = devicesByIncident.get(inc.id) ?? []
    const sn = links[0]?.deviceSn ?? `_incident_${inc.id}`
    const list = byDevice.get(sn) ?? []
    list.push(inc)
    byDevice.set(sn, list)
  }

  for (const [deviceSn, groupIncidents] of byDevice) {
    const groupId = `g_dev_${deviceSn}`
    const device = deviceSlaMap.get(deviceSn)
    const override = compensationMap.get(deviceSn)
    const availability = device?.faultSlaRate ?? detail.faultSlaRate
    const tier =
      toNumberOrNull(override?.compensationTier) ??
      (availability != null ? getCompensationTier(availability) : null)
    const serviceFee =
      toNumberOrNull(override?.serviceFee) ?? device?.serviceFee ?? DEFAULT_DEVICE_SERVICE_FEE
    const amount =
      toNumberOrNull(override?.compensationAmount) ??
      (tier != null ? Math.round(serviceFee * tier) : null)

    groupIncidents.forEach((inc, idx) => {
      const links = devicesByIncident.get(inc.id) ?? []
      const impactMinutes =
        inc.impactMinutes ??
        links.reduce((s, l) => s + (l.impactMinutes ?? 0), 0) ??
        0
      reportRows.push({
        id: inc.id,
        groupId,
        recordedAt: formatTs(inc.discoveredAt ?? inc.startedAt),
        resolvedAt: formatTs(inc.endedAt),
        faultType: inc.faultType,
        impactMinutes,
        impactScope: '单台设备',
        affectedDeviceCount: Math.max(1, links.length || inc.affectedDeviceCount),
        review: (inc.postmortem ?? inc.remediation ?? '').trim() || '—',
        instanceAvailability: availability,
        compensationTier: override?.compensationNote ? null : tier,
        serviceFee,
        compensationAmount: amount,
        compensationNote: override?.compensationNote ?? undefined,
        isGroupHead: idx === 0,
        groupRowSpan: groupIncidents.length,
      })
    })
  }

  const totalCompensation = reportRows
    .filter((r) => r.isGroupHead)
    .reduce((s, r) => s + (r.compensationAmount ?? 0), 0)

  return {
    dataCenterId: detail.dataCenterId,
    dataCenterName: detail.dataCenterName,
    supplierName: detail.supplierName,
    slaMonth,
    incidents: reportRows,
    totalCompensation,
    summaryFaultSlaRate: detail.faultSlaRate,
    summarySupplyCardHours: detail.totalSupplyCardHours,
    summaryFaultCardHours: detail.externalFaultCardHours,
  }
}

export const slaDataAccess = {
  listAvailableMonths: async () => {
    try {
      return await listAvailableMonths()
    } catch (e) {
      supplierError('sla.listAvailableMonths', 'failed', e)
      throw e
    }
  },

  getOverviewRows: async (slaMonth: string) => {
    try {
      const rows = await getOverviewRows(slaMonth)
      supplierLog('sla.getOverviewRows', 'ok', { slaMonth, count: rows.length })
      return rows
    } catch (e) {
      supplierError('sla.getOverviewRows', 'failed', e, { slaMonth })
      throw e
    }
  },

  getDatacenterDetail: async (dataCenterId: string, slaMonth: string) => {
    try {
      return await getDatacenterDetail(dataCenterId, slaMonth)
    } catch (e) {
      supplierError('sla.getDatacenterDetail', 'failed', e, { dataCenterId, slaMonth })
      throw e
    }
  },

  getMonthlyReport: async (dataCenterId: string, slaMonth: string) => {
    try {
      return await getMonthlyReport(dataCenterId, slaMonth)
    } catch (e) {
      supplierError('sla.getMonthlyReport', 'failed', e, { dataCenterId, slaMonth })
      throw e
    }
  },

  hasMonthlyData: async (slaMonth: string) => {
    const [row] = await db
      .select({ id: slaDatacenterMonthly.id })
      .from(slaDatacenterMonthly)
      .where(and(eq(slaDatacenterMonthly.slaMonth, slaMonth), eq(slaDatacenterMonthly.slaScope, 'all')))
      .limit(1)
    return Boolean(row)
  },

  listCompensation: async (input: { dataCenterId: string; slaMonth: string }) => {
    const rows = await db
      .select()
      .from(slaMonthlyReportCompensation)
      .where(
        and(
          eq(slaMonthlyReportCompensation.dataCenterId, input.dataCenterId),
          eq(slaMonthlyReportCompensation.slaMonth, input.slaMonth),
        ),
      )
      .orderBy(asc(slaMonthlyReportCompensation.groupKey))
    return rows.map((r) => ({
      id: r.id,
      slaMonth: r.slaMonth,
      dataCenterId: r.dataCenterId,
      groupKey: r.groupKey,
      serviceFee: toNumberOrNull(r.serviceFee),
      compensationTier: toNumberOrNull(r.compensationTier),
      compensationAmount: toNumberOrNull(r.compensationAmount),
      compensationNote: r.compensationNote,
      updatedAt: r.updatedAt.toISOString(),
    }))
  },

  upsertCompensation: async (input: {
    slaMonth: string
    dataCenterId: string
    groupKey: string
    serviceFee?: number | null
    compensationTier?: number | null
    compensationAmount?: number | null
    compensationNote?: string | null
    updatedByStaffId?: string | null
  }) => {
    const id = crypto.randomUUID()
    const [row] = await db
      .insert(slaMonthlyReportCompensation)
      .values({
        id,
        slaMonth: input.slaMonth,
        dataCenterId: input.dataCenterId,
        groupKey: input.groupKey.trim(),
        serviceFee: input.serviceFee != null ? String(input.serviceFee) : null,
        compensationTier: input.compensationTier != null ? String(input.compensationTier) : null,
        compensationAmount:
          input.compensationAmount != null ? String(input.compensationAmount) : null,
        compensationNote: input.compensationNote?.trim() || null,
        updatedByStaffId: input.updatedByStaffId ?? null,
      })
      .onConflictDoUpdate({
        target: [
          slaMonthlyReportCompensation.slaMonth,
          slaMonthlyReportCompensation.dataCenterId,
          slaMonthlyReportCompensation.groupKey,
        ],
        set: {
          serviceFee: input.serviceFee != null ? String(input.serviceFee) : null,
          compensationTier: input.compensationTier != null ? String(input.compensationTier) : null,
          compensationAmount:
            input.compensationAmount != null ? String(input.compensationAmount) : null,
          compensationNote: input.compensationNote?.trim() || null,
          updatedByStaffId: input.updatedByStaffId ?? null,
          updatedAt: new Date(),
        },
      })
      .returning()
    return row
  },

  deleteCompensation: async (id: string) => {
    await db
      .delete(slaMonthlyReportCompensation)
      .where(eq(slaMonthlyReportCompensation.id, id))
    return { ok: true as const }
  },
}
