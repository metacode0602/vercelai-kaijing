/**
 * Order number generation utilities.
 *
 * Format: `{prefix}{yyyyMMddHHmmss}{random}`
 * - recharge:       RE + 14 digits + 6 random = 22 chars
 * - bare_metal:     BM + 14 digits + 6 random = 22 chars
 * - payment_refund: RF + 14 digits + 6 random = 22 chars
 */

function pad(n: number, size = 2): string {
  return String(n).padStart(size, "0")
}

function formatTimestamp(d: Date): string {
  return (
    `${d.getFullYear()}` +
    `${pad(d.getMonth() + 1)}` +
    `${pad(d.getDate())}` +
    `${pad(d.getHours())}` +
    `${pad(d.getMinutes())}` +
    `${pad(d.getSeconds())}`
  )
}

function randomDigits(n: number): string {
  let result = ""
  for (let i = 0; i < n; i++) {
    result += Math.floor(Math.random() * 10).toString()
  }
  return result
}

/** Generate a recharge order number: RE + timestamp + random */
export function generateRechargeOrderNo(now?: Date): string {
  return `RE${formatTimestamp(now ?? new Date())}${randomDigits(6)}`
}

/** Generate a bare metal order number: BM + timestamp + random */
export function generateBareMetalOrderNo(now?: Date): string {
  return `BM${formatTimestamp(now ?? new Date())}${randomDigits(6)}`
}

/** Generate a payment order number: PAY + timestamp + random */
export function generatePaymentOrderNo(now?: Date): string {
  return `PAY${formatTimestamp(now ?? new Date())}${randomDigits(6)}`
}

/** Generate a refund order number: RF + timestamp + random */
export function generateRefundOrderNo(now?: Date): string {
  return `RF${formatTimestamp(now ?? new Date())}${randomDigits(6)}`
}
