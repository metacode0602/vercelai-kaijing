export function getUrlWithLocale(path: string, locale: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  return `${base}/${locale}${path}`
}
