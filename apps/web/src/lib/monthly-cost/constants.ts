import type { OpportunitySource } from '@/lib/crm/commission-constants'

export const MONTHLY_COST_BRANCHES = ['platform_cost', 'platform_sell_price'] as const

export type MonthlyCostBranch = (typeof MONTHLY_COST_BRANCHES)[number]

export const DEFAULT_MONTHLY_COST_BRANCH: MonthlyCostBranch = 'platform_sell_price'

export const MONTHLY_COST_BRANCH_LABELS: Record<MonthlyCostBranch, string> = {
  platform_cost: '平台成本',
  platform_sell_price: '平台售价',
}

export const SPOT_SELL_PRICE_GROSS_PROFIT_RATE = 0.15

export type MonthlyCostIncentiveLabel = '新客' | '老客'

export const MONTHLY_COST_OPPORTUNITY_SHORT_LABELS: Record<OpportunitySource, string> = {
  marketing_sales: '市场',
  sales_self: '销售',
  exec_sales: '高管',
}

export const MONTHLY_COST_SALES_RATES: Record<
  OpportunitySource,
  Record<MonthlyCostIncentiveLabel, number>
> = {
  marketing_sales: { 新客: 0.1, 老客: 0.07 },
  sales_self: { 新客: 0.15, 老客: 0.15 },
  exec_sales: { 新客: 0.12, 老客: 0.09 },
}

export const MONTHLY_COST_MARKETING_DEPT_RATES: Record<MonthlyCostIncentiveLabel, number> = {
  新客: 0.03,
  老客: 0.03,
}

export const MONTHLY_COST_MIDDLE_DEPT_RATES: Record<MonthlyCostIncentiveLabel, number> = {
  新客: 0.03,
  老客: 0.06,
}

export const MONTHLY_COST_RECIPIENT_ROLES = {
  salesIndividual: 'sales_individual',
  marketingDeptPool: 'marketing_dept_pool',
  middleOfficeDeptPool: 'middle_office_dept_pool',
} as const

export const MONTHLY_COST_DEPT_MARKETING = '市场'
export const MONTHLY_COST_DEPT_MIDDLE = '中台'
