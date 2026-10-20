const DEFAULT_DAILY_CRON = '5 0 * * *'
// 月结在次月 2 日 02:00（Asia/Shanghai）出账：当日 00:05 的日账单已出完，
// 且留出 1 日人工核账窗口，避免月初与日账单抢跑。
const DEFAULT_MONTHLY_CRON = '0 2 2 * *'
const DEFAULT_TIMEZONE = 'Asia/Shanghai'

export function isSupplierBillingEnabled(): boolean {
  return process.env.SUPPLIER_BILLING_ENABLED === 'true'
}

export function getSupplierBillingDailyCron(): string {
  return process.env.SUPPLIER_BILLING_DAILY_CRON?.trim() || DEFAULT_DAILY_CRON
}

export function getSupplierBillingMonthlyCron(): string {
  return process.env.SUPPLIER_BILLING_MONTHLY_CRON?.trim() || DEFAULT_MONTHLY_CRON
}

export function getSupplierBillingTimezone(): string {
  return process.env.SUPPLIER_BILLING_TIMEZONE?.trim() || DEFAULT_TIMEZONE
}

export function getSupplierBillingConfig() {
  return {
    enabled: isSupplierBillingEnabled(),
    dailyCron: getSupplierBillingDailyCron(),
    monthlyCron: getSupplierBillingMonthlyCron(),
    timezone: getSupplierBillingTimezone(),
  }
}

export function getCronSecret(): string | null {
  const raw = process.env.CRON_SECRET?.trim()
  return raw || null
}
