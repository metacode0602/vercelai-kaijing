import { createPgClient } from '@workspace/db'

const { db, webAuthDb, pool } = createPgClient()

export { db, webAuthDb, pool }
