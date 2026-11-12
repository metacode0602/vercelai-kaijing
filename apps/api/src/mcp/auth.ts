import { createHash } from "node:crypto"
import { eq, or } from "drizzle-orm"
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose"
import {
  apiKeyHashesEqual,
  evaluateMcpAccess,
  hashApiKey,
  isOpenshopApiKeyToken,
  parseScopeList,
  type AccessTokenOrgClaims,
} from "@workspace/auth"
import {
  apiKeys,
  oauthAccessToken,
  oauthClient,
  organizationSettings,
  type AppDatabase,
} from "@workspace/db"
import { McpHttpError, type McpEnv, type McpPrincipal } from "./types"

const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function issuerOf(env: McpEnv): string | null {
  const issuer = env.OPENSHOP_OAUTH_ISSUER || env.BETTER_AUTH_URL
  return issuer?.replace(/\/$/, "") || null
}

function jwksFor(issuer: string) {
  const existing = jwksByIssuer.get(issuer)
  if (existing) return existing
  const jwks = createRemoteJWKSet(new URL(`${issuer}/api/auth/jwks`))
  jwksByIssuer.set(issuer, jwks)
  return jwks
}

export function wwwAuthenticate(env: McpEnv): string {
  const resource = env.OPENSHOP_MCP_RESOURCE || "https://localhost/mcp"
  let metadata = resource
  try {
    const url = new URL(resource)
    metadata = `${url.origin}/.well-known/oauth-protected-resource`
  } catch {
    metadata = `${resource}/.well-known/oauth-protected-resource`
  }
  return `Bearer realm="Open Shop MCP", resource_metadata="${metadata}"`
}

function bearerFrom(headers: Headers): string | null {
  const raw = headers.get("authorization") || headers.get("Authorization")
  if (!raw) return null
  const match = raw.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

async function organizationEnabled(db: AppDatabase, organizationId: string): Promise<boolean> {
  const [row] = await db
    .select({ enabled: organizationSettings.mcpWorkbenchEnabled })
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, organizationId))
    .limit(1)
  return row?.enabled === true
}

function deny(env: McpEnv, status: 401 | 403, message: string): never {
  throw new McpHttpError(status, message, status === 401 ? wwwAuthenticate(env) : undefined)
}

function scopesFromClaims(payload: JWTPayload): string[] {
  const scope = payload.scope
  const scopes = (payload as { scopes?: unknown }).scopes
  if (typeof scope === "string") return parseScopeList(scope)
  if (Array.isArray(scopes)) return parseScopeList(scopes as string[])
  return []
}

export async function lookupOAuthRevocationState(
  db: AppDatabase,
  input: { jti?: string | null; rawToken: string; clientId?: string | null },
): Promise<{ tokenRevoked: boolean; clientDisabled: boolean; tokenExpired: boolean; tokenFound: boolean }> {
  const hashed = createHash("sha256").update(input.rawToken, "utf8").digest("hex")
  const tokenMatchers = [
    eq(oauthAccessToken.token, input.rawToken),
    eq(oauthAccessToken.token, hashed),
  ]
  if (input.jti) {
    tokenMatchers.push(eq(oauthAccessToken.token, input.jti), eq(oauthAccessToken.id, input.jti))
  }
  const [tokenRow] = await db
    .select()
    .from(oauthAccessToken)
    .where(or(...tokenMatchers)!)
    .limit(1)

  const clientId = input.clientId || tokenRow?.clientId
  const [clientRow] = clientId
    ? await db.select().from(oauthClient).where(eq(oauthClient.clientId, clientId)).limit(1)
    : [undefined]

  const now = Date.now()
  return {
    tokenFound: Boolean(tokenRow),
    tokenRevoked: Boolean(tokenRow?.revoked),
    tokenExpired: Boolean(tokenRow?.expiresAt && tokenRow.expiresAt.getTime() < now),
    clientDisabled: clientRow?.disabled === true,
  }
}

async function authenticateApiKey(
  db: AppDatabase,
  env: McpEnv,
  token: string,
): Promise<McpPrincipal> {
  const hash = hashApiKey(token)
  const [row] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, hash)).limit(1)
  if (!row || !apiKeyHashesEqual(row.keyHash, hash)) {
    deny(env, 401, "无效的访问令牌")
  }
  const orgEnabled = await organizationEnabled(db, row.organizationId)
  const decision = evaluateMcpAccess({
    envEnabled: env.OPENSHOP_MCP_ENABLED,
    organizationEnabled: orgEnabled,
    keyDisabled: Boolean(row.disabledAt),
    tokenExpired: Boolean(row.expiresAt && row.expiresAt.getTime() < Date.now()),
    claims: { org_id: row.organizationId },
    requestOrgId: null,
    devOrganizationId: process.env.SHOP_DEV_ORGANIZATION_ID ?? null,
  })
  if (!decision.ok) deny(env, decision.status, decision.message)
  return {
    organizationId: decision.organizationId,
    scopes: row.scopes ?? [],
    apiKeyId: row.id,
    kind: "api_key",
  }
}

async function authenticateJwt(
  db: AppDatabase,
  env: McpEnv,
  token: string,
): Promise<McpPrincipal> {
  const issuer = issuerOf(env)
  if (!issuer) deny(env, 401, "未配置授权服务器，无法校验访问令牌")
  let payload: JWTPayload
  try {
    const verified = await jwtVerify(token, jwksFor(issuer), { issuer, clockTolerance: 5 })
    payload = verified.payload
  } catch {
    deny(env, 401, "访问令牌无效或已过期")
  }
  const claims = payload as AccessTokenOrgClaims & JWTPayload
  const clientId =
    (typeof payload.client_id === "string" && payload.client_id) ||
    (typeof payload.azp === "string" && payload.azp) ||
    null
  const state = await lookupOAuthRevocationState(db, {
    jti: typeof payload.jti === "string" ? payload.jti : null,
    rawToken: token,
    clientId,
  })
  const organizationIdGuess = typeof claims.org_id === "string" ? claims.org_id : ""
  const orgEnabled = organizationIdGuess ? await organizationEnabled(db, organizationIdGuess) : false
  const decision = evaluateMcpAccess({
    envEnabled: env.OPENSHOP_MCP_ENABLED,
    organizationEnabled: orgEnabled,
    clientDisabled: state.clientDisabled,
    tokenRevoked: state.tokenRevoked,
    tokenExpired: state.tokenExpired,
    claims,
    requestOrgId: null,
    devOrganizationId: process.env.SHOP_DEV_ORGANIZATION_ID ?? null,
  })
  if (!decision.ok) deny(env, decision.status, decision.message)
  return {
    organizationId: decision.organizationId,
    scopes: scopesFromClaims(payload),
    userId: typeof payload.sub === "string" ? payload.sub : undefined,
    clientId: clientId ?? undefined,
    tokenId: typeof payload.jti === "string" ? payload.jti : undefined,
    kind: "oauth",
  }
}

/**
 * 每个 MCP 调用都做令牌校验 + 客户端停用 / 令牌吊销检查。
 * 组织只来自令牌 org_id 或 API 密钥行，忽略请求体与 SHOP_DEV_ORGANIZATION_ID。
 */
export async function authenticateMcpRequest(
  db: AppDatabase,
  env: McpEnv,
  headers: Headers,
): Promise<McpPrincipal> {
  if (!env.OPENSHOP_MCP_ENABLED) {
    throw new McpHttpError(404, "Not Found")
  }
  const token = bearerFrom(headers)
  if (!token) deny(env, 401, "缺少访问令牌")
  if (isOpenshopApiKeyToken(token)) return authenticateApiKey(db, env, token)
  return authenticateJwt(db, env, token)
}

