import assert from "node:assert/strict"
import { test } from "node:test"
import { isMcpExposed } from "./mcp-flags"

test("MCP 必须同时打开环境开关与组织开关", () => {
  assert.equal(isMcpExposed({ envEnabled: true, organizationEnabled: true }), true)
  assert.equal(isMcpExposed({ envEnabled: true, organizationEnabled: false }), false)
  assert.equal(isMcpExposed({ envEnabled: false, organizationEnabled: true }), false)
  assert.equal(isMcpExposed({ envEnabled: false, organizationEnabled: false }), false)
})
