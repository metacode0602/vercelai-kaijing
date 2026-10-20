/**
 * SLA 日切 / 月切 rollup
 * - 运维事实表由 DB 直写；本 Job 只读 L1，写 L2
 */

import 'server-only'

import { db } from '@/lib/db'
import { supplierError, supplierLog } from '@/lib/server/dataaccess/supplier/logger'
import {
  dataCenter,
  slaDatacenterCardTypeMonthly,
  slaDatacenterMonthly,
  slaDeviceMonthly,
  slaFaultCardHoursDaily,
  slaFaultCountDaily,
  slaFaultDeviceDaily,
  slaOnboardingLoss,
  slaOpsFaultDaily,
  slaOpsFaultIncident,
  slaOpsFaultIncidentDevice,
  slaPlatformInternalUsage,
  slaPlatformOfflineBaremetalIncident,
  slaPlatformOnlineIncident,
  slaSupplyDaily,
  slaUtilizationDaily,
  slaWasteDaily,
} from '@workspace/db/schema'
import { and, eq, gte, lte, sql } from 'drizzle-orm'

const SLA_TARGET = 0.995

function newId() {
  return crypto.randomUUID()
}

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

function monthRange(slaMonth: string): { start: string; end: string; endDay: string } {
  const [y, m] = slaMonth.split('-').map(Number)
  const lastDay = new Date(y!, m!, 0).getDate()
  const endDay = String(lastDay).padStart(2, '0')
  return {
    start: `${slaMonth}-01`,
    end: `${slaMonth}-${endDay}`,
    endDay: `${slaMonth}-${endDay}`,
  }
}

function shanghaiDayBounds(statDate: string): { start: Date; end: Date } {
  return {
    start: new Date(`${statDate}T00:00:00+08:00`),
    end: new Date(`${statDate}T24:00:00+08:00`),
  }
}

function computeRate(supply: number, fault: number): string | null {
  if (supply <= 0) return null
  return String(Math.max(0, (supply - fault) / supply))
}

/** 日切：故障新增/遗留快照 + 次数汇总 */
export async function runSlaFaultDailyJob(statDate: string): Promise<{ ok: true; counts: number }> {
  const { start, end } = shanghaiDayBounds(statDate)

  // 关闭当日：ended_at 落在 D
  // 新增：first_seen_date = D
  // 遗留：first_seen_date < D 且 status not closed at end of D

  const incidents = await db.select().from(slaOpsFaultIncident)

  let snapshotCount = 0
  for (const inc of incidents) {
    const firstSeen = inc.firstSeenDate
    const ended = inc.endedAt
    const status = inc.incidentStatus
    const closedByEnd =
      status === 'closed' && ended != null && ended < end && ended >= start
    const openAtEnd =
      status !== 'closed' || (ended != null && ended >= end) || ended == null

    if (firstSeen === statDate) {
      await db
        .insert(slaOpsFaultDaily)
        .values({
          id: newId(),
          statDate,
          listKind: 'new',
          incidentId: inc.id,
          dataCenterId: inc.dataCenterId,
          gpuCardTypeId: inc.gpuCardTypeId,
          snapshotStatus: status,
        })
        .onConflictDoUpdate({
          target: [
            slaOpsFaultDaily.statDate,
            slaOpsFaultDaily.listKind,
            slaOpsFaultDaily.incidentId,
          ],
          set: { snapshotStatus: status },
        })
      snapshotCount++
    }

    if (firstSeen < statDate && openAtEnd && !closedByEnd) {
      await db
        .insert(slaOpsFaultDaily)
        .values({
          id: newId(),
          statDate,
          listKind: 'carryover',
          incidentId: inc.id,
          dataCenterId: inc.dataCenterId,
          gpuCardTypeId: inc.gpuCardTypeId,
          snapshotStatus: status,
        })
        .onConflictDoUpdate({
          target: [
            slaOpsFaultDaily.statDate,
            slaOpsFaultDaily.listKind,
            slaOpsFaultDaily.incidentId,
          ],
          set: { snapshotStatus: status },
        })
      snapshotCount++
    }
  }

  // 聚合次数
  const buckets = await db
    .select({
      dataCenterId: slaOpsFaultDaily.dataCenterId,
      gpuCardTypeId: slaOpsFaultDaily.gpuCardTypeId,
      listKind: slaOpsFaultDaily.listKind,
      cnt: sql<number>`count(*)::int`,
    })
    .from(slaOpsFaultDaily)
    .where(eq(slaOpsFaultDaily.statDate, statDate))
    .groupBy(
      slaOpsFaultDaily.dataCenterId,
      slaOpsFaultDaily.gpuCardTypeId,
      slaOpsFaultDaily.listKind,
    )

  type Agg = {
    newFaultCount: number
    carryoverFaultCount: number
    closedFaultCount: number
    newFaultDeviceCount: number
    carryoverFaultDeviceCount: number
    closedFaultDeviceCount: number
  }
  const map = new Map<string, Agg>()
  const keyOf = (dc: string, card: string) => `${dc}::${card}`

  for (const b of buckets) {
    const k = keyOf(b.dataCenterId, b.gpuCardTypeId)
    const cur = map.get(k) ?? {
      newFaultCount: 0,
      carryoverFaultCount: 0,
      closedFaultCount: 0,
      newFaultDeviceCount: 0,
      carryoverFaultDeviceCount: 0,
      closedFaultDeviceCount: 0,
    }
    if (b.listKind === 'new') cur.newFaultCount = Number(b.cnt)
    if (b.listKind === 'carryover') cur.carryoverFaultCount = Number(b.cnt)
    map.set(k, cur)
  }

  // 关闭次数
  for (const inc of incidents) {
    if (
      inc.incidentStatus === 'closed' &&
      inc.endedAt &&
      inc.endedAt >= start &&
      inc.endedAt < end
    ) {
      const k = keyOf(inc.dataCenterId, inc.gpuCardTypeId)
      const cur = map.get(k) ?? {
        newFaultCount: 0,
        carryoverFaultCount: 0,
        closedFaultCount: 0,
        newFaultDeviceCount: 0,
        carryoverFaultDeviceCount: 0,
        closedFaultDeviceCount: 0,
      }
      cur.closedFaultCount += 1
      map.set(k, cur)
    }
  }

  // 设备次数（简化：按当日新增/遗留事件关联设备去重）
  const deviceRows = await db
    .select({
      dataCenterId: slaOpsFaultIncidentDevice.dataCenterId,
      gpuCardTypeId: slaOpsFaultIncidentDevice.gpuCardTypeId,
      deviceSn: slaOpsFaultIncidentDevice.deviceSn,
      incidentId: slaOpsFaultIncidentDevice.incidentId,
      firstSeenDate: slaOpsFaultIncident.firstSeenDate,
      deviceStatus: slaOpsFaultIncidentDevice.deviceIncidentStatus,
      startedAt: slaOpsFaultIncidentDevice.startedAt,
    })
    .from(slaOpsFaultIncidentDevice)
    .innerJoin(
      slaOpsFaultIncident,
      eq(slaOpsFaultIncidentDevice.incidentId, slaOpsFaultIncident.id),
    )

  for (const d of deviceRows) {
    const k = keyOf(d.dataCenterId, d.gpuCardTypeId)
    const cur = map.get(k)
    if (!cur) continue
    if (d.firstSeenDate === statDate) cur.newFaultDeviceCount += 1
    if (
      d.firstSeenDate < statDate &&
      d.deviceStatus !== 'closed' &&
      d.startedAt < end
    ) {
      cur.carryoverFaultDeviceCount += 1
    }
  }

  for (const [k, agg] of map) {
    const [dataCenterId, gpuCardTypeId] = k.split('::') as [string, string]
    await db
      .insert(slaFaultCountDaily)
      .values({
        id: newId(),
        statDate,
        dataCenterId,
        gpuCardTypeId,
        slaScope: 'all',
        newFaultCount: agg.newFaultCount,
        carryoverFaultCount: agg.carryoverFaultCount,
        closedFaultCount: agg.closedFaultCount,
        resolvedFaultCount: 0,
        newFaultDeviceCount: agg.newFaultDeviceCount,
        carryoverFaultDeviceCount: agg.carryoverFaultDeviceCount,
        closedFaultDeviceCount: agg.closedFaultDeviceCount,
        newFaultByCategory: {},
      })
      .onConflictDoUpdate({
        target: [
          slaFaultCountDaily.statDate,
          slaFaultCountDaily.dataCenterId,
          slaFaultCountDaily.gpuCardTypeId,
          slaFaultCountDaily.slaScope,
        ],
        set: {
          newFaultCount: agg.newFaultCount,
          carryoverFaultCount: agg.carryoverFaultCount,
          closedFaultCount: agg.closedFaultCount,
          newFaultDeviceCount: agg.newFaultDeviceCount,
          carryoverFaultDeviceCount: agg.carryoverFaultDeviceCount,
          closedFaultDeviceCount: agg.closedFaultDeviceCount,
          updatedAt: new Date(),
        },
      })
  }

  supplierLog('sla.faultDailyJob', 'ok', { statDate, snapshotCount, buckets: map.size })
  return { ok: true, counts: map.size }
}

/** P0：设备×日故障裁剪 */
export async function runSlaFaultDeviceDailyJob(
  statDate: string,
): Promise<{ ok: true; rows: number }> {
  const { start, end } = shanghaiDayBounds(statDate)
  const devices = await db.select().from(slaOpsFaultIncidentDevice)

  type Acc = {
    supplierDeviceId: string | null
    deviceSn: string
    dataCenterId: string
    gpuCardTypeId: string
    gpuCount: number
    impactSide: string
    faultMachineHours: number
    faultCardHours: number
    incidentIds: Set<string>
    sourceIds: string[]
  }
  const accMap = new Map<string, Acc>()

  for (const d of devices) {
    const clipStart = d.startedAt > start ? d.startedAt : start
    const clipEndRaw = d.endedAt ?? end
    const clipEnd = clipEndRaw < end ? clipEndRaw : end
    if (clipEnd <= clipStart) continue
    if (d.startedAt >= end || (d.endedAt != null && d.endedAt <= start)) continue

    const hours = Math.max(0, (clipEnd.getTime() - clipStart.getTime()) / 3_600_000)
    const cardHours = hours * d.gpuCount
    const key = `${d.deviceSn}::${d.impactSide}`
    const cur = accMap.get(key) ?? {
      supplierDeviceId: d.supplierDeviceId,
      deviceSn: d.deviceSn,
      dataCenterId: d.dataCenterId,
      gpuCardTypeId: d.gpuCardTypeId,
      gpuCount: d.gpuCount,
      impactSide: d.impactSide,
      faultMachineHours: 0,
      faultCardHours: 0,
      incidentIds: new Set<string>(),
      sourceIds: [],
    }
    cur.faultMachineHours += hours
    cur.faultCardHours += cardHours
    cur.incidentIds.add(d.incidentId)
    cur.sourceIds.push(d.id)
    accMap.set(key, cur)
  }

  // 供给分摊：同机房×卡型当日 supply / 设备数近似；无设备池时用 gpu_count*24
  const supplyRows = await db
    .select()
    .from(slaSupplyDaily)
    .where(and(eq(slaSupplyDaily.statDate, statDate), eq(slaSupplyDaily.slaScope, 'all')))

  const supplyByBucket = new Map(
    supplyRows.map((r) => [`${r.dataCenterId}::${r.gpuCardTypeId}`, toNum(r.totalCardHours)]),
  )

  const snByBucket = new Map<string, Set<string>>()
  for (const a of accMap.values()) {
    const bk = `${a.dataCenterId}::${a.gpuCardTypeId}`
    const set = snByBucket.get(bk) ?? new Set()
    set.add(a.deviceSn)
    snByBucket.set(bk, set)
  }

  let rows = 0
  const now = new Date()
  for (const a of accMap.values()) {
    const bk = `${a.dataCenterId}::${a.gpuCardTypeId}`
    const pool = supplyByBucket.get(bk) ?? 0
    const snCount = snByBucket.get(bk)?.size ?? 1
    const supplyCardHours =
      pool > 0 ? pool / snCount : a.gpuCount * 24
    const supplyMachineHours = supplyCardHours / Math.max(1, a.gpuCount)
    const deviceSlaRate =
      a.impactSide === 'external'
        ? computeRate(supplyCardHours, a.faultCardHours)
        : null

    await db
      .insert(slaFaultDeviceDaily)
      .values({
        id: newId(),
        statDate,
        supplierDeviceId: a.supplierDeviceId,
        deviceSn: a.deviceSn,
        dataCenterId: a.dataCenterId,
        gpuCardTypeId: a.gpuCardTypeId,
        gpuCount: a.gpuCount,
        impactSide: a.impactSide,
        faultMachineHours: String(a.faultMachineHours),
        faultCardHours: String(a.faultCardHours),
        supplyMachineHours: String(supplyMachineHours),
        supplyCardHours: String(supplyCardHours),
        deviceSlaRate,
        incidentCount: a.incidentIds.size,
        sourceIncidentDeviceIds: a.sourceIds,
        rollupAt: now,
      })
      .onConflictDoUpdate({
        target: [
          slaFaultDeviceDaily.statDate,
          slaFaultDeviceDaily.deviceSn,
          slaFaultDeviceDaily.impactSide,
        ],
        set: {
          faultMachineHours: String(a.faultMachineHours),
          faultCardHours: String(a.faultCardHours),
          supplyMachineHours: String(supplyMachineHours),
          supplyCardHours: String(supplyCardHours),
          deviceSlaRate,
          incidentCount: a.incidentIds.size,
          sourceIncidentDeviceIds: a.sourceIds,
          rollupAt: now,
          updatedAt: now,
        },
      })
    rows++
  }

  supplierLog('sla.faultDeviceDailyJob', 'ok', { statDate, rows })
  return { ok: true, rows }
}

/** 月切：机房×卡型 / 机房 / 设备 */
export async function runSlaMonthlyRollupJob(
  slaMonth: string,
): Promise<{ ok: true; cardTypeRows: number; dcRows: number; deviceRows: number }> {
  const { start, end, endDay } = monthRange(slaMonth)
  const now = new Date()

  const supplyAgg = await db
    .select({
      dataCenterId: slaSupplyDaily.dataCenterId,
      gpuCardTypeId: slaSupplyDaily.gpuCardTypeId,
      contractCardHours: sql<string>`coalesce(sum(${slaSupplyDaily.contractCardHours}),0)::text`,
      totalSupplyCardHours: sql<string>`coalesce(sum(${slaSupplyDaily.totalCardHours}),0)::text`,
      totalSupplyMachineHours: sql<string>`coalesce(sum(${slaSupplyDaily.totalMachineHours}),0)::text`,
      onboardingLossCardHours: sql<string>`coalesce(sum(${slaSupplyDaily.onboardingLossCardHours}),0)::text`,
    })
    .from(slaSupplyDaily)
    .where(
      and(
        eq(slaSupplyDaily.slaScope, 'all'),
        gte(slaSupplyDaily.statDate, start),
        lte(slaSupplyDaily.statDate, end),
      ),
    )
    .groupBy(slaSupplyDaily.dataCenterId, slaSupplyDaily.gpuCardTypeId)

  const faultAgg = await db
    .select({
      dataCenterId: slaFaultCardHoursDaily.dataCenterId,
      gpuCardTypeId: slaFaultCardHoursDaily.gpuCardTypeId,
      impactSide: slaFaultCardHoursDaily.impactSide,
      faultCardHours: sql<string>`coalesce(sum(${slaFaultCardHoursDaily.faultCardHours}),0)::text`,
    })
    .from(slaFaultCardHoursDaily)
    .where(
      and(
        eq(slaFaultCardHoursDaily.slaScope, 'all'),
        gte(slaFaultCardHoursDaily.statDate, start),
        lte(slaFaultCardHoursDaily.statDate, end),
      ),
    )
    .groupBy(
      slaFaultCardHoursDaily.dataCenterId,
      slaFaultCardHoursDaily.gpuCardTypeId,
      slaFaultCardHoursDaily.impactSide,
    )

  const countAgg = await db
    .select({
      dataCenterId: slaFaultCountDaily.dataCenterId,
      gpuCardTypeId: slaFaultCountDaily.gpuCardTypeId,
      newFaultCount: sql<number>`coalesce(sum(${slaFaultCountDaily.newFaultCount}),0)::int`,
      closedFaultCount: sql<number>`coalesce(sum(${slaFaultCountDaily.closedFaultCount}),0)::int`,
      newFaultDeviceCount: sql<number>`coalesce(sum(${slaFaultCountDaily.newFaultDeviceCount}),0)::int`,
    })
    .from(slaFaultCountDaily)
    .where(
      and(
        eq(slaFaultCountDaily.slaScope, 'all'),
        gte(slaFaultCountDaily.statDate, start),
        lte(slaFaultCountDaily.statDate, end),
      ),
    )
    .groupBy(slaFaultCountDaily.dataCenterId, slaFaultCountDaily.gpuCardTypeId)

  const carryEnd = await db
    .select()
    .from(slaFaultCountDaily)
    .where(and(eq(slaFaultCountDaily.statDate, endDay), eq(slaFaultCountDaily.slaScope, 'all')))

  const utilAgg = await db
    .select({
      dataCenterId: slaUtilizationDaily.dataCenterId,
      gpuCardTypeId: slaUtilizationDaily.gpuCardTypeId,
      actualUsage: sql<string>`coalesce(sum(${slaUtilizationDaily.actualUsageCardHours}),0)::text`,
      idle: sql<string>`coalesce(sum(${slaUtilizationDaily.idleCardHours}),0)::text`,
      internalUsage: sql<string>`coalesce(sum(${slaUtilizationDaily.internalUsageCardHours}),0)::text`,
    })
    .from(slaUtilizationDaily)
    .where(
      and(
        eq(slaUtilizationDaily.slaScope, 'all'),
        gte(slaUtilizationDaily.statDate, start),
        lte(slaUtilizationDaily.statDate, end),
      ),
    )
    .groupBy(slaUtilizationDaily.dataCenterId, slaUtilizationDaily.gpuCardTypeId)

  const wasteAgg = await db
    .select({
      dataCenterId: slaWasteDaily.dataCenterId,
      gpuCardTypeId: slaWasteDaily.gpuCardTypeId,
      waste: sql<string>`coalesce(sum(${slaWasteDaily.wasteCardHours}),0)::text`,
    })
    .from(slaWasteDaily)
    .where(
      and(
        eq(slaWasteDaily.slaScope, 'all'),
        gte(slaWasteDaily.statDate, start),
        lte(slaWasteDaily.statDate, end),
      ),
    )
    .groupBy(slaWasteDaily.dataCenterId, slaWasteDaily.gpuCardTypeId)

  const onboardingEvents = await db
    .select({
      dataCenterId: slaOnboardingLoss.dataCenterId,
      gpuCardTypeId: slaOnboardingLoss.gpuCardTypeId,
      cnt: sql<number>`count(*)::int`,
      loss: sql<string>`coalesce(sum(${slaOnboardingLoss.lossCardHours}),0)::text`,
    })
    .from(slaOnboardingLoss)
    .where(
      and(
        gte(slaOnboardingLoss.opsReceivedAt, new Date(`${start}T00:00:00+08:00`)),
        lte(slaOnboardingLoss.opsReceivedAt, new Date(`${end}T23:59:59+08:00`)),
      ),
    )
    .groupBy(slaOnboardingLoss.dataCenterId, slaOnboardingLoss.gpuCardTypeId)

  const offlineCnt = await db
    .select({
      dataCenterId: slaPlatformOfflineBaremetalIncident.dataCenterId,
      gpuCardTypeId: slaPlatformOfflineBaremetalIncident.gpuCardTypeId,
      cnt: sql<number>`count(*)::int`,
      comp: sql<string>`coalesce(sum(${slaPlatformOfflineBaremetalIncident.compensationAmount}),0)::text`,
      exempt: sql<number>`coalesce(sum(case when ${slaPlatformOfflineBaremetalIncident.isForceMajeureExempt} then 1 else 0 end),0)::int`,
    })
    .from(slaPlatformOfflineBaremetalIncident)
    .where(
      and(
        gte(slaPlatformOfflineBaremetalIncident.faultStartedAt, new Date(`${start}T00:00:00+08:00`)),
        lte(slaPlatformOfflineBaremetalIncident.faultStartedAt, new Date(`${end}T23:59:59+08:00`)),
      ),
    )
    .groupBy(
      slaPlatformOfflineBaremetalIncident.dataCenterId,
      slaPlatformOfflineBaremetalIncident.gpuCardTypeId,
    )

  const onlineCnt = await db
    .select({
      dataCenterId: slaPlatformOnlineIncident.dataCenterId,
      gpuCardTypeId: slaPlatformOnlineIncident.gpuCardTypeId,
      cnt: sql<number>`count(*)::int`,
      voucher: sql<string>`coalesce(sum(${slaPlatformOnlineIncident.compensationVoucherAmount}),0)::text`,
      exempt: sql<number>`coalesce(sum(case when ${slaPlatformOnlineIncident.isForceMajeureExempt} then 1 else 0 end),0)::int`,
    })
    .from(slaPlatformOnlineIncident)
    .where(
      and(
        gte(slaPlatformOnlineIncident.faultStartedAt, new Date(`${start}T00:00:00+08:00`)),
        lte(slaPlatformOnlineIncident.faultStartedAt, new Date(`${end}T23:59:59+08:00`)),
      ),
    )
    .groupBy(slaPlatformOnlineIncident.dataCenterId, slaPlatformOnlineIncident.gpuCardTypeId)

  const dcMeta = await db
    .select({ id: dataCenter.id, supplierId: dataCenter.supplierId })
    .from(dataCenter)
  const supplierByDc = new Map(dcMeta.map((d) => [d.id, d.supplierId]))

  type Row = {
    dataCenterId: string
    gpuCardTypeId: string
    contract: number
    supply: number
    supplyMachine: number
    onboardingLoss: number
    externalFault: number
    internalFault: number
    newFault: number
    closedFault: number
    newFaultDevice: number
    carryoverEnd: number
    carryoverDeviceEnd: number
    actualUsage: number
    idle: number
    waste: number
    internalUsage: number
    onboardingEvents: number
    offline: number
    online: number
    compensation: number
    exempt: number
  }

  const rowMap = new Map<string, Row>()
  const ensure = (dc: string, card: string): Row => {
    const k = `${dc}::${card}`
    let r = rowMap.get(k)
    if (!r) {
      r = {
        dataCenterId: dc,
        gpuCardTypeId: card,
        contract: 0,
        supply: 0,
        supplyMachine: 0,
        onboardingLoss: 0,
        externalFault: 0,
        internalFault: 0,
        newFault: 0,
        closedFault: 0,
        newFaultDevice: 0,
        carryoverEnd: 0,
        carryoverDeviceEnd: 0,
        actualUsage: 0,
        idle: 0,
        waste: 0,
        internalUsage: 0,
        onboardingEvents: 0,
        offline: 0,
        online: 0,
        compensation: 0,
        exempt: 0,
      }
      rowMap.set(k, r)
    }
    return r
  }

  for (const s of supplyAgg) {
    const r = ensure(s.dataCenterId, s.gpuCardTypeId)
    r.contract = toNum(s.contractCardHours)
    r.supply = toNum(s.totalSupplyCardHours)
    r.supplyMachine = toNum(s.totalSupplyMachineHours)
    r.onboardingLoss = toNum(s.onboardingLossCardHours)
  }
  for (const f of faultAgg) {
    const r = ensure(f.dataCenterId, f.gpuCardTypeId)
    if (f.impactSide === 'external') r.externalFault = toNum(f.faultCardHours)
    else r.internalFault = toNum(f.faultCardHours)
  }
  for (const c of countAgg) {
    const r = ensure(c.dataCenterId, c.gpuCardTypeId)
    r.newFault = Number(c.newFaultCount)
    r.closedFault = Number(c.closedFaultCount)
    r.newFaultDevice = Number(c.newFaultDeviceCount)
  }
  for (const c of carryEnd) {
    const r = ensure(c.dataCenterId, c.gpuCardTypeId)
    r.carryoverEnd = c.carryoverFaultCount
    r.carryoverDeviceEnd = c.carryoverFaultDeviceCount
  }
  for (const u of utilAgg) {
    const r = ensure(u.dataCenterId, u.gpuCardTypeId)
    r.actualUsage = toNum(u.actualUsage)
    r.idle = toNum(u.idle)
    r.internalUsage = toNum(u.internalUsage)
  }
  for (const w of wasteAgg) {
    const r = ensure(w.dataCenterId, w.gpuCardTypeId)
    r.waste = toNum(w.waste)
  }
  for (const o of onboardingEvents) {
    const r = ensure(o.dataCenterId, o.gpuCardTypeId)
    r.onboardingEvents = Number(o.cnt)
    if (r.onboardingLoss <= 0) r.onboardingLoss = toNum(o.loss)
  }
  for (const o of offlineCnt) {
    const r = ensure(o.dataCenterId, o.gpuCardTypeId)
    r.offline = Number(o.cnt)
    r.compensation += toNum(o.comp)
    r.exempt += Number(o.exempt)
  }
  for (const o of onlineCnt) {
    const r = ensure(o.dataCenterId, o.gpuCardTypeId)
    r.online = Number(o.cnt)
    r.compensation += toNum(o.voucher)
    r.exempt += Number(o.exempt)
  }

  let cardTypeRows = 0
  for (const r of rowMap.values()) {
    const availabilityRate =
      r.contract > 0 ? String(r.supply / r.contract) : null
    const faultSlaRate = computeRate(r.supply, r.externalFault)
    const slaMet =
      faultSlaRate != null ? Number(faultSlaRate) >= SLA_TARGET : null
    const idleRateAvg = r.supply > 0 ? String(r.idle / r.supply) : null
    const wasteRateAvg = r.supply > 0 ? String(r.waste / r.supply) : null

    await db
      .insert(slaDatacenterCardTypeMonthly)
      .values({
        id: newId(),
        slaMonth,
        dataCenterId: r.dataCenterId,
        gpuCardTypeId: r.gpuCardTypeId,
        slaScope: 'all',
        supplierId: supplierByDc.get(r.dataCenterId) ?? null,
        contractCardHours: String(r.contract),
        totalSupplyCardHours: String(r.supply),
        totalSupplyMachineHours: String(r.supplyMachine),
        onboardingLossCardHours: String(r.onboardingLoss),
        newFaultCount: r.newFault,
        carryoverFaultCountEnd: r.carryoverEnd,
        closedFaultCount: r.closedFault,
        newFaultDeviceCount: r.newFaultDevice,
        carryoverFaultDeviceCountEnd: r.carryoverDeviceEnd,
        externalFaultCardHours: String(r.externalFault),
        internalFaultCardHours: String(r.internalFault),
        actualUsageCardHours: String(r.actualUsage),
        idleCardHours: String(r.idle),
        idleRateAvg,
        wasteCardHours: String(r.waste),
        wasteRateAvg,
        internalUsageCardHours: String(r.internalUsage),
        onboardingLossEventCount: r.onboardingEvents,
        platformOfflineIncidentCount: r.offline,
        platformOnlineIncidentCount: r.online,
        compensationAmountTotal: String(r.compensation),
        exemptIncidentCount: r.exempt,
        availabilityRate,
        faultSlaRate,
        slaMet,
        rollupStatus: 'complete',
        rollupAt: now,
        metadata: {},
      })
      .onConflictDoUpdate({
        target: [
          slaDatacenterCardTypeMonthly.slaMonth,
          slaDatacenterCardTypeMonthly.dataCenterId,
          slaDatacenterCardTypeMonthly.gpuCardTypeId,
          slaDatacenterCardTypeMonthly.slaScope,
        ],
        set: {
          contractCardHours: String(r.contract),
          totalSupplyCardHours: String(r.supply),
          totalSupplyMachineHours: String(r.supplyMachine),
          onboardingLossCardHours: String(r.onboardingLoss),
          newFaultCount: r.newFault,
          carryoverFaultCountEnd: r.carryoverEnd,
          closedFaultCount: r.closedFault,
          newFaultDeviceCount: r.newFaultDevice,
          carryoverFaultDeviceCountEnd: r.carryoverDeviceEnd,
          externalFaultCardHours: String(r.externalFault),
          internalFaultCardHours: String(r.internalFault),
          actualUsageCardHours: String(r.actualUsage),
          idleCardHours: String(r.idle),
          idleRateAvg,
          wasteCardHours: String(r.waste),
          wasteRateAvg,
          internalUsageCardHours: String(r.internalUsage),
          onboardingLossEventCount: r.onboardingEvents,
          platformOfflineIncidentCount: r.offline,
          platformOnlineIncidentCount: r.online,
          compensationAmountTotal: String(r.compensation),
          exemptIncidentCount: r.exempt,
          availabilityRate,
          faultSlaRate,
          slaMet,
          rollupStatus: 'complete',
          rollupAt: now,
          updatedAt: now,
        },
      })
    cardTypeRows++
  }

  // 机房级汇总
  const byDc = new Map<string, Row[]>()
  for (const r of rowMap.values()) {
    const list = byDc.get(r.dataCenterId) ?? []
    list.push(r)
    byDc.set(r.dataCenterId, list)
  }

  let dcRows = 0
  for (const [dcId, rows] of byDc) {
    const sum = (pick: (r: Row) => number) => rows.reduce((s, r) => s + pick(r), 0)
    const contract = sum((r) => r.contract)
    const supply = sum((r) => r.supply)
    const externalFault = sum((r) => r.externalFault)
    const idle = sum((r) => r.idle)
    const waste = sum((r) => r.waste)
    const availabilityRate = contract > 0 ? String(supply / contract) : null
    const faultSlaRate = computeRate(supply, externalFault)
    const slaMet = faultSlaRate != null ? Number(faultSlaRate) >= SLA_TARGET : null

    await db
      .insert(slaDatacenterMonthly)
      .values({
        id: newId(),
        slaMonth,
        dataCenterId: dcId,
        slaScope: 'all',
        supplierId: supplierByDc.get(dcId) ?? null,
        contractCardHours: String(contract),
        totalSupplyCardHours: String(supply),
        totalSupplyMachineHours: String(sum((r) => r.supplyMachine)),
        onboardingLossCardHours: String(sum((r) => r.onboardingLoss)),
        newFaultCount: sum((r) => r.newFault),
        carryoverFaultCountEnd: sum((r) => r.carryoverEnd),
        closedFaultCount: sum((r) => r.closedFault),
        newFaultDeviceCount: sum((r) => r.newFaultDevice),
        carryoverFaultDeviceCountEnd: sum((r) => r.carryoverDeviceEnd),
        externalFaultCardHours: String(externalFault),
        internalFaultCardHours: String(sum((r) => r.internalFault)),
        actualUsageCardHours: String(sum((r) => r.actualUsage)),
        idleCardHours: String(idle),
        idleRateAvg: supply > 0 ? String(idle / supply) : null,
        wasteCardHours: String(waste),
        wasteRateAvg: supply > 0 ? String(waste / supply) : null,
        internalUsageCardHours: String(sum((r) => r.internalUsage)),
        onboardingLossEventCount: sum((r) => r.onboardingEvents),
        platformOfflineIncidentCount: sum((r) => r.offline),
        platformOnlineIncidentCount: sum((r) => r.online),
        compensationAmountTotal: String(sum((r) => r.compensation)),
        exemptIncidentCount: sum((r) => r.exempt),
        availabilityRate,
        faultSlaRate,
        slaMet,
        rollupStatus: 'complete',
        rollupAt: now,
        metadata: {},
      })
      .onConflictDoUpdate({
        target: [
          slaDatacenterMonthly.slaMonth,
          slaDatacenterMonthly.dataCenterId,
          slaDatacenterMonthly.slaScope,
        ],
        set: {
          contractCardHours: String(contract),
          totalSupplyCardHours: String(supply),
          totalSupplyMachineHours: String(sum((r) => r.supplyMachine)),
          onboardingLossCardHours: String(sum((r) => r.onboardingLoss)),
          newFaultCount: sum((r) => r.newFault),
          carryoverFaultCountEnd: sum((r) => r.carryoverEnd),
          closedFaultCount: sum((r) => r.closedFault),
          newFaultDeviceCount: sum((r) => r.newFaultDevice),
          carryoverFaultDeviceCountEnd: sum((r) => r.carryoverDeviceEnd),
          externalFaultCardHours: String(externalFault),
          internalFaultCardHours: String(sum((r) => r.internalFault)),
          actualUsageCardHours: String(sum((r) => r.actualUsage)),
          idleCardHours: String(idle),
          idleRateAvg: supply > 0 ? String(idle / supply) : null,
          wasteCardHours: String(waste),
          wasteRateAvg: supply > 0 ? String(waste / supply) : null,
          internalUsageCardHours: String(sum((r) => r.internalUsage)),
          onboardingLossEventCount: sum((r) => r.onboardingEvents),
          platformOfflineIncidentCount: sum((r) => r.offline),
          platformOnlineIncidentCount: sum((r) => r.online),
          compensationAmountTotal: String(sum((r) => r.compensation)),
          exemptIncidentCount: sum((r) => r.exempt),
          availabilityRate,
          faultSlaRate,
          slaMet,
          rollupStatus: 'complete',
          rollupAt: now,
          updatedAt: now,
        },
      })
    dcRows++
  }

  // 设备月
  const deviceDaily = await db
    .select()
    .from(slaFaultDeviceDaily)
    .where(and(gte(slaFaultDeviceDaily.statDate, start), lte(slaFaultDeviceDaily.statDate, end)))

  type DevAcc = {
    supplierDeviceId: string | null
    deviceSn: string
    dataCenterId: string
    gpuCardTypeId: string
    gpuCount: number
    activeDays: Set<string>
    externalMachine: number
    internalMachine: number
    externalCard: number
    internalCard: number
    supplyMachine: number
    supplyCard: number
  }
  const devMap = new Map<string, DevAcc>()
  for (const d of deviceDaily) {
    const cur = devMap.get(d.deviceSn) ?? {
      supplierDeviceId: d.supplierDeviceId,
      deviceSn: d.deviceSn,
      dataCenterId: d.dataCenterId,
      gpuCardTypeId: d.gpuCardTypeId,
      gpuCount: d.gpuCount,
      activeDays: new Set<string>(),
      externalMachine: 0,
      internalMachine: 0,
      externalCard: 0,
      internalCard: 0,
      supplyMachine: 0,
      supplyCard: 0,
    }
    cur.activeDays.add(d.statDate)
    if (d.impactSide === 'external') {
      cur.externalMachine += toNum(d.faultMachineHours)
      cur.externalCard += toNum(d.faultCardHours)
      cur.supplyMachine += toNum(d.supplyMachineHours)
      cur.supplyCard += toNum(d.supplyCardHours)
    } else {
      cur.internalMachine += toNum(d.faultMachineHours)
      cur.internalCard += toNum(d.faultCardHours)
    }
    cur.dataCenterId = d.dataCenterId
    cur.gpuCardTypeId = d.gpuCardTypeId
    cur.gpuCount = d.gpuCount
    cur.supplierDeviceId = d.supplierDeviceId ?? cur.supplierDeviceId
    devMap.set(d.deviceSn, cur)
  }

  let deviceRows = 0
  for (const d of devMap.values()) {
    const deviceSlaRate = computeRate(d.supplyCard, d.externalCard)
    const slaMet =
      deviceSlaRate != null ? Number(deviceSlaRate) >= SLA_TARGET : null
    await db
      .insert(slaDeviceMonthly)
      .values({
        id: newId(),
        slaMonth,
        supplierDeviceId: d.supplierDeviceId,
        deviceSn: d.deviceSn,
        dataCenterId: d.dataCenterId,
        gpuCardTypeId: d.gpuCardTypeId,
        gpuCount: d.gpuCount,
        activeDays: d.activeDays.size,
        externalFaultMachineHours: String(d.externalMachine),
        internalFaultMachineHours: String(d.internalMachine),
        externalFaultCardHours: String(d.externalCard),
        internalFaultCardHours: String(d.internalCard),
        supplyMachineHours: String(d.supplyMachine),
        supplyCardHours: String(d.supplyCard),
        deviceSlaRate,
        slaMet,
        rollupStatus: 'complete',
        rollupAt: now,
        metadata: {},
      })
      .onConflictDoUpdate({
        target: [slaDeviceMonthly.slaMonth, slaDeviceMonthly.deviceSn],
        set: {
          supplierDeviceId: d.supplierDeviceId,
          dataCenterId: d.dataCenterId,
          gpuCardTypeId: d.gpuCardTypeId,
          gpuCount: d.gpuCount,
          activeDays: d.activeDays.size,
          externalFaultMachineHours: String(d.externalMachine),
          internalFaultMachineHours: String(d.internalMachine),
          externalFaultCardHours: String(d.externalCard),
          internalFaultCardHours: String(d.internalCard),
          supplyMachineHours: String(d.supplyMachine),
          supplyCardHours: String(d.supplyCard),
          deviceSlaRate,
          slaMet,
          rollupStatus: 'complete',
          rollupAt: now,
          updatedAt: now,
        },
      })
    deviceRows++
  }

  // 触发内部使用写入 utilization 的旁路可后续扩展；此处仅引用表避免 unused
  void slaPlatformInternalUsage

  supplierLog('sla.monthlyRollup', 'ok', { slaMonth, cardTypeRows, dcRows, deviceRows })
  return { ok: true, cardTypeRows, dcRows, deviceRows }
}

export async function runSlaDailyPipeline(statDate: string): Promise<void> {
  try {
    await runSlaFaultDailyJob(statDate)
    await runSlaFaultDeviceDailyJob(statDate)
    const slaMonth = statDate.slice(0, 7)
    await runSlaMonthlyRollupJob(slaMonth)
  } catch (e) {
    supplierError('sla.dailyPipeline', 'failed', e, { statDate })
    throw e
  }
}
