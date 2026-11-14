import assert from "node:assert/strict"
import { test } from "node:test"
import { createShopOAuthProviderOptions } from "./oauth-provider"

test("clientPrivileges 把 headers 透传给 canManageClients", async () => {
  let seenHeaders: Headers | undefined
  const options = createShopOAuthProviderOptions({
    mcpResource: "https://api.example.test/mcp",
    listOrganizationIds: async () => [],
    canManageClients: (input) => {
      seenHeaders = input.headers
      return true
    },
  })
  const headers = new Headers({ cookie: "shop.lastOrganizationId=org_1" })

  const allowed = await options.clientPrivileges?.({ headers, action: "create" })

  assert.equal(allowed, true)
  assert.equal(seenHeaders?.get("cookie"), "shop.lastOrganizationId=org_1")
})

test("canManageClients 拒绝时 clientPrivileges 返回 false", async () => {
  const options = createShopOAuthProviderOptions({
    mcpResource: "https://api.example.test/mcp",
    listOrganizationIds: async () => [],
    canManageClients: () => false,
  })

  const allowed = await options.clientPrivileges?.({ headers: new Headers(), action: "create" })

  assert.equal(allowed, false)
})
