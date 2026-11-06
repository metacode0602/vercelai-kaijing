import { localeRedirect } from '@/lib/i18n/navigation'
import type { Locale } from 'next-intl'

export default async function SignupPage({
  params,
}: {
  params: Promise<{ locale: Locale }>
}) {
  const { locale } = await params
  // 平台仅限管理员登录，关闭注册入口
  localeRedirect({ href: '/signin', locale })
}
