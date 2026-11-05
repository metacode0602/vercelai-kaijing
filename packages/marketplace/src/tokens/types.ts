import type { MarketplacePlatform, OAuthTokenSet } from "../domain/types"

export interface StoredCredential {
  id: string
  payloadEncrypted: string
  expiresAt: Date | null
  updatedAt: Date
  shopPlatform?: string | null
}

export interface LockedCredentialStore {
  read(): Promise<StoredCredential | null>
  write(input: {
    payloadEncrypted: string
    expiresAt: Date | null
  }): Promise<void>
  markReauth(reason: string): Promise<void>
}

/**
 * Database-backed credential port. `withLockedShop` must serialize refreshes
 * for one shop across processes (e.g. Postgres advisory lock + row lock).
 */
export interface CredentialStore {
  withLockedShop<T>(
    shopId: string,
    fn: (store: LockedCredentialStore) => Promise<T>,
  ): Promise<T>
}

export interface TokenProvider {
  getAccessToken(opts?: { forceRefresh?: boolean }): Promise<string>
}

export interface TokenProviderOptions {
  shopId: string
  platform: MarketplacePlatform
  store: CredentialStore
  /** Calls the platform refresh endpoint with the stored refresh token. */
  refreshToken: (refreshToken: string) => Promise<OAuthTokenSet>
  now?: () => Date
  /**
   * Refresh when the access token expires within this window.
   * Defaults to MARKETPLACE_TOKEN_REFRESH_SKEW_SECONDS, then 300 seconds.
   */
  refreshSkewMs?: number
}

export class MissingCredentialsError extends Error {
  constructor(message = "No marketplace oauth credentials found for shop") {
    super(message)
    this.name = "MissingCredentialsError"
  }
}

export class CredentialPlatformMismatchError extends Error {
  constructor(
    readonly expected: string,
    readonly actual: string,
  ) {
    super(`Credential platform mismatch: expected ${expected}, got ${actual}`)
    this.name = "CredentialPlatformMismatchError"
  }
}

export class ReauthRequiredError extends Error {
  readonly code = "REAUTH_REQUIRED"

  constructor(
    message = "Marketplace refresh token is invalid or expired",
    readonly reason?: unknown,
  ) {
    super(message)
    this.name = "ReauthRequiredError"
  }
}

export class TokenRefreshError extends Error {
  constructor(
    message = "Marketplace token refresh failed",
    readonly reason?: unknown,
  ) {
    super(message)
    this.name = "TokenRefreshError"
  }
}

export class CredentialPersistError extends Error {
  constructor(
    message = "Refreshed marketplace credential could not be persisted",
    readonly reason?: unknown,
  ) {
    super(message)
    this.name = "CredentialPersistError"
  }
}
