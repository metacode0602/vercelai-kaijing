import { requireAuth } from '@/lib/server/auth-utils'
import { SelectOrganizationView } from './_components/select-organization-view'

export default async function SelectOrganizationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireAuth('/signin?callbackUrl=%2Fselect-org')
  const { error } = await searchParams
  return <SelectOrganizationView suspendedError={error === 'suspended'} />
}
