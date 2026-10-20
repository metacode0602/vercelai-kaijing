import { createPgClient } from "@workspace/db"

export const { db, pool } = createPgClient()