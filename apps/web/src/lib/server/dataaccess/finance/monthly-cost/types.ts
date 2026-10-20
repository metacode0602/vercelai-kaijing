import type { MonthlyCostBranch } from '@/lib/monthly-cost/constants'
import type { OpportunitySource } from '@/lib/crm/commission-constants'

export type MonthlyCostRunDto = {
  id: string
  billing_period_id: string
  billing_period_code: string
  usage_month: string
  status: string
  base_line_count: number
  commission_project_line_count: number
  commission_am_line_count: number
  dept_pool_line_count: number
  dept_pool_project_line_count: number
  dept_distribution_line_count: number
  warning_count: number
  dept_distribution_status: string
  error_summary: string | null
  started_at: string
  finished_at: string | null
  confirmed_at: string | null
  confirmed_by: string | null
  confirmed_cost_branch: MonthlyCostBranch | null
}

export type MonthlyCostBaseLineDto = {
  id: string
  project_id: string | null
  project_name: string | null
  tenant_platform_id: string
  tenant_name: string | null
  product_line: string
  region_code: string
  data_center_id: string | null
  data_center_name: string | null
  gpu_card_type_name: string | null
  customer_full_name: string | null
  account_manager_staff_id: string | null
  account_manager_name: string | null
  opportunity_source: string | null
  opportunity_source_label: string | null
  customer_incentive_label: string | null
  balance_consumption: string
  balance_card_hours: string
  voucher_card_hours: string
  confirmed_revenue_excl_tax: string
  pc_sold_duration_cost_excl_tax: string
  pc_gifted_duration_cost_excl_tax: string
  pc_gross_profit: string
  sp_sold_duration_cost_excl_tax: string
  sp_gifted_duration_cost_excl_tax: string
  sp_gross_profit: string
  sp_sell_price_per_hour: string | null
  remark: string | null
}

export type MonthlyCostBaseLineFilterOptionsDto = {
  opportunitySources: { value: string; label: string }[]
  dataCenters: { id: string; name: string }[]
  accountManagers: { staffId: string; name: string }[]
}

export type MonthlyCostBaseLineListFilters = {
  search?: string
  opportunitySource?: string
  dataCenterId?: string
  accountManagerStaffId?: string
  onlyWithProject?: boolean
}

export type MonthlyCostCommissionLineDto = {
  account_manager_name: string
  opportunity_source: OpportunitySource
  opportunity_source_label: string | null
  customer_incentive_label: string
  gross_profit_sum: string
  commission_rate: string
  commission_amount: string
}

export type MonthlyCostCommissionProjectLineDto = {
  id: string
  project_id: string
  project_name: string | null
  account_manager_name: string | null
  opportunity_source: OpportunitySource | null
  opportunity_source_label: string | null
  customer_incentive_label: string
  gross_profit_base: string
  commission_rate: string
  commission_amount: string
}

export type MonthlyCostProjectMetricsDto = {
  balance_consumption: string
  balance_card_hours: string
  voucher_card_hours: string
  confirmed_revenue_excl_tax: string
  sold_duration_cost_excl_tax: string
  gifted_duration_cost_excl_tax: string
  gross_profit: string
}

export type MonthlyCostRunIssueDto = {
  level: 'warning' | 'error'
  code: string
  message: string
  row: Record<string, string | null | undefined> | null
}

export type MonthlyCostDeptPoolLineDto = {
  id: string
  recipient_dept: string
  customer_incentive_label: string
  gross_profit_base_sum: string
  commission_pool_sum: string
  project_count: number
  pool_scope_note: string | null
}

export type MonthlyCostDeptPoolProjectLineDto = {
  id: string
  dept_pool_line_id: string
  recipient_dept: string
  project_id: string
  tenant_id: string
  project_name: string | null
  opportunity_source_label: string | null
  customer_incentive_label: string
  account_manager_name: string | null
  gross_profit_base: string
  commission_pool_amount: string
  metrics: MonthlyCostProjectMetricsDto
}

export type MonthlyCostBundle = {
  run: MonthlyCostRunDto | null
  commissionLines: MonthlyCostCommissionLineDto[]
  commissionProjectLines: MonthlyCostCommissionProjectLineDto[]
  deptPoolLines: MonthlyCostDeptPoolLineDto[]
  deptPoolProjectLines: MonthlyCostDeptPoolProjectLineDto[]
  costBranch: MonthlyCostBranch
}
