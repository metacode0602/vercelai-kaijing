import { requireAuth } from '@/lib/server/auth-utils'
import { OAuthSelectOrgView } from '@/components/auth/oauth-select-org-view'

export default async function OAuthSelectOrgPage() {
  await requireAuth('/oauth/signin')
  return <OAuthSelectOrgView />
}
