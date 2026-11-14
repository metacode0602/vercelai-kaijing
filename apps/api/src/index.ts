import { serve } from "@hono/node-server"
import app from "./app"
import { pool } from "./lib/db"
import { env } from "./lib/env"
import {
  startMarketplaceSyncCron,
  stopMarketplaceSyncCron,
} from "./lib/marketplace/cron"

// Vercel 以 default export 作为 Hono 入口；本地/自托管才启动常驻 HTTP 服务。
export default app

if (!process.env.VERCEL) {
  const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
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
}
