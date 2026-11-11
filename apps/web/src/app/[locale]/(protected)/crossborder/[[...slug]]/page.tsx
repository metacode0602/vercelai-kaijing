import { redirect } from 'next/navigation'
import { mapLegacyPlatformPath } from '@/lib/navigation/legacy-paths'

export default async function CrossborderLegacyRedirectPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}) {
  const { slug } = await params
  const pathname = slug?.length ? `/crossborder/${slug.join('/')}` : '/crossborder'
  redirect(mapLegacyPlatformPath(pathname) ?? '/console')
}
