/** 租户账单同步 — 预览 / 提交类型（UI + 后续 tRPC 共用） */

export type TenantBillingImportDialogPhase = 'idle' | 'fetching' | 'preview' | 'committing'

export type TenantBillingImportAction = 'create' | 'update' | 'skip'

export type TenantBillingImportTab =
  | 'monthlyBills'
  | 'recharges'
  | 'dailyUsageBills'
  | 'billDetails'
  | 'coupons'

export type TenantBillingImportSectionSummary = {
  total: number
  toCreate: number
  toUpdate: number
  skipped: number
}

export type TenantBillingImportSection<T> = {
  summary: TenantBillingImportSectionSummary
  items: T[]
  error?: string
}

export type MonthlyBillPreviewItem = {
  key: string
  action: TenantBillingImportAction
  billMonth: string
  periodStart: string
  periodEnd: string
  totalAmountRmb: number
  couponAmountRmb: number
  balanceAmountRmb: number
}

export type RechargePreviewItem = {
  key: string
  action: TenantBillingImportAction
  transactionId: string
  amountRmb: number
  payChannel: string
  status: string
  createTime: string
  remark?: string
}

export type BillDetailPreviewItem = {
  key: string
  action: TenantBillingImportAction
  billMonth: string
  productLine: string
  resourceName: string
  amountRmb: number
  couponAmountRmb: number
  balanceAmountRmb: number
}

export type DailyUsageBillPreviewItem = {
  key: string
  action: TenantBillingImportAction
  usageDate: string
  taskType: string
  productLine: string
  periodStart: string
  periodEnd: string
  totalAmountRmb: number
  couponAmountRmb: number
  balanceAmountRmb: number
}

export type CouponPreviewItem = {
  key: string
  action: TenantBillingImportAction
  platformRelationId: number
  platformTemplateId: number
  title: string
  valueRmb: number
  surplusAmountRmb: number
  status: string
  issuedAt: string
  expiredAt: string
  remark?: string
  adminNickname?: string
}

export type TenantBillingImportPreviewInput = {
  tenantId: string
  platformTenantId: string
  tenantName: string
  startDate?: string
  endDate?: string
}

export type TenantBillingImportPreviewResult = {
  previewId: string
  tenant: { platformTenantId: string; name: string }
  dateRange: { startDate?: string; endDate?: string }
  sections: {
    monthlyBills: TenantBillingImportSection<MonthlyBillPreviewItem>
    recharges: TenantBillingImportSection<RechargePreviewItem>
    dailyUsageBills: TenantBillingImportSection<DailyUsageBillPreviewItem>
    billDetails: TenantBillingImportSection<BillDetailPreviewItem>
    coupons: TenantBillingImportSection<CouponPreviewItem>
  }
}

export type TenantBillingImportCommitSectionResult = {
  created: number
  updated: number
  upserted: number
  deleted?: number
  errors: { key: string; message: string }[]
}

export type TenantBillingImportCommitResult = {
  monthlyBills: TenantBillingImportCommitSectionResult
  recharges: TenantBillingImportCommitSectionResult
  dailyUsageBills: TenantBillingImportCommitSectionResult
  dailyConsumptionDetails: TenantBillingImportCommitSectionResult
  billDetails: TenantBillingImportCommitSectionResult
  coupons: TenantBillingImportCommitSectionResult
}
