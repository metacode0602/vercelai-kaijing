import assert from "node:assert/strict"
import { test } from "node:test"
import type { BetterAuthOptions } from "better-auth"
import { getSchema } from "better-auth/db"
import { schema } from "@workspace/db"
import { sharedAuthOptions } from "./options"
import { createShopOAuthPlugins } from "./oauth-provider"

test("Better Auth 期望的表名都能在 Drizzle schema 中找到", () => {
  const options: BetterAuthOptions = {
    ...sharedAuthOptions,
    plugins: [
      ...(sharedAuthOptions.plugins ?? []),
      ...createShopOAuthPlugins({
        mcpResource: "http://localhost:3000/mcp",
        listOrganizationIds: async () => [],
        canManageClients: () => false,
      }),
    ],
  }

  const expectedTables = Object.keys(getSchema(options))
  const missingTables = expectedTables.filter((table) => !(table in schema))

  assert.deepEqual(missingTables, [])
})
