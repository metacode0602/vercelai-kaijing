import { eq, and, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { registryCredential } from "@workspace/db"

export interface RegistryCredentialRecord {
  id: string
  tenantId: string
  registryHost: string
  username: string
  credentialType: string
  scope: string
  lastUsedAt: Date | null
  expiresAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface RegistryCredentialDetail extends RegistryCredentialRecord {
  passwordEnc: string
}

function mapRow(row: typeof registryCredential.$inferSelect): RegistryCredentialDetail {
  return { ...row }
}

function mapSummary(row: typeof registryCredential.$inferSelect): RegistryCredentialRecord {
  const { passwordEnc: _, ...rest } = row as RegistryCredentialDetail
  return rest
}

export async function getRegistryCredentials(
  tenantId: string,
): Promise<RegistryCredentialRecord[]> {
  const rows = await db
    .select()
    .from(registryCredential)
    .where(eq(registryCredential.tenantId, tenantId))
    .orderBy(desc(registryCredential.createdAt))

  return rows.map(mapSummary)
}

export async function getRegistryCredentialForUser(
  tenantId: string,
): Promise<RegistryCredentialDetail | null> {
  const [row] = await db
    .select()
    .from(registryCredential)
    .where(eq(registryCredential.tenantId, tenantId))
    .orderBy(desc(registryCredential.createdAt))
    .limit(1)

  return row ? mapRow(row) : null
}

export async function saveRegistryCredentials(
  tenantId: string,
  params: {
    registryHost: string
    username: string
    passwordEnc: string
    credentialType?: string
    scope?: string
    expiresAt?: Date | null
  },
): Promise<RegistryCredentialRecord> {
  const existing = await db
    .select()
    .from(registryCredential)
    .where(
      and(
        eq(registryCredential.tenantId, tenantId),
        eq(registryCredential.registryHost, params.registryHost),
        eq(registryCredential.username, params.username),
      ),
    )
    .limit(1)

  if (existing.length > 0) {
    const [updated] = await db
      .update(registryCredential)
      .set({
        passwordEnc: params.passwordEnc,
        credentialType: params.credentialType ?? existing[0].credentialType,
        scope: params.scope ?? existing[0].scope,
        expiresAt: params.expiresAt ?? existing[0].expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(registryCredential.id, existing[0].id))
      .returning()

    return mapSummary(updated)
  }

  const [created] = await db
    .insert(registryCredential)
    .values({
      id: `rc-${Math.random().toString(36).slice(2, 10)}`,
      tenantId,
      registryHost: params.registryHost,
      username: params.username,
      passwordEnc: params.passwordEnc,
      credentialType: params.credentialType ?? "external",
      scope: params.scope ?? "push_pull",
      expiresAt: params.expiresAt ?? null,
    })
    .returning()

  return mapSummary(created)
}
