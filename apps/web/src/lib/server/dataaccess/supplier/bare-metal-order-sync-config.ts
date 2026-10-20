const DEFAULT_CRON = '10 * * * *'
const DEFAULT_TIMEZONE = 'Asia/Shanghai'
const DEFAULT_BILLING_LOOKBACK_MONTHS = 6
const DEFAULT_WINDOW_DAYS = 2

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return fallback
  return Math.floor(n)
}

export function isBareMetalOrderSyncEnabled(): boolean {
  return process.env.BARE_METAL_ORDER_SYNC_ENABLED === 'true'
}

export function getBareMetalOrderSyncCron(): string {
  return process.env.BARE_METAL_ORDER_SYNC_CRON?.trim() || DEFAULT_CRON
}

export function getBareMetalOrderSyncTimezone(): string {
  return process.env.BARE_METAL_ORDER_SYNC_TIMEZONE?.trim() || DEFAULT_TIMEZONE
}

export function getBareMetalOrderSyncBillingLookbackMonths(): number {
  return parsePositiveInt(
    process.env.BARE_METAL_ORDER_SYNC_BILLING_LOOKBACK_MONTHS,
    DEFAULT_BILLING_LOOKBACK_MONTHS,
  )
}

export function getBareMetalOrderSyncWindowDays(): number {
  const windowRaw = process.env.BARE_METAL_ORDER_SYNC_WINDOW_DAYS?.trim()
  if (windowRaw) {
    return parsePositiveInt(windowRaw, DEFAULT_WINDOW_DAYS)
  }
  return parsePositiveInt(process.env.BARE_METAL_ORDER_SYNC_SAFETY_DAYS, DEFAULT_WINDOW_DAYS)
}

/** @deprecated 请使用 getBareMetalOrderSyncWindowDays */
export function getBareMetalOrderSyncSafetyDays(): number {
  return getBareMetalOrderSyncWindowDays()
}

export function getBareMetalOrderSyncInitialStartDate(): string | null {
  const raw = process.env.BARE_METAL_ORDER_SYNC_INITIAL_START_DATE?.trim()
  if (!raw) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  return raw
}

export function getBareMetalOrderSyncConfig() {
  return {
    enabled: isBareMetalOrderSyncEnabled(),
    cron: getBareMetalOrderSyncCron(),
    timezone: getBareMetalOrderSyncTimezone(),
    billingLookbackMonths: getBareMetalOrderSyncBillingLookbackMonths(),
    windowDays: getBareMetalOrderSyncWindowDays(),
    /** @deprecated 与 windowDays 相同，兼容旧 UI */
    safetyDays: getBareMetalOrderSyncWindowDays(),
    initialStartDate: getBareMetalOrderSyncInitialStartDate(),
  }
}

/** PostgreSQL advisory lock key（独立于 billing sync） */
export const BARE_METAL_ORDER_SYNC_LOCK_KEY = 89451236790
