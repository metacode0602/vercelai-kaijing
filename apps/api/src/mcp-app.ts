import { Hono } from "hono"
import { cors } from "hono/cors"
import { env } from "./lib/env"

/**
 * MCP 宿主与现有 app.ts 分离：不受全局 5s timeout 与 /api/v1 CSRF 影响。
 * 本阶段只挂路由壳；业务工具在 S3/S4 交付，不在此假装已完成。
 */
const mcpApp = new Hono()
const hasExplicitOrigins = env.BETTER_AUTH_TRUSTED_ORIGINS.length > 0

mcpApp.use(
  "/mcp",
  cors({
    origin: hasExplicitOrigins ? env.BETTER_AUTH_TRUSTED_ORIGINS : "*",
    allowHeaders: ["Content-Type", "Authorization", "Mcp-Session-Id"],
    allowMethods: ["POST", "GET", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length", "Mcp-Session-Id"],
    maxAge: 600,
    credentials: hasExplicitOrigins,
  }),
)
mcpApp.use(
  "/mcp/*",
  cors({
    origin: hasExplicitOrigins ? env.BETTER_AUTH_TRUSTED_ORIGINS : "*",
    allowHeaders: ["Content-Type", "Authorization", "Mcp-Session-Id"],
    allowMethods: ["POST", "GET", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length", "Mcp-Session-Id"],
    maxAge: 600,
    credentials: hasExplicitOrigins,
  }),
)

mcpApp.all("/mcp", (c) => {
  if (!env.OPENSHOP_MCP_ENABLED) return c.notFound()
  return c.json(
    {
      error: "mcp_not_ready",
      message: "MCP 工具将在后续阶段交付。授权与设置已可使用，请勿将本响应视为工具已上线。",
    },
    503,
  )
})

mcpApp.all("/mcp/*", (c) => {
  if (!env.OPENSHOP_MCP_ENABLED) return c.notFound()
  return c.json(
    {
      error: "mcp_not_ready",
      message: "MCP 工具将在后续阶段交付。授权与设置已可使用，请勿将本响应视为工具已上线。",
    },
    503,
  )
})

export default mcpApp
