import { sharedAuthOptions } from '@workspace/auth'
import { schema } from '@workspace/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { admin as adminPlugin, lastLoginMethod } from 'better-auth/plugins'
import { db } from './db'

const isProd = process.env.NODE_ENV === 'production'

export const auth = betterAuth({
  ...sharedAuthOptions,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, { schema, provider: 'pg' }),
  advanced: {
    // Must match createAuthClient cookiePrefix in @/lib/auth-client
    cookiePrefix: 'web',
    ...(isProd && {
      useSecureCookies: true,
    }),
  },
  emailAndPassword: {
    enabled: true,
  },
  plugins: [...(sharedAuthOptions.plugins ?? []), adminPlugin(), lastLoginMethod(), nextCookies()],
})
