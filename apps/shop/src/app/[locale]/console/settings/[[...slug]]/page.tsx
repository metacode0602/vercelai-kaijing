import { localeRedirect } from '@/lib/i18n/navigation'

/** 旧设置区路由兼容重定向：/console/settings/* → /settings/*（通知与历史链接兜底）。 */
export default async function LegacyConsoleSettingsRedirectPage({
  params,
}: {
  params: Promise<{ locale: string; slug?: string[] }>
}) {
  const { locale, slug } = await params
  const suffix = (slug ?? []).map((part) => encodeURIComponent(part)).join('/')
  localeRedirect({ href: suffix ? `/settings/${suffix}` : '/settings', locale })
}
