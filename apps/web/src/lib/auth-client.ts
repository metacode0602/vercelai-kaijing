import { createAuthClient } from 'better-auth/react'
import {
  adminClient,
  emailOTPClient,
  lastLoginMethodClient,
  organizationClient,
  phoneNumberClient,
} from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  // Must match websiteConfig.auth.cookiePrefix in @/lib/config/website
  advanced: { cookiePrefix: 'web' },
  plugins: [
    adminClient(),
    phoneNumberClient(),
    emailOTPClient(),
    organizationClient(),
    lastLoginMethodClient(),
  ],
})

export const { signIn, signUp, signOut, useSession } = authClient
