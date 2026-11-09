import {
  decryptCredentialPayload,
  encryptCredentialPayload,
  type CredentialPayload,
} from "../crypto/credentials"
import type { OAuthTokenSet } from "../domain/types"
import {
  CredentialPersistError,
  CredentialPlatformMismatchError,
  MissingCredentialsError,
  ReauthRequiredError,
  TokenRefreshError,
  type LockedCredentialStore,
  type TokenProvider,
  type TokenProviderOptions,
} from "./types"

export const DEFAULT_REFRESH_SKEW_SECONDS = 300

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function isWithinRefreshWindow(
  expiresAt: Date | null,
  now: Date,
  skewMs: number,
): boolean {
  if (!expiresAt) return false
  return expiresAt.getTime() - skewMs <= now.getTime()
}

function isUsable(expiresAt: Date | null, now: Date): boolean {
  return !expiresAt || expiresAt.getTime() > now.getTime()
}

export function resolveRefreshSkewMs(override?: number): number {
  if (override != null && Number.isFinite(override) && override >= 0) {
    return override
  }
  const raw = process.env.MARKETPLACE_TOKEN_REFRESH_SKEW_SECONDS
  if (raw) {
    const parsed = Number(raw)
    if (Number.isFinite(parsed) && parsed >= 0) return parsed * 1000
  }
  return DEFAULT_REFRESH_SKEW_SECONDS * 1000
}

export function isReauthRefreshError(error: unknown): boolean {
  const code = String((error as { code?: unknown })?.code ?? "").toLowerCase()
  if (
    code === "900" ||
    code === "invalid_grant" ||
    code === "invalid_refresh_token" ||
    code === "unauthorized"
  ) {
    return true
  }

  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase()

  if (message.includes("invalid_grant") || message.includes("invalid refresh")) {
    return true
  }
  if (/refresh.?token.*(expired|invalid|revoked|not found)/.test(message)) {
    return true
  }
  return /unauthori[sz]ed|token.*expired/.test(message)
}

function mergeTokenPayload(
  current: CredentialPayload,
  tokens: OAuthTokenSet,
): CredentialPayload {
  return {
    ...current,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken ?? current.refreshToken,
    expiresAt: tokens.expiresAt
      ? tokens.expiresAt.toISOString()
      : (current.expiresAt ?? null),
    refreshExpiresAt: tokens.refreshExpiresAt
      ? tokens.refreshExpiresAt.toISOString()
      : (current.refreshExpiresAt ?? null),
    meta: {
      ...(current.meta ?? {}),
      ...(tokens.meta ?? {}),
    },
  }
}

/**
 * Lazy, single-flight token refresh.
 *
 * - Refreshes only when the access token enters the configurable skew window,
 *   or when the HTTP client sees an auth error and calls `forceRefresh`.
 * - Serializes refresh across processes via `CredentialStore.withLockedShop`.
 * - Falls back to the existing access token on transient proactive-refresh
 *   failures, as long as that token has not expired.
 */
export function createTokenProvider(
  options: TokenProviderOptions,
): TokenProvider {
  const now = options.now ?? (() => new Date())
  const skewMs = resolveRefreshSkewMs(options.refreshSkewMs)

  let memo: { accessToken: string; expiresAt: Date | null } | null = null
  let inflight: Promise<string> | null = null
  let reauthMarked = false

  async function markReauthOnce(
    locked: LockedCredentialStore,
    reason: string,
  ): Promise<void> {
    if (reauthMarked) return
    await locked.markReauth(reason)
    reauthMarked = true
  }

  async function refresh(forceRefresh: boolean): Promise<string> {
    return options.store.withLockedShop(options.shopId, async (locked) => {
      const stored = await locked.read()
      if (!stored) {
        throw new MissingCredentialsError(
          `No marketplace oauth credentials found for shop ${options.shopId}`,
        )
      }
      if (stored.shopPlatform && stored.shopPlatform !== options.platform) {
        throw new CredentialPlatformMismatchError(
          options.platform,
          stored.shopPlatform,
        )
      }

      const payload = decryptCredentialPayload(stored.payloadEncrypted)
      const expiresAt = asDate(payload.expiresAt) ?? stored.expiresAt
      const currentTime = now()

      if (
        !forceRefresh &&
        !isWithinRefreshWindow(expiresAt, currentTime, skewMs)
      ) {
        memo = { accessToken: payload.accessToken, expiresAt }
        return payload.accessToken
      }

      if (expiresAt === null && !forceRefresh) {
        memo = { accessToken: payload.accessToken, expiresAt }
        return payload.accessToken
      }

      if (!payload.refreshToken) {
        await markReauthOnce(locked, "missing refresh_token")
        if (!forceRefresh && isUsable(expiresAt, currentTime)) {
          memo = { accessToken: payload.accessToken, expiresAt }
          return payload.accessToken
        }
        throw new ReauthRequiredError("Marketplace credential has no refresh token")
      }

      const refreshExpiresAt = asDate(payload.refreshExpiresAt)
      if (refreshExpiresAt && refreshExpiresAt.getTime() <= currentTime.getTime()) {
        await markReauthOnce(locked, "refresh_token expired")
        if (!forceRefresh && isUsable(expiresAt, currentTime)) {
          memo = { accessToken: payload.accessToken, expiresAt }
          return payload.accessToken
        }
        throw new ReauthRequiredError("Marketplace refresh token has expired")
      }

      let tokens: OAuthTokenSet
      try {
        tokens = await options.refreshToken(payload.refreshToken)
        if (!tokens.accessToken) {
          throw new TokenRefreshError("Refresh response contained no access_token")
        }
      } catch (error) {
        if (isReauthRefreshError(error)) {
          await markReauthOnce(
            locked,
            error instanceof Error ? error.message : "refresh failed",
          )
          if (!forceRefresh && isUsable(expiresAt, currentTime)) {
            memo = { accessToken: payload.accessToken, expiresAt }
            return payload.accessToken
          }
          throw new ReauthRequiredError(
            "Marketplace refresh token was rejected",
            error,
          )
        }
        if (!forceRefresh && isUsable(expiresAt, currentTime)) {
          memo = { accessToken: payload.accessToken, expiresAt }
          return payload.accessToken
        }
        throw new TokenRefreshError("Marketplace token refresh failed", error)
      }

      const next = mergeTokenPayload(payload, tokens)
      const nextExpiresAt = asDate(next.expiresAt)

      try {
        await locked.write({
          payloadEncrypted: encryptCredentialPayload(next),
          expiresAt: nextExpiresAt,
        })
      } catch (error) {
        throw new CredentialPersistError(undefined, error)
      }

      reauthMarked = false
      memo = { accessToken: next.accessToken, expiresAt: nextExpiresAt }
      return next.accessToken
    })
  }

  return {
    async getAccessToken(opts) {
      const forceRefresh = Boolean(opts?.forceRefresh)

      if (
        !forceRefresh &&
        memo &&
        !isWithinRefreshWindow(memo.expiresAt, now(), skewMs)
      ) {
        return memo.accessToken
      }

      if (inflight) {
        if (!forceRefresh) return inflight
        await inflight.catch(() => undefined)
      }

      const task = refresh(forceRefresh)
      inflight = task
      try {
        return await task
      } finally {
        if (inflight === task) inflight = null
      }
    },
  }
}
