/**
 * 卡时口径说明（对齐 datacenter-sla-implementation-design.md §7–§8）
 *
 * SLA、可用率、闲置率、浪费率均基于供给卡时池计算。
 */

export const CARD_HOUR_TERM_CONTRACT = {
  label: '合同卡时',
  definition:
    '商务产能合同承诺的卡时总量；真源为 supplier_contract_capacity_line，由 Job 日切写入 sla_supply_daily.contract_card_hours。',
  formula: 'SUM(产能明细日卡时)',
} as const

export const CARD_HOUR_TERM_SUPPLY = {
  label: '供给卡时',
  definition:
    '扣除上架损耗后、实际进入可调度供给池的卡时；运维日推 total_card_hours，须满足供给恒等式。',
  formula: '合同卡时 − 上架损耗卡时',
  usedBy: ['SLA（分母）', '可用率（分子）', '闲置率（分母）', '浪费率（分母）'],
} as const
