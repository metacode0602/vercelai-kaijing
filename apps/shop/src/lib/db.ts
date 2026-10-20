import { createPgClient } from '@workspace/db'

export const { db, pool: pgPool } = createPgClient({
  logger: process.env.NODE_ENV !== 'production',
})
