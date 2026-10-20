import { createPgClient } from '@workspace/db'

const { db, pool } = createPgClient()

export { db, pool }
