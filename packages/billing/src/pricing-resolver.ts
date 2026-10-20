import { multiplyMoney, roundToMoneyScale } from './money'

/**
 * 供应商/平台统一价格解析器（W-10）。
 *
 * 背景：出账侧（apps/web 供应商账单生成）与成本侧（租户账单成本核算）此前各自实现
 * 一份价格解析，口径不一致导致三类真实财务偏差：
 *
 *  1. 出账侧不校验 `effectiveFrom` / `effectiveTo`：改价时若只调整生效区间而未把
 *     `configStatus` 置为非 active，供应商账单会继续按已过期价格结算。
 *  2. 出账侧对 `billingUnit = 'month'`（整租）零折算，直接读 `unitPricePerHour`；
 *     而整租记录该列可空 → `Number(null)` 归零 → 整租账单恒为 0 元。
 *  3. 出账侧把 `tiered_card_time` / `tiered_revenue_share` 当作普通卡时处理，
 *     `pricingTiers` 从未被读取，阶梯价完全失效。
 *
 * 本模块是**纯函数**、不依赖 db/框架，供 apps/web 出账与成本核算共用。
 * 所有口径决策集中在此，调用方不得再自行推导单价。
 *
 * 依赖方向：packages/billing -> @workspace/db（此处实际不 import，仅类型层面解耦）。
 */

/** 供应商成本侧计费单位 */
export type SupplierBillingUnit = 'hour' | 'month'

/** 与 platform `billing_unit` 保持一致的子集 */
export const DEFAULT_CARDS_PER_MACHINE = 8

/** 契约计价方式（与 `supplier_pricing_record.pricing_mode` 一致） */
export type ContractPricingMode =
  | 'card_time'
  | 'revenue_share'
  | 'tiered_card_time'
  | 'tiered_revenue_share'

/** 阶梯档位。字段与历史 `apps/web/src/lib/data/types.ts` 的 ContractPricingTier 对齐。 */
export type ContractPricingTier = {
  tierOrder?: number | null
  /** 命中轴：ratio_band = 按成交/刊例比例；hours = 按累计卡时 */
  tierBasis?: 'hours' | 'ratio_band' | null
  thresholdFromHours?: number | string | null
  thresholdToHours?: number | string | null
  dealToListRatioMin?: number | string | null
  dealToListRatioMax?: number | string | null
  unitPricePerHour?: number | string | null
  revenueSharePercent?: number | string | null
  listPriceMultiplier?: number | string | null
}

export type REVENUE_SHARE_PRICING_MODES = ReadonlySet<string>

const REVENUE_SHARE_MODES: REVENUE_SHARE_PRICING_MODES = new Set([
  'revenue_share',
  'tiered_revenue_share',
])

const CARD_TIME_MODES = new Set(['card_time', 'tiered_card_time'])

export function isRevenueSharePricingMode(
  pricingMode: string | null | undefined,
): pricingMode is 'revenue_share' | 'tiered_revenue_share' {
  return pricingMode != null && REVENUE_SHARE_MODES.has(pricingMode)
}

export function isCardTimePricingMode(
  pricingMode: string | null | undefined,
): pricingMode is 'card_time' | 'tiered_card_time' {
  return pricingMode != null && CARD_TIME_MODES.has(pricingMode)
}

export function isTieredPricingMode(
  pricingMode: string | null | undefined,
): pricingMode is 'tiered_card_time' | 'tiered_revenue_share' {
  return pricingMode === 'tiered_card_time' || pricingMode === 'tiered_revenue_share'
}

export function normalizeSupplierBillingUnit(
  value: string | null | undefined,
): SupplierBillingUnit {
  return value === 'month' ? 'month' : 'hour'
}

/** 自然月天数；reference 为 yyyy-MM-dd 或 yyyy-MM-dd HH:mm:ss。解析失败兜底 30 天。 */
export function daysInNaturalMonth(reference: string): number {
  const datePart = reference.trim().slice(0, 10)
  const [yearStr, monthStr] = datePart.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  if (!year || !month || month < 1 || month > 12) return 30
  return new Date(year, month, 0).getDate()
}

/** 解析正金额：0 / 负数 / NaN / 空串统一归 null（区别于 0，0 是有效业务值时须显式处理）。 */
export function parsePositiveMoney(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  if (Number.isNaN(n) || n <= 0) return null
  return n
}

/** 解析非负金额，允许 0（例如已核销的调整额）。 */
export function parseNonNegativeMoney(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  if (Number.isNaN(n) || n < 0) return null
  return n
}

/** 解析百分数（0–100 语义）。负数/NaN 归 null。 */
export function parsePositivePercent(value: string | number | null | undefined): number | null {
  return parsePositiveMoney(value)
}

/**
 * 价格有效期判定（唯一权威实现）。
 *
 * 口径：`asOfDate` 当天仍在有效期内即视为有效 —— `effectiveFrom` 允许到当日 23:59:59，
 * `effectiveTo` 允许到当日 00:00:00。空串/null 视为无上限。
 *
 * 比较采用 `yyyy-MM-dd HH:mm:ss` 字符串字典序（与 drizzle 的
 * `timestamp(..., { mode: 'string' })` 返回格式一致），字典序等价于时间序，
 * 且避免了时区偏移导致的跨月边界错判。
 */
export function isPricingEffectiveAt(
  effectiveFrom: string | null | undefined,
  effectiveTo: string | null | undefined,
  asOfDate: string,
): boolean {
  const datePart = asOfDate.trim().slice(0, 10)
  const endOfDay = `${datePart} 23:59:59`
  const startOfDay = `${datePart} 00:00:00`

  const from = normalizeTimestampString(effectiveFrom)
  if (from != null && from > endOfDay) return false

  const to = normalizeTimestampString(effectiveTo)
  if (to != null && to < startOfDay) return false

  return true
}

/** 纯日期（`supplier_unit_cost.effective_from` 为 date 类型）粒度的有效期判定。 */
export function isUnitCostEffectiveAt(
  effectiveFrom: string | null | undefined,
  effectiveTo: string | null | undefined,
  asOfDate: string,
): boolean {
  const day = asOfDate.trim().slice(0, 10)
  const from = effectiveFrom?.trim().slice(0, 10)
  const to = effectiveTo?.trim().slice(0, 10)
  if (from != null && from !== '' && from > day) return false
  if (to != null && to !== '' && to < day) return false
  return true
}

/** 把可能缺省时间的 timestamp 字符串补齐到 `yyyy-MM-dd HH:mm:ss`，便于安全字典序比较。 */
function normalizeTimestampString(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  if (trimmed === '') return null
  const datePart = trimmed.slice(0, 10)
  if (datePart.length !== 10) return trimmed
  const timePart = trimmed.length > 10 ? trimmed.slice(11, 19) : '00:00:00'
  return `${datePart} ${timePart.length === 8 ? timePart : '00:00:00'}`
}

/** 整租月租 → 卡时单价：月租 / 自然月天数 / 24 / 每机卡数 */
export function deriveCardHourPriceFromMonthlyRent(input: {
  monthlyRentPerMachine: number
  cardsPerMachine: number
  referenceDate: string
}): number | null {
  const { monthlyRentPerMachine, cardsPerMachine, referenceDate } = input
  if (monthlyRentPerMachine <= 0 || cardsPerMachine <= 0) return null
  const days = daysInNaturalMonth(referenceDate)
  if (days <= 0) return null
  const raw = monthlyRentPerMachine / days / 24 / cardsPerMachine
  if (!Number.isFinite(raw)) return null
  // W-19：折算结果**必须量化到 4 位小数**再返回。
  //
  // `unit_cost` 列是 numeric(15,4)，存不下更高精度。带着全精度 float 继续算
  // 会产出一行自相矛盾的数据：
  //   存 unit_cost = 0.5040（量化后）
  //   存 amount     = 48 × 0.50403125… = 24.1935（未量化）
  // 于是 `unit_cost × usage_hours ≠ amount`，任何拿存下来的列重算的审计/
  // 对账都会判定该行不平，W-13 月账单按卡时加权重算 effectiveUnitCost 的
  // 恒等式也跟着失效。
  //
  // 在推导边界就量化一次，下游（明细、账单头、月账单重算）全程自洽。
  return Number(roundToMoneyScale(raw))
}

export type StoredCardTimePricingInput = {
  billingUnit?: string | null
  unitPrice?: string | number | null
  unitPricePerHour?: string | number | null
  cardsPerMachine?: number | null
  effectiveFrom: string
}

/**
 * 卡时单价解析。**整租（month）必须经此折算**，禁止直接读 `unitPricePerHour` ——
 * 整租记录的该列可空，直接读会得到 0。
 */
export function resolveCardTimeUnitPrice(
  input: StoredCardTimePricingInput,
  referenceDate?: string,
): number | null {
  const billingUnit = normalizeSupplierBillingUnit(input.billingUnit)
  const ref = referenceDate ?? input.effectiveFrom

  if (billingUnit === 'month') {
    const monthlyRent = parsePositiveMoney(input.unitPrice)
    const cards = input.cardsPerMachine ?? DEFAULT_CARDS_PER_MACHINE
    if (monthlyRent == null) return null
    return deriveCardHourPriceFromMonthlyRent({
      monthlyRentPerMachine: monthlyRent,
      cardsPerMachine: cards,
      referenceDate: ref,
    })
  }

  return parsePositiveMoney(input.unitPrice) ?? parsePositiveMoney(input.unitPricePerHour)
}

/**
 * 一条价格记录的原始列（对应 `supplier_pricing_record` / `supplier_unit_cost` 的并集子集）。
 */
export type PricingRecordSnapshot = {
  pricingMode: string
  configStatus?: string | null
  billingUnit?: string | null
  unitPrice?: string | number | null
  unitPricePerHour?: string | number | null
  cardsPerMachine?: number | null
  revenueSharePercent?: string | number | null
  listPricePerHour?: string | number | null
  dealToListRatio?: string | number | null
  pricingTiers?: unknown
  effectiveFrom: string
  effectiveTo?: string | null
}

/** 归一化后的价格字段 —— 所有出账/成本计算的输入。 */
export type ResolvedPricingFields = {
  pricingMode: string
  configStatus: string
  billingUnit: SupplierBillingUnit
  cardsPerMachine: number | null
  unitPrice: number | null
  unitPricePerHour: number | null
  listPricePerHour: number | null
  revenueSharePercent: number | null
  pricingTiers: ContractPricingTier[]
}

/**
 * 唯一的价格归一化入口。
 *
 * 关键口径（与历史成本侧实现保持一致，出账侧此前缺失）：
 *  - 仅 `card_time` 走整租折算；`revenue_share` / `tiered_*` 直接取 `unitPricePerHour`。
 *  - `cardsPerMachine` 仅整租保留。
 *  - `referenceDate` 决定整租折算用哪个自然月（应传结算期末日）。
 */
export function resolvePricingFields(
  input: PricingRecordSnapshot & { referenceDate?: string },
): ResolvedPricingFields {
  const billingUnit = normalizeSupplierBillingUnit(input.billingUnit)
  const cardsPerMachine = input.cardsPerMachine ?? DEFAULT_CARDS_PER_MACHINE
  const unitPrice = parsePositiveMoney(input.unitPrice)
  const referenceDate = input.referenceDate ?? input.effectiveFrom ?? ''

  const unitPricePerHour =
    input.pricingMode === 'card_time'
      ? resolveCardTimeUnitPrice(
          {
            billingUnit,
            unitPrice: input.unitPrice,
            unitPricePerHour: input.unitPricePerHour,
            cardsPerMachine: input.cardsPerMachine,
            effectiveFrom: input.effectiveFrom,
          },
          referenceDate,
        )
      : parsePositiveMoney(input.unitPricePerHour)

  return {
    pricingMode: input.pricingMode,
    configStatus: input.configStatus ?? 'active',
    billingUnit,
    cardsPerMachine: billingUnit === 'month' ? cardsPerMachine : null,
    unitPrice,
    unitPricePerHour,
    listPricePerHour: parsePositiveMoney(input.listPricePerHour),
    revenueSharePercent: parsePositivePercent(input.revenueSharePercent),
    pricingTiers: parsePricingTiers(input.pricingTiers),
  }
}

export function parsePricingTiers(value: unknown): ContractPricingTier[] {
  return Array.isArray(value) ? (value as ContractPricingTier[]) : []
}

/**
 * 阶梯命中：按成交/刊例比例，区间左闭右开（`min <= ratio < max`），
 * `max` 为空视为 +Infinity，`min` 为空的档跳过。按 tierOrder 升序取首个命中。
 */
export function matchTierByDealToListRatio(
  tiers: ContractPricingTier[],
  dealToListRatio: number,
): ContractPricingTier | null {
  const sorted = [...tiers].sort((a, b) => (a.tierOrder ?? 0) - (b.tierOrder ?? 0))
  for (const tier of sorted) {
    if (tier.dealToListRatioMin == null) continue
    const min = Number(tier.dealToListRatioMin)
    const max =
      tier.dealToListRatioMax == null ? Number.POSITIVE_INFINITY : Number(tier.dealToListRatioMax)
    if (Number.isNaN(min) || Number.isNaN(max)) continue
    if (dealToListRatio >= min && dealToListRatio < max) return tier
  }
  return null
}

/**
 * 阶梯命中：按累计卡时，区间左闭右开。与 ratio_band 互斥使用。
 */
export function matchTierByCardHours(
  tiers: ContractPricingTier[],
  totalCardHours: number,
): ContractPricingTier | null {
  const sorted = [...tiers].sort((a, b) => (a.tierOrder ?? 0) - (b.tierOrder ?? 0))
  for (const tier of sorted) {
    if (tier.thresholdFromHours == null) continue
    const from = Number(tier.thresholdFromHours)
    const to =
      tier.thresholdToHours == null ? Number.POSITIVE_INFINITY : Number(tier.thresholdToHours)
    if (Number.isNaN(from) || Number.isNaN(to)) continue
    if (totalCardHours >= from && totalCardHours < to) return tier
  }
  return null
}

/** 档位结算单价：优先档内单价，其次刊例 × 倍率。均缺失返回 null。 */
export function tierSettlementUnitPrice(
  tier: ContractPricingTier,
  listPricePerHour: number | null,
): number | null {
  const explicit = parsePositiveMoney(tier.unitPricePerHour)
  if (explicit != null) return explicit
  if (listPricePerHour == null) return null
  const multiplier = parsePositiveMoney(tier.listPriceMultiplier)
  if (multiplier == null) return null
  return listPricePerHour * multiplier
}

/** 实际成交单价 = 消费额 / 总卡时。任一 <= 0 返回 null。 */
export function computeDealUnitPricePerHour(
  balanceConsumption: number,
  totalCardHours: number,
): number | null {
  if (balanceConsumption <= 0 || totalCardHours <= 0) return null
  return balanceConsumption / totalCardHours
}

export function formatCardHourPrice(value: number): string {
  return value.toFixed(4)
}

export function formatMonthlyRentPricingLabel(input: {
  billingUnit: SupplierBillingUnit
  unitPrice: number
  cardsPerMachine: number
  effectiveFrom: string
}): string {
  if (input.billingUnit === 'hour') {
    return `¥${input.unitPrice}/小时`
  }
  const derived = deriveCardHourPriceFromMonthlyRent({
    monthlyRentPerMachine: input.unitPrice,
    cardsPerMachine: input.cardsPerMachine,
    referenceDate: input.effectiveFrom,
  })
  const days = daysInNaturalMonth(input.effectiveFrom)
  const hourly = derived != null ? ` (≈¥${formatCardHourPrice(derived)}/时)` : ''
  return `¥${input.unitPrice}/月${hourly} · ${days}天/${input.cardsPerMachine}卡`
}

/** 分成计价所需的最小价格上下文（可来自 pricing_record 归一化结果） */
export type RevenueSharePricingContext = {
  pricingMode: string
  unitCost: number | null
  pricingTiers: ContractPricingTier[]
  listPricePerHour: number | null
  revenueSharePercent: string | number | null
}

/** 分成计算所需的消费与卡时基数 */
export type ConsumptionBase = {
  /** 对外总消费（含券 + 余额），分成金额的计算基数 */
  totalConsumption: number
  /** 余额消费，仅用于阶梯分成计算成交/刊例比例 */
  balanceConsumption: number
  totalCardHours: number
}

/**
 * 解析实际适用的分成比例（百分数，0–100 语义）。
 *
 * 阶梯分成按「成交/刊例比例」落档：成交单价 = 余额消费 / 总卡时，
 * 比例 = 成交单价 / 刊例价。命中档后取该档 `revenueSharePercent`；
 * 未命中任何档返回 null（待结算），**不静默用顶层比例兜底** ——
 * 兜底会让高价成交被按低档分成结算，直接造成少付供应商。
 */
export function resolveRevenueSharePercent(
  pricing: RevenueSharePricingContext,
  consumption: Pick<ConsumptionBase, 'balanceConsumption' | 'totalCardHours'>,
): number | null {
  if (isTieredPricingMode(pricing.pricingMode)) {
    if (pricing.pricingTiers.length === 0) return null
    if (pricing.listPricePerHour == null || pricing.listPricePerHour <= 0) return null

    const dealUnit = computeDealUnitPricePerHour(
      consumption.balanceConsumption,
      consumption.totalCardHours,
    )
    if (dealUnit == null) return null

    const tier = matchTierByDealToListRatio(
      pricing.pricingTiers,
      dealUnit / pricing.listPricePerHour,
    )
    if (!tier) return null

    const pct = parsePositiveMoney(tier.revenueSharePercent)
    return pct
  }

  return parsePositiveMoney(pricing.revenueSharePercent)
}

export type SettledAmount = {
  /**
   * 结算金额，**4 位定点字符串**（W-19）。
   *
   * 不用 number：`amount` 来自 `usageHours × unitCost`（或消费 × 分成比例），
   * JS float 乘法与 PostgreSQL `numeric` 乘法在 4 位小数上会分歧 ——
   * 实测 4000 次抽样有 2 次差 1e-4（如 520.25 × 382.3866：PG 198936.6287，
   * float 得 198936.6286）。这类 1e-4 错位会被下游「差值 < 0.01 就算平」的
   * 断言全部放过，最终静默进账。
   */
  amount: string
  /** true = 缺少消费或分成比例，金额待结算（消费补齐后需重算） */
  pending: boolean
  /** 实际适用的分成比例（百分数）；非分成模式为 null */
  sharePercent: number | null
}

/**
 * 单行结算金额（卡时与分成的唯一口径）。
 *
 * - 卡时 / 阶梯卡时：`用量卡时 × 卡时单价`
 * - 分成 / 阶梯分成：`总消费 × 分成比例 / 100`，**与卡时无关**
 *
 * 缺消费或缺分成比例时返回 `pending`，金额记 0 —— 由调用方把
 * `tenant_consumption` 留空表示待结算，而不是静默按 0 元出账。
 */
export function computeSettledAmount(
  pricing: RevenueSharePricingContext,
  usageHours: number,
  consumption?: ConsumptionBase | null,
): SettledAmount {
  if (isRevenueSharePricingMode(pricing.pricingMode)) {
    if (!consumption || consumption.totalConsumption <= 0) {
      return { amount: '0.0000', pending: true, sharePercent: null }
    }
    const sharePercent = resolveRevenueSharePercent(pricing, consumption)
    if (sharePercent == null) {
      return { amount: '0.0000', pending: true, sharePercent: null }
    }
    return {
      // 消费额先落到 4 位定点，再乘比例、再除 100 —— 每步都走定点运算，
      // 避免 (a × b) / 100 的中间 float 误差被带进最终金额。
      amount: multiplyMoney(multiplyMoney(consumption.totalConsumption, sharePercent), '0.01'),
      pending: false,
      sharePercent,
    }
  }

  if (pricing.unitCost == null) {
    return { amount: '0.0000', pending: false, sharePercent: null }
  }
  return { amount: multiplyMoney(usageHours, pricing.unitCost), pending: false, sharePercent: null }
}

/**
 * 检测「阶梯配置了 hours 轴，但出账侧尚未应用」的状态。
 *
 * 现状（审计结论，勿删）：
 *  - `tiered_revenue_share` 的 `ratio_band` 轴**已接入**
 *    （见 `resolveRevenueSharePercent` → `matchTierByDealToListRatio`）；
 *  - `tiered_card_time` 的 `hours` 轴**未接入** —— `matchTierByCardHours`
 *    至今没有任何调用方，`resolvePricingFields` 对 `tiered_*` 直接取顶层
 *    `unitPricePerHour`，`pricingTiers` 被整体忽略。
 *
 * 为什么用「报错」而不是「补实现」：
 *  `hours` 轴要算对，必须先定死两件设计文档没写的事 ——
 *  ① 累计窗口（自然月 / 合同期 / 终身累计）；
 *  ② 跨档语义（满 N 卡时后**全部**卡时回溯重定价，还是仅超出部分按新价）。
 *  两者都直接决定付给供应商多少钱，猜错就是资损。补实现前必须由业务定口径。
 *
 * 在此之前，若放行这条路径，运营配好阶梯（8 元/时、满 100 卡时 7 元/时）
 * 就会静默按 8 元/时全额结算 —— 供应商少拿钱且无人察觉。
 * 所以出账侧必须显式中止，把问题暴露在出账环节而不是付款环节。
 *
 * @returns 存在「配了 hours 轴阶梯但不会被应用」时返回 true
 */
export function hasUnappliedHoursTiers(
  pricingMode: string | null | undefined,
  pricingTiers: ContractPricingTier[] | null | undefined,
): boolean {
  if (pricingMode !== 'tiered_card_time') return false
  if (!Array.isArray(pricingTiers) || pricingTiers.length === 0) return false
  return pricingTiers.some(
    (tier) =>
      tier != null &&
      // tierBasis 缺省时，只有带小时阈值的档才可能走 hours 轴，
      // 避免把 ratio_band 阶梯误判为未应用。
      (tier.tierBasis === 'hours' ||
        (tier.tierBasis == null &&
          (tier.thresholdFromHours != null || tier.thresholdToHours != null))),
  )
}
