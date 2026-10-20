import { toMoneyString } from '@/lib/finance/income-row-utils'
import {
  DEFAULT_MONTHLY_COST_BRANCH,
  type MonthlyCostBranch,
} from '@/lib/monthly-cost/constants'
import { usageMonthFromPeriodCode } from '@/lib/monthly-cost/period-utils'
import { db } from '@/lib/db'
import {
  billingPeriod,
  billingTenant,
  crmProject,
  monthlyCostBaseLine,
  monthlyCostRun,
  projectMonthlyCostSnapshot,
} from '@workspace/db/schema'
import { and, eq, inArray, isNotNull, isNull, ne } from 'drizzle-orm'
import { FinanceError } from '../errors'
import { refreshBillingPeriodPeriodTotals } from '../billing-period-period-totals'
import { appendOperationLog, newId } from '../operation-log'
import { findLatestMonthlyCostRun } from './read'

function branchMetrics(
  line: typeof monthlyCostBaseLine.$inferSelect,
  branch: MonthlyCostBranch,
) {
  if (branch === 'platform_cost') {
    return {
      soldDurationCostExclTax:
        Number(line.pcSoldDurationCostExclTax) + Number(line.pcGiftedDurationCostExclTax),
      giftedDurationCostExclTax: Number(line.pcGiftedDurationCostExclTax),
      soldOnly: Number(line.pcSoldDurationCostExclTax),
      grossProfit: Number(line.pcGrossProfit),
    }
  }
  return {
    soldDurationCostExclTax:
      Number(line.spSoldDurationCostExclTax) + Number(line.spGiftedDurationCostExclTax),
    giftedDurationCostExclTax: Number(line.spGiftedDurationCostExclTax),
    soldOnly: Number(line.spSoldDurationCostExclTax),
    grossProfit: Number(line.spGrossProfit),
  }
}

type SnapshotGroup = {
  tenantPlatformId: string
  tenantId: string | null
  projectId: string | null
  projectName: string | null
  tenantName: string
  customerFullName: string | null
  accountManager: string | null
  opportunitySource: string | null
  balanceConsumption: number
  balanceCardHours: number
  voucherCardHours: number
  confirmedRevenueExclTax: number
  soldDurationCostExclTax: number
  giftedDurationCostExclTax: number
  grossProfit: number
  detailRows: Array<{
    data_center_name: string
    region: string
    card_type: string
    balance_consumption: string
    balance_card_hours: string
    voucher_card_hours: string
    confirmed_revenue_excl_tax: string
    sold_duration_cost_excl_tax: string
    gifted_duration_cost_excl_tax: string
    gross_profit: string
  }>
}

async function syncProjectSnapshotsFromRun(input: {
  runId: string
  billingPeriodId: string
  settlementMonth: string
  costBranch: MonthlyCostBranch
  savedByStaffId?: string | null
}): Promise<number> {
  const lines = await db
    .select({
      line: monthlyCostBaseLine,
      projectName: crmProject.name,
    })
    .from(monthlyCostBaseLine)
    .leftJoin(crmProject, eq(crmProject.id, monthlyCostBaseLine.projectId))
    .where(
      and(eq(monthlyCostBaseLine.runId, input.runId), isNotNull(monthlyCostBaseLine.projectId)),
    )

  if (lines.length === 0) return 0

  const platformIds = [...new Set(lines.map((r) => r.line.tenantPlatformId))]
  const tenantRows = await db
    .select({
      id: billingTenant.id,
      platformTenantId: billingTenant.platformTenantId,
      tenantName: billingTenant.name,
      customerId: billingTenant.customerId,
    })
    .from(billingTenant)
    .where(inArray(billingTenant.platformTenantId, platformIds))

  const tenantByPlatform = new Map(
    tenantRows
      .filter((t) => t.platformTenantId)
      .map((t) => [t.platformTenantId!, t]),
  )

  const groups = new Map<string, SnapshotGroup>()

  for (const { line, projectName } of lines) {
    const metrics = branchMetrics(line, input.costBranch)
    const soldCost = metrics.soldOnly
    const giftedCost = metrics.giftedDurationCostExclTax

    const key = line.tenantPlatformId
    const tenant = tenantByPlatform.get(line.tenantPlatformId)
    const existing = groups.get(key) ?? {
      tenantPlatformId: line.tenantPlatformId,
      tenantId: line.tenantId ?? tenant?.id ?? null,
      projectId: line.projectId,
      projectName: projectName ?? null,
      tenantName: tenant?.tenantName ?? line.tenantPlatformId,
      customerFullName: line.customerFullName,
      accountManager: line.accountManagerName,
      opportunitySource: line.opportunitySource,
      balanceConsumption: 0,
      balanceCardHours: 0,
      voucherCardHours: 0,
      confirmedRevenueExclTax: 0,
      soldDurationCostExclTax: 0,
      giftedDurationCostExclTax: 0,
      grossProfit: 0,
      detailRows: [],
    }

    existing.balanceConsumption += Number(line.balanceConsumption) || 0
    existing.balanceCardHours += Number(line.balanceCardHours) || 0
    existing.voucherCardHours += Number(line.voucherCardHours) || 0
    existing.confirmedRevenueExclTax += Number(line.confirmedRevenueExclTax) || 0
    existing.soldDurationCostExclTax += soldCost
    existing.giftedDurationCostExclTax += giftedCost
    existing.grossProfit += metrics.grossProfit
    existing.detailRows.push({
      data_center_name: line.regionCode,
      region: line.regionCode,
      card_type: line.gpuCardTypeName ?? line.productLine,
      balance_consumption: toMoneyString(Number(line.balanceConsumption) || 0),
      balance_card_hours: toMoneyString(Number(line.balanceCardHours) || 0),
      voucher_card_hours: toMoneyString(Number(line.voucherCardHours) || 0),
      confirmed_revenue_excl_tax: toMoneyString(Number(line.confirmedRevenueExclTax) || 0),
      sold_duration_cost_excl_tax: toMoneyString(soldCost),
      gifted_duration_cost_excl_tax: toMoneyString(giftedCost),
      gross_profit: toMoneyString(metrics.grossProfit),
    })
    groups.set(key, existing)
  }

  const savedAt = new Date()
  let savedCount = 0

  for (const group of groups.values()) {
    if (!group.tenantId) continue

    const rowValues = {
      billingPeriodId: input.billingPeriodId,
      settlementMonth: input.settlementMonth,
      tenantId: group.tenantId,
      tenantPlatformId: group.tenantPlatformId,
      tenantName: group.tenantName,
      projectId: group.projectId,
      projectName: group.projectName,
      customerId: tenantByPlatform.get(group.tenantPlatformId)?.customerId ?? null,
      customerFullName: group.customerFullName,
      accountManager: group.accountManager,
      opportunitySource: group.opportunitySource,
      balanceConsumption: toMoneyString(group.balanceConsumption),
      balanceCardHours: toMoneyString(group.balanceCardHours),
      voucherCardHours: toMoneyString(group.voucherCardHours),
      confirmedRevenueExclTax: toMoneyString(group.confirmedRevenueExclTax),
      soldDurationCostExclTax: toMoneyString(group.soldDurationCostExclTax),
      giftedDurationCostExclTax: toMoneyString(group.giftedDurationCostExclTax),
      grossProfit: toMoneyString(group.grossProfit),
      metadata: {
        detail_rows: group.detailRows,
        source: 'monthly_cost_confirm',
        cost_branch: input.costBranch,
        run_id: input.runId,
      },
      savedBy: input.savedByStaffId ?? null,
      savedAt,
    }

    await db
      .insert(projectMonthlyCostSnapshot)
      .values({ id: newId(), ...rowValues })
      .onConflictDoUpdate({
        target: [
          projectMonthlyCostSnapshot.billingPeriodId,
          projectMonthlyCostSnapshot.tenantPlatformId,
        ],
        set: { ...rowValues, updatedAt: new Date() },
      })
    savedCount += 1
  }

  return savedCount
}

export async function confirmMonthlyCost(input: {
  billingPeriodId: string
  usageMonth: string
  costBranch?: MonthlyCostBranch
  actorId?: string | null
}): Promise<{
  runId: string
  confirmedAt: string
  confirmedCostBranch: MonthlyCostBranch
  projectCost: string
  totalGrossProfit: string
  snapshotCount: number
  periodStatus: string
}> {
  const costBranch = input.costBranch ?? DEFAULT_MONTHLY_COST_BRANCH

  const period = await db.query.billingPeriod.findFirst({
    where: eq(billingPeriod.id, input.billingPeriodId),
  })
  if (!period) throw new FinanceError('NOT_FOUND', '账期不存在')
  if (period.status === 'void') {
    throw new FinanceError('PRECONDITION_FAILED', '作废账期不可确认')
  }
  if (period.status === 'published') {
    throw new FinanceError('PRECONDITION_FAILED', '已发布账期不可重新确认，请先撤回发布')
  }

  let expectedUsageMonth: string
  try {
    expectedUsageMonth = usageMonthFromPeriodCode(period.periodCode)
  } catch {
    throw new FinanceError('BAD_REQUEST', `无法解析账期编码：${period.periodCode}`)
  }
  if (expectedUsageMonth !== input.usageMonth) {
    throw new FinanceError(
      'PRECONDITION_FAILED',
      `结算月 ${input.usageMonth} 与账期 ${period.periodCode} 不一致`,
    )
  }

  const run = await findLatestMonthlyCostRun({
    billingPeriodId: input.billingPeriodId,
    usageMonth: input.usageMonth,
  })
  if (!run) {
    throw new FinanceError('PRECONDITION_FAILED', '请先完成成本与提成跑批')
  }
  if (run.warningCount > 0) {
    throw new FinanceError(
      'PRECONDITION_FAILED',
      `存在 ${run.warningCount} 条警告，请先处理后再确认`,
    )
  }
  if (run.deptDistributionStatus === 'pending') {
    throw new FinanceError('PRECONDITION_FAILED', '部门池权重分配未完成，请先维护权重')
  }

  const projectLines = await db
    .select()
    .from(monthlyCostBaseLine)
    .where(
      and(eq(monthlyCostBaseLine.runId, run.id), isNotNull(monthlyCostBaseLine.projectId)),
    )

  let projectCostAcc = 0
  let totalGrossProfitAcc = 0
  for (const line of projectLines) {
    const metrics = branchMetrics(line, costBranch)
    const revenue = Number(line.confirmedRevenueExclTax) || 0
    projectCostAcc += revenue - metrics.grossProfit
    totalGrossProfitAcc += metrics.grossProfit
  }

  const confirmedAt = new Date()

  await db.transaction(async (tx) => {
    await tx
      .update(monthlyCostRun)
      .set({
        confirmedAt: null,
        confirmedBy: null,
        confirmedCostBranch: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(monthlyCostRun.billingPeriodId, input.billingPeriodId),
          eq(monthlyCostRun.usageMonth, input.usageMonth),
          isNotNull(monthlyCostRun.confirmedAt),
          ne(monthlyCostRun.id, run.id),
        ),
      )

    await tx
      .update(monthlyCostRun)
      .set({
        confirmedAt,
        confirmedBy: input.actorId ?? null,
        confirmedCostBranch: costBranch,
        updatedAt: new Date(),
      })
      .where(eq(monthlyCostRun.id, run.id))
  })

  const snapshotCount = await syncProjectSnapshotsFromRun({
    runId: run.id,
    billingPeriodId: input.billingPeriodId,
    settlementMonth: period.periodCode,
    costBranch,
    savedByStaffId: input.actorId,
  })

  const hasIncome =
    period.incomeTotal != null && Number(period.incomeTotal) > 0
  await refreshBillingPeriodPeriodTotals(input.billingPeriodId, {
    projectCost: projectCostAcc,
    internalUserCost: 0,
    totalCost: projectCostAcc,
    totalGrossProfit: totalGrossProfitAcc,
    lastComputedAt: confirmedAt,
    ...(hasIncome ? { status: 'computed' } : {}),
  })

  await appendOperationLog({
    billingPeriodId: input.billingPeriodId,
    operation: 'confirm_monthly_cost',
    actorId: input.actorId,
    metadata: {
      runId: run.id,
      usageMonth: input.usageMonth,
      costBranch,
      projectCost: projectCostAcc,
      totalGrossProfit: totalGrossProfitAcc,
      snapshotCount,
    },
  })

  const updatedPeriod = await db.query.billingPeriod.findFirst({
    where: eq(billingPeriod.id, input.billingPeriodId),
  })

  return {
    runId: run.id,
    confirmedAt: confirmedAt.toISOString(),
    confirmedCostBranch: costBranch,
    projectCost: toMoneyString(projectCostAcc),
    totalGrossProfit: toMoneyString(totalGrossProfitAcc),
    snapshotCount,
    periodStatus: updatedPeriod?.status ?? period.status,
  }
}
