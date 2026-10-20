import { db } from '@/lib/db'
import {
  classifyPersonalIncomeSegment,
  type BaremetalSourceMode,
} from '@/lib/finance/personal-income-core'
import {
  billingPeriod,
  billingPeriodRawBaremetalOrder,
  billingPeriodRawTenantBill,
} from '@workspace/db/schema'
import { eq } from 'drizzle-orm'
import type { PersonalIncomeReconciliationDto } from './compute-personal-income'
import { FinanceError } from './errors'
import { listExcludedInternalPlatformIdsForPeriod } from './internal-tenant-income-exclusion'
import { buildActiveBlacklistPlatformIdSet } from './personal-income-blacklist'
import {
  listExcludedProjectTenants,
  listProjectLinkedPlatformTenantIds,
} from './personal-income-tenants'
import { getPersonalImportBatches, resolveBaremetalSourceMode } from './purge-personal'

export type ValidatePersonalIncomeResult = {
  periodStatus: string
  tenantBillReady: boolean
  baremetalReady: boolean
  baremetalImported: boolean
  baremetalSourceMode: BaremetalSourceMode
  canCompute: boolean
  tenantsInExcel: number
  tenantsExcludedProject: number
  tenantsPersonal: number
  excludedProjectTenants: Array<{
    platform_tenant_id: string
    project_names: string[]
  }>
  messages: string[]
  reconciliation: PersonalIncomeReconciliationDto | null
}

export async function validatePersonalIncome(
  billingPeriodId: string,
): Promise<ValidatePersonalIncomeResult> {
  const period = await db.query.billingPeriod.findFirst({
    where: eq(billingPeriod.id, billingPeriodId),
  })
  if (!period) throw new FinanceError('NOT_FOUND', '账期不存在')

  const batches = await getPersonalImportBatches(billingPeriodId)
  const tenantBillReady = batches.tenantBill?.parseStatus === 'ok'
  const baremetalReady = batches.baremetal?.parseStatus === 'ok'
  const baremetalSourceMode = resolveBaremetalSourceMode(batches)
  const messages: string[] = []

  if (!batches.tenantBill) {
    messages.push('未上传个人账单详情 Excel')
  } else if (!tenantBillReady) {
    messages.push('个人账单详情解析未通过，请修正后重新上传')
  }
  if (baremetalSourceMode === 'excel') {
    messages.push('裸金属口径：账单 Excel（类型=新版裸金属）；读库导入为选填')
  } else if (!baremetalReady) {
    messages.push('个人裸金属订单读库导入未成功，请修正订单主数据后重新导入')
  } else {
    messages.push('裸金属口径：裸金属订单读库（余额支付）')
  }

  let tenantsInExcel = 0
  let tenantsPersonal = 0
  let tenantsExcludedProject = 0
  let excluded: ValidatePersonalIncomeResult['excludedProjectTenants'] = []

  if (tenantBillReady) {
    const billRows = await db
      .select({ tenantPlatformId: billingPeriodRawTenantBill.tenantPlatformId })
      .from(billingPeriodRawTenantBill)
      .where(eq(billingPeriodRawTenantBill.batchId, batches.tenantBill!.id))

    const tExcel = new Set(billRows.map((r) => r.tenantPlatformId))

    if (baremetalReady && batches.baremetal) {
      const bareRows = await db
        .select({ tenantPlatformId: billingPeriodRawBaremetalOrder.tenantPlatformId })
        .from(billingPeriodRawBaremetalOrder)
        .where(eq(billingPeriodRawBaremetalOrder.batchId, batches.baremetal.id))
      for (const r of bareRows) tExcel.add(r.tenantPlatformId)
    }

    tenantsInExcel = tExcel.size

    const projectLinked = await listProjectLinkedPlatformTenantIds([...tExcel])
    const internalIds = new Set(
      await listExcludedInternalPlatformIdsForPeriod(billingPeriodId, [...tExcel]),
    )
    const blacklistIds = await buildActiveBlacklistPlatformIdSet()

    const excludedRaw = await listExcludedProjectTenants(
      [...tExcel].filter((id) => projectLinked.has(id)),
    )
    excluded = excludedRaw.map((e) => ({
      platform_tenant_id: e.platformTenantId,
      project_names: e.projectNames,
    }))
    tenantsExcludedProject = projectLinked.size

    tenantsPersonal = [...tExcel].filter((id) => {
      const seg = classifyPersonalIncomeSegment({
        platformTenantId: id,
        internalIds,
        projectLinkedIds: projectLinked,
        blacklistIds,
      })
      return seg === 'non_project' || seg === 'blacklist'
    }).length

    if (tenantsInExcel === 0) {
      messages.push('Excel 中无有效租户')
    }
  }

  const reportRow = await db.query.billingPeriodReconciliationReport.findFirst({
    where: (t, { eq: eqOp }) => eqOp(t.billingPeriodId, billingPeriodId),
  })
  let reconciliation: PersonalIncomeReconciliationDto | null = null
  const computedSummaryCount = await db.query.billingPeriodPersonalIncomeSummary.findMany({
    where: (t, { eq: eqOp }) => eqOp(t.billingPeriodId, billingPeriodId),
    columns: { id: true },
  })
  if (
    computedSummaryCount.length > 0 &&
    reportRow?.reportJson &&
    typeof reportRow.reportJson === 'object'
  ) {
    const pi = (
      reportRow.reportJson as {
        personalIncome?: { reconciliation?: PersonalIncomeReconciliationDto }
      }
    ).personalIncome
    if (pi?.reconciliation) reconciliation = pi.reconciliation
  }

  const canCompute =
    tenantBillReady &&
    tenantsInExcel > 0 &&
    (baremetalSourceMode === 'excel' || baremetalReady) &&
    period.status !== 'void' &&
    period.status !== 'published'

  if (period.status === 'published') {
    messages.push('已发布账期须先撤回发布')
  }

  return {
    periodStatus: period.status,
    tenantBillReady,
    baremetalReady,
    baremetalImported: baremetalReady,
    baremetalSourceMode,
    canCompute,
    tenantsInExcel,
    tenantsExcludedProject,
    tenantsPersonal,
    excludedProjectTenants: excluded,
    messages,
    reconciliation,
  }
}

export function mapPersonalBatchDto(
  batch: {
    id: string
    fileType: string
    fileName: string
    parseStatus: string
    parseErrorCount: number
    rowCount: number
    errorReportPath: string | null
    uploadedAt: Date
  } | undefined,
) {
  if (!batch) return null
  return {
    id: batch.id,
    file_type: batch.fileType,
    file_name: batch.fileName,
    parse_status: batch.parseStatus,
    parse_error_count: batch.parseErrorCount,
    row_count: batch.rowCount,
    has_error_report: Boolean(batch.errorReportPath),
    uploaded_at: batch.uploadedAt.toISOString(),
  }
}
