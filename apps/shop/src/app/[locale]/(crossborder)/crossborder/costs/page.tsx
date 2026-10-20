import { localeRedirect } from '@/lib/i18n/navigation'

export default async function CrossborderCostsRedirect({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  localeRedirect({ href: '/console/costs', locale })
}
