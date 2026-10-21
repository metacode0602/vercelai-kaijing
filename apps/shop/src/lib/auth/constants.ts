export const AUTH_PATH = '/api/auth'

/** Normalize CN mobile: digits only; strip leading 86 when remainder is 11 digits. */
export function normalizeContactPhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length > 11 && digits.startsWith('86')) {
    const withoutCountryCode = digits.slice(2)
    if (withoutCountryCode.length === 11) return withoutCountryCode
  }
  return digits
}
