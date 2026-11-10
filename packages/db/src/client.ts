import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import { schema, type AppDbSchema } from "./schema"
import { applyPgSslMode, resolvePgSslMode } from "./ssl"
import { webAuthAdapterSchema } from "./web-auth-schema"

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

/** apps/web 平台管理员身份库专用实例（web_auth schema），见 web-auth-schema.ts */
export type WebAuthDatabase = NodePgDatabase<typeof webAuthAdapterSchema> & {
  $client: Pool
}

export type NodePgClient = {
  db: AppDatabase
  webAuthDb: WebAuthDatabase
  pool: Pool
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

  // 连接串内的 sslmode 会覆盖程序化 ssl 配置且语义随 pg 版本漂移（require 被当作
  // verify-full，自签证书链即失败），统一改写为 DATABASE_SSL/自动策略解析出的模式。
  const pool = new Pool({
    connectionString: applyPgSslMode(connectionString, resolvePgSslMode(connectionString)),
    max: resolvePoolMax(config),
  })

  const db = drizzle({
    client: pool,
    logger: config.logger ?? false,
    schema,
  })

  // 与 db 共享同一连接池，但 schema 隔离：join 查询按 db.query 键名解析，
  // 必须指向 web_auth 表，见 web-auth-schema.ts 顶部说明。
  const webAuthDb: WebAuthDatabase = drizzle({
    client: pool,
    logger: config.logger ?? false,
    schema: webAuthAdapterSchema,
  })

  return { db, webAuthDb, pool }
}