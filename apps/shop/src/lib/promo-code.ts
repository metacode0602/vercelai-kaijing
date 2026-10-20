/**
 * Promo code persistence utility
 * 
 * 从 URL 参数提取推广码并存储到 cookie，供注册流程使用
 */

const PROMO_CODE_COOKIE = 'gpurun_promo_code'
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 // 7 days in seconds

export function setPromoCodeCookie(promoCode: string): void {
  if (typeof document === 'undefined') return
  
  document.cookie = `${PROMO_CODE_COOKIE}=${encodeURIComponent(promoCode)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
}

export function getPromoCodeCookie(): string | null {
  if (typeof document === 'undefined') return null
  
  const cookies = document.cookie.split(';')
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=')
    if (name === PROMO_CODE_COOKIE) {
      return value ? decodeURIComponent(value) : null
    }
  }
  return null
}

export function clearPromoCodeCookie(): void {
  if (typeof document === 'undefined') return
  
  document.cookie = `${PROMO_CODE_COOKIE}=; path=/; max-age=0`
}

// Server-side cookie reading (for API routes)
export function getPromoCodeFromCookieHeader(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null
  
  const cookies = cookieHeader.split(';')
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=')
    if (name === PROMO_CODE_COOKIE) {
      return value ? decodeURIComponent(value) : null
    }
  }
  return null
}
