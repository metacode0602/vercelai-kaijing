import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { LazopHttpClient } from "./lazop-http"

describe("LazopHttpClient auth retry", () => {
  it("force-refreshes once on an auth error and replays the call", async () => {
    const calls: string[] = []
    let attempt = 0
    const fetchImpl = (async (input: URL | RequestInfo) => {
      calls.push(String(input))
      attempt += 1
      if (attempt === 1) {
        return new Response(
          JSON.stringify({ code: "900", message: "Unauthorized" }),
          { status: 401 },
        )
      }
      return new Response(JSON.stringify({ code: "0", data: { ok: true } }), {
        status: 200,
      })
    }) as typeof fetch

    const tokenCalls: boolean[] = []
    let currentToken = "stale-token"
    const client = new LazopHttpClient({
      family: "daraz",
      region: "lk",
      appKey: "app-key",
      appSecret: "app-secret",
      fetchImpl,
      tokenProvider: {
        async getAccessToken(opts) {
          const force = Boolean(opts?.forceRefresh)
          tokenCalls.push(force)
          if (force) currentToken = "fresh-token"
          return currentToken
        },
      },
    })

    const result = await client.call<{ data: { ok: boolean } }>({
      path: "/order/get",
      params: { order_id: "1" },
    })

    assert.equal(result.data.ok, true)
    assert.deepEqual(tokenCalls, [false, true, false])
    assert.equal(calls.length, 2)
    assert.match(calls[0]!, /access_token=stale-token/)
    assert.match(calls[1]!, /access_token=fresh-token/)
  })
})
