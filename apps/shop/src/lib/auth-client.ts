'use client'

import { createAuthClient } from 'better-auth/react'
import { emailOTPClient, phoneNumberClient } from 'better-auth/client/plugins'
import { oauthProviderClient } from '@better-auth/oauth-provider/client'
import { websiteConfig } from '@/lib/config/website'

export const authClient = createAuthClient({
  advanced: { cookiePrefix: websiteConfig.auth.cookiePrefix },
  plugins: [phoneNumberClient(), emailOTPClient(), oauthProviderClient()],
})

export const { signIn, signOut, useSession } = authClient
