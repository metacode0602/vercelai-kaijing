import { config } from "dotenv"
import { defineConfig } from "drizzle-kit"
import { applyPgSslMode, resolvePgSslMode } from "./src/ssl"

config({ path: "../../.env" })

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run Drizzle commands")
}

const redactDatabaseUrl = (url: string) => url.replace(/(:\/\/[^:@/]+:)[^@/]+@/, "$1***@")
console.log("DATABASE_URL", redactDatabaseUrl(process.env.DATABASE_URL))

export default defineConfig({
  // web-auth-schema 单独列入：不进 schema.ts 聚合（其 adapter 键名会覆盖 public 同名键）
  schema: ["./src/schema.ts", "./src/web-auth-schema.ts"],
  // push/introspect 默认只看 public；显式列出 web_auth，避免 push 跳过平台管理员身份库
  schemaFilter: ["public", "web_auth"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // drizzle-kit 在提供 url 时会忽略 ssl 选项，TLS 策略必须写进连接串（见 src/ssl.ts）
    url: applyPgSslMode(process.env.DATABASE_URL, resolvePgSslMode(process.env.DATABASE_URL)),
  },
  strict: true,
  verbose: true,
})
