import { OpenAPIHono } from "@hono/zod-openapi"
import { Scalar } from "@scalar/hono-api-reference"
import { Hono } from "hono"
import { compress } from "hono/compress"
import { cors } from "hono/cors"
import { csrf } from "hono/csrf"
import { logger } from "hono/logger"
import { prettyJSON } from "hono/pretty-json"
import { secureHeaders } from "hono/secure-headers"
import { timeout } from "hono/timeout"
import { AUTH_PATH } from "@workspace/auth"
import { auth } from "./lib/auth"
import { env } from "./lib/env"
import health from "./routes/health"
import hello from "./routes/hello"
import recharge from "./routes/recharge"
import bareMetal from "./routes/bare-metal"
import account from "./routes/account"
import consumption from "./routes/consumption"
import tasks from "./routes/tasks"
import sync from "./routes/sync-purchase-prices"
import vouchers from "./routes/vouchers"
import subjects from "./routes/subjects"
import agent from "./routes/agent"
import recon from "./routes/recon"

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

app.on(["GET", "POST"], `${AUTH_PATH}/*`, (c) => auth.handler(c.req.raw))

apiV1.route("/health", health)
apiV1.route("/hello", hello)
apiV1.route("/recharge", recharge)
apiV1.route("/bare-metal", bareMetal)
apiV1.route("/tasks", tasks)
apiV1.route("/account", account)
apiV1.route("/consumption", consumption)
apiV1.route("/sync", sync)
apiV1.route("/vouchers", vouchers)
apiV1.route("/subjects", subjects)
apiV1.route("/agent", agent)
apiV1.route("/recon", recon)

apiV1.doc("/open-api", {
  openapi: "3.0.0",
  info: {
    title: "Studio API",
    version: "1.0.0",
  },
  servers: [{ url: "/api/v1", description: "API v1" }],
})

app.route("/api/v1", apiV1)

app.get(
  "/docs",
  Scalar({
    pageTitle: "Studio API",
    sources: [
      { url: "/api/v1/open-api", title: "API" },
      { url: `${AUTH_PATH}/open-api/generate-schema`, title: "Auth" },
    ],
  })
)

export default app
