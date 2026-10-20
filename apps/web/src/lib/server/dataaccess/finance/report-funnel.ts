import { db } from '@/lib/db'
import {
  resolveOperationalComparePeriod,
  resolveOperationalPeriod,
  shanghaiDateRangeToUtcBounds,
  type OperationalPeriodPreset,
} from '@/lib/crm/operational-dashboard-period'
import {
  isInternalTenantExcludedFromPeriodIncome,
  type BillingPeriodDateRange,
} from '@/lib/finance/internal-tenant-income-exclusion'
import {
  billingTenant,
  crmProject,
  customer,
  projectConversionSetting,
  recharge,
} from '@workspace/db/schema'
import { and, eq, gte, inArray, isNotNull, lt, lte, sql } from 'drizzle-orm'

export type MomMetric = {
  value: number
  momPercent: number | null
}

export type BCustomerFunnelResponse = {
  available: boolean
  periodCode: string
  newRegistrations: MomMetric
  testPassed: MomMetric
  conversionsCustomer: MomMetric
  conversionsProject: MomMetric
  testingToConverted: MomMetric
  registrationToTestRate: number | null
  testToConversionRate: number | null
}

export function percentChange(current: number, compare: number): number | null {
  if (compare === 0) return current === 0 ? 0 : null
  return Math.round(((current - compare) / compare) * 1000) / 10
}

export function toNumber(value: unknown): number {
  return Number(value ?? 0)
}

export async function loadExcludedTenantIds(period: BillingPeriodDateRange): Promise<Set<string>> {
  const rows = await db
    .select({
      id: billingTenant.id,
      type: billingTenant.type,
      internalEffectiveFrom: billingTenant.internalEffectiveFrom,
      internalEffectiveTo: billingTenant.internalEffectiveTo,
    })
    .from(billingTenant)
    .where(eq(billingTenant.type, 'internal'))

  const excluded = new Set<string>()
  for (const row of rows) {
    if (
      isInternalTenantExcludedFromPeriodIncome(
        {
          type: row.type,
          internalEffectiveFrom: row.internalEffectiveFrom,
          internalEffectiveTo: row.internalEffectiveTo,
        },
        period,
      )
    ) {
      excluded.add(row.id)
    }
  }
  return excluded
}

function tenantFilter(excludedTenantIds: Set<string>) {
  if (excludedTenantIds.size === 0) return undefined
  return sql`${billingTenant.id} NOT IN (${sql.join(
    [...excludedTenantIds].map((id) => sql`${id}`),
    sql`, `,
  )})`
}

export async function sumRechargeNet(
  startDate: string,
  endDate: string,
  excludedTenantIds: Set<string>,
  projectIds?: Set<string>,
): Promise<number> {
  const { startUtc, endExclusiveUtc } = shanghaiDateRangeToUtcBounds(startDate, endDate)
  const timeFilter = and(
    eq(recharge.status, 'paid'),
    gte(sql`coalesce(${recharge.completedAt}, ${recharge.createdAt})`, startUtc),
    lt(sql`coalesce(${recharge.completedAt}, ${recharge.createdAt})`, endExclusiveUtc),
  )

  if (projectIds && projectIds.size === 0) return 0

  const rows = await db
    .select({
      value: sql<number>`COALESCE(SUM(${recharge.amount} - ${recharge.refundAmount}), 0)`,
    })
    .from(recharge)
    .innerJoin(billingTenant, eq(recharge.tenantId, billingTenant.id))
    .where(
      and(
        timeFilter,
        tenantFilter(excludedTenantIds),
        projectIds && projectIds.size > 0
          ? inArray(recharge.projectId, [...projectIds])
          : undefined,
      ),
    )

  return toNumber(rows[0]?.value)
}

async function countMomMetric(
  current: number,
  countFn: (startDate: string, endDate: string) => Promise<number>,
  compareStart: string,
  compareEnd: string,
): Promise<MomMetric> {
  const compare = await countFn(compareStart, compareEnd)
  return { value: current, momPercent: percentChange(current, compare) }
}

export async function getBCustomerFunnel(input: {
  preset: OperationalPeriodPreset
  customMonth: string
}): Promise<BCustomerFunnelResponse> {
  if (input.preset === 'last7days') {
    return {
      available: false,
      periodCode: '',
      newRegistrations: { value: 0, momPercent: null },
      testPassed: { value: 0, momPercent: null },
      conversionsCustomer: { value: 0, momPercent: null },
      conversionsProject: { value: 0, momPercent: null },
      testingToConverted: { value: 0, momPercent: null },
      registrationToTestRate: null,
      testToConversionRate: null,
    }
  }

  const period = resolveOperationalPeriod(input.preset, input.customMonth)
  const compare = resolveOperationalComparePeriod(period)

  const countNewRegistrations = async (start: string, end: string) => {
    const bounds = shanghaiDateRangeToUtcBounds(start, end)
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(customer)
      .where(
        and(
          eq(customer.type, 'B'),
          gte(customer.createdAt, bounds.startUtc),
          lt(customer.createdAt, bounds.endExclusiveUtc),
        ),
      )
    return toNumber(rows[0]?.count)
  }

  const countTestPassed = async (start: string, end: string) => {
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(customer)
      .where(
        and(
          eq(customer.type, 'B'),
          isNotNull(customer.testCompletedOn),
          gte(customer.testCompletedOn, start),
          lte(customer.testCompletedOn, end),
        ),
      )
    return toNumber(rows[0]?.count)
  }

  const countConversionsCustomer = async (start: string, end: string) => {
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(customer)
      .where(
        and(
          eq(customer.type, 'B'),
          isNotNull(customer.conversionDate),
          gte(customer.conversionDate, start),
          lte(customer.conversionDate, end),
        ),
      )
    return toNumber(rows[0]?.count)
  }

  const countConversionsProject = async (start: string, end: string) => {
    const rows = await db
      .select({ count: sql<number>`count(DISTINCT ${projectConversionSetting.projectId})` })
      .from(projectConversionSetting)
      .innerJoin(crmProject, eq(projectConversionSetting.projectId, crmProject.id))
      .innerJoin(customer, eq(crmProject.customerId, customer.id))
      .where(
        and(
          eq(customer.type, 'B'),
          gte(projectConversionSetting.conversionDate, start),
          lte(projectConversionSetting.conversionDate, end),
        ),
      )
    return toNumber(rows[0]?.count)
  }

  const countTestingToConverted = async (start: string, end: string) => {
    const rows = await db
      .select({ count: sql<number>`count(DISTINCT ${crmProject.id})` })
      .from(crmProject)
      .innerJoin(projectConversionSetting, eq(projectConversionSetting.projectId, crmProject.id))
      .innerJoin(customer, eq(crmProject.customerId, customer.id))
      .where(
        and(
          eq(customer.type, 'B'),
          eq(crmProject.stage, 'converted'),
          isNotNull(customer.testCompletedOn),
          gte(projectConversionSetting.conversionDate, start),
          lte(projectConversionSetting.conversionDate, end),
        ),
      )
    return toNumber(rows[0]?.count)
  }

  const [
    newRegistrations,
    testPassed,
    conversionsCustomer,
    conversionsProject,
    testingToConverted,
  ] = await Promise.all([
    countMomMetric(
      await countNewRegistrations(period.startDate, period.endDate),
      countNewRegistrations,
      compare.startDate,
      compare.endDate,
    ),
    countMomMetric(
      await countTestPassed(period.startDate, period.endDate),
      countTestPassed,
      compare.startDate,
      compare.endDate,
    ),
    countMomMetric(
      await countConversionsCustomer(period.startDate, period.endDate),
      countConversionsCustomer,
      compare.startDate,
      compare.endDate,
    ),
    countMomMetric(
      await countConversionsProject(period.startDate, period.endDate),
      countConversionsProject,
      compare.startDate,
      compare.endDate,
    ),
    countMomMetric(
      await countTestingToConverted(period.startDate, period.endDate),
      countTestingToConverted,
      compare.startDate,
      compare.endDate,
    ),
  ])

  const registrationToTestRate =
    newRegistrations.value > 0
      ? Math.round((testPassed.value / newRegistrations.value) * 1000) / 10
      : null
  const testToConversionRate =
    testPassed.value > 0
      ? Math.round((conversionsCustomer.value / testPassed.value) * 1000) / 10
      : null

  const periodCode =
    input.preset === 'customMonth'
      ? input.customMonth
      : `${period.startDate.slice(0, 7)}（${period.startDate.slice(5)} ~ ${period.endDate.slice(5)}）`

  return {
    available: true,
    periodCode,
    newRegistrations,
    testPassed,
    conversionsCustomer,
    conversionsProject,
    testingToConverted,
    registrationToTestRate,
    testToConversionRate,
  }
}
