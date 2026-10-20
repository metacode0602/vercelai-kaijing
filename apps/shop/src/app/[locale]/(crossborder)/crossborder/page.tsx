import { localeRedirect } from "@/lib/i18n/navigation"

export default async function CrossborderIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  localeRedirect({ href: "/crossborder/candidates", locale })
}
