import { Hono } from "hono"
import { OpenAPIHono } from "@hono/zod-openapi"
import { logger } from "hono/logger"
import { compress } from "hono/compress"
import { secureHeaders } from "hono/secure-headers"
import { prettyJSON } from "hono/pretty-json"
import { cors } from "hono/cors"
import { timeout } from "hono/timeout"
import { csrf } from "hono/csrf"

import { auth } from "./lib/auth"
import { env } from "./lib/env"
import { AUTH_PATH } from "./lib/auth-path"
import mcpApp from "./mcp-app"

import health from "./routes/health"
import hello from "./routes/hello"
import cron from "./routes/cron"
import webhooks from "./routes/webhooks"
import sync from "./routes/sync"

const app = new Hono()
const apiV1 = new OpenAPIHono()
const hasExplicitOrigins = env.BETTER_AUTH_TRUSTED_ORIGINS.length > 0

app.use("*", timeout(5000))

app.use(logger())
app.use(compress())
app.use(secureHeaders())
app.use(prettyJSON())

app.use(
  `${AUTH_PATH}/*`,
  cors({
    origin: hasExplicitOrigins ? env.BETTER_AUTH_TRUSTED_ORIGINS : "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: hasExplicitOrigins,
  })
)

app.use(
  "/api/v1/*",
  cors({
    origin: hasExplicitOrigins ? env.BETTER_AUTH_TRUSTED_ORIGINS : "*",
    credentials: hasExplicitOrigins,
  })
)

apiV1.use(
  "*",
  csrf({
    origin: hasExplicitOrigins ? env.BETTER_AUTH_TRUSTED_ORIGINS : undefined,
  })
)

app.all(`${AUTH_PATH}/*`, () => auth.handler())

apiV1.route("/health", health)
apiV1.route("/hello", hello)
apiV1.route("/cron", cron)
apiV1.route("/webhooks", webhooks)
apiV1.route("/sync", sync)

apiV1.doc("/open-api", {
  openapi: "3.0.0",
  info: {
    version: "1.0.0",
    title: "Open Shop API",
  },
})

app.route("/api/v1", apiV1)

/**
 * 根应用：/mcp 先于现有 app 挂载，避免落入 5s timeout / CSRF。
 * Vercel 等平台以本文件作为入口（default export）。
 */
const root = new Hono()
root.route("/", mcpApp)
root.route("/", app)

export default root
