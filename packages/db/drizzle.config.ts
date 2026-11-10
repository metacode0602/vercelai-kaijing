import { config } from "dotenv"
import { defineConfig } from "drizzle-kit"
import { applyPgSslMode, resolvePgSslMode } from "./src/ssl"

config({ path: "../../.env" })

console.log("DATABASE_URL", process.env.DATABASE_URL)

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run Drizzle commands")
}

export default defineConfig({
  // web-auth-schema 单独列入：不进 schema.ts 聚合（其 adapter 键名会覆盖 public 同名键）
  schema: ["./src/schema.ts", "./src/web-auth-schema.ts"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // drizzle-kit 在提供 url 时会忽略 ssl 选项，TLS 策略必须写进连接串（见 src/ssl.ts）
    url: applyPgSslMode(process.env.DATABASE_URL, resolvePgSslMode(process.env.DATABASE_URL)),
  },
  strict: true,
  verbose: true,
})
