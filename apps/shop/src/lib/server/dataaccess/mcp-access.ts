import { and, count, desc, eq, isNull } from 'drizzle-orm'
import { apiKeys, oauthClient, organizationSettings } from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import {
  generateApiKeySecret,
  isMcpExposed,
  OPENSHOP_ISSUABLE_SCOPES,
  parseScopeList,
  assertIssuableScopes,
} from '@workspace/auth'
import { isOpenshopMcpEnabled, resolveMcpResourceUrl } from '@/lib/auth/oauth-server'
import { normalizePage, normalizePageSize, type PaginatedResult } from '@/lib/server/dataaccess/pagination'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

const DEFAULT_CLIENT_SCOPES = [...OPENSHOP_ISSUABLE_SCOPES]

export function getMcpRuntimeStatus() {
  return {
    envEnabled: isOpenshopMcpEnabled(),
    resource: resolveMcpResourceUrl(),
  }
}

export async function getOrganizationMcpEnabled(db: DbLike, organizationId: string): Promise<boolean> {
  const [row] = await db
    .select({ enabled: organizationSettings.mcpWorkbenchEnabled })
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, organizationId))
    .limit(1)
  return Boolean(row?.enabled)
}

export async function getMcpAccessStatus(db: DbLike, organizationId: string) {
  const runtime = getMcpRuntimeStatus()
  const organizationEnabled = await getOrganizationMcpEnabled(db, organizationId)
  return {
    ...runtime,
    organizationEnabled,
    mcpExposed: isMcpExposed({
      envEnabled: runtime.envEnabled,
      organizationEnabled,
    }),
  }
}

export async function setOrganizationMcpEnabled(
  db: AppDatabase,
  organizationId: string,
  enabled: boolean,
): Promise<boolean> {
  const [existing] = await db
    .select({ organizationId: organizationSettings.organizationId })
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, organizationId))
    .limit(1)
  if (!existing) {
    await db.insert(organizationSettings).values({
      organizationId,
      mcpWorkbenchEnabled: enabled,
    })
  } else {
    await db
      .update(organizationSettings)
      .set({ mcpWorkbenchEnabled: enabled, updatedAt: new Date() })
      .where(eq(organizationSettings.organizationId, organizationId))
  }
  return enabled
}

export type ApiKeyListItem = {
  id: string
  name: string
  keyPrefix: string
  scopes: string[]
  lastUsedAt: string | null
  disabledAt: string | null
  expiresAt: string | null
  createdAt: string
}

export async function listApiKeys(
  db: DbLike,
  organizationId: string,
  input: { page?: number; pageSize?: number } = {},
): Promise<PaginatedResult<ApiKeyListItem>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const where = eq(apiKeys.organizationId, organizationId)
  const [totalRow] = await db.select({ value: count() }).from(apiKeys).where(where)
  const rows = await db
    .select()
    .from(apiKeys)
    .where(where)
    .orderBy(desc(apiKeys.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  return {
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      keyPrefix: row.keyPrefix,
      scopes: row.scopes ?? [],
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      disabledAt: row.disabledAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    total: Number(totalRow?.value ?? 0),
    page,
    pageSize,
  }
}

export async function createApiKey(
  db: AppDatabase,
  input: {
    organizationId: string
    userId?: string
    name: string
    scopes: string[]
  },
): Promise<{ item: ApiKeyListItem; plaintext: string }> {
  const name = input.name.trim()
  if (!name) throw new Error('请填写密钥名称')
  const scopes = parseScopeList(input.scopes)
  assertIssuableScopes(scopes)
  const secret = generateApiKeySecret()
  const [row] = await db
    .insert(apiKeys)
    .values({
      organizationId: input.organizationId,
      name,
      keyPrefix: secret.prefix,
      keyHash: secret.hash,
      scopes,
      createdByUserId: input.userId,
    })
    .returning()
  if (!row) throw new Error('无法创建 API 密钥')
  return {
    plaintext: secret.plaintext,
    item: {
      id: row.id,
      name: row.name,
      keyPrefix: row.keyPrefix,
      scopes: row.scopes ?? [],
      lastUsedAt: null,
      disabledAt: null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    },
  }
}

export async function disableApiKey(
  db: AppDatabase,
  organizationId: string,
  apiKeyId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: apiKeys.id, disabledAt: apiKeys.disabledAt })
    .from(apiKeys)
    .where(and(eq(apiKeys.id, apiKeyId), eq(apiKeys.organizationId, organizationId)))
    .limit(1)
  if (!row) throw new Error('密钥不存在')
  if (row.disabledAt) return
  await db
    .update(apiKeys)
    .set({ disabledAt: new Date(), updatedAt: new Date() })
    .where(and(eq(apiKeys.id, apiKeyId), eq(apiKeys.organizationId, organizationId), isNull(apiKeys.disabledAt)))
}

export type OAuthClientListItem = {
  id: string
  clientId: string
  name: string | null
  redirectUris: string[]
  tokenEndpointAuthMethod: string | null
  applicationType: string | null
  requirePKCE: boolean
  disabled: boolean
  createdAt: string | null
}

export async function listOAuthClients(
  db: DbLike,
  organizationId: string,
  input: { page?: number; pageSize?: number } = {},
): Promise<PaginatedResult<OAuthClientListItem>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const where = eq(oauthClient.referenceId, organizationId)
  const [totalRow] = await db.select({ value: count() }).from(oauthClient).where(where)
  const rows = await db
    .select()
    .from(oauthClient)
    .where(where)
    .orderBy(desc(oauthClient.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  return {
    items: rows.map((row) => ({
      id: row.id,
      clientId: row.clientId,
      name: row.name,
      redirectUris: row.redirectUris ?? [],
      tokenEndpointAuthMethod: row.tokenEndpointAuthMethod,
      applicationType: row.applicationType,
      requirePKCE: row.requirePKCE !== false,
      disabled: Boolean(row.disabled),
      createdAt: row.createdAt?.toISOString() ?? null,
    })),
    total: Number(totalRow?.value ?? 0),
    page,
    pageSize,
  }
}

export async function bindOAuthClientToOrganization(
  db: AppDatabase,
  input: { clientId: string; organizationId: string },
): Promise<void> {
  await db
    .update(oauthClient)
    .set({
      referenceId: input.organizationId,
      requirePKCE: true,
      scopes: DEFAULT_CLIENT_SCOPES,
      updatedAt: new Date(),
    })
    .where(eq(oauthClient.clientId, input.clientId))
}

export async function disableOAuthClient(
  db: AppDatabase,
  organizationId: string,
  clientId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: oauthClient.id, disabled: oauthClient.disabled })
    .from(oauthClient)
    .where(and(eq(oauthClient.clientId, clientId), eq(oauthClient.referenceId, organizationId)))
    .limit(1)
  if (!row) throw new Error('客户端不存在')
  if (row.disabled) return
  await db
    .update(oauthClient)
    .set({ disabled: true, updatedAt: new Date() })
    .where(and(eq(oauthClient.clientId, clientId), eq(oauthClient.referenceId, organizationId)))
}
