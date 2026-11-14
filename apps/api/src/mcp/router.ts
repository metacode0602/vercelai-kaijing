import { Hono } from "hono"
import { cors } from "hono/cors"
import { timeout } from "hono/timeout"
import { randomUUID } from "node:crypto"
import {
  OPENSHOP_ISSUABLE_SCOPES,
} from "@workspace/auth"
import type { AppDatabase } from "@workspace/db"
import { authenticateMcpRequest, resolveOauthIssuer, wwwAuthenticate } from "./auth"
import {
  MCP_PROTOCOL_VERSION,
  isJsonRpcNotification,
  parseJsonRpc,
  rpcError,
  rpcResult,
  type JsonRpcRequest,
} from "./protocol"
import { callRegisteredTool, toMcpToolList } from "./tools"
import { McpHttpError, type McpEnv, type McpPrincipal } from "./types"

const TEN_MINUTES_MS = 10 * 60 * 1000

export type McpRouterOptions = {
  env: McpEnv
  db: AppDatabase
  authenticate?: (headers: Headers) => Promise<McpPrincipal>
}

function protectedResourceMetadata(env: McpEnv) {
  const resource = env.OPENSHOP_MCP_RESOURCE || "https://localhost/mcp"
  const issuer = resolveOauthIssuer(env)
  return {
    resource,
    authorization_servers: issuer ? [issuer] : [],
    bearer_methods_supported: ["header"],
    scopes_supported: [...OPENSHOP_ISSUABLE_SCOPES],
  }
}

async function dispatch(
  request: JsonRpcRequest,
  ctx: { db: AppDatabase; principal: McpPrincipal },
): Promise<unknown> {
  const method = request.method ?? ""
  const params = (request.params && typeof request.params === "object" ? request.params : {}) as Record<
    string,
    unknown
  >
  if (method === "initialize") {
    return {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "open-shop", title: "Open Shop 工作台", version: "0.3.0" },
      instructions:
        "Desktop 第一期仅开放 Daraz 斯里兰卡。组织由访问令牌绑定，请勿传入 organization_id。写工具只创建或补全待审，确认请在 /console/pending。",
    }
  }
  if (method === "ping") return {}
  if (method === "notifications/initialized") return { ok: true }
  if (method === "tools/list") return toMcpToolList()
  if (method === "tools/call") {
    const name = typeof params.name === "string" ? params.name : ""
    const args =
      params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments)
        ? (params.arguments as Record<string, unknown>)
        : {}
    if (!name) throw new Error("缺少工具名称")
    const result = await callRegisteredTool(ctx.db, ctx.principal, name, args)
    if (!result.ok) {
      return {
        content: [{ type: "text", text: result.message }],
        structuredContent: {
          error: {
            code: result.code,
            message: result.message,
            fieldErrors: result.fieldErrors,
            retryable: result.retryable,
            requestId: randomUUID(),
            pendingActionId: result.pendingActionId,
          },
        },
        isError: true,
      }
    }
    const text = JSON.stringify(result.data, null, 2)
    return {
      content: [{ type: "text", text }],
      structuredContent: result.data,
      isError: false,
    }
  }
  const error = new Error(`不支持的方法：${method}`)
  ;(error as Error & { rpcCode: number }).rpcCode = -32601
  throw error
}

export function createMcpRouter(options: McpRouterOptions) {
  const { env, db } = options
  const authenticate = options.authenticate ?? ((headers: Headers) => authenticateMcpRequest(db, env, headers))
  const app = new Hono()
  const hasExplicitOrigins = env.BETTER_AUTH_TRUSTED_ORIGINS.length > 0

  const corsMw = cors({
    origin: hasExplicitOrigins ? env.BETTER_AUTH_TRUSTED_ORIGINS : "*",
    allowHeaders: ["Content-Type", "Authorization", "Mcp-Session-Id"],
    allowMethods: ["POST", "GET", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length", "Mcp-Session-Id", "WWW-Authenticate"],
    maxAge: 600,
    credentials: hasExplicitOrigins,
  })
  app.use("/mcp", corsMw)
  app.use("/mcp/*", corsMw)
  app.use("/mcp", timeout(TEN_MINUTES_MS))

  app.get("/.well-known/oauth-protected-resource", (c) => c.json(protectedResourceMetadata(env)))
  app.get("/.well-known/oauth-protected-resource/mcp", (c) => c.json(protectedResourceMetadata(env)))

  app.get("/mcp", (c) => {
    if (!env.OPENSHOP_MCP_ENABLED) return c.notFound()
    return c.json({ error: "method_not_allowed", message: "请使用 POST /mcp 调用 JSON-RPC 工具。" }, 405)
  })

  app.post("/mcp", async (c) => {
    if (!env.OPENSHOP_MCP_ENABLED) return c.notFound()
    let principal: McpPrincipal
    try {
      principal = await authenticate(c.req.raw.headers)
    } catch (error) {
      if (error instanceof McpHttpError) {
        if (error.wwwAuthenticate) c.header("WWW-Authenticate", error.wwwAuthenticate)
        if (error.status === 404) return c.notFound()
        return c.json({ error: error.status === 403 ? "mcp_forbidden" : "mcp_unauthorized", message: error.message }, error.status)
      }
      c.header("WWW-Authenticate", wwwAuthenticate(env))
      return c.json({ error: "mcp_unauthorized", message: "鉴权失败" }, 401)
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(rpcError(null, -32700, "请求体不是合法 JSON"), 200)
    }
    const parsed = parseJsonRpc(body)
    if (!parsed) return c.json(rpcError(null, -32600, "无效的 JSON-RPC 请求"), 200)

    const handleOne = async (request: JsonRpcRequest) => {
      if (!request.method) return rpcError(request.id ?? null, -32600, "缺少 method")
      if (isJsonRpcNotification(request) && request.method === "notifications/initialized") {
        return null
      }
      try {
        const result = await dispatch(request, { db, principal })
        return rpcResult(request.id ?? null, result)
      } catch (error) {
        const rpcCode = (error as { rpcCode?: number }).rpcCode ?? -32603
        const message = error instanceof Error ? error.message : "内部错误"
        return rpcError(request.id ?? null, rpcCode, message)
      }
    }

    if (Array.isArray(parsed)) {
      const results = (await Promise.all(parsed.map(handleOne))).filter((item) => item !== null)
      return c.json(results)
    }
    const result = await handleOne(parsed)
    if (result === null) return c.body(null, 204)
    return c.json(result)
  })

  return app
}
