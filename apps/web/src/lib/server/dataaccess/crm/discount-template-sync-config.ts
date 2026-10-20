const DEFAULT_CRON = '0 6 * * *'
const DEFAULT_TIMEZONE = 'Asia/Shanghai'

export function isDiscountTemplateSyncEnabled(): boolean {
  const raw = process.env.DISCOUNT_TEMPLATE_SYNC_ENABLED?.trim()
  if (raw === 'false') return false
  // 默认跟随账单同步开关；未配置时若账单同步开启则开启
  if (raw === 'true') return true
  return process.env.BILLING_SYNC_ENABLED === 'true'
}

export function getDiscountTemplateSyncCron(): string {
  return process.env.DISCOUNT_TEMPLATE_SYNC_CRON?.trim() || DEFAULT_CRON
}

export function getDiscountTemplateSyncTimezone(): string {
  return process.env.DISCOUNT_TEMPLATE_SYNC_TIMEZONE?.trim() || DEFAULT_TIMEZONE
}
