import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  decryptCredentialPayload,
  encryptCredentialPayload,
  type CredentialPayload,
} from "../crypto/credentials"
import type { OAuthTokenSet } from "../domain/types"
import { ReauthRequiredError } from "./types"
import { createTokenProvider } from "./manager"

process.env.MARKETPLACE_CREDENTIALS_KEY =
  "0000000000000000000000000000000000000000000000000000000000000000"

const NOW = new Date("2026-11-05T00:00:00.000Z")

function isoPlus(seconds: number): string {
  return new Date(NOW.getTime() + seconds * 1000).toISOString()
}

function createStore(payload: CredentialPayload) {
  let stored = {
    id: "cred-1",
    payloadEncrypted: encryptCredentialPayload(payload),
    expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
    updatedAt: NOW,
    shopPlatform: "daraz",
  }
  const writes: Array<{ payloadEncrypted: string; expiresAt: Date | null }> = []
  const reauthReasons: string[] = []

  const store = {
    async withLockedShop<T>(
      _shopId: string,
      fn: (locked: {
        read: () => Promise<typeof stored | null>
        write: (input: {
          payloadEncrypted: string
          expiresAt: Date | null
        }) => Promise<void>
        markReauth: (reason: string) => Promise<void>
      }) => Promise<T>,
    ): Promise<T> {
      return fn({
        async read() {
          return stored
        },
        async write(input) {
          writes.push(input)
          stored = { ...stored, ...input, updatedAt: NOW }
        },
        async markReauth(reason) {
          reauthReasons.push(reason)
        },
      })
    },
  }

  return { store, writes, reauthReasons }
}

function tokenSet(overrides: Partial<OAuthTokenSet> = {}): OAuthTokenSet {
  return {
    accessToken: "new-access",
    refreshToken: "new-refresh",
    expiresAt: new Date(NOW.getTime() + 3_600_000),
    refreshExpiresAt: new Date(NOW.getTime() + 86_400_000),
    meta: { sellerId: "s2" },
    ...overrides,
  }
}

describe("marketplace token provider", () => {
  it("refreshes inside the skew window and merges rotated tokens", async () => {
    const { store, writes, reauthReasons } = createStore({
      accessToken: "old-access",
      refreshToken: "old-refresh",
      expiresAt: isoPlus(120),
      refreshExpiresAt: isoPlus(86_400),
      meta: { shopCipher: "cipher-1", sellerId: "s1" },
    })
    let refreshCount = 0
    const provider = createTokenProvider({
      shopId: "shop-1",
      platform: "daraz",
      store,
      now: () => NOW,
      refreshSkewMs: 300_000,
      refreshToken: async () => {
        refreshCount += 1
        return tokenSet()
      },
    })

    assert.equal(await provider.getAccessToken(), "new-access")
    assert.equal(refreshCount, 1)
    assert.equal(writes.length, 1)
    assert.deepEqual(reauthReasons, [])

    const persisted = decryptCredentialPayload(writes[0]!.payloadEncrypted)
    assert.equal(persisted.accessToken, "new-access")
    assert.equal(persisted.refreshToken, "new-refresh")
    assert.deepEqual(persisted.meta, { shopCipher: "cipher-1", sellerId: "s2" })

    assert.equal(await provider.getAccessToken(), "new-access")
    assert.equal(refreshCount, 1)
  })

  it("does not refresh outside the skew window", async () => {
    const { store } = createStore({
      accessToken: "old-access",
      refreshToken: "old-refresh",
      expiresAt: isoPlus(3_600),
      refreshExpiresAt: isoPlus(86_400),
      meta: {},
    })
    let refreshCount = 0
    const provider = createTokenProvider({
      shopId: "shop-1",
      platform: "daraz",
      store,
      now: () => NOW,
      refreshSkewMs: 300_000,
      refreshToken: async () => {
        refreshCount += 1
        return tokenSet()
      },
    })

    assert.equal(await provider.getAccessToken(), "old-access")
    assert.equal(refreshCount, 0)
  })

  it("single-flights concurrent refreshes", async () => {
    const { store, writes } = createStore({
      accessToken: "old-access",
      refreshToken: "old-refresh",
      expiresAt: isoPlus(60),
      refreshExpiresAt: isoPlus(86_400),
      meta: {},
    })
    let refreshCount = 0
    const provider = createTokenProvider({
      shopId: "shop-1",
      platform: "daraz",
      store,
      now: () => NOW,
      refreshSkewMs: 300_000,
      refreshToken: async () => {
        refreshCount += 1
        await new Promise((resolve) => setTimeout(resolve, 10))
        return tokenSet()
      },
    })

    const tokens = await Promise.all([
      provider.getAccessToken(),
      provider.getAccessToken(),
      provider.getAccessToken(),
    ])
    assert.deepEqual(tokens, ["new-access", "new-access", "new-access"])
    assert.equal(refreshCount, 1)
    assert.equal(writes.length, 1)
  })

  it("force-refreshes even when the token is outside the skew window", async () => {
    const { store } = createStore({
      accessToken: "old-access",
      refreshToken: "old-refresh",
      expiresAt: isoPlus(3_600),
      refreshExpiresAt: isoPlus(86_400),
      meta: {},
    })
    let refreshCount = 0
    const provider = createTokenProvider({
      shopId: "shop-1",
      platform: "daraz",
      store,
      now: () => NOW,
      refreshSkewMs: 300_000,
      refreshToken: async () => {
        refreshCount += 1
        return tokenSet()
      },
    })

    assert.equal(
      await provider.getAccessToken({ forceRefresh: true }),
      "new-access",
    )
    assert.equal(refreshCount, 1)
  })

  it("keeps the unexpired access token on transient refresh failures", async () => {
    const { store, writes, reauthReasons } = createStore({
      accessToken: "old-access",
      refreshToken: "old-refresh",
      expiresAt: isoPlus(60),
      refreshExpiresAt: isoPlus(86_400),
      meta: {},
    })
    const provider = createTokenProvider({
      shopId: "shop-1",
      platform: "daraz",
      store,
      now: () => NOW,
      refreshSkewMs: 300_000,
      refreshToken: async () => {
        throw new Error("ECONNRESET")
      },
    })

    assert.equal(await provider.getAccessToken(), "old-access")
    assert.equal(writes.length, 0)
    assert.deepEqual(reauthReasons, [])
  })

  it("marks reauth once and rejects force refresh after invalid_grant", async () => {
    const { store, reauthReasons } = createStore({
      accessToken: "old-access",
      refreshToken: "old-refresh",
      expiresAt: isoPlus(60),
      refreshExpiresAt: isoPlus(86_400),
      meta: {},
    })
    const provider = createTokenProvider({
      shopId: "shop-1",
      platform: "daraz",
      store,
      now: () => NOW,
      refreshSkewMs: 300_000,
      refreshToken: async () => {
        throw Object.assign(new Error("invalid_grant"), { code: "invalid_grant" })
      },
    })

    assert.equal(await provider.getAccessToken(), "old-access")
    assert.deepEqual(reauthReasons, ["invalid_grant"])

    await assert.rejects(
      provider.getAccessToken({ forceRefresh: true }),
      ReauthRequiredError,
    )
    assert.equal(reauthReasons.length, 1)
  })
})
