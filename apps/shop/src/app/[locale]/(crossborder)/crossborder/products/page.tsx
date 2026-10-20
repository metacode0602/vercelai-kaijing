import { localeRedirect } from '@/lib/i18n/navigation'

export default async function CrossborderProductsRedirect({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  localeRedirect({ href: '/console/products', locale })
}
