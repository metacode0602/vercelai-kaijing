/**
 * Supplier settlement bill generation (daily → monthly).
 *
 * Called from apps/web cron only (register-supplier-billing-cron).
 * Daily bills are an internal intermediate; product shape for suppliers is monthly.
 */
import { db } from '@/lib/db'
import {
  supplierBillDaily,
  supplierBillDailyDetail,
  supplierBill,
  supplierBillDetail,
  dataCenter,
  supplierDevice,
  supplierPricingRecord,
  supplierDatacenterInfrastructure,
  devicePlatformProbeSnapshot,
  bareMetalOrderDevice,
  bareMetalOrder,
  tenantRegionGpuConsumptionDaily,
} from '@workspace/db/schema'
import { eq, and, gte, lt, sql, inArray, ne, isNotNull } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { notifyBillGenerated } from '@workspace/shared-supplier/notifications'
import {
  computeSettledAmount,
  daysInNaturalMonth,
  isPricingEffectiveAt,
  isCardTimePricingMode,
  isRevenueSharePricingMode,
  isTieredPricingMode,
  hasUnappliedHoursTiers,
  parsePricingTiers,
  resolvePricingFields,
  type ConsumptionBase,
  type ContractPricingTier as SharedContractPricingTier,
} from '@workspace/billing/pricing-resolver'
// W-19：金额一律走定点整数运算，不用 float 相加（详见 money.ts 注释）。
import { multiplyMoney, subtractMoney, sumMoney } from '@workspace/billing/money'
import { crmError, crmLog } from '@/lib/server/dataaccess/crm/logger'

const LOG = 'supplier-bill-generation'

/**
 * 单个（供应商 × 机房）出账失败记录。
 *
 * 存在的原因：出账按 (供应商, 机房) 逐个 try/catch，一个机房出错不该阻断
 * 其余供应商。但此前 catch 只写日志就继续，函数仍返回成功，
 * 导致「定价缺失 / DB 报错」这类致命配置问题表现为
 * 「本次运行成功，只是账单没生成」—— cron 绿灯、无人告警、供应商没账单。
 * 因此把失败显式带回，由调用方决定是否告警。
 */
export type BillGenerationFailure = {
  supplierId: string
  /** 日账单粒度到机房；月账单粒度只到供应商，故为 null */
  dataCenterId: string | null
  billMonth: string
  error: string
}

export type BillGenerationResult = {
  billsCreated: number
  failures: BillGenerationFailure[]
}

const RENTED_PROXY_STATUSES = new Set(['ElasticRenting'])

type CardTypeUsage = {
  gpuCardTypeId: string
  usageHours: number
  /** 归一化卡时单价；纯分成模式为 null（金额取决于客户消费，不由卡时决定） */
  unitCost: number | null
}

/** Device-level attribution row. Mirrors one row of supplier_bill_daily_detail. */
type DeviceUsage = {
  deviceId: string
  gpuCardTypeId: string
  usageHours: number
  /**
   * W-12：设备所属合同。合同追溯只能落在设备粒度 —— 月账单/日账单是按
   * (机房, 卡型) 聚合的，同一 (机房, 卡型) 可以被多份合同覆盖，因此账单头
   * 挂单个 contractId 语义不成立。设备粒度才有唯一合同，才能真正回答
   * 「这笔钱对应哪份合同」。
   */
  contractId: string | null
}

/**
 * Pricing snapshot resolved for one (dataCenter, cardType) pair.
 * `pricingMode` is persisted onto the bill so downstream consumers never
 * have to re-join supplierContract / supplierPricingRecord to know the formula.
 */
type ResolvedPricing = {
  pricingMode: string
  /** 归一化后的卡时单价（整租已折算）；分成模式为 null，金额走消费 × 分成比例 */
  unitCost: number | null
  billingUnit: string | null
  unitPrice: string | null
  unitPricePerHour: string | null
  cardsPerMachine: number | null
  revenueSharePercent: string | null
  /** 阶梯档位（tiered_* 才非空），出账按实际成交比例/卡时落档 */
  pricingTiers: SharedContractPricingTier[]
  listPricePerHour: number | null
}

type DeviceStats = {
  onlineDeviceCount: number
  rentedGpuCount: number
  idleGpuCount: number
}

function shanghaiDateString(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
}

function shanghaiDayBounds(usageDate: Date): { start: Date; end: Date; dateStr: string } {
  const dateStr = shanghaiDateString(usageDate)
  // Interpret YYYY-MM-DD as Shanghai midnight → UTC Instant via offset-aware construction
  const start = new Date(`${dateStr}T00:00:00+08:00`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { start, end, dateStr }
}

function overlapHours(
  rangeStart: Date,
  rangeEnd: Date,
  windowStart: Date,
  windowEnd: Date,
): number {
  const start = Math.max(rangeStart.getTime(), windowStart.getTime())
  const end = Math.min(rangeEnd.getTime(), windowEnd.getTime())
  if (end <= start) return 0
  return (end - start) / (60 * 60 * 1000)
}

async function resolveCooperationMode(
  supplierId: string,
  dataCenterId: string,
): Promise<string> {
  const rows = await db
    .select({
      cooperationType: supplierDevice.cooperationType,
      cnt: sql<number>`COUNT(*)::int`,
    })
    .from(supplierDevice)
    .where(
      and(
        eq(supplierDevice.supplierId, supplierId),
        eq(supplierDevice.dataCenterId, dataCenterId),
        eq(supplierDevice.lifecycleStatus, 'online'),
      ),
    )
    .groupBy(supplierDevice.cooperationType)

  if (rows.length === 0) return 'idle_time'
  if (rows.length === 1) return rows[0]!.cooperationType || 'idle_time'

  const types = new Set(rows.map((r) => r.cooperationType).filter(Boolean))
  if (types.size === 1) return [...types][0]!
  return 'mixed'
}

/**
 * Resolve the active pricing snapshot for one (dataCenter, cardType) pair.
 * The dataCenterId filter is required: the same card type can be priced
 * differently per datacenter, and billing off the wrong row silently
 * misprices the whole bill.
 */
/**
 * 解析供应商价格（W-10：口径统一到 @workspace/billing/pricing-resolver）。
 *
 * 相比原实现修掉三处财务偏差：
 *  1. **有效期**：原来只按 `configStatus='active'` 过滤，完全不读
 *     `effectiveFrom` / `effectiveTo`，改价时若只调生效区间会继续按过期价结算。
 *  2. **整租**：原来直接 `parseFloat(unitPricePerHour ?? '0')`；整租记录该列可空
 *     → 恒 0 元，整租账单金额全错。现统一走 `resolvePricingFields`，由
 *     `resolveCardTimeUnitPrice` 按自然月天数折算。
 *  3. **阶梯**：原来从不读 `pricingTiers`，`tiered_*` 被当普通卡时处理。
 *
 * @param asOfDate 结算基准日（`yyyy-MM-dd`）。整租折算用其所在自然月，
 *                 有效期也按该日判定。
 */
async function fetchPricing(
  supplierId: string,
  dataCenterId: string,
  cardTypeId: string,
  asOfDate: string,
): Promise<ResolvedPricing> {
  const [pricing] = await db
    .select({
      pricingMode: supplierPricingRecord.pricingMode,
      configStatus: supplierPricingRecord.configStatus,
      unitPricePerHour: supplierPricingRecord.unitPricePerHour,
      billingUnit: supplierPricingRecord.billingUnit,
      unitPrice: supplierPricingRecord.unitPrice,
      cardsPerMachine: supplierPricingRecord.cardsPerMachine,
      revenueSharePercent: supplierPricingRecord.revenueSharePercent,
      listPricePerHour: supplierPricingRecord.listPricePerHour,
      pricingTiers: supplierPricingRecord.pricingTiers,
      effectiveFrom: supplierPricingRecord.effectiveFrom,
      effectiveTo: supplierPricingRecord.effectiveTo,
    })
    .from(supplierPricingRecord)
    .where(
      and(
        eq(supplierPricingRecord.supplierId, supplierId),
        eq(supplierPricingRecord.dataCenterId, dataCenterId),
        eq(supplierPricingRecord.gpuCardTypeId, cardTypeId),
        eq(supplierPricingRecord.configStatus, 'active'),
      ),
    )
    .limit(1)

  if (!pricing) {
    crmLog(LOG, 'missing active pricing', { supplierId, dataCenterId, cardTypeId })
    throw new Error(
      `No active pricing for supplier ${supplierId}, datacenter ${dataCenterId}, card ${cardTypeId}`,
    )
  }

  if (!isPricingEffectiveAt(pricing.effectiveFrom, pricing.effectiveTo, asOfDate)) {
    crmLog(LOG, 'pricing not effective at bill date', {
      supplierId,
      dataCenterId,
      cardTypeId,
      asOfDate,
      effectiveFrom: pricing.effectiveFrom,
      effectiveTo: pricing.effectiveTo,
    })
    // 不静默按过期价出账，也不兜底 0 元：这属于配置错误，必须让运营先修价格。
    throw new Error(
      `Pricing not effective on ${asOfDate} for supplier ${supplierId}, datacenter ${dataCenterId}, card ${cardTypeId} (effective ${pricing.effectiveFrom} ~ ${pricing.effectiveTo ?? '∞'})`,
    )
  }

  // 阶梯 hours 轴未接入出账（matchTierByCardHours 无调用方）。配置了就必须中止，
  // 不能静默按顶层 unitPricePerHour 全额结算 —— 那会让阶梯折扣对供应商无效，
  // 且钱已经付出去了才发现。详见 hasUnappliedHoursTiers 的注释。
  if (hasUnappliedHoursTiers(pricing.pricingMode, parsePricingTiers(pricing.pricingTiers))) {
    crmError(
      LOG,
      'tiered_card_time with hours-axis tiers is not supported by billing yet',
      new Error('unapplied hours-axis tiers'),
      { supplierId, dataCenterId, cardTypeId, asOfDate, pricingMode: pricing.pricingMode },
    )
    throw new Error(
      `出账中止：${supplierId}/${dataCenterId}/${cardTypeId} 的 pricingMode=tiered_card_time ` +
        `配置了 hours 轴阶梯，但出账侧尚未接入该阶梯（matchTierByCardHours 无调用方）。` +
        `静默按顶层 unitPricePerHour 结算会导致阶梯折扣对供应商失效。` +
        `需业务先确定累计窗口（自然月/合同期）与跨档语义（回溯重定价/仅超出部分）后再启用。`,
    )
  }

  const fields = resolvePricingFields({
    ...pricing,
    referenceDate: asOfDate,
  })

  // 分成模式的金额来自「客户消费 × 分成比例」，没有卡时单价；
  // tiered_* 需要按实际成交比例/卡时落档后再取档位单价，故此处要求有卡时基价。
  if (isRevenueSharePricingMode(fields.pricingMode) && !isTieredPricingMode(fields.pricingMode)) {
    if (fields.revenueSharePercent == null) {
      crmLog(LOG, 'revenue_share pricing without percent', { supplierId, dataCenterId, cardTypeId })
      throw new Error(
        `Revenue-share pricing missing revenueSharePercent for supplier ${supplierId}, datacenter ${dataCenterId}, card ${cardTypeId}`,
      )
    }
  } else if (fields.unitPricePerHour == null) {
    crmLog(LOG, 'pricing resolved to null unit price', {
      supplierId,
      dataCenterId,
      cardTypeId,
      asOfDate,
      billingUnit: fields.billingUnit,
    })
    throw new Error(
      `Cannot derive unit price for supplier ${supplierId}, datacenter ${dataCenterId}, card ${cardTypeId} (billingUnit=${fields.billingUnit})`,
    )
  }

  return {
    pricingMode: fields.pricingMode,
    unitCost: fields.unitPricePerHour,
    billingUnit: fields.billingUnit,
    unitPrice: pricing.unitPrice,
    unitPricePerHour: pricing.unitPricePerHour,
    cardsPerMachine: fields.cardsPerMachine,
    revenueSharePercent: pricing.revenueSharePercent,
    pricingTiers: fields.pricingTiers,
    listPricePerHour: fields.listPricePerHour,
  }
}

/**
 * Probe-snapshot metering: for each CRM inventory snapshot hour in the day,
 * count GPU hours when the device looks rented (bare metal match or ElasticRenting).
 */
async function fetchUsageFromProbeSnapshots(
  supplierId: string,
  dataCenterId: string,
  dayStart: Date,
  dayEnd: Date,
): Promise<{
  byCardType: Map<string, number>
  byDevice: Map<string, DeviceUsage>
  rentedGpuPeak: number
  onlineDeviceCount: number
} | null> {
  const snapshots = await db
    .select({
      supplierDeviceId: devicePlatformProbeSnapshot.supplierDeviceId,
      snapshotHour: devicePlatformProbeSnapshot.snapshotHour,
      bareMetalMatched: devicePlatformProbeSnapshot.bareMetalMatched,
      proxyRentStatus: devicePlatformProbeSnapshot.proxyRentStatus,
      gpuCardTypeId: supplierDevice.gpuCardTypeId,
      gpuCount: supplierDevice.gpuCount,
      contractId: supplierDevice.contractId,
    })
    .from(devicePlatformProbeSnapshot)
    .innerJoin(
      supplierDevice,
      eq(devicePlatformProbeSnapshot.supplierDeviceId, supplierDevice.id),
    )
    .where(
      and(
        eq(devicePlatformProbeSnapshot.recordKind, 'crm_inventory'),
        eq(devicePlatformProbeSnapshot.supplierId, supplierId),
        eq(devicePlatformProbeSnapshot.dataCenterId, dataCenterId),
        gte(devicePlatformProbeSnapshot.snapshotHour, dayStart),
        lt(devicePlatformProbeSnapshot.snapshotHour, dayEnd),
      ),
    )

  if (snapshots.length === 0) return null

  const byCardType = new Map<string, number>()
  const byDevice = new Map<string, DeviceUsage>()
  const deviceIds = new Set<string>()
  const rentedGpuByHour = new Map<string, number>()

  for (const row of snapshots) {
    if (!row.supplierDeviceId || !row.gpuCardTypeId) continue
    deviceIds.add(row.supplierDeviceId)

    const rented =
      row.bareMetalMatched ||
      (row.proxyRentStatus != null && RENTED_PROXY_STATUSES.has(row.proxyRentStatus))

    if (!rented) continue

    const gpuCount = Number(row.gpuCount ?? 0)
    byCardType.set(row.gpuCardTypeId, (byCardType.get(row.gpuCardTypeId) ?? 0) + gpuCount)

    const prev = byDevice.get(row.supplierDeviceId)
    byDevice.set(row.supplierDeviceId, {
      deviceId: row.supplierDeviceId,
      gpuCardTypeId: row.gpuCardTypeId,
      usageHours: (prev?.usageHours ?? 0) + gpuCount,
      contractId: row.contractId ?? null,
    })

    const hourKey = row.snapshotHour.toISOString()
    rentedGpuByHour.set(hourKey, (rentedGpuByHour.get(hourKey) ?? 0) + gpuCount)
  }

  let rentedGpuPeak = 0
  for (const v of rentedGpuByHour.values()) {
    if (v > rentedGpuPeak) rentedGpuPeak = v
  }

  return {
    byCardType,
    byDevice,
    rentedGpuPeak,
    onlineDeviceCount: deviceIds.size,
  }
}

/**
 * Order-duration metering: clip bare-metal order device rent windows to the day.
 */
async function fetchUsageFromOrderDuration(
  supplierId: string,
  dataCenterId: string,
  dayStart: Date,
  dayEnd: Date,
): Promise<{
  byCardType: Map<string, number>
  byDevice: Map<string, DeviceUsage>
  rentedGpuPeak: number
  onlineDeviceCount: number
} | null> {
  const rows = await db
    .select({
      gpuCardTypeId: sql<string>`COALESCE(${bareMetalOrderDevice.gpuCardTypeId}, ${supplierDevice.gpuCardTypeId})`,
      gpuCount: bareMetalOrderDevice.gpuCount,
      deviceGpuCount: supplierDevice.gpuCount,
      rentStartsAt: bareMetalOrderDevice.rentStartsAt,
      rentEndsAt: bareMetalOrderDevice.rentEndsAt,
      orderRentStartsAt: bareMetalOrder.rentStartsAt,
      orderRentEndsAt: bareMetalOrder.rentEndsAt,
      supplierDeviceId: bareMetalOrderDevice.supplierDeviceId,
      durationHours: bareMetalOrderDevice.durationHours,
      contractId: supplierDevice.contractId,
    })
    .from(bareMetalOrderDevice)
    .innerJoin(bareMetalOrder, eq(bareMetalOrderDevice.bareMetalOrderId, bareMetalOrder.id))
    .leftJoin(supplierDevice, eq(bareMetalOrderDevice.supplierDeviceId, supplierDevice.id))
    .where(
      and(
        eq(bareMetalOrder.supplierId, supplierId),
        eq(bareMetalOrder.dataCenterId, dataCenterId),
        ne(bareMetalOrderDevice.allocationStatus, 'released'),
      ),
    )

  if (rows.length === 0) return null

  const byCardType = new Map<string, number>()
  const byDevice = new Map<string, DeviceUsage>()
  const deviceIds = new Set<string>()
  let rentedGpuPeak = 0
  let anyOverlap = false

  for (const row of rows) {
    const start = row.rentStartsAt ?? row.orderRentStartsAt
    const end = row.rentEndsAt ?? row.orderRentEndsAt
    if (!start) continue

    const rangeEnd = end ?? dayEnd
    const hours = overlapHours(start, rangeEnd, dayStart, dayEnd)
    if (hours <= 0) continue

    anyOverlap = true
    const gpuCount = Number(row.gpuCount || row.deviceGpuCount || 0)
    const cardTypeId = row.gpuCardTypeId
    if (!cardTypeId || gpuCount <= 0) continue

    byCardType.set(cardTypeId, (byCardType.get(cardTypeId) ?? 0) + gpuCount * hours)
    rentedGpuPeak += gpuCount
    if (row.supplierDeviceId) {
      deviceIds.add(row.supplierDeviceId)
      const prev = byDevice.get(row.supplierDeviceId)
      byDevice.set(row.supplierDeviceId, {
        deviceId: row.supplierDeviceId,
        gpuCardTypeId: cardTypeId,
        usageHours: (prev?.usageHours ?? 0) + gpuCount * hours,
        contractId: row.contractId ?? null,
      })
    }
  }

  if (!anyOverlap || byCardType.size === 0) return null

  return {
    byCardType,
    byDevice,
    rentedGpuPeak,
    onlineDeviceCount: deviceIds.size,
  }
}

async function fetchOnlineInventoryStats(
  supplierId: string,
  dataCenterId: string,
): Promise<DeviceStats> {
  const [stats] = await db
    .select({
      onlineDeviceCount: sql<number>`COUNT(DISTINCT ${supplierDevice.id})::int`,
      totalGpuCount: sql<number>`COALESCE(SUM(${supplierDevice.gpuCount}), 0)::int`,
    })
    .from(supplierDevice)
    .where(
      and(
        eq(supplierDevice.supplierId, supplierId),
        eq(supplierDevice.dataCenterId, dataCenterId),
        eq(supplierDevice.lifecycleStatus, 'online'),
      ),
    )

  const onlineDeviceCount = Number(stats?.onlineDeviceCount ?? 0)
  const totalGpuCount = Number(stats?.totalGpuCount ?? 0)
  return { onlineDeviceCount, rentedGpuCount: 0, idleGpuCount: totalGpuCount }
}

async function fetchCardTypeUsageAndStats(
  supplierId: string,
  dataCenterId: string,
  usageDate: Date,
): Promise<{
  usage: CardTypeUsage[]
  deviceUsage: DeviceUsage[]
  pricingByCardType: Map<string, ResolvedPricing>
  stats: DeviceStats
}> {
  const { start, end } = shanghaiDayBounds(usageDate)

  let metering = await fetchUsageFromProbeSnapshots(supplierId, dataCenterId, start, end)
  let source: 'probe' | 'order' | 'none' = metering ? 'probe' : 'none'

  if (!metering) {
    metering = await fetchUsageFromOrderDuration(supplierId, dataCenterId, start, end)
    if (metering) source = 'order'
  }

  const inventory = await fetchOnlineInventoryStats(supplierId, dataCenterId)

  if (!metering || metering.byCardType.size === 0) {
    crmLog(LOG, 'no metering data; usage hours = 0', {
      supplierId,
      dataCenterId,
      date: shanghaiDateString(usageDate),
      source,
    })
    return {
      usage: [],
      deviceUsage: [],
      pricingByCardType: new Map(),
      stats: inventory,
    }
  }

  crmLog(LOG, 'metering resolved', {
    supplierId,
    dataCenterId,
    date: shanghaiDateString(usageDate),
    source,
    cardTypes: metering.byCardType.size,
  })

  const usage: CardTypeUsage[] = []
  const pricingByCardType = new Map<string, ResolvedPricing>()
  for (const [cardTypeId, usageHours] of metering.byCardType.entries()) {
    if (usageHours <= 0) continue
    const pricing = await fetchPricing(
      supplierId,
      dataCenterId,
      cardTypeId,
      shanghaiDateString(usageDate),
    )
    pricingByCardType.set(cardTypeId, pricing)
    usage.push({ gpuCardTypeId: cardTypeId, usageHours, unitCost: pricing.unitCost })
  }

  // Device-level attribution: only keep device rows whose card type actually
  // got priced, so detail rows never reference a card type with no pricing.
  const pricedCardTypes = new Set(pricingByCardType.keys())
  const deviceUsage: DeviceUsage[] = []
  for (const row of metering.byDevice.values()) {
    if (row.usageHours <= 0) continue
    if (!pricedCardTypes.has(row.gpuCardTypeId)) continue
    deviceUsage.push(row)
  }

  const rentedGpuCount = metering.rentedGpuPeak
  const idleGpuCount = Math.max(0, inventory.idleGpuCount - rentedGpuCount)

  return {
    usage,
    deviceUsage,
    pricingByCardType,
    stats: {
      onlineDeviceCount: metering.onlineDeviceCount || inventory.onlineDeviceCount,
      rentedGpuCount,
      idleGpuCount,
    },
  }
}

/**
 * Build supplier_bill_daily_detail rows from card-type totals plus the
 * device-level split.
 *
 * Device rows carry `deviceId`; whatever card-type hours could not be traced
 * to a device is written as one residual row per card type with `deviceId = NULL`.
 * This keeps `SUM(detail) == card-type total` exactly, so supplier-facing
 * read models can sum device rows without ever double counting.
 */
/**
 * 单行结算金额（W-10 统一口径）。
 *
 * - 卡时 / 阶梯卡时：`用量卡时 × 卡时单价`
 * - 分成 / 阶梯分成：**金额来自「客户消费 × 分成比例」，与卡时无关**，
 *   因此卡时单价为 null、金额记 0，并把 `tenantConsumption` 置 null 表示「待结算」。
 *   消费额由 W-13 从 tenant_region_gpu_consumption_{daily,monthly} 回填。
 *
 * 绝不能在这里用 `unitPricePerHour` 兜底成分成金额 —— 那会把分成账单
 * 算成卡时账单，金额系统性错误。
 */
export function buildDailyDetailRows(input: {
  dailyBillId: string
  cardTypeUsage: CardTypeUsage[]
  deviceUsage: DeviceUsage[]
  pricingByCardType: Map<string, ResolvedPricing>
  /** W-13：机房当日各卡型的租户消费，分成计价的计算基数 */
  consumptionByCardType?: Map<string, ConsumptionBase>
}): {
  rows: Array<{
    id: string
    dailyBillId: string
    gpuCardTypeId: string
    deviceId: string | null
    contractId: string | null
    usageHours: string
    unitCost: string
    amount: string
    tenantConsumption: string | null
  }>
  /**
   * 「金额不可知」的分成卡型：消费数据缺失或分成比例未配置。
   *
   * 与「消费确实为 0」严格区分 —— 后者供应商当天确实只挣 ¥0，写 0 是正确的；
   * 前者是**数据没到**，此时写 0 等于凭空断言供应商收入为 0。
   */
  unpricedCardTypes: Array<{ gpuCardTypeId: string; reason: string }>
} {
  const {
    dailyBillId,
    cardTypeUsage,
    deviceUsage,
    pricingByCardType,
    consumptionByCardType,
  } = input

  const attributedHoursByCardType = new Map<string, number>()
  const rows: ReturnType<typeof buildDailyDetailRows>['rows'] = []
  const unpricedCardTypes: ReturnType<typeof buildDailyDetailRows>['unpricedCardTypes'] = []

  for (const device of deviceUsage) {
    const pricing = pricingByCardType.get(device.gpuCardTypeId)
    if (!pricing) continue
    attributedHoursByCardType.set(
      device.gpuCardTypeId,
      (attributedHoursByCardType.get(device.gpuCardTypeId) ?? 0) + device.usageHours,
    )
    rows.push({
      id: createId(),
      dailyBillId,
      gpuCardTypeId: device.gpuCardTypeId,
      deviceId: device.deviceId,
      // W-12：合同追溯落在设备粒度。快照化存储，出账后设备改挂合同也不影响
      // 已生成账单的追溯链。
      contractId: device.contractId,
      usageHours: device.usageHours.toFixed(4),
      unitCost: (pricing.unitCost ?? 0).toFixed(4),
      // 卡时/整租：金额按设备归因（用量卡时 × 卡时单价），在本行计。
      //
      // 此前这里硬编码 '0.0000'，把全部金额寄望于下方「残差桶行」。但残差
      // = 卡型总卡时 − 已归因设备卡时，一旦设备级计量数据齐全（有探针快照，
      // 生产常态），残差就是 0，残差行被 `residual <= 0.0001` 跳过 ——
      // 于是卡时收入从明细里整段消失，而账单头 total_amount 照收不误。
      // 实测 3 天样本：账单头 2160.5805，明细合计仅 1800.0000，360.5805
      // （16.7%）凭空蒸发；supplier_bill_detail 与供应商端明细/发票随之失真。
      //
      // 分成：消费是卡型级、不可按设备拆分，仍记 0，由残差桶行计一次，
      // 否则同一笔消费会被多台设备重复计入。
      amount: isRevenueSharePricingMode(pricing.pricingMode)
        ? '0.0000'
        : computeSettledAmount(pricing, device.usageHours).amount,
      // 分成金额是卡型级（消费不按设备拆分），统一在残差桶行计一次，
      // 避免同一笔消费被多台设备重复计入。
      tenantConsumption: null,
    })
  }

  for (const cardType of cardTypeUsage) {
    const pricing = pricingByCardType.get(cardType.gpuCardTypeId)
    if (!pricing) continue
    const attributed = attributedHoursByCardType.get(cardType.gpuCardTypeId) ?? 0
    const residual = cardType.usageHours - attributed
    // Tolerance guards float drift from repeated toFixed round-trips.
    // 分成模式没有「残差」概念（金额来自消费而非卡时分摊），需要单独出一行承载
    // 卡型级消费与分成金额；否则残差为 0 时整卡型的分成收入会凭空丢失。
    const consumption = consumptionByCardType?.get(cardType.gpuCardTypeId) ?? null
    if (isRevenueSharePricingMode(pricing.pricingMode)) {
      const settled = computeSettledAmount(pricing, residual, consumption)
      // W-10 连带修复：区分「消费确实为 0」与「消费数据缺失/比例未配置」。
      // 只有后者金额不可知，必须上报而不是静默落 ¥0。
      if (settled.pending) {
        const reason =
          consumption == null
            ? '分成计价缺少租户消费数据'
            : consumption.totalConsumption <= 0
              ? null
              : '分成计价缺少 revenueSharePercent 配置'
        if (reason) unpricedCardTypes.push({ gpuCardTypeId: cardType.gpuCardTypeId, reason })
      }
      rows.push({
        id: createId(),
        dailyBillId,
        gpuCardTypeId: cardType.gpuCardTypeId,
        deviceId: null,
        // 残差桶是「卡型总量 − 已归因设备量」的差额，天然不对应任何单台设备，
        // 因此也无法确定合同。置 null 而不是猜一个：宁可承认归因不到合同，
        // 也不能把差额挂到某份合同上让对账看起来是完整的。
        contractId: null,
        usageHours: residual.toFixed(4),
        unitCost: '0.0000',
        amount: settled.amount,
        tenantConsumption: consumption ? consumption.totalConsumption.toFixed(4) : null,
      })
      continue
    }

    if (residual <= 0.0001) continue
    rows.push({
      id: createId(),
      dailyBillId,
      gpuCardTypeId: cardType.gpuCardTypeId,
      deviceId: null,
      contractId: null,
      usageHours: residual.toFixed(4),
      unitCost: (pricing.unitCost ?? 0).toFixed(4),
      amount: computeSettledAmount(pricing, residual).amount,
      tenantConsumption: null,
    })
  }

  return { rows, unpricedCardTypes }
}

/**
 * W-15：月账单的基础设施费**以月度配置为准**，不再由日账单按天求和。
 *
 * 原缺陷：日账单在「无在线设备且无卡时用量」时整日 `continue`（见
 * generateDailyBills），于是那天没有 `supplier_bill_daily` 行，月账单
 * `SUM(networkFeeDaily)` 自然少算一天。极端情况 —— 供应商当月设备全部
 * 处于租期外/停机 —— 该月 0 条日账单，网络费与管理费**按 0 计入**，
 * 平台白白少收 `networkFeeMonthly`。
 *
 * 改为直接读 `dataCenter.networkFeeMonthly` / `mgmtNodeFeeMonthly` 与
 * `supplier_datacenter_infrastructure.storageConfig`：机房费是**固定月租**，
 * 与当天有没有设备开机无关，不该被设备在线率打折。
 *
 * 仍从日账单求和的只有 `totalUsageHours` / `totalAmount` —— 那些是真按用量
 * 计的。日账单上的 `networkFeeDaily` 等字段保留，仅作当日展示/对账参考。
 *
 * 口径说明：`storageConfig.billingMode='per_tb'` 时 `currentTb` 取自配置快照，
 * 库中**没有**存储实际用量表（已核查），故 per_tb 仍是「配置值 × 单价」，
 * 属于独立的精度问题（见审计文档 W-15 连带项），本轮不臆造用量来源。
 *
 * 另有一项已知限制：机房级月费**没有按天分摊的数据结构**，故月中入驻的机房
 * 按整月计。库中既无机房级 `effectiveFrom/effectiveTo`，也无分摊字段，无法正确
 * 算出比例；与其按日账单求和（少收）不如按合同月费全额计，口径由运营在合同中约定。
 *
 * 计费范围：供应商名下 `cooperationStatus='active'` 且未删除的**全部**机房 ——
 * 不是「当月有日账单的机房」。后者恰好会漏掉要修的场景：设备全停机的机房本来
 * 就没有日账单。
 */
async function fetchMonthlyInfraFees(
  supplierId: string,
): Promise<{ networkFee: string; managementFee: string; storageFee: string }> {
  const dcInfos = await db
    .select({
      id: dataCenter.id,
      networkFeeMonthly: dataCenter.networkFeeMonthly,
      mgmtNodeFeeMonthly: dataCenter.mgmtNodeFeeMonthly,
    })
    .from(dataCenter)
    .where(
      and(
        eq(dataCenter.supplierId, supplierId),
        eq(dataCenter.cooperationStatus, 'active'),
        eq(dataCenter.sourceDeleted, false),
      ),
    )

  if (dcInfos.length === 0) {
    return { networkFee: '0.0000', managementFee: '0.0000', storageFee: '0.0000' }
  }

  const dataCenterIds = dcInfos.map((d) => d.id)

  const infraConfigs = await db
    .select({
      dataCenterId: supplierDatacenterInfrastructure.dataCenterId,
      storageConfig: supplierDatacenterInfrastructure.storageConfig,
    })
    .from(supplierDatacenterInfrastructure)
    .where(inArray(supplierDatacenterInfrastructure.dataCenterId, dataCenterIds))

  const storageByDc = new Map(infraConfigs.map((c) => [c.dataCenterId, c.storageConfig]))

  // W-19：全部按定点字符串累加。money() 列是 numeric(15,4)，此处若先
  // parseFloat 相加再 toFixed，机房数量一多就会引入 1e-4 级误差。
  let networkFee = '0.0000'
  let managementFee = '0.0000'
  let storageFee = '0.0000'
  for (const dc of dcInfos) {
    networkFee = sumMoney([networkFee, dc.networkFeeMonthly])
    managementFee = sumMoney([managementFee, dc.mgmtNodeFeeMonthly])
    const storageConfig = storageByDc.get(dc.id) as
      | { billingMode?: string; fixed?: { monthlyFee?: string }; unitPrice?: string; currentTb?: string }
      | null
      | undefined
    if (storageConfig?.billingMode === 'fixed') {
      storageFee = sumMoney([storageFee, storageConfig.fixed?.monthlyFee])
    } else if (storageConfig?.billingMode === 'per_tb') {
      // 单价 × TB 数同样走定点乘法，避免 double 逼近。
      storageFee = sumMoney([storageFee, multiplyMoney(storageConfig.unitPrice, storageConfig.currentTb)])
    }
  }

  return { networkFee, managementFee, storageFee }
}

async function fetchInfraFeesProRated(
  dataCenterId: string,
  usageDate: Date,
): Promise<{
  networkFeeDaily: number
  mgmtFeeDaily: number
  storageFeeDaily: number
}> {
  const [dcInfo] = await db
    .select({
      networkFeeMonthly: dataCenter.networkFeeMonthly,
      mgmtNodeFeeMonthly: dataCenter.mgmtNodeFeeMonthly,
    })
    .from(dataCenter)
    .where(eq(dataCenter.id, dataCenterId))
    .limit(1)

  const [infraConfig] = await db
    .select({
      storageConfig: supplierDatacenterInfrastructure.storageConfig,
    })
    .from(supplierDatacenterInfrastructure)
    .where(eq(supplierDatacenterInfrastructure.dataCenterId, dataCenterId))
    .limit(1)

  const dateStr = shanghaiDateString(usageDate)
  const [y, m] = dateStr.split('-').map(Number)
  const daysInMonth = new Date(y!, m!, 0).getDate()

  const networkFeeMonthly = parseFloat(dcInfo?.networkFeeMonthly ?? '0')
  const mgmtFeeMonthly = parseFloat(dcInfo?.mgmtNodeFeeMonthly ?? '0')

  let storageFeeMonthly = 0
  const storageConfig = infraConfig?.storageConfig as
    | {
        billingMode?: string
        fixed?: { monthlyFee?: string }
        unitPrice?: string
        currentTb?: string
      }
    | null
    | undefined
  if (storageConfig?.billingMode === 'fixed') {
    storageFeeMonthly = parseFloat(storageConfig.fixed?.monthlyFee ?? '0')
  } else if (storageConfig?.billingMode === 'per_tb') {
    const unitPrice = parseFloat(storageConfig.unitPrice ?? '0')
    const currentTb = parseFloat(storageConfig.currentTb ?? '0')
    storageFeeMonthly = unitPrice * currentTb
  }

  return {
    networkFeeDaily: networkFeeMonthly / daysInMonth,
    mgmtFeeDaily: mgmtFeeMonthly / daysInMonth,
    storageFeeDaily: storageFeeMonthly / daysInMonth,
  }
}

/**
 * 归集某机房某日的租户消费（W-13）。
 *
 * 归因依据：`dataCenter.supplierId` 是 notNull 外键，**一个机房唯一对应一个供应商**，
 * 因此按 `dataCenterId` 过滤即可确定供应商，无需按卡数份额分摊，也不存在
 * 「同机房多供应商重复计入消费」的可能。
 *
 * 只取 `dataCenterId` 与 `gpuCardTypeId` 均非空的行：这两列可空，为空的行无法归因到
 * 具体机房/卡型，计入会让账单金额虚高。此类行单独统计并在日志中报告，交由上游修数。
 *
 * 金额口径用 `totalConsumption`（含券 + 余额的对外总消费），与租户账单侧一致；
 * 卡时用 `totalCardHours` 供阶梯分成计算成交比例。
 */
export async function fetchTenantConsumptionByCardType(
  dataCenterId: string,
  usageDate: string,
): Promise<{
  byCardType: Map<string, ConsumptionBase>
  unattributedRows: number
  unattributedConsumption: number
}> {
  const rows = await db
    .select({
      gpuCardTypeId: tenantRegionGpuConsumptionDaily.gpuCardTypeId,
      totalConsumption: sql<string>`COALESCE(SUM(${tenantRegionGpuConsumptionDaily.totalConsumption}), 0)`,
      balanceConsumption: sql<string>`COALESCE(SUM(${tenantRegionGpuConsumptionDaily.balanceConsumption}), 0)`,
      totalCardHours: sql<string>`COALESCE(SUM(${tenantRegionGpuConsumptionDaily.totalCardHours}), 0)`,
    })
    .from(tenantRegionGpuConsumptionDaily)
    .where(
      and(
        eq(tenantRegionGpuConsumptionDaily.dataCenterId, dataCenterId),
        eq(tenantRegionGpuConsumptionDaily.usageDate, usageDate),
      ),
    )
    .groupBy(tenantRegionGpuConsumptionDaily.gpuCardTypeId)

  const byCardType = new Map<string, ConsumptionBase>()
  let unattributedConsumption = 0
  let unattributedRows = 0

  for (const row of rows) {
    if (!row.gpuCardTypeId) {
      // groupBy 后 gpuCardTypeId 可为 null：该组即「归属机房但无法定位卡型」的消费
      unattributedRows++
      unattributedConsumption += Number(row.totalConsumption ?? 0)
      continue
    }
    byCardType.set(row.gpuCardTypeId, {
      totalConsumption: Number(row.totalConsumption ?? 0),
      balanceConsumption: Number(row.balanceConsumption ?? 0),
      totalCardHours: Number(row.totalCardHours ?? 0),
    })
  }

  return { byCardType, unattributedRows, unattributedConsumption }
}

export async function generateDailyBills(usageDate: Date): Promise<BillGenerationResult> {
  const { dateStr } = shanghaiDayBounds(usageDate)
  crmLog(LOG, 'generateDailyBills start', { date: dateStr })

  const suppliersWithDC = await db
    .select({
      supplierId: dataCenter.supplierId,
      dataCenterId: dataCenter.id,
    })
    .from(dataCenter)
    .where(eq(dataCenter.status, 'online'))

  let billsCreated = 0
  const failures: BillGenerationFailure[] = []

  for (const { supplierId, dataCenterId } of suppliersWithDC) {
    try {
      // 幂等预检查：避免为已存在的账单白跑一次完整计算（明细聚合、费率解析）。
      // 真正的并发幂等由事务内 insert 的 onConflictDoNothing 保证，两层缺一不可：
      // 预检查有 TOCTOU 窗口，唯一索引才是最终防线。
      const [existing] = await db
        .select({ id: supplierBillDaily.id })
        .from(supplierBillDaily)
        .where(
          and(
            eq(supplierBillDaily.supplierId, supplierId),
            eq(supplierBillDaily.dataCenterId, dataCenterId),
            eq(supplierBillDaily.usageDate, dateStr),
          ),
        )
        .limit(1)

      if (existing) {
        continue
      }

      const cooperationMode = await resolveCooperationMode(supplierId, dataCenterId)
      const { usage: cardTypeUsage, deviceUsage, pricingByCardType, stats } =
        await fetchCardTypeUsageAndStats(supplierId, dataCenterId, usageDate)

      // W-13：分成计价的计算基数。按 dataCenterId 归集即可确定供应商
      // （dataCenter.supplierId 为 notNull 外键，一机房一供应商）。
      const { byCardType: consumptionByCardType, unattributedRows, unattributedConsumption } =
        await fetchTenantConsumptionByCardType(dataCenterId, dateStr)

      if (unattributedRows > 0) {
        crmError(
          LOG,
          'tenant consumption rows without gpuCardTypeId cannot be attributed to a supplier',
          {
            supplierId,
            dataCenterId,
            usageDate: dateStr,
            rows: unattributedRows,
            consumption: unattributedConsumption,
          },
        )
      }

      const hasRevenueSharePricing = [...pricingByCardType.values()].some((p) =>
        isRevenueSharePricingMode(p.pricingMode),
      )
      if (hasRevenueSharePricing && consumptionByCardType.size === 0) {
        crmError(
          LOG,
          'revenue-share pricing but no tenant consumption found; rows will be pending',
          { supplierId, dataCenterId, usageDate: dateStr },
        )
      }

      if (stats.onlineDeviceCount === 0 && cardTypeUsage.length === 0) {
        continue
      }

      const totalUsageHours = cardTypeUsage.reduce((sum, c) => sum + c.usageHours, 0)
      // 总额必须与 buildDailyDetailRows 的行金额求和完全一致，否则账单头与明细对不平。
      // 分成模式按消费计（与残差桶行同源），卡时模式按卡时 × 单价计。
      // W-19：定点累加，reduce 初值用定点字符串。
      const totalAmount = cardTypeUsage.reduce((sum, c) => {
        const pricing = pricingByCardType.get(c.gpuCardTypeId)
        if (!pricing) return sum
        const consumption = consumptionByCardType.get(c.gpuCardTypeId) ?? null
        return sumMoney([sum, computeSettledAmount(pricing, c.usageHours, consumption).amount])
      }, '0.0000')
      const infraFees = await fetchInfraFeesProRated(dataCenterId, usageDate)
      const billId = createId()
      const usageMonth = dateStr.slice(0, 7)

      // W-10 连带修复：先构建明细再决定是否落库。
      //
      // 此前 computeSettledAmount 返回的 pending 标志被直接丢弃，缺消费时
      // 静默写 ¥0；而唯一索引 (supplier_id, data_center_id, usage_date) +
      // onConflictDoNothing 意味着重跑会走 `inserted.length === 0` 分支直接
      // return —— 消费数据后来补齐也**永远不会重算**，一个临时的数据缺口
      // 被永久固化成 ¥0 账单。此处改为：金额不可知就整张日账单不落库，
      // 报错进入 failures，等数据补齐后由下次调度重算。
      const detailBuild =
        cardTypeUsage.length > 0
          ? buildDailyDetailRows({
              dailyBillId: billId,
              cardTypeUsage,
              deviceUsage,
              pricingByCardType,
              consumptionByCardType,
            })
          : { rows: [], unpricedCardTypes: [] }

      if (detailBuild.unpricedCardTypes.length > 0) {
        throw new Error(
          `分成计价金额不可知，已跳过出账以免固化错误的 ¥0：${detailBuild.unpricedCardTypes
            .map((u) => `${u.gpuCardTypeId}(${u.reason})`)
            .join('; ')}`,
        )
      }

      const insertedNew = await db.transaction(async (tx) => {
        // 并发幂等：预检查存在 TOCTOU 窗口，由唯一索引
        // supplier_bill_daily_uk + onConflictDoNothing 兜底。
        // 冲突时整体放弃，避免插入指向不存在 dailyBillId 的孤儿明细。
        const inserted = await tx
          .insert(supplierBillDaily)
          .values({
            id: billId,
            supplierId,
            dataCenterId,
            usageDate: dateStr,
            usageMonth,
            cooperationMode,
            totalUsageHours: totalUsageHours.toFixed(4),
            // W-19：金额已是 4 位定点字符串，原样写库。
            totalAmount,
            networkFeeDaily: infraFees.networkFeeDaily.toFixed(4),
            mgmtFeeDaily: infraFees.mgmtFeeDaily.toFixed(4),
            storageFeeDaily: infraFees.storageFeeDaily.toFixed(4),
            onlineDeviceCount: stats.onlineDeviceCount,
            rentedGpuCount: stats.rentedGpuCount,
            idleGpuCount: stats.idleGpuCount,
          })
          .onConflictDoNothing({
            target: [
              supplierBillDaily.supplierId,
              supplierBillDaily.dataCenterId,
              supplierBillDaily.usageDate,
            ],
          })
          .returning({ id: supplierBillDaily.id })

        if (inserted.length === 0) {
          crmLog(LOG, 'daily bill already created by concurrent run, skipping', {
            supplierId,
            dataCenterId,
            usageDate: dateStr,
          })
          return false
        }

        if (detailBuild.rows.length > 0) {
          await tx.insert(supplierBillDailyDetail).values(detailBuild.rows)
        }

        return true
      })

      // 只有事务真的插入了账单才计数：否则「本次运行新建账单数」会虚增，
      // 且 cron 会把已存在的账单当成本次产出重复通知运营。
      if (insertedNew) {
        billsCreated++
      }
    } catch (error) {
      crmError(LOG, `daily bill failed for ${supplierId}/${dataCenterId}`, error)
      failures.push({
        supplierId,
        dataCenterId,
        billMonth: dateStr.slice(0, 7),
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  crmLog(LOG, 'generateDailyBills done', { date: dateStr, billsCreated, failed: failures.length })
  return { billsCreated, failures }
}

export async function generateMonthlyBills(billMonth: string): Promise<BillGenerationResult> {
  crmLog(LOG, 'generateMonthlyBills start', { billMonth })

  if (!/^\d{4}-\d{2}$/.test(billMonth)) {
    throw new Error(`Invalid billMonth: ${billMonth}`)
  }

  // W-15 连带修复：月账单的供应商集合**不能只取「当月有日账单」的供应商**。
  //
  // 原缺陷：generateDailyBills 在「无在线设备且无卡时用量」时整日 continue，
  // 于是设备全停机的供应商当月 0 条日账单；而这里若只按日账单取供应商，
  // 该供应商根本进不了下面的循环 —— fetchMonthlyInfraFees 虽然正确地遍历
  // 了「全部 active 机房」，却永远不会被调用，固定月租（网络费/管理费/存储费）
  // **系统性漏收**。fetchMonthlyInfraFees 的注释声称已覆盖该场景，实际未覆盖。
  //
  // 因此集合取并集：
  //   ① 当月有日账单的供应商（有卡时/分成收入）
  //   ② 当月有 active 机房的供应商（即使 0 用量，也要按固定月租出账）
  //
  // 下方聚合对空集已安全（COALESCE → 0、uniqueModes 为空 → 'idle_time'），
  // 因此②进来时 totalAmount=0、finalAmount=机房费，正是期望行为。
  const fromDaily = await db
    .select({ supplierId: supplierBillDaily.supplierId })
    .from(supplierBillDaily)
    .where(eq(supplierBillDaily.usageMonth, billMonth))
    .groupBy(supplierBillDaily.supplierId)

  const fromInfra = await db
    .select({ supplierId: dataCenter.supplierId })
    .from(dataCenter)
    .where(
      and(eq(dataCenter.cooperationStatus, 'active'), eq(dataCenter.sourceDeleted, false)),
    )
    .groupBy(dataCenter.supplierId)

  const supplierIds = [
    ...new Set([...fromDaily.map((r) => r.supplierId), ...fromInfra.map((r) => r.supplierId)]),
  ].filter(Boolean)

  let billsCreated = 0
  const failures: BillGenerationFailure[] = []

  for (const supplierId of supplierIds) {
    try {
      // 预检查只作为快速跳过，避免无谓的聚合查询；它与事务之间存在 TOCTOU 窗口，
      // 真正的并发幂等由事务内 insert 的 onConflictDoNothing 保证
      // （唯一索引 supplier_bill_supplier_month_uk）。
      const [existing] = await db
        .select({ id: supplierBill.id })
        .from(supplierBill)
        .where(
          and(eq(supplierBill.supplierId, supplierId), eq(supplierBill.billMonth, billMonth)),
        )
        .limit(1)

      if (existing) continue

      const [aggregate] = await db
        .select({
          totalUsageHours: sql<string>`COALESCE(SUM(${supplierBillDaily.totalUsageHours}), 0)`,
          totalAmount: sql<string>`COALESCE(SUM(${supplierBillDaily.totalAmount}), 0)`,
          // W-15：网络费/管理费/存储费不再由日账单按天求和，改由
          // fetchMonthlyInfraFees 按月度配置一次性计（见其注释）。
          // 这三个 select 字段刻意不再 SUM 日账单列，避免误用。
        })
        .from(supplierBillDaily)
        .where(
          and(
            eq(supplierBillDaily.supplierId, supplierId),
            eq(supplierBillDaily.usageMonth, billMonth),
          ),
        )

      const modes = await db
        .select({
          cooperationMode: supplierBillDaily.cooperationMode,
        })
        .from(supplierBillDaily)
        .where(
          and(
            eq(supplierBillDaily.supplierId, supplierId),
            eq(supplierBillDaily.usageMonth, billMonth),
          ),
        )
        .groupBy(supplierBillDaily.cooperationMode)

      const uniqueModes = modes.map((m) => m.cooperationMode).filter(Boolean)
      const cooperationMode =
        uniqueModes.length === 1 ? uniqueModes[0]! : uniqueModes.length > 1 ? 'mixed' : 'idle_time'

      const totalUsageHours = parseFloat(aggregate?.totalUsageHours ?? '0')
      // W-19：金额全程保持**字符串**定点形式，直到最后写库才落地。
      // aggregate.totalAmount 来自 SQL `SUM(numeric)`，本身已是精确十进制；
      // 一旦 parseFloat 变成 double，`+` 就是二进制近似相加，与日账单
      // 「各自 toFixed(4) 再 SUM」那条精确路径差 1e-4，月表和日表对不平。
      const totalAmountStr = aggregate?.totalAmount ?? '0.0000'
      // W-15：以机房月度配置为准，机房费是固定月租，不因当日无在线设备而减免。
      const monthlyInfra = await fetchMonthlyInfraFees(supplierId)
      const networkFee = monthlyInfra.networkFee
      const managementFee = monthlyInfra.managementFee
      const storageFee = monthlyInfra.storageFee
      const finalAmount = sumMoney([totalAmountStr, networkFee, managementFee, storageFee])
      // 仅用于日志/断言的可读数值；不参与任何金额计算。
      const totalAmount = parseFloat(totalAmountStr)

      const details = await db
        .select({
          dataCenterId: supplierBillDaily.dataCenterId,
          gpuCardTypeId: supplierBillDailyDetail.gpuCardTypeId,
          usageHours: sql<string>`COALESCE(SUM(${supplierBillDailyDetail.usageHours}), 0)`,
          amount: sql<string>`COALESCE(SUM(${supplierBillDailyDetail.amount}), 0)`,
          // W-13：分成金额的计算基数，从日明细快照继承（同 unitCost 的理由：
          // 不能用月末现价重算，否则改价会让消费快照与金额脱节）。
          tenantConsumption: sql<string>`COALESCE(SUM(${supplierBillDailyDetail.tenantConsumption}), 0)`,
          // 有效单价按卡时加权：Σ(unitCost × usageHours) / Σ(usageHours)。
          // 关键：unitCost 必须继承自日明细快照，不能在月末用「当前 active 价」
          // 重新解析 —— 月末改价会让 unitCost × usageHours ≠ amount，对账必然不平。
          // 取加权平均后，重建恒等式 Σ(unitCost × usageHours) == amount（仅 4 位舍入误差）。
          effectiveUnitCost: sql<string>`CASE
            WHEN COALESCE(SUM(${supplierBillDailyDetail.usageHours}), 0) = 0 THEN '0'
            ELSE (
              SUM(${supplierBillDailyDetail.unitCost} * ${supplierBillDailyDetail.usageHours})
              / SUM(${supplierBillDailyDetail.usageHours})
            )::numeric(15,4)
          END`,
        })
        .from(supplierBillDaily)
        .innerJoin(
          supplierBillDailyDetail,
          eq(supplierBillDaily.id, supplierBillDailyDetail.dailyBillId),
        )
        .where(
          and(
            eq(supplierBillDaily.supplierId, supplierId),
            eq(supplierBillDaily.usageMonth, billMonth),
          ),
        )
        .groupBy(supplierBillDaily.dataCenterId, supplierBillDailyDetail.gpuCardTypeId)

      const billId = createId()
      const dueDate = new Date(`${billMonth}-01T00:00:00+08:00`)
      dueDate.setMonth(dueDate.getMonth() + 1)
      dueDate.setDate(15)
      const dueDateStr = shanghaiDateString(dueDate)

      // Pricing is resolved per (dataCenter, cardType): the same card type can
      // carry a different pricingMode / unit price in another datacenter.
      const detailKeys = [
        ...new Set(details.map((d) => `${d.dataCenterId}:${d.gpuCardTypeId}`)),
      ]

      const insertedNew = await db.transaction(async (tx) => {
        // W-10：WHERE 带 dataCenterId 精确过滤 + 补读有效期/阶梯/刊例列，
        // 归一化统一走 resolvePricingFields。此前此处既缺 DC 过滤、又零有效期
        // 校验、又把整租当 0 元，是 W-10 三个财务偏差在月账单路径上的同一份复制。
        const distinctCardTypes = [...new Set(details.map((d) => d.gpuCardTypeId))]
        const distinctDataCenters = [...new Set(details.map((d) => d.dataCenterId))]
        const pricingRows =
          detailKeys.length > 0
            ? await tx
                .select({
                  dataCenterId: supplierPricingRecord.dataCenterId,
                  gpuCardTypeId: supplierPricingRecord.gpuCardTypeId,
                  pricingMode: supplierPricingRecord.pricingMode,
                  configStatus: supplierPricingRecord.configStatus,
                  unitPricePerHour: supplierPricingRecord.unitPricePerHour,
                  billingUnit: supplierPricingRecord.billingUnit,
                  unitPrice: supplierPricingRecord.unitPrice,
                  cardsPerMachine: supplierPricingRecord.cardsPerMachine,
                  revenueSharePercent: supplierPricingRecord.revenueSharePercent,
                  listPricePerHour: supplierPricingRecord.listPricePerHour,
                  pricingTiers: supplierPricingRecord.pricingTiers,
                  effectiveFrom: supplierPricingRecord.effectiveFrom,
                  effectiveTo: supplierPricingRecord.effectiveTo,
                })
                .from(supplierPricingRecord)
                .where(
                  and(
                    eq(supplierPricingRecord.supplierId, supplierId),
                    inArray(supplierPricingRecord.gpuCardTypeId, distinctCardTypes),
                    inArray(supplierPricingRecord.dataCenterId, distinctDataCenters),
                    eq(supplierPricingRecord.configStatus, 'active'),
                  ),
                )
            : []

        // 月账单归因基准日 = 该月最后一天（Asia/Shanghai）。
        // 整租折算与有效期判定都以此为准，与日账单逐日解析保持同一口径。
        const billMonthEndDate = `${billMonth}-${daysInNaturalMonth(`${billMonth}-01`)}`
        // 租户消费的月窗口上界（开区间）。用「下月 1 号」而非 lte(月末)，
        // 避免依赖 usageDate 的字符串/日期比较语义。
        // 12 月需跨年：'2026-12' + 1 = '2026-13-01'，Postgres 会直接报错。
        // billMonth 形如 'yyyy-MM'，解析失败时回落为 1 月，避免 NaN 进 SQL。
        const [yearRaw, monthRaw] = billMonth.split('-')
        const billYear = Number(yearRaw)
        const billMonthNum = Number(monthRaw)
        const safeYear = Number.isFinite(billYear) ? billYear : 1970
        const safeMonth =
          Number.isFinite(billMonthNum) && billMonthNum >= 1 && billMonthNum <= 12
            ? billMonthNum
            : 1
        const nextMonthStart =
          safeMonth === 12
            ? `${safeYear + 1}-01-01`
            : `${safeYear}-${String(safeMonth + 1).padStart(2, '0')}-01`

        const pricingByKey = new Map<string, ResolvedPricing>()
        for (const p of pricingRows) {
          const key = `${p.dataCenterId}:${p.gpuCardTypeId}`
          if (pricingByKey.has(key)) continue

          if (!isPricingEffectiveAt(p.effectiveFrom, p.effectiveTo, billMonthEndDate)) {
            crmError(LOG, 'monthly bill: pricing not effective at month end', {
              supplierId,
              dataCenterId: p.dataCenterId,
              cardTypeId: p.gpuCardTypeId,
              billMonth,
              effectiveFrom: p.effectiveFrom,
              effectiveTo: p.effectiveTo,
            })
            throw new Error(
              `Pricing not effective on ${billMonthEndDate} for ${p.dataCenterId}/${p.gpuCardTypeId}`,
            )
          }

          // 与日账单 fetchPricing 同一守卫：hours 轴阶梯未接入，不能静默按
          // 顶层单价全额结算。放在这里是因为月账单自行查价并解析，
          // 不经过 fetchPricing，只加日侧会漏。
          if (hasUnappliedHoursTiers(p.pricingMode, parsePricingTiers(p.pricingTiers))) {
            crmError(
              LOG,
              'tiered_card_time with hours-axis tiers is not supported by billing yet',
              new Error('unapplied hours-axis tiers'),
              { supplierId, billMonth, dataCenterId: p.dataCenterId, gpuCardTypeId: p.gpuCardTypeId },
            )
            throw new Error(
              `月账单中止：${supplierId}/${billMonth} 的 ${p.dataCenterId}/${p.gpuCardTypeId} ` +
                `pricingMode=tiered_card_time 配置了 hours 轴阶梯，出账侧尚未接入。` +
                `静默按顶层 unitPricePerHour 结算会导致阶梯折扣对供应商失效。`,
            )
          }

          const fields = resolvePricingFields({ ...p, referenceDate: billMonthEndDate })
          pricingByKey.set(key, {
            pricingMode: fields.pricingMode,
            unitCost: fields.unitPricePerHour,
            billingUnit: fields.billingUnit,
            unitPrice: p.unitPrice,
            unitPricePerHour: p.unitPricePerHour,
            cardsPerMachine: fields.cardsPerMachine,
            revenueSharePercent: p.revenueSharePercent,
            pricingTiers: fields.pricingTiers,
            listPricePerHour: fields.listPricePerHour,
          })
        }

        // 缺价即中止：与日账单 fetchPricing 口径一致。
        // 此前兜底成 'card_time' 会给分成供应商生成一张错价账单，且无任何报错。
        const missingPricing = details.filter(
          (d) => !pricingByKey.has(`${d.dataCenterId}:${d.gpuCardTypeId}`),
        )
        if (missingPricing.length > 0) {
          crmError(
            LOG,
            'missing pricing on monthly detail, aborting bill',
            new Error(`${missingPricing.length} (dataCenter, cardType) pairs have no active pricing`),
            {
              supplierId,
              billMonth,
              missing: missingPricing.map((d) => ({
                dataCenterId: d.dataCenterId,
                gpuCardTypeId: d.gpuCardTypeId,
              })),
            },
          )
          throw new Error(
            `月账单中止：${supplierId}/${billMonth} 有 ${missingPricing.length} 个机房卡型缺少生效单价`,
          )
        }

        const detailPricingModes = new Set<string>()
        const detailRows = details.map((d) => {
          const pricing = pricingByKey.get(`${d.dataCenterId}:${d.gpuCardTypeId}`)!
          const pricingMode = pricing.pricingMode
          detailPricingModes.add(pricingMode)
          return {
            id: createId(),
            billId,
            dataCenterId: d.dataCenterId,
            gpuCardTypeId: d.gpuCardTypeId,
            pricingMode,
            // 聚合分形态金额时按 (机房, 卡型) 回查 pricingByKey 取 billingUnit，
            // 用于区分整租（month）与卡时（hour）。
            usageHours: d.usageHours,
            // 继承日明细的加权有效单价（见 details 查询注释），不用月末现价。
            unitCost: d.effectiveUnitCost,
            amount: d.amount,
            tenantConsumption: isRevenueSharePricingMode(pricingMode)
              ? d.tenantConsumption
              : null,
          }
        })

        // Bill-level snapshot: the single mode when the month is uniform,
        // otherwise `mixed` — consumers then fall back to the per-detail mode.
        const billPricingMode =
          detailPricingModes.size === 1 ? [...detailPricingModes][0]! : 'mixed'

        // ── W-14：按结算形态拆分应付供应商金额 ──────────────────────────────
        // 设计 5.4 要求 supplier_bill 落 3 个分形态金额列。
        //
        // 关键：整租**不是**独立的 pricingMode。整租 = pricingMode 'card_time'
        // 且 billingUnit 'month'，折算在 resolvePricingFields 内部完成
        // （monthly_rent / days_in_month）。所以拆分依据是 billingUnit，
        // 只看 pricingMode 会把整租金额并进卡时列，报表口径就错了。
        //
        // 三列从 detailRows 聚合而非另算：Σ(明细金额) 恒等于 total_amount，
        // 另算会与明细漂移，正是 W-10 反复强调要避免的。
        // W-19：分形态金额用定点累加，避免 float 逐行累加的舍入漂移。
        let revenueShareAmount = '0.0000'
        let cardTimeAmount = '0.0000'
        let wholeRentAmount = '0.0000'
        for (const row of detailRows) {
          const amt = row.amount
          const key = `${row.dataCenterId}:${row.gpuCardTypeId}`
          const billingUnit = pricingByKey.get(key)?.billingUnit ?? 'hour'
          if (isRevenueSharePricingMode(row.pricingMode)) {
            revenueShareAmount = sumMoney([revenueShareAmount, amt])
          } else if (isCardTimePricingMode(row.pricingMode)) {
            // 整租与卡时同属 card_time，靠计费单位区分。
            if (billingUnit === 'month') wholeRentAmount = sumMoney([wholeRentAmount, amt])
            else cardTimeAmount = sumMoney([cardTimeAmount, amt])
          } else {
            // 不静默归入某一类：未知计价模式会让 3 列之和 != total_amount，
            // 而报表按列取数，错了不会有人发现。这里直接中止出账。
            throw new Error(
              `月账单中止：${supplierId}/${billMonth} 出现未知计价模式 ${row.pricingMode}（${key}）`,
            )
          }
        }
        // 恒等式自检：Σ(分形态金额) 必须等于账单头 total_amount。
        // 两者同源于 detailRows，理论上必然相等；保留断言是为了在
        // 「未来有人只改了一侧」时立刻炸掉，而不是产出对不平的账单。
        // 恒等式必须是**精确相等**，不是「差值小于 0.01」：两侧现在都是定点值，
        // 任何不等都意味着明细或归类有 bug，放过 1e-2 的钱差等于放过真实资损。
        const splitTotal = sumMoney([revenueShareAmount, cardTimeAmount, wholeRentAmount])
        if (splitTotal !== sumMoney([totalAmountStr])) {
          throw new Error(
            `月账单中止：${supplierId}/${billMonth} 分形态金额合计 ${splitTotal} != totalAmount ${sumMoney([totalAmountStr])}`,
          )
        }

        // ── W-14：平台毛利 = tenant消费 - supplier结算 ──────────────────────
        // 口径说明（为何不复用 detail.tenantConsumption）：
        // 该列只在 revenue_share 明细上有值（见 buildDailyDetailRows），卡时账单
        // 取它会得到 0，导致 grossProfit = -finalAmount，把「没归因」误报成
        // 「巨亏」。因此这里回到 W-13 的同一数据源重新聚合，并按本账单的
        // (机房, 卡型) 对精确限定 —— 账单里没有的卡型，其消费不归本供应商。
        //
        // finalAmount 含 network/management/storage 费用，因此闲置产能
        // （有费用无消费）会得到负毛利，这是真实结果，不做截断。
        const billCardTypeKeys = new Set(
          details.map((d) => `${d.dataCenterId}:${d.gpuCardTypeId}`),
        )
        const billDataCenterIds = [...new Set(details.map((d) => d.dataCenterId))]
        const tenantConsumptionRows = await tx
          .select({
            dataCenterId: tenantRegionGpuConsumptionDaily.dataCenterId,
            gpuCardTypeId: tenantRegionGpuConsumptionDaily.gpuCardTypeId,
            totalConsumption: sql<string>`COALESCE(SUM(${tenantRegionGpuConsumptionDaily.totalConsumption}), 0)`,
          })
          .from(tenantRegionGpuConsumptionDaily)
          .where(
            and(
              inArray(tenantRegionGpuConsumptionDaily.dataCenterId, billDataCenterIds),
              gte(tenantRegionGpuConsumptionDaily.usageDate, `${billMonth}-01`),
              lt(tenantRegionGpuConsumptionDaily.usageDate, nextMonthStart),
              isNotNull(tenantRegionGpuConsumptionDaily.dataCenterId),
              isNotNull(tenantRegionGpuConsumptionDaily.gpuCardTypeId),
            ),
          )
          .groupBy(
            tenantRegionGpuConsumptionDaily.dataCenterId,
            tenantRegionGpuConsumptionDaily.gpuCardTypeId,
          )

        const tenantConsumption = tenantConsumptionRows.reduce((sum, r) => {
          if (!r.dataCenterId || !r.gpuCardTypeId) return sum
          if (!billCardTypeKeys.has(`${r.dataCenterId}:${r.gpuCardTypeId}`)) return sum
          // W-19：定点累加，不 parseFloat。
          return sumMoney([sum, r.totalConsumption])
        }, '0.0000')
        // W-19：定点相减，tenantConsumption 为 SQL SUM 的精确十进制字符串。
        const grossProfit = subtractMoney(tenantConsumption, finalAmount)

        // 并发幂等：预检查存在 TOCTOU 窗口，两个并发任务可能都通过预检查。
        // 由唯一索引 supplier_bill_supplier_month_uk + onConflictDoNothing 兜底。
        // 冲突时必须整体放弃（返回），否则会插入指向不存在 billId 的孤儿明细，
        // 并对已存在的账单重复发通知。
        const inserted = await tx
          .insert(supplierBill)
          .values({
            id: billId,
            supplierId,
            billMonth,
            cooperationMode,
            pricingMode: billPricingMode,
            status: 'pending',
            totalUsageHours: totalUsageHours.toFixed(4),
            // W-19：金额已是 4 位定点字符串，原样写库，不再经过 float。
            totalAmount: sumMoney([totalAmountStr]),
            networkFee,
            managementFee,
            storageFee,
            finalAmount,
            // W-14：分形态拆分 + 平台毛利。设计 5.4 要求的 5 列中，
            // voucher_cost_amount 无数据源（券成本未按供应商归集），恒为 0，
            // 详见下方 grossProfit 计算处的说明。
            supplierRevenueShareAmount: revenueShareAmount,
            supplierCardTimeAmount: cardTimeAmount,
            supplierWholeRentAmount: wholeRentAmount,
            voucherCostAmount: '0.0000',
            grossProfit,
            dueDate: dueDateStr,
          })
          .onConflictDoNothing({
            target: [supplierBill.supplierId, supplierBill.billMonth],
          })
          .returning({ id: supplierBill.id })

        if (inserted.length === 0) {
          crmLog(LOG, 'monthly bill already created by concurrent run, skipping', {
            supplierId,
            billMonth,
          })
          return false
        }

        if (detailRows.length > 0) {
          await tx.insert(supplierBillDetail).values(detailRows)
        }

        // 通知移入事务：此前在事务外，通知失败时账单已提交，重跑会命中
        // 「已存在」跳过 → 通知永久丢失。移入后通知失败会整体回滚，可重跑。
        // finalAmount 是 4 位定点字符串；通知展示保留 2 位即可（仅站内信文案）。
        await notifyBillGenerated(tx, supplierId, billMonth, (parseFloat(finalAmount)).toFixed(2))

        return true
      })

      // 冲突跳过时事务返回 false，不能计入「本次新建」，
      // 否则 cron 汇报的账单数与实际新增不一致（详见 generateDailyBills 同处注释）。
      if (insertedNew) {
        billsCreated++
      }
    } catch (error) {
      crmError(LOG, `monthly bill failed for ${supplierId}/${billMonth}`, error)
      failures.push({
        supplierId,
        dataCenterId: null,
        billMonth,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  crmLog(LOG, 'generateMonthlyBills done', { billMonth, billsCreated, failed: failures.length })
  return { billsCreated, failures }
}

/** Previous calendar day in Asia/Shanghai. */
export function previousShanghaiDate(now = new Date()): Date {
  const today = shanghaiDateString(now)
  const start = new Date(`${today}T00:00:00+08:00`)
  return new Date(start.getTime() - 24 * 60 * 60 * 1000)
}

/** Previous calendar month YYYY-MM in Asia/Shanghai. */
export function previousShanghaiMonth(now = new Date()): string {
  const today = shanghaiDateString(now)
  const [y, m] = today.split('-').map(Number)
  const prev = new Date(Date.UTC(y!, m! - 2, 1))
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`
}
