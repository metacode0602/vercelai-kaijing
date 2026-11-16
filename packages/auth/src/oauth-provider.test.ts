import assert from "node:assert/strict"
import { test } from "node:test"
import type { OAuthProviderExtension } from "@better-auth/oauth-provider"
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

test("extensions 透传到 oauthProvider 配置", () => {
  const extension: OAuthProviderExtension = {
    grants: {
      "urn:example:grant": async () => ({
        access_token: "token",
        expires_in: 60,
        expires_at: Math.floor(Date.now() / 1000) + 60,
        token_type: "Bearer",
        refresh_token: "refresh",
        id_token: "id-token",
        scope: "openid",
        issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
      }),
    },
  }
  const options = createShopOAuthProviderOptions({
    mcpResource: "https://api.example.test/mcp",
    listOrganizationIds: async () => [],
    extensions: [extension],
  })

  assert.deepEqual(options.extensions, [extension])
})
