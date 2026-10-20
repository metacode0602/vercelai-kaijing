import type { OpportunitySource } from '@/lib/crm/commission-constants'
import {
  MONTHLY_COST_BRANCHES,
  MONTHLY_COST_DEPT_MARKETING,
  MONTHLY_COST_DEPT_MIDDLE,
  MONTHLY_COST_MARKETING_DEPT_RATES,
  MONTHLY_COST_MIDDLE_DEPT_RATES,
  MONTHLY_COST_OPPORTUNITY_SHORT_LABELS,
  MONTHLY_COST_RECIPIENT_ROLES,
  MONTHLY_COST_SALES_RATES,
  type MonthlyCostBranch,
  type MonthlyCostIncentiveLabel,
} from '@/lib/monthly-cost/constants'
import { toMoneyString } from '@/lib/finance/income-row-utils'

export type ProjectCommissionInput = {
  projectId: string
  projectName: string | null
  accountManagerStaffId: string | null
  accountManagerName: string | null
  opportunitySource: OpportunitySource | null
  customerIncentiveLabel: MonthlyCostIncentiveLabel
  pcGrossProfit: number
  spGrossProfit: number
  skipSalesIndividual: boolean
}

export type CommissionProjectLineDraft = {
  costBranch: MonthlyCostBranch
  projectId: string
  projectName: string | null
  recipientRole: string
  recipientDept: string | null
  accountManagerStaffId: string | null
  accountManagerName: string | null
  opportunitySource: OpportunitySource | null
  customerIncentiveLabel: MonthlyCostIncentiveLabel
  grossProfitBase: number
  commissionRate: number
  commissionAmount: number
}

function grossForBranch(input: ProjectCommissionInput, branch: MonthlyCostBranch): number {
  return branch === 'platform_cost' ? input.pcGrossProfit : input.spGrossProfit
}

function rateForSales(
  source: OpportunitySource,
  label: MonthlyCostIncentiveLabel,
): number {
  return MONTHLY_COST_SALES_RATES[source][label]
}

export function buildCommissionProjectLines(
  projects: ProjectCommissionInput[],
): { lines: CommissionProjectLineDraft[]; skippedProjectIds: string[] } {
  const lines: CommissionProjectLineDraft[] = []
  const skippedProjectIds: string[] = []

  for (const project of projects) {
    // 缺商机来源：跳过销售/市场提成，但中台部门池仍按项目毛利入池
    if (!project.opportunitySource) {
      skippedProjectIds.push(project.projectId)
    }

    for (const branch of MONTHLY_COST_BRANCHES) {
      const base = grossForBranch(project, branch)
      const label = project.customerIncentiveLabel

      if (project.opportunitySource) {
        if (!project.skipSalesIndividual) {
          const salesRate = rateForSales(project.opportunitySource, label)
          lines.push({
            costBranch: branch,
            projectId: project.projectId,
            projectName: project.projectName,
            recipientRole: MONTHLY_COST_RECIPIENT_ROLES.salesIndividual,
            recipientDept: null,
            accountManagerStaffId: project.accountManagerStaffId,
            accountManagerName: project.accountManagerName,
            opportunitySource: project.opportunitySource,
            customerIncentiveLabel: label,
            grossProfitBase: base,
            commissionRate: salesRate,
            commissionAmount: base * salesRate,
          })
        }

        if (project.opportunitySource === 'marketing_sales') {
          const mRate = MONTHLY_COST_MARKETING_DEPT_RATES[label]
          lines.push({
            costBranch: branch,
            projectId: project.projectId,
            projectName: project.projectName,
            recipientRole: MONTHLY_COST_RECIPIENT_ROLES.marketingDeptPool,
            recipientDept: MONTHLY_COST_DEPT_MARKETING,
            accountManagerStaffId: project.accountManagerStaffId,
            accountManagerName: project.accountManagerName,
            opportunitySource: project.opportunitySource,
            customerIncentiveLabel: label,
            grossProfitBase: base,
            commissionRate: mRate,
            commissionAmount: base * mRate,
          })
        }
      }

      const midRate = MONTHLY_COST_MIDDLE_DEPT_RATES[label]
      lines.push({
        costBranch: branch,
        projectId: project.projectId,
        projectName: project.projectName,
        recipientRole: MONTHLY_COST_RECIPIENT_ROLES.middleOfficeDeptPool,
        recipientDept: MONTHLY_COST_DEPT_MIDDLE,
        accountManagerStaffId: project.accountManagerStaffId,
        accountManagerName: project.accountManagerName,
        opportunitySource: project.opportunitySource,
        customerIncentiveLabel: label,
        grossProfitBase: base,
        commissionRate: midRate,
        commissionAmount: base * midRate,
      })
    }
  }

  return { lines, skippedProjectIds }
}

export type AmCommissionDraft = {
  costBranch: MonthlyCostBranch
  accountManagerStaffId: string | null
  accountManagerName: string
  opportunitySource: OpportunitySource
  opportunitySourceLabel: string
  customerIncentiveLabel: MonthlyCostIncentiveLabel
  grossProfitSum: number
  commissionRate: number
  commissionAmount: number
}

export function rollupAmCommissionLines(
  projectLines: CommissionProjectLineDraft[],
): AmCommissionDraft[] {
  const map = new Map<string, AmCommissionDraft>()

  for (const line of projectLines) {
    if (line.recipientRole !== MONTHLY_COST_RECIPIENT_ROLES.salesIndividual) continue
    if (!line.opportunitySource) continue

    const name = line.accountManagerName ?? '未指定客户经理'
    const key = [
      line.costBranch,
      line.accountManagerStaffId ?? '',
      name,
      line.opportunitySource,
      line.customerIncentiveLabel,
    ].join('::')

    const existing = map.get(key)
    if (existing) {
      existing.grossProfitSum += line.grossProfitBase
      existing.commissionAmount += line.commissionAmount
    } else {
      map.set(key, {
        costBranch: line.costBranch,
        accountManagerStaffId: line.accountManagerStaffId,
        accountManagerName: name,
        opportunitySource: line.opportunitySource,
        opportunitySourceLabel: MONTHLY_COST_OPPORTUNITY_SHORT_LABELS[line.opportunitySource],
        customerIncentiveLabel: line.customerIncentiveLabel,
        grossProfitSum: line.grossProfitBase,
        commissionRate: line.commissionRate,
        commissionAmount: line.commissionAmount,
      })
    }
  }

  return [...map.values()]
}

export type DeptPoolDraft = {
  costBranch: MonthlyCostBranch
  recipientDept: string
  customerIncentiveLabel: MonthlyCostIncentiveLabel
  grossProfitBaseSum: number
  commissionPoolSum: number
  projectCount: number
  poolScopeNote: string
  projectLines: {
    projectId: string
    projectName: string | null
    opportunitySource: OpportunitySource | null
    opportunitySourceLabel: string | null
    accountManagerName: string | null
    grossProfitBase: number
    commissionPoolAmount: number
  }[]
}

export function rollupDeptPoolLines(
  projectLines: CommissionProjectLineDraft[],
): DeptPoolDraft[] {
  const pools: DeptPoolDraft[] = []
  const deptRoles = [
    {
      dept: MONTHLY_COST_DEPT_MIDDLE,
      role: MONTHLY_COST_RECIPIENT_ROLES.middleOfficeDeptPool,
      note: '全部项目',
    },
    {
      dept: MONTHLY_COST_DEPT_MARKETING,
      role: MONTHLY_COST_RECIPIENT_ROLES.marketingDeptPool,
      note: '仅市场来源项目',
    },
  ] as const

  for (const branch of MONTHLY_COST_BRANCHES) {
    for (const { dept, role, note } of deptRoles) {
      for (const label of ['新客', '老客'] as const) {
        const matching = projectLines.filter(
          (l) =>
            l.costBranch === branch &&
            l.recipientRole === role &&
            l.customerIncentiveLabel === label,
        )
        if (matching.length === 0) continue

        const projectMap = new Map<
          string,
          {
            projectId: string
            projectName: string | null
            opportunitySource: OpportunitySource | null
            accountManagerName: string | null
            grossProfitBase: number
            commissionPoolAmount: number
          }
        >()

        for (const line of matching) {
          const acc = projectMap.get(line.projectId) ?? {
            projectId: line.projectId,
            projectName: line.projectName,
            opportunitySource: line.opportunitySource,
            accountManagerName: line.accountManagerName,
            grossProfitBase: 0,
            commissionPoolAmount: 0,
          }
          acc.grossProfitBase += line.grossProfitBase
          acc.commissionPoolAmount += line.commissionAmount
          projectMap.set(line.projectId, acc)
        }

        const projectLinesOut = [...projectMap.values()].map((p) => ({
          ...p,
          opportunitySourceLabel: p.opportunitySource
            ? MONTHLY_COST_OPPORTUNITY_SHORT_LABELS[p.opportunitySource]
            : null,
        }))

        pools.push({
          costBranch: branch,
          recipientDept: dept,
          customerIncentiveLabel: label,
          grossProfitBaseSum: matching.reduce((s, l) => s + l.grossProfitBase, 0),
          commissionPoolSum: matching.reduce((s, l) => s + l.commissionAmount, 0),
          projectCount: projectMap.size,
          poolScopeNote: note,
          projectLines: projectLinesOut,
        })
      }
    }
  }

  return pools
}

export function money4(n: number): string {
  return toMoneyString(n)
}
