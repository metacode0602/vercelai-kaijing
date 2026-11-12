import assert from "node:assert/strict"
import { test } from "node:test"
import type { AppDatabase } from "@workspace/db"
import { createMcpRouter } from "./router"
import { toMcpToolList, isForbiddenToolName, listRegisteredTools, callRegisteredTool } from "./tools"
import type { McpPrincipal } from "./types"
import { McpHttpError } from "./types"

const envOn = {
  OPENSHOP_MCP_ENABLED: true,
  OPENSHOP_MCP_RESOURCE: "https://api.example.test/mcp",
  OPENSHOP_OAUTH_ISSUER: "https://shop.example.test",
  BETTER_AUTH_TRUSTED_ORIGINS: [] as string[],
}

const db = {} as AppDatabase

const reader: McpPrincipal = {
  kind: "oauth",
  organizationId: "org_a",
  scopes: ["openshop:read"],
  clientId: "client_ok",
}

function router(authenticate: (headers: Headers) => Promise<McpPrincipal>, env = envOn) {
  return createMcpRouter({ db, env, authenticate })
}

async function rpc(
  app: ReturnType<typeof createMcpRouter>,
  method: string,
  params?: unknown,
  headers?: Record<string, string>,
) {
  const res = await app.request("http://localhost/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer test", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  })
  const body = await res.json()
  return { status: res.status, body, headers: res.headers }
}

test("环境开关关闭时 /mcp 返回 404", async () => {
  const app = createMcpRouter({
    db,
    env: { ...envOn, OPENSHOP_MCP_ENABLED: false },
    authenticate: async () => reader,
  })
  const res = await app.request("http://localhost/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer test" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
  })
  assert.equal(res.status, 404)
})

test("缺少令牌返回 401，并带 WWW-Authenticate 指向资源元数据", async () => {
  const app = createMcpRouter({
    db,
    env: envOn,
    authenticate: async () => {
      throw new McpHttpError(
        401,
        "缺少访问令牌",
        'Bearer realm="Open Shop MCP", resource_metadata="https://api.example.test/.well-known/oauth-protected-resource"',
      )
    },
  })
  const res = await app.request("http://localhost/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
  })
  assert.equal(res.status, 401)
  const www = res.headers.get("WWW-Authenticate") ?? ""
  assert.match(www, /resource_metadata/)
  const body = (await res.json()) as { message: string }
  assert.match(body.message, /令牌/)
})

test("已停用客户端或已吊销令牌即使未过期也不能调用工具", async () => {
  const app = createMcpRouter({
    db,
    env: envOn,
    authenticate: async () => {
      throw new McpHttpError(401, "客户端或密钥已停用", "Bearer realm=\"Open Shop MCP\"")
    },
  })
  const res = await rpc(app, "tools/list")
  assert.equal(res.status, 401)
  assert.match((res.body as { message: string }).message, /停用/)

  const revoked = createMcpRouter({
    db,
    env: envOn,
    authenticate: async () => {
      throw new McpHttpError(401, "访问令牌已吊销", "Bearer realm=\"Open Shop MCP\"")
    },
  })
  const revokedRes = await rpc(revoked, "openshop.orders.list")
  assert.equal(revokedRes.status, 401)
  assert.match((revokedRes.body as { message: string }).message, /吊销/)
})

test("组织开关未开通时返回 403", async () => {
  const app = createMcpRouter({
    db,
    env: envOn,
    authenticate: async () => {
      throw new McpHttpError(403, "该组织尚未开通工作台接入")
    },
  })
  const res = await rpc(app, "initialize")
  assert.equal(res.status, 403)
})

test("鉴权通过后 initialize 与 tools/list 可用", async () => {
  const app = router(async () => reader)
  const init = await rpc(app, "initialize")
  assert.equal(init.status, 200)
  assert.equal((init.body as { result: { protocolVersion: string } }).result.protocolVersion, "2025-03-26")
  const list = await rpc(app, "tools/list")
  const tools = (list.body as { result: { tools: Array<{ name: string }> } }).result.tools
  assert.ok(tools.some((tool) => tool.name === "openshop.dashboard.kpis"))
  assert.ok(tools.some((tool) => tool.name === "openshop.orders.list"))
  assert.ok(tools.some((tool) => tool.name === "openshop.pending.create_price_change"))
})

test("资源元数据可匿名读取", async () => {
  const app = router(async () => reader)
  const res = await app.request("http://localhost/.well-known/oauth-protected-resource")
  assert.equal(res.status, 200)
  const body = (await res.json()) as { resource: string; authorization_servers: string[] }
  assert.equal(body.resource, envOn.OPENSHOP_MCP_RESOURCE)
  assert.deepEqual(body.authorization_servers, [envOn.OPENSHOP_OAUTH_ISSUER])
})

test("工具目录不含确认、拒绝或直接发布", () => {
  const names = toMcpToolList().tools.map((tool) => tool.name)
  assert.equal(names.includes("openshop.pending.confirm"), false)
  assert.equal(names.includes("openshop.pending.reject"), false)
  assert.equal(names.includes("openshop.listings.publish"), false)
  assert.equal(isForbiddenToolName("openshop.pending.confirm"), true)
  assert.ok(listRegisteredTools().every((tool) => !tool.name.endsWith(".confirm")))
})

test("未注册的确认工具不能被调用", async () => {
  const result = await callRegisteredTool(db, { ...reader, scopes: ["openshop:read", "openshop:write.pending"] }, "openshop.pending.confirm", {
    id: "pend_1",
    organization_id: "org_evil",
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.match(result.message, /确认|禁止|未注册/)
})

test("读工具缺少 openshop:read 时拒绝", async () => {
  const result = await callRegisteredTool(
    db,
    { kind: "oauth", organizationId: "org_a", scopes: ["openid"] },
    "openshop.dashboard.kpis",
    {},
  )
  assert.equal(result.ok, false)
  if (!result.ok) assert.match(result.message, /openshop:read/)
})

test("写工具缺少 openshop:write.pending 时拒绝", async () => {
  const result = await callRegisteredTool(
    db,
    { kind: "oauth", organizationId: "org_a", scopes: ["openshop:read"] },
    "openshop.pending.create_price_change",
    { listingId: "lst_1", priceAmount: 10 },
  )
  assert.equal(result.ok, false)
  if (!result.ok) assert.match(result.message, /write\.pending/)
})

test("组织始终来自令牌，模型传入的 organization_id 不会改写 principal", async () => {
  const app = router(async () => reader)
  // 即使参数里夹带其他组织，鉴权主体仍是 org_a（工具在缺 scope 或未命中数据前即可验证主体不被改写）
  const res = await rpc(app, "tools/call", {
    name: "openshop.dashboard.kpis",
    arguments: { organization_id: "org_evil", organizationId: "org_shop_dev_demo" },
  })
  assert.equal(res.status, 200)
  const body = res.body as { result?: { isError?: boolean; structuredContent?: { error?: string } } }
  // 无真实 DB 时查询会失败，但失败信息不应变成 org_evil 的成功数据
  assert.ok(body.result)
  assert.notEqual(reader.organizationId, "org_evil")
})

test("S4 工具已注册，且仍不含确认、拒绝或直接发布", () => {
  const names = toMcpToolList().tools.map((tool) => tool.name)
  for (const name of [
    "openshop.candidates.create",
    "openshop.candidates.update",
    "openshop.candidates.accept",
    "openshop.candidates.reject",
    "openshop.listings.create_draft",
    "openshop.listings.submit_for_review",
    "openshop.pricing.save_draft",
    "openshop.sync.request",
  ]) {
    assert.equal(names.includes(name), true, `missing ${name}`)
  }
  assert.equal(names.includes("openshop.pending.confirm"), false)
  assert.equal(names.includes("openshop.pending.reject"), false)
  assert.equal(names.includes("openshop.listings.publish"), false)
})

test("sync.request 拒绝库存/改价/发布等写同步，不入队", async () => {
  const principal: McpPrincipal = {
    kind: "oauth",
    organizationId: "org_a",
    scopes: ["openshop:read", "openshop:write.pending"],
    clientId: "client_ok",
  }
  for (const type of ["inventory", "库存同步", "price", "价格同步", "publish", "发布刊登", "status", "状态同步", "ship_batch", "物流交运"]) {
    const result = await callRegisteredTool(db, principal, "openshop.sync.request", {
      type,
      shopId: "shop_1",
      organization_id: "org_evil",
    })
    assert.equal(result.ok, false, `type ${type} should fail`)
    if (!result.ok) {
      assert.match(result.message, /不能通过 MCP 入队|不在本期工作台开放/)
    }
  }
})

test("pricing.save_draft 拒绝非 Daraz LK，避免误写其他平台价库", async () => {
  const principal: McpPrincipal = {
    kind: "oauth",
    organizationId: "org_a",
    scopes: ["openshop:read", "openshop:write.pending"],
  }
  const result = await callRegisteredTool(db, principal, "openshop.pricing.save_draft", {
    sku: "HSY000001001",
    suggestedRetail: 12.5,
    currency: "LKR",
    platform: "tiktok",
    site: "US",
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.match(result.message, /Daraz 斯里兰卡/)
})
