import { serve } from "@hono/node-server"
import { Hono } from "hono"
import app from "./app"
import mcpApp from "./mcp-app"
import { pool } from "./lib/db"
import { env } from "./lib/env"
import {
  startMarketplaceSyncCron,
  stopMarketplaceSyncCron,
} from "./lib/marketplace/cron"

const root = new Hono()
// /mcp 必须先于现有 app 挂载，避免落入 5s timeout / CSRF。
root.route("/", mcpApp)
root.route("/", app)

const server = serve({ fetch: root.fetch, port: env.PORT }, (info) => {
  console.log(`API running on http://localhost:${info.port}`)
  startMarketplaceSyncCron()
})

function shutdown() {
  stopMarketplaceSyncCron()
  server.close(async (err) => {
    if (err) {
      console.error(err)
      process.exit(1)
      return
    }

    try {
      await pool.end()
      process.exit(0)
    } catch (error) {
      console.error(error)
      process.exit(1)
    }
  })
}

process.on("SIGINT", () => {
  shutdown()
})

process.on("SIGTERM", () => {
  shutdown()
})
