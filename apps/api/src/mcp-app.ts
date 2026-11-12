import { db } from "./lib/db"
import { env } from "./lib/env"
import { createMcpRouter } from "./mcp/router"

/**
 * MCP 宿主与现有 app.ts 分离：不受全局 5s timeout 与 /api/v1 CSRF 影响。
 * 只读与待审写工具在 /mcp 以 JSON-RPC 提供；环境开关关闭时返回 404。
 */
const mcpApp = createMcpRouter({
  db,
  env: {
    OPENSHOP_MCP_ENABLED: env.OPENSHOP_MCP_ENABLED,
    OPENSHOP_MCP_RESOURCE: env.OPENSHOP_MCP_RESOURCE,
    OPENSHOP_OAUTH_ISSUER: env.OPENSHOP_OAUTH_ISSUER,
    BETTER_AUTH_URL: env.BETTER_AUTH_URL,
    BETTER_AUTH_TRUSTED_ORIGINS: env.BETTER_AUTH_TRUSTED_ORIGINS,
  },
})

export default mcpApp
