import { localeRedirect } from '@/lib/i18n/navigation'

export default async function CrossborderInventoryRedirect({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  localeRedirect({ href: '/console/inventory', locale })
}
