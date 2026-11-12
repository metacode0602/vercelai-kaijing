import { requireAuth } from '@/lib/server/auth-utils'
import { OAuthConsentView } from '@/components/auth/oauth-consent-view'

export default async function OAuthConsentPage() {
  await requireAuth('/oauth/signin')
  return <OAuthConsentView />
}
