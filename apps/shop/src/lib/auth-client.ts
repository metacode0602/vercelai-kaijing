import { createAuthClient } from 'better-auth/react'
import {
  emailOTPClient,
  organizationClient,
  phoneNumberClient,
} from 'better-auth/client/plugins'

// Must match websiteConfig.auth.cookiePrefix in @/lib/config/website
export const authClient = createAuthClient({
  advanced: { cookiePrefix: 'gpus' },
  plugins: [organizationClient(), phoneNumberClient(), emailOTPClient()],
})
