/**
 * 单账期企业收入计算。
 * 数据源：CRM `tenant_bill`（按 bill_month = period_code）+ `tenant_bill_detail`。
 * 不读取 consumption_usage_daily / tenant_consumption_daily_detail 等每日消耗表。
 */
import { db } from '@/lib/db'
import {
  billingPeriod,
  billingPeriodReconciliationReport,
  platformIncomeMonthly,
  tenantBill,
  tenantBillDetail,
} from '@workspace/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { computeTotalConsumption, toMoneyString } from '@/lib/finance/income-row-utils'
import { TENANT_METAL_PRODUCT_LINE } from '@/lib/server/dataaccess/crm/tenant-billing-lists'
import type { ComputeIncomeResult } from './compute-income-shared'
import { stepI5UpdatePeriodIncomeTotals } from './billing-period-period-totals'
import { RULE_VERSION } from './constants'
import { FinanceError } from './errors'
import { financeLog } from './logger'
import { appendOperationLog, newId } from './operation-log'
import { getBillingPeriodDateRange } from './internal-tenant-income-exclusion'
import { listIncomeEligibleProjects } from './single-income-projects'
import type { SingleIncomeComputePayload, SingleIncomePreviewRow } from './single-income-types'
import {
  buildValidationIssueRows,
  SINGLE_INCOME_ISSUE_TYPE,
} from '@/lib/finance/single-income-issue-rows'
import type { SingleIncomeIssueRow } from '@/lib/finance/single-income-types'
import { validateSingleIncome } from './validate-single-income'

const AMOUNT_TOLERANCE = 0.01

function aggregateBillDetails(
  details: Array<{
    productLine: string | null
    amount: string
    balanceAmount: string
  }>,
): { bareMetalAmount: number; bareMetalBalance: number; balanceNonBare: number } {
  let bareMetalAmount = 0
  let bareMetalBalance = 0
  let balanceNonBare = 0
  for (const d of details) {
    const isBare = d.productLine === TENANT_METAL_PRODUCT_LINE
    if (isBare) {
      bareMetalAmount += Number(d.amount) || 0
      bareMetalBalance += Number(d.balanceAmount) || 0
    } else {
      balanceNonBare += Number(d.balanceAmount) || 0
    }
  }
  return { bareMetalAmount, bareMetalBalance, balanceNonBare }
}

function toPlatformIncomeMonthlyInsertRow(
  periodId: string,
  row: SingleIncomePreviewRow,
): typeof platformIncomeMonthly.$inferInsert {
  return {
    id: newId(),
    billingPeriodId: periodId,
    customerType: row.customerType,
    tenantId: row.tenantId,
    tenantPlatformId: row.platformTenantId,
    tenantName: row.tenantName,
    customerId: row.customerId,
    customerFullName: row.customerFullName,
    projectId: row.projectId,
    projectName: row.projectName,
    supplementaryConsumption: row.supplementaryConsumption,
    balanceConsumption: row.balanceConsumption,
    bareMetalConsumption: row.bareMetalConsumption,
    bareMetalBalanceConsumption: row.bareMetalBalanceConsumption,
    totalConsumption: row.totalConsumption,
  }
}

async function loadPeriodForSingleIncome(
  periodId: string,
  options?: { allowPublished?: boolean },
): Promise<{ periodCode: string }> {
  const period = await db.query.billingPeriod.findFirst({
    where: eq(billingPeriod.id, periodId),
  })
  if (!period) throw new FinanceError('NOT_FOUND', '账期不存在')
  if (period.status === 'void') {
    throw new FinanceError('CONFLICT', '作废账期不可计算')
  }
  if (!options?.allowPublished && period.status === 'published') {
    throw new FinanceError('CONFLICT', '已发布账期不可直接重算，请先撤回发布')
  }
  return { periodCode: period.periodCode }
}

async function loadSupplementaryByProject(
  periodId: string,
): Promise<Map<string, string>> {
  const existingRows = await db
    .select({
      projectId: platformIncomeMonthly.projectId,
      supplementaryConsumption: platformIncomeMonthly.supplementaryConsumption,
    })
    .from(platformIncomeMonthly)
    .where(eq(platformIncomeMonthly.billingPeriodId, periodId))

  const map = new Map<string, string>()
  for (const row of existingRows) {
    if (row.projectId) {
      map.set(row.projectId, row.supplementaryConsumption ?? '0')
    }
  }
  return map
}

function buildSummary(rows: SingleIncomePreviewRow[]) {
  let totalIncome = 0
  let balanceIncome = 0
  let baremetalIncome = 0
  let supplementary = 0
  for (const row of rows) {
    totalIncome += Number(row.totalConsumption) || 0
    balanceIncome += Number(row.balanceConsumption) || 0
    baremetalIncome += Number(row.bareMetalConsumption) || 0
    supplementary += Number(row.supplementaryConsumption) || 0
  }
  return {
    totalIncome: toMoneyString(totalIncome),
    balanceIncome: toMoneyString(balanceIncome),
    baremetalIncome: toMoneyString(baremetalIncome),
    supplementary: toMoneyString(supplementary),
  }
}

/** 试算 / 落库共用的收入行构建（不写库） */
export async function buildSinglePeriodIncomePayload(
  billingPeriodId: string,
  options?: { allowPublished?: boolean; preserveSupplementary?: boolean },
): Promise<SingleIncomeComputePayload> {
  const periodId = billingPeriodId
  const { periodCode } = await loadPeriodForSingleIncome(periodId, options)
  const validation = await validateSingleIncome(periodId)

  if (validation.projectsIncluded === 0) {
    throw new FinanceError(
      'PRECONDITION_FAILED',
      `账期 ${periodCode} 无具备平台租户 ID 且已同步 CRM 月度账单的项目，请先维护项目租户并同步账单`,
    )
  }

  const periodRange = await getBillingPeriodDateRange(periodId)
  const eligibleProjects = await listIncomeEligibleProjects(periodRange)
  const missingIds = new Set(
    validation.projectsMissingBill.map((m) => m.projectId),
  )
  const projectsToCompute = eligibleProjects.filter((p) => !missingIds.has(p.projectId))

  const tenantIds = [...new Set(projectsToCompute.map((p) => p.tenantId))]
  const bills =
    tenantIds.length > 0
      ? await db
          .select({
            id: tenantBill.id,
            tenantId: tenantBill.tenantId,
            totalAmount: tenantBill.totalAmount,
            balanceAmount: tenantBill.balanceAmount,
          })
          .from(tenantBill)
          .where(eq(tenantBill.billMonth, periodCode))
      : []

  const billByTenantId = new Map(
    bills
      .filter((b) => b.tenantId && tenantIds.includes(b.tenantId))
      .map((b) => [b.tenantId!, b]),
  )

  const billIds = bills.map((b) => b.id)
  const allDetails =
    billIds.length > 0
      ? await db
          .select()
          .from(tenantBillDetail)
          .where(inArray(tenantBillDetail.billId, billIds))
      : []

  const detailsByBillId = new Map<string, typeof allDetails>()
  for (const d of allDetails) {
    const list = detailsByBillId.get(d.billId) ?? []
    list.push(d)
    detailsByBillId.set(d.billId, list)
  }

  const supplementaryByProject =
    options?.preserveSupplementary !== false
      ? await loadSupplementaryByProject(periodId)
      : new Map<string, string>()

  const issues: string[] = []
  const projectDetailsById = new Map(
    eligibleProjects.map((p) => [
      p.projectId,
      {
        projectId: p.projectId,
        projectName: p.projectName,
        tenantId: p.tenantId,
        tenantName: p.tenantName,
        platformTenantId: p.platformTenantId,
        customerId: p.customerId,
        customerName: p.customerName,
      },
    ]),
  )
  const issueRows: SingleIncomeIssueRow[] = buildValidationIssueRows({
    projectDetailsById,
    projectsMissingBill: validation.projectsMissingBill,
    sharedPlatformTenantWarnings: validation.sharedPlatformTenantWarnings,
    canPreviewSingleIncome: validation.canPreviewSingleIncome,
    canComputeSingleIncome: validation.canComputeSingleIncome,
  })
  const rows: SingleIncomePreviewRow[] = []

  for (const p of validation.projectsMissingBill) {
    issues.push(
      `项目「${p.projectName}」（项目ID: ${p.projectId}）· 平台租户 ${p.platformTenantId}（租户ID: ${p.tenantId}，${p.tenantName}）：账期内无 CRM 月度账单，试算时将跳过`,
    )
  }

  for (const row of issueRows) {
    if (row.issueType === SINGLE_INCOME_ISSUE_TYPE.SHARED_PLATFORM_TENANT) {
      issues.push(
        `平台租户 ${row.platformTenantId}（租户ID: ${row.tenantId}，${row.tenantName}）· 项目「${row.projectName}」（项目ID: ${row.projectId}）：${row.errorMessage}`,
      )
    }
  }

  for (const project of projectsToCompute) {
    const bill = billByTenantId.get(project.tenantId)
    if (!bill) continue

    const details = detailsByBillId.get(bill.id) ?? []
    const { bareMetalAmount, bareMetalBalance, balanceNonBare } = aggregateBillDetails(
      details.map((d) => ({
        productLine: d.productLine,
        amount: d.amount,
        balanceAmount: d.balanceAmount,
      })),
    )

    let balanceConsumption = balanceNonBare
    if (details.length === 0) {
      balanceConsumption = Number(bill.balanceAmount) || 0
    }

    const headerBalance = Number(bill.balanceAmount) || 0
    const detailBalanceSum = balanceConsumption + bareMetalBalance
    if (Math.abs(detailBalanceSum - headerBalance) > AMOUNT_TOLERANCE && details.length > 0) {
      const message = `余额明细合计 ${detailBalanceSum.toFixed(2)} 与账单头余额 ${headerBalance.toFixed(2)} 不一致`
      issues.push(
        `项目「${project.projectName}」（项目ID: ${project.projectId}）· 平台租户 ${project.platformTenantId}（租户ID: ${project.tenantId}）· 账单ID ${bill.id}：${message}`,
      )
      issueRows.push({
        issueType: SINGLE_INCOME_ISSUE_TYPE.BILL_AMOUNT_MISMATCH,
        errorMessage: message,
        projectId: project.projectId,
        projectName: project.projectName,
        tenantId: project.tenantId,
        tenantName: project.tenantName,
        platformTenantId: project.platformTenantId,
        customerId: project.customerId,
        customerName: project.customerName,
        billId: bill.id,
      })
    }

    const supplementary = supplementaryByProject.get(project.projectId) ?? '0'
    const balanceStr = toMoneyString(balanceConsumption)
    const bareAmountStr = toMoneyString(bareMetalAmount)
    const bareBalanceStr = toMoneyString(bareMetalBalance)
    const totalConsumption = computeTotalConsumption({
      balance_consumption: balanceStr,
      bare_metal_balance_consumption: bareBalanceStr,
    })

    rows.push({
      projectId: project.projectId,
      projectName: project.projectName,
      tenantId: project.tenantId,
      tenantName: project.tenantName,
      platformTenantId: project.platformTenantId,
      customerId: project.customerId,
      customerFullName: project.customerName,
      customerType: project.customerType,
      billId: bill.id,
      supplementaryConsumption: supplementary,
      balanceConsumption: balanceStr,
      bareMetalConsumption: bareAmountStr,
      bareMetalBalanceConsumption: bareBalanceStr,
      totalConsumption,
    })
  }

  return {
    periodCode,
    incomeCount: rows.length,
    reconciliationIssues: issues,
    issueRows,
    rows,
    summary: buildSummary(rows),
  }
}

export async function previewSinglePeriodIncome(
  billingPeriodId: string,
): Promise<SingleIncomeComputePayload> {
  financeLog('preview-single-income', 'start', { billingPeriodId })
  const payload = await buildSinglePeriodIncomePayload(billingPeriodId, {
    allowPublished: true,
  })
  financeLog('preview-single-income', 'done', {
    billingPeriodId,
    incomeCount: payload.incomeCount,
  })
  return payload
}

async function upsertSingleIncomeReconciliationReport(input: {
  periodId: string
  issues: string[]
  meta: Record<string, unknown>
}): Promise<void> {
  const existing = await db.query.billingPeriodReconciliationReport.findFirst({
    where: eq(billingPeriodReconciliationReport.billingPeriodId, input.periodId),
  })

  const reportJson = {
    ...(existing?.reportJson && typeof existing.reportJson === 'object'
      ? (existing.reportJson as Record<string, unknown>)
      : {}),
    singleIncomeSource: 'crm_tenant_bill',
    singleIncomeIssues: input.issues,
    singleIncomeMeta: input.meta,
    singleIncomeComputedAt: new Date().toISOString(),
  }

  if (existing) {
    await db
      .update(billingPeriodReconciliationReport)
      .set({ reportJson, ruleVersion: RULE_VERSION })
      .where(eq(billingPeriodReconciliationReport.id, existing.id))
  } else {
    await db.insert(billingPeriodReconciliationReport).values({
      id: newId(),
      billingPeriodId: input.periodId,
      reportJson,
      ruleVersion: RULE_VERSION,
    })
  }
}

export async function computeSinglePeriodIncome(input: {
  billingPeriodId: string
  actorId?: string | null
}): Promise<ComputeIncomeResult> {
  const periodId = input.billingPeriodId
  financeLog('compute-single-income', 'start', { periodId, ruleVersion: RULE_VERSION })

  const period = await db.query.billingPeriod.findFirst({
    where: eq(billingPeriod.id, periodId),
  })
  if (!period) throw new FinanceError('NOT_FOUND', '账期不存在')

  const payload = await buildSinglePeriodIncomePayload(periodId, {
    preserveSupplementary: false,
  })

  await db.transaction(async (tx) => {
    await tx
      .delete(platformIncomeMonthly)
      .where(eq(platformIncomeMonthly.billingPeriodId, periodId))

    if (payload.rows.length > 0) {
      await tx.insert(platformIncomeMonthly).values(
        payload.rows.map((row) => toPlatformIncomeMonthlyInsertRow(periodId, row)),
      )
    }
  })

  await stepI5UpdatePeriodIncomeTotals({
    periodId,
    markComputed: period.status !== 'adjusted',
  })

  await upsertSingleIncomeReconciliationReport({
    periodId,
    issues: payload.reconciliationIssues,
    meta: {
      periodCode: payload.periodCode,
      incomeCount: payload.incomeCount,
      summary: payload.summary,
    },
  })

  await appendOperationLog({
    billingPeriodId: periodId,
    operation: 'compute_single_income',
    actorId: input.actorId,
    metadata: {
      ruleVersion: RULE_VERSION,
      incomeCount: payload.incomeCount,
      source: 'crm_tenant_bill',
      grain: 'project',
    },
  })

  financeLog('compute-single-income', 'done', {
    periodId,
    incomeCount: payload.incomeCount,
    issueCount: payload.reconciliationIssues.length,
  })

  return {
    incomeCount: payload.incomeCount,
    reconciliationIssues: payload.reconciliationIssues,
  }
}
