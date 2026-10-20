import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"
import { Pool, type PoolConfig } from "pg"
import { schema, type AppDbSchema } from "./schema"

export type NodePgClientConfig = {
  connectionString?: string
  logger?: boolean
  max?: number
}

/**
 * 显式声明客户端类型，避免消费方（如 apps/api 的 `export const { db }`）
 * 触发 TS2742: 推断类型无法在不引用各 schema 子模块的情况下命名。
 */
export type AppDatabase = NodePgDatabase<AppDbSchema> & { $client: Pool }

export type NodePgClient = {
  db: AppDatabase
  pool: Pool
}

function extractHost(connectionString: string): string | undefined {
  const match = connectionString.match(/@([^:/@?#]+)/)
  return match?.[1]
}

function isLocalhost(host: string | undefined): boolean {
  if (!host) return false
  const normalized = host.replace(/^\[|\]$/g, "").toLowerCase()
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "0.0.0.0" ||
    normalized.startsWith("127.")
  )
}

function resolveSsl(connectionString: string): PoolConfig["ssl"] {
  const mode = (process.env.DATABASE_SSL ?? "").trim().toLowerCase()

  if (mode === "require" || mode === "required" || mode === "true" || mode === "1" || mode === "yes") {
    return { rejectUnauthorized: true }
  }
  if (
    mode === "noverify" ||
    mode === "verify-none" ||
    mode === "allow" ||
    mode === "prefer"
  ) {
    return { rejectUnauthorized: false }
  }
  if (mode === "disable" || mode === "false" || mode === "0" || mode === "no" || mode === "none") {
    return false
  }

  const host = extractHost(connectionString)
  if (isLocalhost(host)) return false
  return { rejectUnauthorized: false }
}

function resolvePoolMax(config: NodePgClientConfig): number {
  if (config.max != null) return config.max
  const raw = process.env.DATABASE_POOL_MAX
  if (raw) {
    const parsed = Number.parseInt(raw.trim(), 10)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return 10
}

export function createPgClient(config: NodePgClientConfig = {}): NodePgClient {
  const connectionString = config.connectionString ?? process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL is missing.")
  }

  const pool = new Pool({
    connectionString,
    ssl: resolveSsl(connectionString),
    max: resolvePoolMax(config),
  })

  const db = drizzle({
    client: pool,
    logger: config.logger ?? false,
    schema,
  })

  return { db, pool }
}