import { and, eq } from "drizzle-orm"
import { assertIssuableScopes } from "@workspace/auth"
import {
  federationAudit,
  federationConsent,
  federationOrgBinding,
  federationProvider,
  oauthClient,
} from "@workspace/db"
import { auth } from "@/lib/auth"
import { resolveMcpResourceUrl } from "@/lib/auth/oauth-server"
import { db } from "@/lib/db"
import { FEDERATION_TOKEN_EXCHANGE_GRANT_TYPE, federationClientId } from "@/lib/auth/federation-constants"

export type ProvisionFederationInput = {
  externalOrgId: string
  displayName: string
  denIssuer: string
  denJwksUri: string
  requestedScopes: string[]
  claims?: Record<string, unknown>
  roleMapping?: Record<string, string>
  jitProvisioning?: boolean
}

export type ProvisionFederationResult = {
  organizationId: string
  externalOrgId: string
  mcpUrl: string
  status: string
  scopes: string[]
  oauthClient: {
    clientId: string
    clientSecret: string | null
    tokenEndpointAuthMethod: "client_secret_basic"
    grantTypes: string[]
  }
  createdAt: string
}

export class FederationProvisioningError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, status: number, message: string) {
    super(message)
    this.name = "FederationProvisioningError"
    this.code = code
    this.status = status
  }
}

function normalizeIssuer(issuer: string): string {
  return issuer.trim().replace(/\/+$/, "")
}

function uniqueScopes(scopes: readonly string[]): string[] {
  return [...new Set(scopes.map((scope) => scope.trim()).filter(Boolean))]
}

function clientName(displayName: string): string {
  return `OpenMCP · ${displayName.trim()}`
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  const code = "code" in error ? error.code : undefined
  return code === "23505"
}

async function removeClient(clientId: string): Promise<void> {
  try {
    await db.delete(oauthClient).where(eq(oauthClient.clientId, clientId))
  } catch {
    // The original provisioning error is more useful than cleanup failure.
  }
}

async function disableClient(clientId: string): Promise<void> {
  try {
    await db
      .update(oauthClient)
      .set({ disabled: true, updatedAt: new Date() })
      .where(eq(oauthClient.clientId, clientId))
  } catch {
    // The original provisioning error is more useful than cleanup failure.
  }
}

async function createFederationClient(input: {
  headers: Headers
  displayName: string
  externalOrgId: string
  scopes: string[]
}): Promise<{ clientId: string; clientSecret: string }> {
  const created = await auth.api.adminCreateOAuthClient({
    headers: input.headers,
    body: {
      client_name: clientName(input.displayName),
      application_type: "web",
      token_endpoint_auth_method: "client_secret_basic",
      grant_types: [FEDERATION_TOKEN_EXCHANGE_GRANT_TYPE],
      scope: input.scopes.join(" "),
      skip_consent: true,
      metadata: {
        openmcp: {
          externalOrgId: input.externalOrgId,
        },
      },
    },
  })
  if (!created.client_id || !created.client_secret) {
    throw new FederationProvisioningError(
      "client_creation_failed",
      502,
      "OpenShop 未能创建联邦 OAuth 客户端"
    )
  }

  const generatedClientId = created.client_id
  const clientId = federationClientId(input.externalOrgId)
  try {
    const updated = await db
      .update(oauthClient)
      .set({ clientId, updatedAt: new Date() })
      .where(eq(oauthClient.clientId, generatedClientId))
      .returning({ id: oauthClient.id })
    if (!updated) {
      await disableClient(generatedClientId)
      throw new FederationProvisioningError(
        "client_creation_failed",
        502,
        "OpenShop 未能设置联邦 OAuth client_id"
      )
    }
  } catch (error) {
    if (error instanceof FederationProvisioningError) throw error
    await disableClient(generatedClientId)
    if (isUniqueViolation(error)) {
      throw new FederationProvisioningError(
        "client_id_conflict",
        409,
        `client_id 已存在: ${clientId}`
      )
    }
    throw error
  }

  return {
    clientId,
    clientSecret: created.client_secret,
  }
}

export async function provisionFederation(input: {
  headers: Headers
  userId: string
  organizationId: string
  requestId: string
  payload: ProvisionFederationInput
}): Promise<ProvisionFederationResult> {
  const externalOrgId = input.payload.externalOrgId.trim()
  const denIssuer = normalizeIssuer(input.payload.denIssuer)
  const scopes = uniqueScopes(input.payload.requestedScopes)
  if (scopes.length === 0) {
    throw new FederationProvisioningError(
      "invalid_scope",
      400,
      "requestedScopes 不能为空"
    )
  }
  try {
    assertIssuableScopes(scopes)
  } catch {
    throw new FederationProvisioningError(
      "invalid_scope",
      400,
      "requestedScopes 包含不可签发的 scope"
    )
  }

  const [existingProvider] = await db
    .select()
    .from(federationProvider)
    .where(eq(federationProvider.issuer, denIssuer))
    .limit(1)
  if (existingProvider && existingProvider.status !== "active") {
    throw new FederationProvisioningError(
      "provider_disabled",
      409,
      "该 Den issuer 已被禁用"
    )
  }

  const allowedScopes = existingProvider
    ? uniqueScopes([...existingProvider.allowedScopes, ...scopes])
    : scopes
  const [existingBinding] = existingProvider
    ? await db
        .select()
        .from(federationOrgBinding)
        .where(
          and(
            eq(federationOrgBinding.providerId, existingProvider.id),
            eq(federationOrgBinding.externalOrgId, externalOrgId)
          )
        )
        .limit(1)
    : []

  if (existingBinding) {
    if (existingBinding.organizationId !== input.organizationId) {
      throw new FederationProvisioningError(
        "tenant_mismatch",
        409,
        "该 externalOrgId 已绑定到其他 OpenShop 组织"
      )
    }
    const [client] = await db
      .select({
        disabled: oauthClient.disabled,
        referenceId: oauthClient.referenceId,
      })
      .from(oauthClient)
      .where(eq(oauthClient.clientId, existingBinding.clientId))
      .limit(1)
    if (!client || client.disabled) {
      throw new FederationProvisioningError(
        "client_disabled",
        409,
        "联邦 OAuth 客户端不存在或已禁用，请先轮换凭据"
      )
    }
    if (client.referenceId && client.referenceId !== input.organizationId) {
      throw new FederationProvisioningError(
        "tenant_mismatch",
        409,
        "联邦 OAuth 客户端已绑定到其他组织"
      )
    }

    const updated = await db.transaction(async (tx) => {
      const [provider] = await tx
        .update(federationProvider)
        .set({
          jwksUri: input.payload.denJwksUri,
          ...(input.payload.claims !== undefined
            ? { claimsJson: input.payload.claims }
            : {}),
          allowedScopes,
          updatedAt: new Date(),
        })
        .where(eq(federationProvider.id, existingBinding.providerId))
        .returning()
      if (!provider) {
        throw new FederationProvisioningError(
          "provider_missing",
          409,
          "联邦 provider 不存在"
        )
      }
      await tx
        .update(oauthClient)
        .set({ referenceId: input.organizationId, updatedAt: new Date() })
        .where(eq(oauthClient.clientId, existingBinding.clientId))
      const [binding] = await tx
        .update(federationOrgBinding)
        .set({
          denIssuer,
          jitEnabled:
            input.payload.jitProvisioning ?? existingBinding.jitEnabled,
          roleMappingJson:
            input.payload.roleMapping ?? existingBinding.roleMappingJson,
          updatedAt: new Date(),
        })
        .where(eq(federationOrgBinding.id, existingBinding.id))
        .returning()
      if (!binding) {
        throw new FederationProvisioningError(
          "binding_missing",
          409,
          "联邦组织绑定不存在"
        )
      }
      await tx
        .insert(federationConsent)
        .values({
          providerId: provider.id,
          organizationId: binding.organizationId,
          clientId: binding.clientId,
          scopes,
          consentedBy: input.userId,
          consentedAt: new Date(),
          revokedAt: null,
        })
        .onConflictDoUpdate({
          target: [
            federationConsent.providerId,
            federationConsent.organizationId,
            federationConsent.clientId,
          ],
          set: {
            scopes,
            consentedBy: input.userId,
            consentedAt: new Date(),
            revokedAt: null,
          },
        })
      await tx.insert(federationAudit).values({
        organizationId: binding.organizationId,
        providerId: provider.id,
        event: "provisioning.updated",
        actor: input.userId,
        subject: externalOrgId,
        requestId: input.requestId,
      })
      return { binding, provider }
    })

    return {
      organizationId: updated.binding.organizationId,
      externalOrgId: updated.binding.externalOrgId,
      mcpUrl: resolveMcpResourceUrl(),
      status: updated.binding.status,
      scopes,
      oauthClient: {
        clientId: updated.binding.clientId,
        clientSecret: null,
        tokenEndpointAuthMethod: "client_secret_basic",
        grantTypes: [FEDERATION_TOKEN_EXCHANGE_GRANT_TYPE],
      },
      createdAt: updated.binding.createdAt.toISOString(),
    }
  }

  const client = await createFederationClient({
    headers: input.headers,
    displayName: input.payload.displayName,
    externalOrgId,
    scopes,
  })

  try {
    const created = await db.transaction(async (tx) => {
      const [provider] = await tx
        .insert(federationProvider)
        .values({
          issuer: denIssuer,
          jwksUri: input.payload.denJwksUri,
          claimsJson: input.payload.claims ?? {},
          allowedScopes,
          status: "active",
        })
        .onConflictDoUpdate({
          target: federationProvider.issuer,
          set: {
            jwksUri: input.payload.denJwksUri,
            ...(input.payload.claims !== undefined
              ? { claimsJson: input.payload.claims }
              : {}),
            allowedScopes,
            updatedAt: new Date(),
          },
        })
        .returning()
      if (!provider) {
        throw new FederationProvisioningError(
          "provider_creation_failed",
          500,
          "联邦 provider 创建失败"
        )
      }
      const [binding] = await tx
        .insert(federationOrgBinding)
        .values({
          organizationId: input.organizationId,
          providerId: provider.id,
          externalOrgId,
          clientId: client.clientId,
          denIssuer,
          status: "active",
          jitEnabled: input.payload.jitProvisioning ?? false,
          roleMappingJson: input.payload.roleMapping ?? {},
        })
        .returning()
      if (!binding) {
        throw new FederationProvisioningError(
          "binding_creation_failed",
          500,
          "联邦组织绑定创建失败"
        )
      }
      const [linkedClient] = await tx
        .update(oauthClient)
        .set({
          referenceId: input.organizationId,
          updatedAt: new Date(),
        })
        .where(eq(oauthClient.clientId, client.clientId))
        .returning({ id: oauthClient.id })
      if (!linkedClient) {
        throw new FederationProvisioningError(
          "client_missing",
          500,
          "联邦 OAuth 客户端不存在"
        )
      }
      await tx.insert(federationConsent).values({
        providerId: provider.id,
        organizationId: binding.organizationId,
        clientId: binding.clientId,
        scopes,
        consentedBy: input.userId,
        consentedAt: new Date(),
      })
      await tx.insert(federationAudit).values({
        organizationId: binding.organizationId,
        providerId: provider.id,
        event: "provisioning.created",
        actor: input.userId,
        subject: externalOrgId,
        requestId: input.requestId,
      })
      return { binding, provider }
    })

    return {
      organizationId: created.binding.organizationId,
      externalOrgId: created.binding.externalOrgId,
      mcpUrl: resolveMcpResourceUrl(),
      status: created.binding.status,
      scopes,
      oauthClient: {
        clientId: created.binding.clientId,
        clientSecret: client.clientSecret,
        tokenEndpointAuthMethod: "client_secret_basic",
        grantTypes: [FEDERATION_TOKEN_EXCHANGE_GRANT_TYPE],
      },
      createdAt: created.binding.createdAt.toISOString(),
    }
  } catch (error) {
    // Nothing committed: drop the client so a retry can reuse the stable id.
    await removeClient(client.clientId)
    throw error
  }
}
