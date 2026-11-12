import { getSessionCookie } from 'better-auth/cookies'
import createIntlMiddleware from 'next-intl/middleware'
import { NextResponse, type NextRequest } from 'next/server'
import { websiteConfig } from '@/lib/config/website'
import { routing } from '@/lib/i18n/routing'

const handleI18nRouting = createIntlMiddleware(routing)

const PROTECTED_PREFIXES = ['/console', '/settings', '/onboarding', '/select-org']

function isOAuthSessionPath(pathname: string) {
  return (
    pathname === '/oauth/consent' ||
    pathname.startsWith('/oauth/consent/') ||
    pathname === '/oauth/select-org' ||
    pathname.startsWith('/oauth/select-org/')
  )
}

function isProtectedPath(pathname: string) {
  if (isOAuthSessionPath(pathname)) return true
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

function stripLocale(pathname: string) {
  const segments = pathname.split('/').filter(Boolean)
  const first = segments[0]
  if (first && (routing.locales as readonly string[]).includes(first)) {
    return { locale: first, pathname: `/${segments.slice(1).join('/')}` }
  }
  return { locale: undefined, pathname }
}

export function proxy(request: NextRequest) {
  const { locale, pathname } = stripLocale(request.nextUrl.pathname)

  if (
    isProtectedPath(pathname) &&
    !getSessionCookie(request, { cookiePrefix: websiteConfig.auth.cookiePrefix })
  ) {
    if (isOAuthSessionPath(pathname)) {
      const signinUrl = new URL(locale ? `/${locale}/oauth/signin` : '/oauth/signin', request.url)
      request.nextUrl.searchParams.forEach((value, key) => {
        signinUrl.searchParams.set(key, value)
      })
      return NextResponse.redirect(signinUrl)
    }
    const signinUrl = new URL(locale ? `/${locale}/signin` : '/signin', request.url)
    signinUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(signinUrl)
  }

  return handleI18nRouting(request)
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
}
