import { localeRedirect } from "@/lib/i18n/navigation"

export default async function InstancesRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; locale: string }>
  searchParams: Promise<{ new?: string }>
}) {
  const { id, locale } = await params
  const { new: isNew } = await searchParams
  localeRedirect({
    href: `/console/instances/${id}${isNew === "1" ? "?new=1" : ""}`,
    locale,
  })
}