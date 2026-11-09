import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { TiktokConnector } from "./tiktok"

describe("TiktokConnector read sync (mocked HTTP)", () => {
  it("listOrders maps detail payload and forwards page_token / shop_cipher", async () => {
    const calls: Array<{ url: string; method: string; body: string | undefined }> =
      []
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input)
      calls.push({
        url,
        method: String(init?.method ?? "GET"),
        body: init?.body ? String(init.body) : undefined,
      })
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            next_page_token: "tok-2",
            orders: [
              {
                id: "TT-ORDER-1",
                status: "CANCELLED",
                create_time: 1730448000,
                payment: { currency: "USD", total_amount: "10" },
                line_items: [
                  {
                    id: "LI-1",
                    seller_sku: "SKU-TT-1",
                    product_name: "Item",
                    quantity: 1,
                    sale_price: "10",
                  },
                ],
              },
            ],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }

    const connector = new TiktokConnector({
      platform: "tiktok_shop",
      appKey: "app-key",
      appSecret: "app-secret",
      accessToken: "access-token",
      shopCipher: "cipher-abc",
      region: "global",
      fetchImpl,
    })

    const page = await connector.listOrders({
      pageSize: 20,
      cursor: "tok-1",
      updatedAfter: "2026-11-01T00:00:00.000Z",
    })

    assert.equal(page.items.length, 1)
    assert.equal(page.items[0]!.externalOrderId, "TT-ORDER-1")
    assert.equal(page.items[0]!.status, "cancelled")
    assert.equal(page.items[0]!.lines?.[0]?.sku, "SKU-TT-1")
    assert.equal(page.nextCursor, "tok-2")
    assert.equal(calls.length, 1)
    assert.match(calls[0]!.url, /shop_cipher=cipher-abc/)
    assert.match(calls[0]!.url, /page_token=tok-1/)
    assert.match(calls[0]!.url, /\/order\/202309\/orders\/search/)
    assert.ok(calls[0]!.body?.includes("update_time_ge"))
  })

  it("getOrder uses detail/query path and maps request id order", async () => {
    const calls: string[] = []
    const fetchImpl: typeof fetch = async (input) => {
      calls.push(String(input))
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            orders: [
              {
                id: "REQ-ORDER-9",
                status: "AWAITING_SHIPMENT",
                line_items: [{ id: "1", seller_sku: "A", quantity: 1 }],
              },
            ],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }
    const connector = new TiktokConnector({
      platform: "tiktok_shop",
      appKey: "k",
      appSecret: "s",
      accessToken: "t",
      fetchImpl,
    })
    const order = await connector.getOrder("REQ-ORDER-9")
    assert.equal(order.externalOrderId, "REQ-ORDER-9")
    assert.equal(order.status, "ready_to_ship")
    assert.match(calls[0]!, /\/order\/202309\/orders\/detail\/query/)
  })

  it("listProducts search maps seller_sku for listing sync", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          code: 0,
          data: {
            products: [
              {
                id: "P1",
                title: "Hat",
                status: "ACTIVATE",
                skus: [
                  {
                    id: "S1",
                    seller_sku: "HAT-1",
                    price: { amount: "5", currency: "USD" },
                  },
                ],
              },
            ],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    const connector = new TiktokConnector({
      platform: "tiktok_shop",
      appKey: "k",
      appSecret: "s",
      accessToken: "t",
      fetchImpl,
    })
    const page = await connector.listProducts({ pageSize: 10 })
    assert.equal(page.items[0]!.externalId, "P1")
    assert.equal(page.items[0]!.skus?.[0]?.sellerSku, "HAT-1")
  })
})
