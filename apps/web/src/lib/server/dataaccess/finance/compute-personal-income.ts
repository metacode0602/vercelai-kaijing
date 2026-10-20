import { db } from '@/lib/db'
import {
  classifyPersonalIncomeSegment,
  PERSONAL_INCOME_AMOUNT_TOLERANCE,
  PERSONAL_INCOME_SUMMARY_DISPLAY_ORDER,
  PERSONAL_INCOME_SUMMARY_KINDS,
  type BaremetalSourceMode,
  type PersonalIncomeSegment,
  type PersonalIncomeSummaryKind,
} from '@/lib/finance/personal-income-core'
import { parseMoney, toMoneyString } from '@/lib/finance/income-row-utils'
import {
  billingPeriod,
  billingPeriodPersonalIncomeSummary,
  billingPeriodPersonalIncomeTenantLine,
  billingPeriodRawBaremetalOrder,
  billingPeriodRawTenantBill,
  billingPeriodReconciliationReport,
  billingTenant,
  platformIncomeMonthly,
} from '@workspace/db/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { PERSONAL_INCOME_RULE_VERSION } from './constants'
import { FinanceError } from './errors'
import { financeLog } from './logger'
import { listExcludedInternalPlatformIdsForPeriod } from './internal-tenant-income-exclusion'
import { appendOperationLog, newId } from './operation-log'
import { buildActiveBlacklistPlatformIdSet } from './personal-income-blacklist'
import {
  isNewBareMetalRawBillRow,
} from './personal-income-bill-rows'
import {
  listExcludedProjectTenants,
  listProjectLinkedPlatformTenantIds,
} from './personal-income-tenants'
import {
  assertPersonalImportsReady,
  getPersonalImportBatches,
  resolveBaremetalSourceMode,
} from './purge-personal'

export type PersonalIncomeReconciliationDto = {
  excel_computed_balance_total: string
  enterprise_project_total_consumption: string
  personal_non_project_total_consumption: string
  blacklist_total_consumption: string
  internal_total_consumption: string
  four_segment_sum: string
  four_segment_matches_excel: boolean
  enterprise_crm_total_consumption: string | null
  enterprise_cross_check_delta: string | null
  baremetal_source_mode: BaremetalSourceMode
}

export type ComputePersonalIncomeResult = {
  summaries: Array<{
    summary_kind: PersonalIncomeSummaryKind
    balance_consumption: string
    bare_metal_consumption: string
    total_consumption: string
    matched_tenant_count: number
  }>
  personalTenantCount: number
  blacklistTenantCount: number
  reconciliationIssues: string[]
  reconciliation: PersonalIncomeReconciliationDto
}

type TenantAgg = {
  balance: number
  bare: number
  voucher: number
  customerTypeLabel: string | null
  customerName: string | null
}

function addToAgg(map: Map<string, TenantAgg>, tenantId: string, patch: Partial<TenantAgg>) {
  const key = tenantId.trim()
  const cur = map.get(key) ?? {
    balance: 0,
    bare: 0,
    voucher: 0,
    customerTypeLabel: null,
    customerName: null,
  }
  map.set(key, {
    balance: cur.balance + (patch.balance ?? 0),
    bare: cur.bare + (patch.bare ?? 0),
    voucher: cur.voucher + (patch.voucher ?? 0),
    customerTypeLabel: patch.customerTypeLabel ?? cur.customerTypeLabel,
    customerName: patch.customerName ?? cur.customerName,
  })
}

function sumSegment(
  segment: PersonalIncomeSegment,
  tenantLines: Map<string, { segment: PersonalIncomeSegment; agg: TenantAgg }>,
): { balance: number; bare: number; count: number; total: number } {
  let balance = 0
  let bare = 0
  let count = 0
  let total = 0
  for (const { segment: seg, agg } of tenantLines.values()) {
    if (seg !== segment) continue
    const t = agg.balance + agg.bare
    if (t <= 0) continue
    balance += agg.balance
    bare += agg.bare
    total += t
    count += 1
  }
  return { balance, bare, count, total }
}

async function loadPeriodOrThrow(periodId: string) {
  const period = await db.query.billingPeriod.findFirst({
    where: eq(billingPeriod.id, periodId),
  })
  if (!period) throw new FinanceError('NOT_FOUND', '账期不存在')
  if (period.status === 'void') {
    throw new FinanceError('CONFLICT', '作废账期不可计算')
  }
  if (period.status === 'published') {
    throw new FinanceError('CONFLICT', '已发布账期须先撤回发布后再计算个人收入')
  }
  return period
}

export async function computePersonalPeriodIncome(input: {
  billingPeriodId: string
  actorId?: string | null
}): Promise<ComputePersonalIncomeResult> {
  const periodId = input.billingPeriodId
  await loadPeriodOrThrow(periodId)
  const batches = await getPersonalImportBatches(periodId)
  assertPersonalImportsReady(batches)
  const baremetalSourceMode = resolveBaremetalSourceMode(batches)

  financeLog('compute-personal-income', 'start', {
    periodId,
    ruleVersion: PERSONAL_INCOME_RULE_VERSION,
    baremetalSourceMode,
  })

  const billRows = await db
    .select()
    .from(billingPeriodRawTenantBill)
    .where(eq(billingPeriodRawTenantBill.batchId, batches.tenantBill!.id))

  const bareRows =
    baremetalSourceMode === 'db' && batches.baremetal
      ? await db
          .select()
          .from(billingPeriodRawBaremetalOrder)
          .where(eq(billingPeriodRawBaremetalOrder.batchId, batches.baremetal.id))
      : []

  const agg = new Map<string, TenantAgg>()
  const tAll = new Set<string>()
  let excelNewBareMetalRowCount = 0

  for (const row of billRows) {
    tAll.add(row.tenantPlatformId)
    const isBare = isNewBareMetalRawBillRow(row)
    if (isBare) excelNewBareMetalRowCount += 1

    if (isBare && baremetalSourceMode === 'excel') {
      addToAgg(agg, row.tenantPlatformId, {
        bare: parseMoney(row.balanceConsumption),
        voucher: parseMoney(row.voucherConsumption),
        customerTypeLabel: row.customerTypeLabel,
        customerName: row.customerName,
      })
    } else if (!isBare) {
      addToAgg(agg, row.tenantPlatformId, {
        balance: parseMoney(row.balanceConsumption),
        voucher: parseMoney(row.voucherConsumption),
        customerTypeLabel: row.customerTypeLabel,
        customerName: row.customerName,
      })
    } else {
      addToAgg(agg, row.tenantPlatformId, {
        voucher: parseMoney(row.voucherConsumption),
        customerTypeLabel: row.customerTypeLabel,
        customerName: row.customerName,
      })
    }
  }

  if (baremetalSourceMode === 'db') {
    for (const row of bareRows) {
      tAll.add(row.tenantPlatformId)
      addToAgg(agg, row.tenantPlatformId, {
        bare: parseMoney(row.finalAmount),
      })
    }
  }

  if (tAll.size === 0) {
    throw new FinanceError('PRECONDITION_FAILED', 'Excel 中无有效租户，请检查上传文件')
  }

  const projectLinked = await listProjectLinkedPlatformTenantIds([...tAll])
  const internalIds = new Set(
    await listExcludedInternalPlatformIdsForPeriod(periodId, [...tAll]),
  )
  const blacklistIds = await buildActiveBlacklistPlatformIdSet()
  const issues: string[] = []

  if (baremetalSourceMode === 'excel' && excelNewBareMetalRowCount === 0) {
    issues.push('未导入裸金属订单，且 Excel 中无「新版裸金属」行，线上裸金属消费将为 0')
  }
  if (baremetalSourceMode === 'db' && excelNewBareMetalRowCount > 0) {
    issues.push(
      `已读库导入：Excel 中 ${excelNewBareMetalRowCount} 行「新版裸金属」已忽略，裸金属以订单余额支付为准`,
    )
  }

  const tenantLines = new Map<string, { segment: PersonalIncomeSegment; agg: TenantAgg }>()
  for (const [tenantId, tenantAgg] of agg) {
    const segment = classifyPersonalIncomeSegment({
      platformTenantId: tenantId,
      internalIds,
      projectLinkedIds: projectLinked,
      blacklistIds,
    })
    tenantLines.set(tenantId, { segment, agg: tenantAgg })
  }

  const summaryRows = PERSONAL_INCOME_SUMMARY_DISPLAY_ORDER.map((kind) => {
    const totals = sumSegment(kind, tenantLines)
    return {
      kind,
      balance: totals.balance,
      bare: totals.bare,
      count: totals.count,
      total: totals.total,
    }
  })

  const excelComputedTotal = [...tenantLines.values()].reduce(
    (s, { agg }) => s + agg.balance + agg.bare,
    0,
  )
  const fourSegmentSum = summaryRows.reduce((s, r) => s + r.total, 0)

  if (Math.abs(fourSegmentSum - excelComputedTotal) > PERSONAL_INCOME_AMOUNT_TOLERANCE) {
    throw new FinanceError(
      'UNPROCESSABLE',
      `四段合计 ${fourSegmentSum.toFixed(4)} 与 Excel 全量 ${excelComputedTotal.toFixed(4)} 不一致`,
    )
  }

  for (const row of summaryRows) {
    const lineSum = sumSegment(row.kind, tenantLines)
    if (
      Math.abs(lineSum.balance - row.balance) > PERSONAL_INCOME_AMOUNT_TOLERANCE ||
      Math.abs(lineSum.bare - row.bare) > PERSONAL_INCOME_AMOUNT_TOLERANCE
    ) {
      throw new FinanceError('UNPROCESSABLE', `汇总行 ${row.kind} 与租户明细不一致`)
    }
  }

  const enterpriseProjectTotal =
    summaryRows.find((r) => r.kind === PERSONAL_INCOME_SUMMARY_KINDS.enterpriseProject)?.total ??
    0

  let enterpriseCrossCheckDelta: number | null = null
  let enterpriseCrmTotal: number | null = null
  const projectTenantIds = [...tenantLines.entries()]
    .filter(([, v]) => v.segment === PERSONAL_INCOME_SUMMARY_KINDS.enterpriseProject)
    .map(([id]) => id)

  if (projectTenantIds.length > 0) {
    const crmRows = await db
      .select({ total: platformIncomeMonthly.totalConsumption })
      .from(platformIncomeMonthly)
      .where(
        and(
          eq(platformIncomeMonthly.billingPeriodId, periodId),
          inArray(platformIncomeMonthly.tenantPlatformId, projectTenantIds),
        ),
      )
    const crmTotal = crmRows.reduce((s, r) => s + parseMoney(r.total), 0)
    enterpriseCrmTotal = crmTotal
    enterpriseCrossCheckDelta = enterpriseProjectTotal - crmTotal
    if (Math.abs(enterpriseCrossCheckDelta) > PERSONAL_INCOME_AMOUNT_TOLERANCE) {
      issues.push(
        `B 端 Excel 合计 ${enterpriseProjectTotal.toFixed(2)} 与 CRM 企业收入 ${crmTotal.toFixed(2)} 偏差 ${enterpriseCrossCheckDelta.toFixed(2)}`,
      )
    }
  }

  const excluded = await listExcludedProjectTenants([...tAll].filter((id) => projectLinked.has(id)))
  if (excluded.length > 0) {
    issues.push(`已纳入 B 端分段的项目关联租户 ${excluded.length} 个（详见底部列表）`)
  }

  const personalTenantIds = [...tenantLines.entries()]
    .filter(
      ([, v]) =>
        v.segment === PERSONAL_INCOME_SUMMARY_KINDS.nonProject ||
        v.segment === PERSONAL_INCOME_SUMMARY_KINDS.blacklist,
    )
    .map(([id]) => id)

  const knownRows =
    personalTenantIds.length > 0
      ? await db
          .select({ platformTenantId: billingTenant.platformTenantId })
          .from(billingTenant)
          .where(inArray(billingTenant.platformTenantId, personalTenantIds))
      : []
  const knownIds = new Set(knownRows.map((r) => r.platformTenantId).filter(Boolean))
  const unknownCount = personalTenantIds.filter((id) => !knownIds.has(id)).length
  if (unknownCount > 0) {
    issues.push(`警告：${unknownCount} 个平台租户 ID 未在 CRM 主数据中登记，仍计入汇总`)
  }

  const nonProjectCount =
    summaryRows.find((r) => r.kind === PERSONAL_INCOME_SUMMARY_KINDS.nonProject)?.count ?? 0
  const blacklistCount =
    summaryRows.find((r) => r.kind === PERSONAL_INCOME_SUMMARY_KINDS.blacklist)?.count ?? 0

  const reconciliation: PersonalIncomeReconciliationDto = {
    excel_computed_balance_total: toMoneyString(excelComputedTotal),
    enterprise_project_total_consumption: toMoneyString(enterpriseProjectTotal),
    personal_non_project_total_consumption: toMoneyString(
      summaryRows.find((r) => r.kind === PERSONAL_INCOME_SUMMARY_KINDS.nonProject)?.total ?? 0,
    ),
    blacklist_total_consumption: toMoneyString(
      summaryRows.find((r) => r.kind === PERSONAL_INCOME_SUMMARY_KINDS.blacklist)?.total ?? 0,
    ),
    internal_total_consumption: toMoneyString(
      summaryRows.find((r) => r.kind === PERSONAL_INCOME_SUMMARY_KINDS.internal)?.total ?? 0,
    ),
    four_segment_sum: toMoneyString(fourSegmentSum),
    four_segment_matches_excel: true,
    enterprise_crm_total_consumption:
      enterpriseCrmTotal != null ? toMoneyString(enterpriseCrmTotal) : null,
    enterprise_cross_check_delta:
      enterpriseCrossCheckDelta != null ? toMoneyString(enterpriseCrossCheckDelta) : null,
    baremetal_source_mode: baremetalSourceMode,
  }

  const now = new Date()
  const reportJson = {
    ruleVersion: PERSONAL_INCOME_RULE_VERSION,
    baremetalSourceMode,
    blacklistMatchMode: 'active_open',
    excelNewBareMetalRowCount,
    tenantCounts: {
      inExcel: tAll.size,
      projectLinked: projectLinked.size,
      personalNonProject: nonProjectCount,
      blacklist: blacklistCount,
      internal: summaryRows.find((r) => r.kind === PERSONAL_INCOME_SUMMARY_KINDS.internal)?.count ?? 0,
    },
    excludedProjectTenants: excluded,
    reconciliation,
    issues,
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(billingPeriodPersonalIncomeTenantLine)
      .where(eq(billingPeriodPersonalIncomeTenantLine.billingPeriodId, periodId))
    await tx
      .delete(billingPeriodPersonalIncomeSummary)
      .where(eq(billingPeriodPersonalIncomeSummary.billingPeriodId, periodId))

    for (const [tenantId, { segment, agg: tenantAgg }] of tenantLines) {
      const total = tenantAgg.balance + tenantAgg.bare
      await tx.insert(billingPeriodPersonalIncomeTenantLine).values({
        id: newId(),
        billingPeriodId: periodId,
        platformTenantId: tenantId,
        segment,
        customerTypeLabel: tenantAgg.customerTypeLabel,
        customerName: tenantAgg.customerName,
        balanceConsumption: toMoneyString(tenantAgg.balance),
        bareMetalConsumption: toMoneyString(tenantAgg.bare),
        totalConsumption: toMoneyString(total),
        voucherConsumption: toMoneyString(tenantAgg.voucher),
        ruleVersion: PERSONAL_INCOME_RULE_VERSION,
        lastComputedAt: now,
      })
    }

    for (const row of summaryRows) {
      await tx.insert(billingPeriodPersonalIncomeSummary).values({
        id: newId(),
        billingPeriodId: periodId,
        summaryKind: row.kind,
        balanceConsumption: toMoneyString(row.balance),
        bareMetalConsumption: toMoneyString(row.bare),
        totalConsumption: toMoneyString(row.total),
        matchedTenantCount: row.count,
        tenantBillBatchId: batches.tenantBill!.id,
        baremetalBatchId: batches.baremetal?.id ?? null,
        ruleVersion: PERSONAL_INCOME_RULE_VERSION,
        lastComputedAt: now,
      })
    }

    const existingReport = await tx.query.billingPeriodReconciliationReport.findFirst({
      where: eq(billingPeriodReconciliationReport.billingPeriodId, periodId),
    })
    const mergedReport = {
      ...(typeof existingReport?.reportJson === 'object' && existingReport.reportJson !== null
        ? (existingReport.reportJson as Record<string, unknown>)
        : {}),
      personalIncome: reportJson,
    }
    if (existingReport) {
      await tx
        .update(billingPeriodReconciliationReport)
        .set({
          reportJson: mergedReport,
          ruleVersion: PERSONAL_INCOME_RULE_VERSION,
        })
        .where(eq(billingPeriodReconciliationReport.id, existingReport.id))
    } else {
      await tx.insert(billingPeriodReconciliationReport).values({
        id: newId(),
        billingPeriodId: periodId,
        reportJson: mergedReport,
        ruleVersion: PERSONAL_INCOME_RULE_VERSION,
      })
    }
  })

  await appendOperationLog({
    billingPeriodId: periodId,
    operation: 'compute_personal_income',
    actorId: input.actorId,
    metadata: {
      ruleVersion: PERSONAL_INCOME_RULE_VERSION,
      baremetalSourceMode,
      personalTenantCount: nonProjectCount,
      blacklistTenantCount: blacklistCount,
    },
  })

  const summaries = summaryRows.map((row) => ({
    summary_kind: row.kind,
    balance_consumption: toMoneyString(row.balance),
    bare_metal_consumption: toMoneyString(row.bare),
    total_consumption: toMoneyString(row.total),
    matched_tenant_count: row.count,
  }))

  const { refreshBillingPeriodPeriodTotals } = await import('./billing-period-period-totals')
  await refreshBillingPeriodPeriodTotals(periodId)

  financeLog('compute-personal-income', 'done', {
    periodId,
    personalTenantCount: nonProjectCount,
    fourSegmentSum,
  })

  return {
    summaries,
    personalTenantCount: nonProjectCount,
    blacklistTenantCount: blacklistCount,
    reconciliationIssues: issues,
    reconciliation,
  }
}
