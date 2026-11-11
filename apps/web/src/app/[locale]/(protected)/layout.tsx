import { requirePlatformAdmin } from '@/lib/server/require-platform-admin'

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requirePlatformAdmin()
  return children
}
