import { db } from '@/lib/db'
import { resolveCustomerSegmentByProjectId, type CustomerSegmentKey } from '@/lib/crm/customer-segment'
import {
  getBCustomerFunnel,
  loadExcludedTenantIds,
  percentChange,
  sumRechargeNet,
  toNumber,
} from '@/lib/server/dataaccess/finance/report-funnel'
import {
  billingPeriod,
  platformIncomeMonthly,
  projectMonthlyCostSnapshot,
  recharge,
  tenantBillDailyDetail,
} from '@workspace/db/schema'
import { TRPCError } from '@trpc/server'
import { and, desc, eq, gte, lt, lte, sql } from 'drizzle-orm'

export type MomMetric = {
  value: number
  momPercent: number | null
}

export type BillingStatus = 'published' | 'computed' | 'draft'

export type CustomerSegmentKey4 = CustomerSegmentKey | 'unclassified' | 'total'

export type CustomerSegmentRow = {
  key: CustomerSegmentKey4
  label: string
  recharge: number
  consumption: number
  grossProfit: number
  rechargeCustomers: number
  consumptionCustomers: number
}

export type ProductLineRow = {
  productLine: string
  newCustomer: number
  oldCustomer: number
  unclassified: number
  total: number
  /**
   * 账期口径的产品线卡时目前无可靠数据源：
   * 客户消费侧（platform_income_monthly / billing_period_agg_customer_consumption）
   * 只有金额没有卡时，成本侧 platform_cost_monthly 有卡时但按
   * data_center / card_type 维度而非产品线维度，两者无法对齐。
   * 因此这里显式返回 null 由 UI 渲染「—」，不用顶层卡时冒充产品线卡时。
   */
  cardHours: number | null
}

export type MonthlyReport = {
  periodCode: string
  periodLabel: string
  billingStatus: BillingStatus
  publishedAt: string | null
  platform: {
    recharge: MomMetric
    consumption: MomMetric
    grossProfit: MomMetric
    grossMarginPercent: number | null
    enterpriseConsumption: number
    personalConsumption: number
    balanceConsumption: number
    baremetalConsumption: number
    rechargeTenantCount: number
    consumptionTenantCount: number
  }
  funnel: {
    newRegistrations: MomMetric
    testPassed: MomMetric
    conversionsCustomer: MomMetric
    conversionsProject: MomMetric
    testingToConverted: MomMetric
    registrationToTestRate: number | null
    testToConversionRate: number | null
  }
  customerSegments: CustomerSegmentRow[]
  productLines: ProductLineRow[]
}

const SEGMENT_LABELS: Record<CustomerSegmentKey4, string> = {
  new: '新客（销售新客）',
  old: '老客（平台老客 / 中台直客）',
  unclassified: '未分类（无客户标签）',
  total: '合计',
}

const BILLING_STATUSES = new Set<BillingStatus>(['published', 'computed', 'draft'])

function toBillingStatus(value: string): BillingStatus {
  return BILLING_STATUSES.has(value as BillingStatus) ? (value as BillingStatus) : 'draft'
}

function formatPeriodLabel(periodCode: string): string {
  const [year, month] = periodCode.split('-')
  return `${year} 年 ${Number(month)} 月`
}

function toMomMetric(current: number, compare: number | null): MomMetric {
  return {
    value: round2(current),
    momPercent: compare === null ? null : percentChange(round2(current), round2(compare)),
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function ratioPercent(numerator: number, denominator: number): number | null {
  if (!denominator) return null
  return round2((numerator / denominator) * 100)
}

type PeriodRow = typeof billingPeriod.$inferSelect

async function loadPeriod(periodCode: string): Promise<PeriodRow> {
  const row = await db.query.billingPeriod.findFirst({
    where: eq(billingPeriod.periodCode, periodCode),
  })
  if (!row) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `账期 ${periodCode} 不存在` })
  }
  return row
}

/** 上一自然月账期，按 periodCode 字典序前一条（YYYY-MM 零填充，序即时间序） */
async function loadPreviousPeriod(periodCode: string): Promise<PeriodRow | null> {
  const row = await db.query.billingPeriod.findFirst({
    where: sql`${billingPeriod.periodCode} < ${periodCode}`,
    orderBy: [desc(billingPeriod.periodCode)],
  })
  return row ?? null
}

type PlatformCounters = {
  recharge: number
  consumption: number
  grossProfit: number
  grossMarginPercent: number | null
  enterpriseConsumption: number
  personalConsumption: number
  balanceConsumption: number
  baremetalConsumption: number
  rechargeTenantCount: number
  consumptionTenantCount: number
}

async function countRechargeTenants(startDate: string, endDate: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`COUNT(DISTINCT ${recharge.tenantId})` })
    .from(recharge)
    .where(
      and(
        eq(recharge.status, 'paid'),
        gte(sql`coalesce(${recharge.completedAt}, ${recharge.createdAt})`, startDate),
        lt(sql`coalesce(${recharge.completedAt}, ${recharge.createdAt})`, endDate),
      ),
    )
  return toNumber(rows[0]?.count)
}

async function countConsumptionTenants(billingPeriodId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`COUNT(DISTINCT ${platformIncomeMonthly.tenantId})` })
    .from(platformIncomeMonthly)
    .where(eq(platformIncomeMonthly.billingPeriodId, billingPeriodId))
  return toNumber(rows[0]?.count)
}

async function loadPlatformCounters(period: PeriodRow): Promise<PlatformCounters> {
  const startDate = period.periodStart
  const endDate = period.periodEnd
  // 账期为自然月，充值按自然日区间统计；与看板 getKpi 保持同一口径
  const excluded = await loadExcludedTenantIds({ periodStart: startDate, periodEnd: endDate })

  const [recharge, rechargeTenantCount, consumptionTenantCount] = await Promise.all([
    sumRechargeNet(startDate, endDate, excluded),
    countRechargeTenants(startDate, `${endDate}T23:59:59.999Z`),
    countConsumptionTenants(period.id),
  ])

  const incomeTotal = toNumber(period.incomeTotal)
  const grossProfit = toNumber(period.totalGrossProfit)

  return {
    recharge: round2(recharge),
    consumption: round2(incomeTotal),
    grossProfit: round2(grossProfit),
    grossMarginPercent: ratioPercent(grossProfit, incomeTotal),
    enterpriseConsumption: round2(toNumber(period.enterpriseIncome)),
    personalConsumption: round2(toNumber(period.personalIncome)),
    balanceConsumption: round2(toNumber(period.balanceIncome)),
    baremetalConsumption: round2(toNumber(period.baremetalIncome)),
    rechargeTenantCount,
    consumptionTenantCount,
  }
}

type SegmentAccumulator = {
  recharge: number
  consumption: number
  grossProfit: number
  rechargeCustomers: Set<string>
  consumptionCustomers: Set<string>
}

type SegmentPatch = {
  recharge?: number
  consumption?: number
  grossProfit?: number
  rechargeCustomers?: string[]
  consumptionCustomers?: string[]
}

function emptyAccumulator(): SegmentAccumulator {
  return {
    recharge: 0,
    consumption: 0,
    grossProfit: 0,
    rechargeCustomers: new Set(),
    consumptionCustomers: new Set(),
  }
}

function segmentOf(
  segmentMap: Map<string, CustomerSegmentKey>,
  projectId: string | null,
): Exclude<CustomerSegmentKey4, 'total'> {
  if (!projectId) return 'unclassified'
  return segmentMap.get(projectId) ?? 'unclassified'
}

async function loadCustomerSegments(
  period: PeriodRow,
  segmentMap: Map<string, CustomerSegmentKey>,
): Promise<CustomerSegmentRow[]> {
  const accumulators: Record<CustomerSegmentKey4, SegmentAccumulator> = {
    new: emptyAccumulator(),
    old: emptyAccumulator(),
    unclassified: emptyAccumulator(),
    total: emptyAccumulator(),
  }

  const add = (key: CustomerSegmentKey4, patch: SegmentPatch) => {
    for (const target of [key, 'total'] as const) {
      const acc = accumulators[target]
      acc.recharge += patch.recharge ?? 0
      acc.consumption += patch.consumption ?? 0
      acc.grossProfit += patch.grossProfit ?? 0
      for (const id of patch.rechargeCustomers ?? []) acc.rechargeCustomers.add(id)
      for (const id of patch.consumptionCustomers ?? []) acc.consumptionCustomers.add(id)
    }
  }

  // 充值按项目归集（recharge.projectId 可空 → 未分类）
  const rechargeRows = await db
    .select({
      projectId: recharge.projectId,
      value: sql<number>`COALESCE(SUM(${recharge.amount} - ${recharge.refundAmount}), 0)`,
    })
    .from(recharge)
    .where(
      and(
        eq(recharge.status, 'paid'),
        gte(
          sql`coalesce(${recharge.completedAt}, ${recharge.createdAt})`,
          period.periodStart,
        ),
        lt(
          sql`coalesce(${recharge.completedAt}, ${recharge.createdAt})`,
          `${period.periodEnd}T23:59:59.999Z`,
        ),
      ),
    )
    .groupBy(recharge.projectId)

  for (const row of rechargeRows) {
    const value = toNumber(row.value)
    if (value === 0) continue
    add(segmentOf(segmentMap, row.projectId), { recharge: value })
  }

  // 消耗按项目归集（platform_income_monthly 是账期派生层，与 billingPeriodId 对齐）
  const incomeRows = await db
    .select({
      projectId: platformIncomeMonthly.projectId,
      customerId: platformIncomeMonthly.customerId,
      value: sql<number>`COALESCE(SUM(${platformIncomeMonthly.totalConsumption}), 0)`,
    })
    .from(platformIncomeMonthly)
    .where(eq(platformIncomeMonthly.billingPeriodId, period.id))
    .groupBy(platformIncomeMonthly.projectId, platformIncomeMonthly.customerId)

  for (const row of incomeRows) {
    const value = toNumber(row.value)
    if (value === 0) continue
    add(segmentOf(segmentMap, row.projectId), {
      consumption: value,
      consumptionCustomers: row.customerId ? [row.customerId] : [],
    })
  }

  // 分客毛利取 project_monthly_cost_snapshot（账期级项目成本快照）
  const costRows = await db
    .select({
      projectId: projectMonthlyCostSnapshot.projectId,
      value: sql<number>`COALESCE(SUM(${projectMonthlyCostSnapshot.grossProfit}), 0)`,
    })
    .from(projectMonthlyCostSnapshot)
    .where(eq(projectMonthlyCostSnapshot.billingPeriodId, period.id))
    .groupBy(projectMonthlyCostSnapshot.projectId)

  for (const row of costRows) {
    const value = toNumber(row.value)
    if (value === 0) continue
    add(segmentOf(segmentMap, row.projectId), { grossProfit: value })
  }

  return (['new', 'old', 'unclassified', 'total'] as const).map((key) => ({
    key,
    label: SEGMENT_LABELS[key],
    recharge: round2(accumulators[key].recharge),
    consumption: round2(accumulators[key].consumption),
    grossProfit: round2(accumulators[key].grossProfit),
    rechargeCustomers: accumulators[key].rechargeCustomers.size,
    consumptionCustomers: accumulators[key].consumptionCustomers.size,
  }))
}

/**
 * 账期内 租户 → 客群 的映射。
 *
 * tenant_bill_daily_detail 只有 tenantId 没有 projectId，无法直接按项目分客群；
 * 而 platform_income_monthly 有 projectId，两表以 tenantId 关联。
 * 一个租户可能同时挂新客和老客项目，直接展开会把同一笔金额重复计入两个客群，
 * 因此这里取「老客优先」的单一归属：任一项目判为老客则该租户整体记老客，
 * 否则任一项目判为新客记新客，都没有则记未分类。保证 Σ(各客群) == 总额。
 */
async function loadTenantSegmentByPeriod(
  period: PeriodRow,
  segmentMap: Map<string, CustomerSegmentKey>,
): Promise<Map<string, Exclude<CustomerSegmentKey4, 'total'>>> {
  const rows = await db
    .select({
      tenantId: platformIncomeMonthly.tenantId,
      projectId: platformIncomeMonthly.projectId,
    })
    .from(platformIncomeMonthly)
    .where(eq(platformIncomeMonthly.billingPeriodId, period.id))

  const result = new Map<string, Exclude<CustomerSegmentKey4, 'total'>>()
  for (const row of rows) {
    const key = segmentOf(segmentMap, row.projectId)
    if (key === 'old') {
      result.set(row.tenantId, 'old')
      continue
    }
    if (!result.has(row.tenantId)) {
      result.set(row.tenantId, key)
    }
  }
  return result
}

const PRODUCT_LINE_SEGMENT_FIELD: Record<
  Exclude<CustomerSegmentKey4, 'total'>,
  'newCustomer' | 'oldCustomer' | 'unclassified'
> = {
  new: 'newCustomer',
  old: 'oldCustomer',
  unclassified: 'unclassified',
}

async function loadProductLines(
  period: PeriodRow,
  segmentMap: Map<string, CustomerSegmentKey>,
): Promise<ProductLineRow[]> {
  const tenantSegments = await loadTenantSegmentByPeriod(period, segmentMap)

  const rows = await db
    .select({
      productLine: tenantBillDailyDetail.productLine,
      tenantId: tenantBillDailyDetail.tenantId,
      value: sql<number>`COALESCE(SUM(${tenantBillDailyDetail.amount}), 0)`,
    })
    .from(tenantBillDailyDetail)
    .where(
      and(
        gte(tenantBillDailyDetail.usageDate, period.periodStart),
        lte(tenantBillDailyDetail.usageDate, period.periodEnd),
      ),
    )
    .groupBy(tenantBillDailyDetail.productLine, tenantBillDailyDetail.tenantId)

  const byProductLine = new Map<
    string,
    { newCustomer: number; oldCustomer: number; unclassified: number; total: number }
  >()

  for (const row of rows) {
    const value = toNumber(row.value)
    const bucket =
      byProductLine.get(row.productLine) ??
      { newCustomer: 0, oldCustomer: 0, unclassified: 0, total: 0 }
    const segment = tenantSegments.get(row.tenantId) ?? 'unclassified'
    bucket[PRODUCT_LINE_SEGMENT_FIELD[segment]] += value
    bucket.total += value
    byProductLine.set(row.productLine, bucket)
  }

  return [...byProductLine.entries()]
    .map(([productLine, bucket]) => ({
      productLine,
      newCustomer: round2(bucket.newCustomer),
      oldCustomer: round2(bucket.oldCustomer),
      unclassified: round2(bucket.unclassified),
      total: round2(bucket.total),
      cardHours: null,
    }))
    .sort((a, b) => b.total - a.total)
}

async function loadFunnel(periodCode: string): Promise<MonthlyReport['funnel']> {
  // 漏斗口径完全复用经营看板的 getBCustomerFunnel，避免两处各算一套
  const funnel = await getBCustomerFunnel({
    preset: 'customMonth',
    customMonth: periodCode,
  })
  return {
    newRegistrations: funnel.newRegistrations,
    testPassed: funnel.testPassed,
    conversionsCustomer: funnel.conversionsCustomer,
    conversionsProject: funnel.conversionsProject,
    testingToConverted: funnel.testingToConverted,
    registrationToTestRate: funnel.registrationToTestRate,
    testToConversionRate: funnel.testToConversionRate,
  }
}

export const monthlyReportDataAccess = {
  async getPeriodOptions(): Promise<
    Array<{ periodCode: string; label: string; status: BillingStatus }>
  > {
    const rows = await db
      .select({ periodCode: billingPeriod.periodCode, status: billingPeriod.status })
      .from(billingPeriod)
      .orderBy(desc(billingPeriod.periodCode))
      .limit(24)

    return rows.map((row) => ({
      periodCode: row.periodCode,
      label: formatPeriodLabel(row.periodCode),
      status: toBillingStatus(row.status),
    }))
  },

  async getReport(input: { periodCode: string }): Promise<MonthlyReport> {
    const period = await loadPeriod(input.periodCode)
    const previous = await loadPreviousPeriod(input.periodCode)
    const segmentMap = await resolveCustomerSegmentByProjectId()

    const [current, prev, customerSegments, productLines, funnel] = await Promise.all([
      loadPlatformCounters(period),
      previous ? loadPlatformCounters(previous) : Promise.resolve(null),
      loadCustomerSegments(period, segmentMap),
      loadProductLines(period, segmentMap),
      loadFunnel(period.periodCode),
    ])

    return {
      periodCode: period.periodCode,
      periodLabel: formatPeriodLabel(period.periodCode),
      billingStatus: toBillingStatus(period.status),
      publishedAt: period.publishedAt ? formatPublishedAt(period.publishedAt) : null,
      platform: {
        recharge: toMomMetric(current.recharge, prev?.recharge ?? null),
        consumption: toMomMetric(current.consumption, prev?.consumption ?? null),
        grossProfit: toMomMetric(current.grossProfit, prev?.grossProfit ?? null),
        grossMarginPercent: current.grossMarginPercent,
        enterpriseConsumption: current.enterpriseConsumption,
        personalConsumption: current.personalConsumption,
        balanceConsumption: current.balanceConsumption,
        baremetalConsumption: current.baremetalConsumption,
        rechargeTenantCount: current.rechargeTenantCount,
        consumptionTenantCount: current.consumptionTenantCount,
      },
      funnel,
      customerSegments,
      productLines,
    }
  },
}

function formatPublishedAt(value: Date): string {
  const iso = value.toISOString()
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`
}
