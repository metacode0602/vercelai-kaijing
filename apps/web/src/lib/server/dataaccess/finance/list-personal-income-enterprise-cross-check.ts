import { db } from '@/lib/db'
import { parseMoney, toMoneyString } from '@/lib/finance/income-row-utils'
import { PERSONAL_INCOME_SUMMARY_KINDS } from '@/lib/finance/personal-income-core'
import {
  billingPeriodPersonalIncomeTenantLine,
  platformIncomeMonthly,
} from '@workspace/db/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { FinanceError } from './errors'
import { listExcludedProjectTenants } from './personal-income-tenants'

export type PersonalIncomeEnterpriseCrossCheckRow = {
  platform_tenant_id: string
  customer_name: string | null
  project_names: string[]
  excel_balance_consumption: string
  excel_bare_metal_consumption: string
  excel_total_consumption: string
  crm_balance_consumption: string
  crm_bare_metal_consumption: string
  crm_total_consumption: string
  delta_total: string
  delta_balance: string
  delta_bare_metal: string
  has_crm_row: boolean
}

export type PersonalIncomeEnterpriseCrossCheckResult = {
  summary: {
    excel_total: string
    crm_total: string
    delta: string
  }
  rows: PersonalIncomeEnterpriseCrossCheckRow[]
}

export async function listPersonalIncomeEnterpriseCrossCheck(
  billingPeriodId: string,
): Promise<PersonalIncomeEnterpriseCrossCheckResult> {
  const period = await db.query.billingPeriod.findFirst({
    where: (t, { eq: eqOp }) => eqOp(t.id, billingPeriodId),
  })
  if (!period) throw new FinanceError('NOT_FOUND', '账期不存在')

  const excelRows = await db
    .select()
    .from(billingPeriodPersonalIncomeTenantLine)
    .where(
      and(
        eq(billingPeriodPersonalIncomeTenantLine.billingPeriodId, billingPeriodId),
        eq(
          billingPeriodPersonalIncomeTenantLine.segment,
          PERSONAL_INCOME_SUMMARY_KINDS.enterpriseProject,
        ),
      ),
    )

  if (excelRows.length === 0) {
    return {
      summary: {
        excel_total: toMoneyString(0),
        crm_total: toMoneyString(0),
        delta: toMoneyString(0),
      },
      rows: [],
    }
  }

  const tenantIds = excelRows.map((r) => r.platformTenantId)
  const tenantIdSet = new Set(tenantIds)
  const crmRows = await db
    .select({
      tenantPlatformId: platformIncomeMonthly.tenantPlatformId,
      balanceConsumption: platformIncomeMonthly.balanceConsumption,
      bareMetalBalanceConsumption: platformIncomeMonthly.bareMetalBalanceConsumption,
      totalConsumption: platformIncomeMonthly.totalConsumption,
    })
    .from(platformIncomeMonthly)
    .where(
      and(
        eq(platformIncomeMonthly.billingPeriodId, billingPeriodId),
        eq(platformIncomeMonthly.customerType, 'B'),
        inArray(platformIncomeMonthly.tenantPlatformId, tenantIds),
      ),
    )

  const crmByTenant = new Map<
    string,
    { balance: number; bare: number; total: number; rowCount: number }
  >()
  for (const row of crmRows) {
    if (!tenantIdSet.has(row.tenantPlatformId)) continue
    const cur = crmByTenant.get(row.tenantPlatformId) ?? {
      balance: 0,
      bare: 0,
      total: 0,
      rowCount: 0,
    }
    crmByTenant.set(row.tenantPlatformId, {
      balance: cur.balance + parseMoney(row.balanceConsumption),
      bare: cur.bare + parseMoney(row.bareMetalBalanceConsumption),
      total: cur.total + parseMoney(row.totalConsumption),
      rowCount: cur.rowCount + 1,
    })
  }

  const projectInfo = await listExcludedProjectTenants(tenantIds)
  const projectNamesByTenant = new Map(
    projectInfo.map((p) => [p.platformTenantId, p.projectNames]),
  )

  const rows: PersonalIncomeEnterpriseCrossCheckRow[] = excelRows.map((row) => {
    const excelBalance = parseMoney(row.balanceConsumption)
    const excelBare = parseMoney(row.bareMetalConsumption)
    const excelTotal = parseMoney(row.totalConsumption)
    const crm = crmByTenant.get(row.platformTenantId)
    const crmBalance = crm?.balance ?? 0
    const crmBare = crm?.bare ?? 0
    const crmTotal = crm?.total ?? 0

    return {
      platform_tenant_id: row.platformTenantId,
      customer_name: row.customerName,
      project_names: projectNamesByTenant.get(row.platformTenantId) ?? [],
      excel_balance_consumption: row.balanceConsumption,
      excel_bare_metal_consumption: row.bareMetalConsumption,
      excel_total_consumption: row.totalConsumption,
      crm_balance_consumption: toMoneyString(crmBalance),
      crm_bare_metal_consumption: toMoneyString(crmBare),
      crm_total_consumption: toMoneyString(crmTotal),
      delta_total: toMoneyString(excelTotal - crmTotal),
      delta_balance: toMoneyString(excelBalance - crmBalance),
      delta_bare_metal: toMoneyString(excelBare - crmBare),
      has_crm_row: Boolean(crm && crm.rowCount > 0),
    }
  })

  rows.sort((a, b) => Math.abs(parseMoney(b.delta_total)) - Math.abs(parseMoney(a.delta_total)))

  const excelTotal = rows.reduce((s, r) => s + parseMoney(r.excel_total_consumption), 0)
  const crmTotal = rows.reduce((s, r) => s + parseMoney(r.crm_total_consumption), 0)

  return {
    summary: {
      excel_total: toMoneyString(excelTotal),
      crm_total: toMoneyString(crmTotal),
      delta: toMoneyString(excelTotal - crmTotal),
    },
    rows,
  }
}
