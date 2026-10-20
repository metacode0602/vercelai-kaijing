import { db } from '@/lib/db'
import {
  DEFAULT_MONTHLY_COST_BRANCH,
  MONTHLY_COST_OPPORTUNITY_SHORT_LABELS,
  MONTHLY_COST_RECIPIENT_ROLES,
  type MonthlyCostBranch,
} from '@/lib/monthly-cost/constants'
import { OPPORTUNITY_SOURCE_LABELS, OPPORTUNITY_SOURCE_VALUES } from '@/lib/crm/commission-constants'
import {
  billingTenant,
  crmProject,
  dataCenter,
  monthlyCostBaseLine,
  monthlyCostCommissionLine,
  monthlyCostCommissionProjectLine,
  monthlyCostDeptPoolLine,
  monthlyCostDeptPoolProjectLine,
  monthlyCostRun,
} from '@workspace/db/schema'
import { and, desc, eq, ilike, isNotNull, or, sql, type SQL } from 'drizzle-orm'
import type {
  MonthlyCostBaseLineDto,
  MonthlyCostBaseLineFilterOptionsDto,
  MonthlyCostBaseLineListFilters,
  MonthlyCostBundle,
  MonthlyCostProjectMetricsDto,
  MonthlyCostRunDto,
  MonthlyCostRunIssueDto,
} from './types'
import { loadProjectMetricsByRun } from './project-metrics'
import { parseRunIssues } from './run-issues'

function mapRun(row: typeof monthlyCostRun.$inferSelect): MonthlyCostRunDto {
  return {
    id: row.id,
    billing_period_id: row.billingPeriodId,
    billing_period_code: row.billingPeriodCode,
    usage_month: row.usageMonth,
    status: row.status,
    base_line_count: row.baseLineCount,
    commission_project_line_count: row.commissionProjectLineCount,
    commission_am_line_count: row.commissionAmLineCount,
    dept_pool_line_count: row.deptPoolLineCount,
    dept_pool_project_line_count: row.deptPoolProjectLineCount,
    dept_distribution_line_count: row.deptDistributionLineCount,
    warning_count: row.warningCount,
    dept_distribution_status: row.deptDistributionStatus,
    error_summary: row.errorSummary,
    started_at: row.startedAt.toISOString(),
    finished_at: row.finishedAt?.toISOString() ?? null,
    confirmed_at: row.confirmedAt?.toISOString() ?? null,
    confirmed_by: row.confirmedBy ?? null,
    confirmed_cost_branch: (row.confirmedCostBranch as MonthlyCostBranch | null) ?? null,
  }
}

function mapBaseLine(
  r: typeof monthlyCostBaseLine.$inferSelect & {
    projectName?: string | null
    tenantName?: string | null
    dataCenterName?: string | null
  },
): MonthlyCostBaseLineDto {
  return {
    id: r.id,
    project_id: r.projectId,
    project_name: r.projectName ?? null,
    tenant_platform_id: r.tenantPlatformId,
    tenant_name: r.tenantName ?? null,
    product_line: r.productLine,
    region_code: r.regionCode,
    data_center_id: r.dataCenterId,
    data_center_name: r.dataCenterName ?? null,
    gpu_card_type_name: r.gpuCardTypeName,
    customer_full_name: r.customerFullName,
    account_manager_staff_id: r.accountManagerStaffId,
    account_manager_name: r.accountManagerName,
    opportunity_source: r.opportunitySource,
    opportunity_source_label: r.opportunitySourceLabel,
    customer_incentive_label: r.customerIncentiveLabel,
    balance_consumption: r.balanceConsumption,
    balance_card_hours: r.balanceCardHours,
    voucher_card_hours: r.voucherCardHours,
    confirmed_revenue_excl_tax: r.confirmedRevenueExclTax,
    pc_sold_duration_cost_excl_tax: r.pcSoldDurationCostExclTax,
    pc_gifted_duration_cost_excl_tax: r.pcGiftedDurationCostExclTax,
    pc_gross_profit: r.pcGrossProfit,
    sp_sold_duration_cost_excl_tax: r.spSoldDurationCostExclTax,
    sp_gifted_duration_cost_excl_tax: r.spGiftedDurationCostExclTax,
    sp_gross_profit: r.spGrossProfit,
    sp_sell_price_per_hour: r.spSellPricePerHour,
    remark: r.remark,
  }
}

function escapeIlikePattern(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&')
}

function baseLineConditions(input: {
  runId: string
  onlyWithProject: boolean
  search?: string
  opportunitySource?: string
  dataCenterId?: string
  accountManagerStaffId?: string
}): SQL | undefined {
  const conditions: SQL[] = [eq(monthlyCostBaseLine.runId, input.runId)]
  if (input.onlyWithProject) {
    conditions.push(isNotNull(monthlyCostBaseLine.projectId))
  }
  if (input.opportunitySource?.trim()) {
    conditions.push(eq(monthlyCostBaseLine.opportunitySource, input.opportunitySource.trim()))
  }
  if (input.dataCenterId?.trim()) {
    conditions.push(eq(monthlyCostBaseLine.dataCenterId, input.dataCenterId.trim()))
  }
  if (input.accountManagerStaffId?.trim()) {
    conditions.push(
      eq(monthlyCostBaseLine.accountManagerStaffId, input.accountManagerStaffId.trim()),
    )
  }
  const search = input.search?.trim()
  if (search) {
    const pattern = `%${escapeIlikePattern(search)}%`
    conditions.push(
      or(
        ilike(monthlyCostBaseLine.tenantPlatformId, pattern),
        ilike(monthlyCostBaseLine.customerFullName, pattern),
        ilike(billingTenant.name, pattern),
      )!,
    )
  }
  return and(...conditions)
}

const baseLineSelect = {
  line: monthlyCostBaseLine,
  projectName: crmProject.name,
  tenantName: billingTenant.name,
  dataCenterName: dataCenter.name,
}

function baseLineFrom() {
  return db
    .select(baseLineSelect)
    .from(monthlyCostBaseLine)
    .leftJoin(crmProject, eq(crmProject.id, monthlyCostBaseLine.projectId))
    .leftJoin(billingTenant, eq(billingTenant.id, monthlyCostBaseLine.tenantId))
    .leftJoin(dataCenter, eq(dataCenter.id, monthlyCostBaseLine.dataCenterId))
}

export async function findLatestMonthlyCostRun(input: {
  billingPeriodId: string
  usageMonth: string
}): Promise<typeof monthlyCostRun.$inferSelect | null> {
  const runs = await db
    .select()
    .from(monthlyCostRun)
    .where(
      and(
        eq(monthlyCostRun.billingPeriodId, input.billingPeriodId),
        eq(monthlyCostRun.usageMonth, input.usageMonth),
        eq(monthlyCostRun.status, 'completed'),
      ),
    )
    .orderBy(desc(monthlyCostRun.finishedAt))
    .limit(1)
  return runs[0] ?? null
}

export async function listBaseLines(
  input: {
    billingPeriodId: string
    usageMonth: string
    page?: number
    pageSize?: number
  } & MonthlyCostBaseLineListFilters,
): Promise<{
  run: MonthlyCostRunDto | null
  rows: MonthlyCostBaseLineDto[]
  total: number
  page: number
  pageSize: number
}> {
  const onlyWithProject = input.onlyWithProject ?? true
  const page = Math.max(1, input.page ?? 1)
  const pageSize = Math.min(200, Math.max(1, input.pageSize ?? 20))
  const offset = (page - 1) * pageSize

  const run = await findLatestMonthlyCostRun(input)
  if (!run) {
    return { run: null, rows: [], total: 0, page, pageSize }
  }

  const where = baseLineConditions({
    runId: run.id,
    onlyWithProject,
    search: input.search,
    opportunitySource: input.opportunitySource,
    dataCenterId: input.dataCenterId,
    accountManagerStaffId: input.accountManagerStaffId,
  })

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(monthlyCostBaseLine)
    .leftJoin(billingTenant, eq(billingTenant.id, monthlyCostBaseLine.tenantId))
    .where(where)

  const rows = await baseLineFrom()
    .where(where)
    .orderBy(
      desc(monthlyCostBaseLine.balanceConsumption),
      monthlyCostBaseLine.tenantPlatformId,
    )
    .limit(pageSize)
    .offset(offset)

  return {
    run: mapRun(run),
    rows: rows.map((r) =>
      mapBaseLine({
        ...r.line,
        projectName: r.projectName,
        tenantName: r.tenantName,
        dataCenterName: r.dataCenterName,
      }),
    ),
    total: countRow?.count ?? 0,
    page,
    pageSize,
  }
}

export async function listAllBaseLines(
  input: {
    billingPeriodId: string
    usageMonth: string
  } & MonthlyCostBaseLineListFilters,
): Promise<{ run: MonthlyCostRunDto | null; rows: MonthlyCostBaseLineDto[] }> {
  const onlyWithProject = input.onlyWithProject ?? true
  const run = await findLatestMonthlyCostRun(input)
  if (!run) return { run: null, rows: [] }

  const where = baseLineConditions({
    runId: run.id,
    onlyWithProject,
    search: input.search,
    opportunitySource: input.opportunitySource,
    dataCenterId: input.dataCenterId,
    accountManagerStaffId: input.accountManagerStaffId,
  })

  const rows = await baseLineFrom()
    .where(where)
    .orderBy(
      desc(monthlyCostBaseLine.balanceConsumption),
      monthlyCostBaseLine.tenantPlatformId,
    )

  return {
    run: mapRun(run),
    rows: rows.map((r) =>
      mapBaseLine({
        ...r.line,
        projectName: r.projectName,
        tenantName: r.tenantName,
        dataCenterName: r.dataCenterName,
      }),
    ),
  }
}

export async function listBaseLineFilterOptions(input: {
  billingPeriodId: string
  usageMonth: string
}): Promise<MonthlyCostBaseLineFilterOptionsDto> {
  const run = await findLatestMonthlyCostRun(input)
  if (!run) {
    return { opportunitySources: [], dataCenters: [], accountManagers: [] }
  }

  const [dcRows, amRows, oppRows] = await Promise.all([
    db
      .selectDistinct({
        id: monthlyCostBaseLine.dataCenterId,
        name: dataCenter.name,
      })
      .from(monthlyCostBaseLine)
      .leftJoin(dataCenter, eq(dataCenter.id, monthlyCostBaseLine.dataCenterId))
      .where(
        and(
          eq(monthlyCostBaseLine.runId, run.id),
          isNotNull(monthlyCostBaseLine.dataCenterId),
        ),
      ),
    db
      .selectDistinct({
        staffId: monthlyCostBaseLine.accountManagerStaffId,
        name: monthlyCostBaseLine.accountManagerName,
      })
      .from(monthlyCostBaseLine)
      .where(
        and(
          eq(monthlyCostBaseLine.runId, run.id),
          isNotNull(monthlyCostBaseLine.accountManagerStaffId),
        ),
      ),
    db
      .selectDistinct({
        value: monthlyCostBaseLine.opportunitySource,
      })
      .from(monthlyCostBaseLine)
      .where(
        and(
          eq(monthlyCostBaseLine.runId, run.id),
          isNotNull(monthlyCostBaseLine.opportunitySource),
        ),
      ),
  ])

  const opportunitySources = OPPORTUNITY_SOURCE_VALUES.filter((v) =>
    oppRows.some((r) => r.value === v),
  ).map((value) => ({
    value,
    label: OPPORTUNITY_SOURCE_LABELS[value],
  }))

  return {
    opportunitySources,
    dataCenters: dcRows
      .filter((r): r is { id: string; name: string } => Boolean(r.id && r.name))
      .map((r) => ({ id: r.id, name: r.name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
    accountManagers: amRows
      .filter((r): r is { staffId: string; name: string } => Boolean(r.staffId && r.name))
      .map((r) => ({ staffId: r.staffId, name: r.name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
  }
}

export async function getMonthlyCostBundle(input: {
  billingPeriodId: string
  usageMonth: string
  costBranch?: MonthlyCostBranch
}): Promise<MonthlyCostBundle> {
  const costBranch = input.costBranch ?? DEFAULT_MONTHLY_COST_BRANCH
  const run = await findLatestMonthlyCostRun(input)

  if (!run) {
    return {
      run: null,
      commissionLines: [],
      commissionProjectLines: [],
      deptPoolLines: [],
      deptPoolProjectLines: [],
      costBranch,
    }
  }

  const projectMetrics = await loadProjectMetricsByRun({
    runId: run.id,
    costBranch,
  })

  const emptyMetrics = (): MonthlyCostProjectMetricsDto => ({
    balance_consumption: '0',
    balance_card_hours: '0',
    voucher_card_hours: '0',
    confirmed_revenue_excl_tax: '0',
    sold_duration_cost_excl_tax: '0',
    gifted_duration_cost_excl_tax: '0',
    gross_profit: '0',
  })

  const [
    commissionLines,
    commissionProjectLines,
    deptPoolLines,
    deptPoolProjectLines,
    projectTenantRows,
  ] = await Promise.all([
    db
      .select()
      .from(monthlyCostCommissionLine)
      .where(
        and(
          eq(monthlyCostCommissionLine.runId, run.id),
          eq(monthlyCostCommissionLine.costBranch, costBranch),
        ),
      ),
    db
      .select()
      .from(monthlyCostCommissionProjectLine)
      .where(
        and(
          eq(monthlyCostCommissionProjectLine.runId, run.id),
          eq(monthlyCostCommissionProjectLine.costBranch, costBranch),
          eq(
            monthlyCostCommissionProjectLine.recipientRole,
            MONTHLY_COST_RECIPIENT_ROLES.salesIndividual,
          ),
        ),
      ),
    db
      .select()
      .from(monthlyCostDeptPoolLine)
      .where(
        and(
          eq(monthlyCostDeptPoolLine.runId, run.id),
          eq(monthlyCostDeptPoolLine.costBranch, costBranch),
        ),
      ),
    db
      .select()
      .from(monthlyCostDeptPoolProjectLine)
      .where(
        and(
          eq(monthlyCostDeptPoolProjectLine.runId, run.id),
          eq(monthlyCostDeptPoolProjectLine.costBranch, costBranch),
        ),
      ),
    // 部门池项目行未冗余租户；从同次 run 基线按项目取平台租户 Id
    db
      .selectDistinct({
        projectId: monthlyCostBaseLine.projectId,
        tenantPlatformId: monthlyCostBaseLine.tenantPlatformId,
      })
      .from(monthlyCostBaseLine)
      .where(
        and(
          eq(monthlyCostBaseLine.runId, run.id),
          isNotNull(monthlyCostBaseLine.projectId),
        ),
      ),
  ])

  const tenantIdByProject = new Map<string, string>()
  for (const row of projectTenantRows) {
    if (!row.projectId) continue
    const existing = tenantIdByProject.get(row.projectId)
    if (!existing) {
      tenantIdByProject.set(row.projectId, row.tenantPlatformId)
      continue
    }
    if (!existing.split(', ').includes(row.tenantPlatformId)) {
      tenantIdByProject.set(row.projectId, `${existing}, ${row.tenantPlatformId}`)
    }
  }

  return {
    run: mapRun(run),
    commissionLines: commissionLines.map((r) => ({
      account_manager_name: r.accountManagerName,
      opportunity_source: r.opportunitySource as MonthlyCostBundle['commissionLines'][0]['opportunity_source'],
      opportunity_source_label: r.opportunitySourceLabel,
      customer_incentive_label: r.customerIncentiveLabel,
      gross_profit_sum: r.grossProfitSum,
      commission_rate: r.commissionRate,
      commission_amount: r.commissionAmount,
    })),
    commissionProjectLines: commissionProjectLines.map((r) => ({
      id: r.id,
      project_id: r.projectId,
      project_name: r.projectName,
      account_manager_name: r.accountManagerName,
      opportunity_source: r.opportunitySource as MonthlyCostBundle['commissionProjectLines'][0]['opportunity_source'],
      opportunity_source_label: r.opportunitySource
        ? MONTHLY_COST_OPPORTUNITY_SHORT_LABELS[
            r.opportunitySource as keyof typeof MONTHLY_COST_OPPORTUNITY_SHORT_LABELS
          ]
        : null,
      customer_incentive_label: r.customerIncentiveLabel,
      gross_profit_base: r.grossProfitBase,
      commission_rate: r.commissionRate,
      commission_amount: r.commissionAmount,
    })),
    deptPoolLines: deptPoolLines.map((r) => ({
      id: r.id,
      recipient_dept: r.recipientDept,
      customer_incentive_label: r.customerIncentiveLabel,
      gross_profit_base_sum: r.grossProfitBaseSum,
      commission_pool_sum: r.commissionPoolSum,
      project_count: r.projectCount,
      pool_scope_note: r.poolScopeNote,
    })),
    deptPoolProjectLines: deptPoolProjectLines.map((r) => ({
      id: r.id,
      dept_pool_line_id: r.deptPoolLineId,
      recipient_dept: r.recipientDept,
      project_id: r.projectId,
      tenant_id: tenantIdByProject.get(r.projectId) ?? '',
      project_name: r.projectName,
      opportunity_source_label: r.opportunitySourceLabel,
      customer_incentive_label: r.customerIncentiveLabel,
      account_manager_name: r.accountManagerName,
      gross_profit_base: r.grossProfitBase,
      commission_pool_amount: r.commissionPoolAmount,
      metrics: projectMetrics.get(r.projectId) ?? emptyMetrics(),
    })),
    costBranch,
  }
}

export async function listMonthlyCostUsageMonths(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ usageMonth: monthlyCostRun.usageMonth })
    .from(monthlyCostRun)
    .where(eq(monthlyCostRun.status, 'completed'))
    .orderBy(desc(monthlyCostRun.usageMonth))
  return rows.map((r) => r.usageMonth)
}

export async function listMonthlyCostRunIssues(input: {
  billingPeriodId: string
  usageMonth: string
}): Promise<{
  run: MonthlyCostRunDto | null
  issues: MonthlyCostRunIssueDto[]
  warningCount: number
  errorCount: number
}> {
  const run = await findLatestMonthlyCostRun(input)
  if (!run) {
    return { run: null, issues: [], warningCount: 0, errorCount: 0 }
  }
  const parsed = parseRunIssues(run.errorSummary)
  return {
    run: mapRun(run),
    issues: parsed.issues,
    warningCount: parsed.warningCount,
    errorCount: parsed.errorCount,
  }
}

export async function listMonthlyCostProjectBaseLines(input: {
  billingPeriodId: string
  usageMonth: string
  projectId: string
}): Promise<{ run: MonthlyCostRunDto | null; rows: MonthlyCostBaseLineDto[] }> {
  const run = await findLatestMonthlyCostRun(input)
  if (!run) return { run: null, rows: [] }

  const rows = await baseLineFrom().where(
    and(
      eq(monthlyCostBaseLine.runId, run.id),
      eq(monthlyCostBaseLine.projectId, input.projectId),
    ),
  )
    .orderBy(
      desc(monthlyCostBaseLine.balanceConsumption),
      monthlyCostBaseLine.regionCode,
      monthlyCostBaseLine.gpuCardTypeName,
    )

  return {
    run: mapRun(run),
    rows: rows.map((r) =>
      mapBaseLine({
        ...r.line,
        projectName: r.projectName,
        tenantName: r.tenantName,
        dataCenterName: r.dataCenterName,
      }),
    ),
  }
}
