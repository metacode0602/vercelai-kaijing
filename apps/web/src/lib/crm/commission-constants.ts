export const OPPORTUNITY_SOURCE_VALUES = [
  'marketing_sales',
  'sales_self',
  'exec_sales',
] as const

export type OpportunitySource = (typeof OPPORTUNITY_SOURCE_VALUES)[number]

export const OPPORTUNITY_SOURCE_LABELS: Record<OpportunitySource, string> = {
  marketing_sales: '市场 + 销售',
  sales_self: '销售自拓',
  exec_sales: '高管 + 销售',
}

export const CONVERSION_REASON_VALUES = [
  'offline_signing',
  'online_signing',
  'online_registration_only',
] as const

export type ConversionReason = (typeof CONVERSION_REASON_VALUES)[number]

export const CONVERSION_REASON_LABELS: Record<ConversionReason, string> = {
  offline_signing: '线下签约',
  online_signing: '线上签约',
  online_registration_only: '仅线上注册',
}

/** 弹性算力提成政策执行期 */
export const COMMISSION_POLICY_START_MONTH = '2026-05'
export const COMMISSION_POLICY_END_MONTH = '2026-12'
