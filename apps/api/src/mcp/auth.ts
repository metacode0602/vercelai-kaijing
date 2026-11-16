import { createHash } from "node:crypto"
import { and, eq, or } from "drizzle-orm"
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose"
import {
  apiKeyHashesEqual,
  evaluateMcpAccess,
  hashApiKey,
  isOpenshopApiKeyToken,
  OPENSHOP_ISSUABLE_SCOPES,
  parseScopeList,
  type AccessTokenOrgClaims,
} from "@workspace/auth"
import {
  apiKeys,
  member,
  oauthAccessToken,
  oauthClient,
  organizationSettings,
  type AppDatabase,
} from "@workspace/db"
import { McpHttpError, type McpEnv, type McpPrincipal } from "./types"

export type McpHeaderReader = (name: string) => string | null | undefined

const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

/** Better Auth 挂载路径，与 packages/auth 的 AUTH_PATH 保持一致。 */
const AUTH_BASE_PATH = "/api/auth"

/**
 * 归一化授权服务器 issuer：JWT `iss`、JWKS 地址、RFC 8414 discovery
 * 都必须使用带 /api/auth 的完整 issuer（AS 实测 issuer = https://host/api/auth）。
 * 配置里传 origin 或完整 issuer 均可。
 */
export function resolveOauthIssuer(env: McpEnv): string | null {
  const raw = env.OPENSHOP_OAUTH_ISSUER || env.BETTER_AUTH_URL
  if (!raw) return null
  const trimmed = raw.replace(/\/+$/, "")
  return trimmed.endsWith(AUTH_BASE_PATH) ? trimmed : `${trimmed}${AUTH_BASE_PATH}`
}

function issuerOf(env: McpEnv): string | null {
  return resolveOauthIssuer(env)
}

function jwksFor(issuer: string) {
  const existing = jwksByIssuer.get(issuer)
  if (existing) return existing
  const jwks = createRemoteJWKSet(new URL(`${issuer}/jwks`))
  jwksByIssuer.set(issuer, jwks)
  return jwks
}

export function resolveMcpAudience(env: McpEnv): string {
  return env.OPENSHOP_MCP_RESOURCE || "https://localhost/mcp"
}

export function wwwAuthenticate(env: McpEnv): string {
  const resource = resolveMcpAudience(env)
  let metadata = resource
  try {
    const url = new URL(resource)
    metadata = `${url.origin}/.well-known/oauth-protected-resource`
  } catch {
    metadata = `${resource}/.well-known/oauth-protected-resource`
  }
  // scope= 让外部 MCP 客户端（OpenWork Den）的发现流程把全部可签发 scope
  // 列为必需项，避免管理员建连接时漏勾 openshop:write.pending。
  return `Bearer realm="Open Shop MCP", resource_metadata="${metadata}", scope="${OPENSHOP_ISSUABLE_SCOPES.join(" ")}"`
}

function bearerFrom(readHeader: McpHeaderReader): string | null {
  const raw = readHeader("authorization") || readHeader("Authorization")
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
  if ("status" in decision) deny(env, decision.status, decision.message)
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
    const verified = await jwtVerify(token, jwksFor(issuer), {
      issuer,
      audience: resolveMcpAudience(env),
      clockTolerance: 5,
    })
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
  if ("status" in decision) deny(env, decision.status, decision.message)
  // C7：每请求校验成员关系。成员被移除后，令牌在过期前也不能继续调用。
  const userId = typeof claims.sub === "string" ? claims.sub : ""
  if (!userId) deny(env, 401, "访问令牌缺少用户身份")
  const [memberRow] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.organizationId, decision.organizationId),
        eq(member.userId, userId),
      ),
    )
    .limit(1)
  if (!memberRow) deny(env, 401, "已不是该组织成员")
  return {
    organizationId: decision.organizationId,
    scopes: scopesFromClaims(payload),
    userId,
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
  readHeader: McpHeaderReader,
): Promise<McpPrincipal> {
  if (!env.OPENSHOP_MCP_ENABLED) {
    throw new McpHttpError(404, "Not Found")
  }
  const token = bearerFrom(readHeader)
  if (!token) deny(env, 401, "缺少访问令牌")
  if (isOpenshopApiKeyToken(token)) return authenticateApiKey(db, env, token)
  return authenticateJwt(db, env, token)
}

