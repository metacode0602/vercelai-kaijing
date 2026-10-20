export {
  NEW_BARE_METAL_LINE_TYPE,
  PERSONAL_INCOME_SUMMARY_KINDS,
  PERSONAL_INCOME_SUMMARY_DISPLAY_ORDER,
  personalIncomeSummaryKindLabel,
  type PersonalIncomeSummaryKind,
  type PersonalIncomeSegment,
  type BaremetalSourceMode,
} from '@/lib/finance/personal-income-core'

export const PERSONAL_TENANT_BILL_HINT =
  '必填 · 列：租户ID、类型、租户类型、客户类型、客户名、总消费、券消费、余额消费（与平台导出一致；亦兼容含 GPU/区域 的旧模板）'

export const PERSONAL_BAREMETAL_HINT =
  '选填 · 导入后线上裸金属消费以订单余额支付为准，Excel 中「新版裸金属」行将被忽略；未导入时使用 Excel 中「类型=新版裸金属」的余额消费'
