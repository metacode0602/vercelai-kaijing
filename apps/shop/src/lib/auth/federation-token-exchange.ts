import { randomUUID } from "node:crypto"
import { and, eq, isNull, sql } from "drizzle-orm"
import { decodeJwt, createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose"
import { APIError } from "better-auth/api"
import type {
  OAuthProviderExtension,
  OAuthTokenResponse,
} from "@better-auth/oauth-provider"
import { assertIssuableScopes, parseScopeList } from "@workspace/auth"
import {
  federationAudit,
  federationConsent,
  federationIdentity,
  federationOrgBinding,
  federationProvider,
  member,
  oauthTokenExchange,
  user,
  type AppDatabase,
} from "@workspace/db"
import {
  FEDERATION_ACCESS_TOKEN_TYPE,
  FEDERATION_ACTOR_TOKEN_USE,
  FEDERATION_CLOCK_SKEW_SECONDS,
  FEDERATION_DEFAULT_ACTOR_SUBJECT,
  FEDERATION_JWT_TOKEN_TYPE,
  FEDERATION_MAX_TOKEN_TTL_SECONDS,
  FEDERATION_SUBJECT_TOKEN_USE,
  FEDERATION_TOKEN_EXCHANGE_GRANT_TYPE,
} from "./federation-constants"

const JWT_TOKEN_TYPE = FEDERATION_JWT_TOKEN_TYPE
const ACCESS_TOKEN_TYPE = FEDERATION_ACCESS_TOKEN_TYPE
const DEFAULT_ACTOR_SUBJECT = FEDERATION_DEFAULT_ACTOR_SUBJECT
const MAX_FEDERATION_TOKEN_TTL_SECONDS = FEDERATION_MAX_TOKEN_TTL_SECONDS
const CLOCK_SKEW_SECONDS = FEDERATION_CLOCK_SKEW_SECONDS

type FederationTokenExchangeOptions = {
  db: AppDatabase
  mcpResource: string
}

type FederationClaims = {
  orgIdClaim: string
  tokenUseClaim: string
  emailClaim: string
  emailVerifiedClaim: string
  actorSubject: string
}

const jwksByUri = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function oauthError(error: string, description: string): never {
  throw new APIError("BAD_REQUEST", {
    error,
    error_description: description,
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function claimString(payload: JWTPayload, claim: string): string | null {
  return stringValue(payload[claim])
}

function claimBoolean(payload: JWTPayload, claim: string): boolean {
  return payload[claim] === true
}

function bodyString(
  body: Record<string, unknown>,
  name: string
): string | null {
  return stringValue(body[name])
}

function bodyScopes(value: unknown): string[] {
  if (typeof value === "string") return parseScopeList(value)
  if (Array.isArray(value)) {
    return parseScopeList(
      value.filter((item): item is string => typeof item === "string")
    )
  }
  return []
}

function claimsConfig(provider: {
  issuer: string
  claimsJson: unknown
}): FederationClaims {
  const config = isRecord(provider.claimsJson) ? provider.claimsJson : {}
  return {
    orgIdClaim: stringValue(config.orgIdClaim) ?? `${provider.issuer}/org_id`,
    tokenUseClaim: stringValue(config.tokenUseClaim) ?? "token_use",
    emailClaim: stringValue(config.emailClaim) ?? "email",
    emailVerifiedClaim:
      stringValue(config.emailVerifiedClaim) ?? "email_verified",
    actorSubject: stringValue(config.actorSubject) ?? DEFAULT_ACTOR_SUBJECT,
  }
}

function jwksFor(uri: string) {
  const existing = jwksByUri.get(uri)
  if (existing) return existing
  const jwks = createRemoteJWKSet(new URL(uri))
  jwksByUri.set(uri, jwks)
  return jwks
}

function validateTokenLifetime(payload: JWTPayload): void {
  const now = Math.floor(Date.now() / 1000)
  const issuedAt = typeof payload.iat === "number" ? payload.iat : null
  const expiresAt = typeof payload.exp === "number" ? payload.exp : null
  if (issuedAt === null || expiresAt === null) {
    oauthError("invalid_grant", "token_missing_lifetime")
  }
  if (issuedAt > now + CLOCK_SKEW_SECONDS) {
    oauthError("invalid_grant", "token_issued_in_future")
  }
  if (
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > MAX_FEDERATION_TOKEN_TTL_SECONDS
  ) {
    oauthError("invalid_grant", "token_lifetime_invalid")
  }
}

function isUniqueViolation(error: unknown): boolean {
  return isRecord(error) && error.code === "23505"
}

function assertScopeSubset(
  scopes: readonly string[],
  allowed: readonly string[],
  description: string
): void {
  const allowedSet = new Set(allowed)
  if (scopes.some((scope) => !allowedSet.has(scope))) {
    oauthError("invalid_scope", description)
  }
}

async function resolveProvider(
  db: AppDatabase,
  subjectToken: string,
  audience: string
): Promise<{
  provider: typeof federationProvider.$inferSelect
  claims: FederationClaims
  subject: JWTPayload
  jwks: ReturnType<typeof createRemoteJWKSet>
}> {
  let unverifiedIssuer: string | null = null
  try {
    unverifiedIssuer = stringValue(decodeJwt(subjectToken).iss)
  } catch {
    oauthError("invalid_grant", "subject_token_invalid")
  }
  if (!unverifiedIssuer) {
    oauthError("invalid_grant", "subject_token_missing_issuer")
  }
  const [provider] = await db
    .select()
    .from(federationProvider)
    .where(
      and(
        eq(federationProvider.issuer, unverifiedIssuer),
        eq(federationProvider.status, "active")
      )
    )
    .limit(1)
  if (!provider) {
    oauthError("invalid_grant", "issuer_not_trusted")
  }
  const jwks = jwksFor(provider.jwksUri)
  let subject: JWTPayload
  try {
    const verified = await jwtVerify(subjectToken, jwks, {
      issuer: provider.issuer,
      audience,
      clockTolerance: CLOCK_SKEW_SECONDS,
    })
    subject = verified.payload
  } catch {
    oauthError("invalid_grant", "subject_token_invalid")
  }
  return {
    provider,
    claims: claimsConfig(provider),
    subject,
    jwks,
  }
}

async function verifyActorToken(input: {
  actorToken: string
  provider: typeof federationProvider.$inferSelect
  claims: FederationClaims
  jwks: ReturnType<typeof createRemoteJWKSet>
  audience: string
}): Promise<JWTPayload> {
  let actor: JWTPayload
  try {
    const verified = await jwtVerify(input.actorToken, input.jwks, {
      issuer: input.provider.issuer,
      audience: input.audience,
      clockTolerance: CLOCK_SKEW_SECONDS,
    })
    actor = verified.payload
  } catch {
    oauthError("invalid_grant", "actor_token_invalid")
  }
  validateTokenLifetime(actor)
  if (
    claimString(actor, input.claims.tokenUseClaim) !==
    FEDERATION_ACTOR_TOKEN_USE
  ) {
    oauthError("invalid_grant", "actor_token_use_invalid")
  }
  if (claimString(actor, "sub") !== input.claims.actorSubject) {
    oauthError("invalid_grant", "actor_subject_invalid")
  }
  if (!claimString(actor, "jti")) {
    oauthError("invalid_grant", "actor_token_missing_jti")
  }
  return actor
}

async function resolveBoundOrganization(
  db: AppDatabase,
  input: {
    providerId: string
    externalOrgId: string
    clientId: string
    issuer: string
  }
): Promise<typeof federationOrgBinding.$inferSelect> {
  const [binding] = await db
    .select()
    .from(federationOrgBinding)
    .where(
      and(
        eq(federationOrgBinding.providerId, input.providerId),
        eq(federationOrgBinding.externalOrgId, input.externalOrgId)
      )
    )
    .limit(1)
  if (!binding) {
    oauthError("invalid_grant", "tenant_not_provisioned")
  }
  if (binding.status !== "active") {
    oauthError("invalid_grant", "tenant_disabled")
  }
  if (binding.clientId !== input.clientId) {
    oauthError("invalid_grant", "tenant_mismatch")
  }
  if (binding.denIssuer !== input.issuer) {
    oauthError("invalid_grant", "tenant_issuer_mismatch")
  }
  return binding
}

async function resolveIdentityUser(
  db: AppDatabase,
  input: {
    providerId: string
    externalOrgId: string
    externalUserId: string
    organizationId: string
    jitEnabled: boolean
    email: string | null
    emailVerified: boolean
  }
): Promise<typeof user.$inferSelect> {
  const [identity] = await db
    .select()
    .from(federationIdentity)
    .where(
      and(
        eq(federationIdentity.providerId, input.providerId),
        eq(federationIdentity.externalOrgId, input.externalOrgId),
        eq(federationIdentity.externalUserId, input.externalUserId)
      )
    )
    .limit(1)

  let userId = identity?.userId ?? null
  if (identity && identity.organizationId !== input.organizationId) {
    oauthError("invalid_grant", "tenant_mismatch")
  }
  if (!userId) {
    if (!input.jitEnabled) {
      oauthError("invalid_grant", "user_link_required")
    }
    if (!input.email || !input.emailVerified) {
      oauthError("invalid_grant", "user_email_not_verified")
    }
    const [candidate] = await db
      .select({ userId: member.userId })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(
        and(
          eq(member.organizationId, input.organizationId),
          sql`lower(${user.email}) = ${input.email.toLowerCase()}`
        )
      )
      .limit(1)
    if (!candidate) {
      oauthError("invalid_grant", "user_link_required")
    }
    userId = candidate.userId
    try {
      await db.insert(federationIdentity).values({
        providerId: input.providerId,
        externalOrgId: input.externalOrgId,
        externalUserId: input.externalUserId,
        organizationId: input.organizationId,
        userId,
        email: input.email,
        emailVerified: input.emailVerified,
      })
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
    }
  }

  const [membership] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.organizationId, input.organizationId),
        eq(member.userId, userId)
      )
    )
    .limit(1)
  if (!membership) {
    oauthError("invalid_grant", "user_not_member")
  }

  const [row] = await db.select().from(user).where(eq(user.id, userId)).limit(1)
  if (!row) {
    oauthError("invalid_grant", "user_not_found")
  }
  return row
}

async function resolveConsentScopes(
  db: AppDatabase,
  input: {
    providerId: string
    organizationId: string
    clientId: string
  }
): Promise<string[]> {
  const [consent] = await db
    .select()
    .from(federationConsent)
    .where(
      and(
        eq(federationConsent.providerId, input.providerId),
        eq(federationConsent.organizationId, input.organizationId),
        eq(federationConsent.clientId, input.clientId),
        isNull(federationConsent.revokedAt)
      )
    )
    .limit(1)
  if (!consent) {
    oauthError("invalid_grant", "consent_required")
  }
  return consent.scopes
}

async function claimSubjectJti(
  db: AppDatabase,
  input: {
    organizationId: string
    providerId: string
    subjectJti: string
    actorJti: string | null
    clientId: string
    userId: string
    scopes: string[]
    requestId: string
  }
): Promise<void> {
  try {
    await db.insert(oauthTokenExchange).values({
      ...input,
      result: "pending",
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      oauthError("invalid_grant", "subject_token_replayed")
    }
    throw error
  }
}

async function completeSubjectJti(
  db: AppDatabase,
  subjectJti: string,
  result: "success" | "failed"
): Promise<void> {
  await db
    .update(oauthTokenExchange)
    .set({ result })
    .where(eq(oauthTokenExchange.subjectJti, subjectJti))
}

async function releaseSubjectJti(
  db: AppDatabase,
  subjectJti: string
): Promise<void> {
  await db
    .delete(oauthTokenExchange)
    .where(eq(oauthTokenExchange.subjectJti, subjectJti))
}

async function writeAudit(
  db: AppDatabase,
  input: {
    organizationId: string
    providerId: string
    event: string
    actor: string | null
    subject: string | null
    requestId: string
  }
): Promise<void> {
  await db.insert(federationAudit).values(input)
}

export function createFederationTokenExchangeExtension(
  options: FederationTokenExchangeOptions
): OAuthProviderExtension {
  return {
    grants: {
      [FEDERATION_TOKEN_EXCHANGE_GRANT_TYPE]: async ({ ctx, provider }) => {
        const body = isRecord(ctx.body) ? ctx.body : {}
        const subjectToken = bodyString(body, "subject_token")
        const actorToken = bodyString(body, "actor_token")
        const subjectTokenType = bodyString(body, "subject_token_type")
        const actorTokenType = bodyString(body, "actor_token_type")
        const requestedTokenType = bodyString(body, "requested_token_type")
        const requestedAudience = bodyString(body, "audience")
        const requestId =
          stringValue(ctx.request?.headers.get("x-request-id")) ?? randomUUID()

        if (!subjectToken)
          oauthError("invalid_request", "missing_subject_token")
        if (!actorToken) oauthError("invalid_request", "missing_actor_token")
        if (subjectTokenType !== JWT_TOKEN_TYPE) {
          oauthError("invalid_request", "unsupported_subject_token_type")
        }
        if (actorTokenType !== JWT_TOKEN_TYPE) {
          oauthError("invalid_request", "unsupported_actor_token_type")
        }
        if (requestedTokenType && requestedTokenType !== ACCESS_TOKEN_TYPE) {
          oauthError("invalid_request", "unsupported_requested_token_type")
        }
        if (requestedAudience && requestedAudience !== options.mcpResource) {
          oauthError("invalid_target", "audience_mismatch")
        }

        const resolved = await resolveProvider(
          options.db,
          subjectToken,
          options.mcpResource
        )
        const { provider: trustedProvider, claims, subject, jwks } = resolved
        validateTokenLifetime(subject)
        if (
          claimString(subject, claims.tokenUseClaim) !==
          FEDERATION_SUBJECT_TOKEN_USE
        ) {
          oauthError("invalid_grant", "subject_token_use_invalid")
        }
        const externalOrgId = claimString(subject, claims.orgIdClaim)
        const externalUserId = claimString(subject, "sub")
        const subjectJti = claimString(subject, "jti")
        if (!externalOrgId)
          oauthError("invalid_grant", "subject_token_missing_org")
        if (!externalUserId)
          oauthError("invalid_grant", "subject_token_missing_user")
        if (!subjectJti)
          oauthError("invalid_grant", "subject_token_missing_jti")

        const subjectScopes = parseScopeList(
          typeof subject.scope === "string" ? subject.scope : undefined
        )
        const requestedScopes = bodyScopes(body.scope)
        const scopes =
          requestedScopes.length > 0 ? requestedScopes : subjectScopes
        if (scopes.length === 0) oauthError("invalid_scope", "missing_scope")
        try {
          assertIssuableScopes(scopes)
        } catch {
          oauthError("invalid_scope", "scope_not_issuable")
        }
        assertScopeSubset(scopes, subjectScopes, "scope_not_in_subject_token")

        const authenticated = await provider.authenticateClient({ scopes })
        const binding = await resolveBoundOrganization(options.db, {
          providerId: trustedProvider.id,
          externalOrgId,
          clientId: authenticated.client.clientId,
          issuer: trustedProvider.issuer,
        })
        const consentScopes = await resolveConsentScopes(options.db, {
          providerId: trustedProvider.id,
          organizationId: binding.organizationId,
          clientId: authenticated.client.clientId,
        })
        assertScopeSubset(scopes, consentScopes, "scope_not_consented")
        assertScopeSubset(
          scopes,
          trustedProvider.allowedScopes,
          "scope_not_allowed"
        )

        const actor = await verifyActorToken({
          actorToken,
          provider: trustedProvider,
          claims,
          jwks,
          audience: options.mcpResource,
        })
        const actorJti = claimString(actor, "jti")
        const actorSubject = claimString(actor, "sub")
        const actorIssuer = claimString(actor, "iss")
        if (!actorJti || !actorSubject || !actorIssuer) {
          oauthError("invalid_grant", "actor_token_incomplete")
        }

        const linkedUser = await resolveIdentityUser(options.db, {
          providerId: trustedProvider.id,
          externalOrgId,
          externalUserId,
          organizationId: binding.organizationId,
          jitEnabled: binding.jitEnabled,
          email: claimString(subject, claims.emailClaim),
          emailVerified: claimBoolean(subject, claims.emailVerifiedClaim),
        })

        await claimSubjectJti(options.db, {
          organizationId: binding.organizationId,
          providerId: trustedProvider.id,
          subjectJti,
          actorJti,
          clientId: authenticated.client.clientId,
          userId: linkedUser.id,
          scopes,
          requestId,
        })

        let tokens: OAuthTokenResponse
        try {
          tokens = await provider.issueTokens({
            client: authenticated.client,
            user: linkedUser,
            scopes,
            referenceId: binding.organizationId,
            resources: [options.mcpResource],
            accessTokenClaims: {
              external_org_id: externalOrgId,
              external_user_id: externalUserId,
              act: {
                sub: actorSubject,
                iss: actorIssuer,
                jti: actorJti,
              },
            },
            tokenResponse: {
              issued_token_type: ACCESS_TOKEN_TYPE,
            },
          })
        } catch (error) {
          await releaseSubjectJti(options.db, subjectJti)
          throw error
        }

        try {
          await completeSubjectJti(options.db, subjectJti, "success")
          await options.db
            .update(federationIdentity)
            .set({ lastSeenAt: new Date() })
            .where(
              and(
                eq(federationIdentity.providerId, trustedProvider.id),
                eq(federationIdentity.externalOrgId, externalOrgId),
                eq(federationIdentity.externalUserId, externalUserId)
              )
            )
          await writeAudit(options.db, {
            organizationId: binding.organizationId,
            providerId: trustedProvider.id,
            event: "token_exchange.succeeded",
            actor: actorSubject,
            subject: externalUserId,
            requestId,
          })
        } catch {
          // The token is already issued. A pending claim still blocks replay.
        }
        return tokens
      },
    },
  }
}
