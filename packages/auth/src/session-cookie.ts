interface CookieAttributes {
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'Strict' | 'Lax' | 'None'
  path?: string
  maxAge?: number
  domain?: string
}

const ALGORITHM = { name: 'HMAC', hash: 'SHA-256' } as const

async function makeSignature(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    ALGORITHM,
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(ALGORITHM.name, key, new TextEncoder().encode(value))
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
}

async function signCookieValue(value: string, secret: string): Promise<string> {
  const signature = await makeSignature(value, secret)
  return encodeURIComponent(`${value}.${signature}`)
}

function serializeCookie(name: string, value: string, attrs: CookieAttributes): string {
  let cookie = `${name}=${value}`
  if (typeof attrs.maxAge === 'number' && attrs.maxAge >= 0) {
    cookie += `; Max-Age=${Math.floor(attrs.maxAge)}`
  }
  if (attrs.path) cookie += `; Path=${attrs.path}`
  if (attrs.domain) cookie += `; Domain=${attrs.domain}`
  if (attrs.httpOnly) cookie += '; HttpOnly'
  if (attrs.secure) cookie += '; Secure'
  if (attrs.sameSite) cookie += `; SameSite=${attrs.sameSite}`
  return cookie
}

export async function signSessionCookie(
  cookieName: string,
  token: string,
  secret: string,
  attributes: CookieAttributes,
): Promise<string> {
  const signedValue = await signCookieValue(token, secret)
  return serializeCookie(cookieName, signedValue, attributes)
}
