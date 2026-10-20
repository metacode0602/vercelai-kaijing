import { config } from "dotenv"
import { defineConfig } from "drizzle-kit"

config({ path: "../../.env" })

console.log("DATABASE_URL", process.env.DATABASE_URL)

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run Drizzle commands")
}

function isLocalhost(url: string): boolean {
  const host = url.match(/@([^:/@?#]+)/)?.[1]?.replace(/^\[|\]$/g, "").toLowerCase()
  return (
    !host ||
    host === "localhost" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host.startsWith("127.")
  )
}

function resolveSsl(url: string): boolean | "require" | "verify-full" | "allow" | "prefer" {
  const mode = (process.env.DATABASE_SSL ?? "").trim().toLowerCase()
  if (mode === "require" || mode === "required" || mode === "true" || mode === "1") {
    return "verify-full"
  }
  if (mode === "noverify" || mode === "verify-none" || mode === "allow" || mode === "prefer") {
    return "require"
  }
  if (mode === "disable" || mode === "false" || mode === "0" || mode === "no" || mode === "none") {
    return false
  }
  return isLocalhost(url) ? false : "require"
}

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
    ssl: resolveSsl(process.env.DATABASE_URL),
  },
  strict: true,
  verbose: true,
})
