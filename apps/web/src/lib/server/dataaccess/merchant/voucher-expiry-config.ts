/**
 * 商户算力券过期回收的调度配置。
 *
 * 这个 job 干的事只有一件：把 `expired_at` 已过、但 `status` 还停在 `active`
 * 的券逐张回收 —— `expireMerchantCoupon()` 会把冻结在券池里的剩余额度
 * （reserved → available）退回商户，并把券置为 `expired`。
 *
 * **默认开启**：它不是「额外增值功能」而是资金正确性兜底。不跑的后果是
 * 商户的钱被一张没人用的券永久锁在 reserved 里，商户账面可用额凭空少一截。
 * 需要停用时显式传 `MERCHANT_VOUCHER_EXPIRY_ENABLED=false`。
 */

const DEFAULT_CRON = '17 * * * *' // 每小时第 17 分：错开整点的其他 cron
const DEFAULT_TIMEZONE = 'Asia/Shanghai'
const DEFAULT_BATCH_SIZE = 200
const DEFAULT_MAX_BATCHES = 10

export function isMerchantVoucherExpiryEnabled(): boolean {
  return process.env.MERCHANT_VOUCHER_EXPIRY_ENABLED?.trim() !== 'false'
}

export function getMerchantVoucherExpiryCron(): string {
  return process.env.MERCHANT_VOUCHER_EXPIRY_CRON?.trim() || DEFAULT_CRON
}

export function getMerchantVoucherExpiryTimezone(): string {
  return process.env.MERCHANT_VOUCHER_EXPIRY_TIMEZONE?.trim() || DEFAULT_TIMEZONE
}

/** 单批扫描多少张过期券；每批独立事务，失败不影响已回收的 */
export function getMerchantVoucherExpiryBatchSize(): number {
  const n = Number(process.env.MERCHANT_VOUCHER_EXPIRY_BATCH_SIZE)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_BATCH_SIZE
  return Math.min(1000, Math.floor(n))
}

/** 单次运行最多跑多少批，防止积压时把 DB 拖死 */
export function getMerchantVoucherExpiryMaxBatches(): number {
  const n = Number(process.env.MERCHANT_VOUCHER_EXPIRY_MAX_BATCHES)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_MAX_BATCHES
  return Math.min(100, Math.floor(n))
}

export function getCronSecret(): string | null {
  const raw = process.env.CRON_SECRET?.trim()
  return raw || null
}
