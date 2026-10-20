import { schema } from "@workspace/db"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is missing. In this monorepo, Next.js reads env from apps/dashboard/.env* by default."
  )
}

export const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

export const db = drizzle({
  client: pgPool,
  logger: true,
  schema,
})
