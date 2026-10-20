import { schema } from "@workspace/db"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { AUTH_PATH } from "./constants"
import { sharedAuthOptions } from "./options"

type DrizzleDatabase = Parameters<typeof drizzleAdapter>[0]

export type CreateAuthOptions = {
  baseURL: string
  secret: string
  trustedOrigins?: string[]
  cookiePrefix?: string
}

export function createAuth(
  database: DrizzleDatabase,
  options: CreateAuthOptions
) {
  return betterAuth({
    ...sharedAuthOptions,
    advanced: {
      ...(options.cookiePrefix ? { cookiePrefix: options.cookiePrefix } : {}),
    },
    basePath: AUTH_PATH,
    baseURL: options.baseURL,
    secret: options.secret,
    trustedOrigins: options.trustedOrigins ?? [],
    database: drizzleAdapter(database, {
      provider: "pg",
      schema,
    }),
  })
}
