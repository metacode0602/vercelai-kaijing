import { and, desc, eq, sql } from 'drizzle-orm'
import {
  integrationCredentials,
  integrationStates,
  shops,
} from '@workspace/db/schema'
import {
  decryptCredentialPayload,
  type CredentialStore,
  type LockedCredentialStore,
  type StoredCredential,
} from '@workspace/marketplace'
import { db } from '@/lib/db'

const LOCK_NAMESPACE = 'marketplace_cred:'

/** Read non-secret credential metadata (e.g. TikTok shop_cipher) for live sync. */
export async function loadCredentialMeta(
  shopId: string,
): Promise<Record<string, unknown> | null> {
  const [row] = await db
    .select({ payloadEncrypted: integrationCredentials.payloadEncrypted })
    .from(integrationCredentials)
    .where(
      and(
        eq(integrationCredentials.shopId, shopId),
        eq(integrationCredentials.kind, 'oauth'),
      ),
    )
    .orderBy(desc(integrationCredentials.updatedAt))
    .limit(1)

  if (!row) return null
  return decryptCredentialPayload(row.payloadEncrypted).meta ?? null
}

/**
 * Postgres-backed credential store for the marketplace token provider.
 *
 * `pg_advisory_xact_lock` serializes refresh for one shop across processes;
 * the transaction also row-locks the credential and writes the rotated token
 * before releasing the lock.
 */
export function createDbCredentialStore(): CredentialStore {
  return {
    async withLockedShop(shopId, fn) {
      return db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`${LOCK_NAMESPACE}${shopId}`}))`,
        )

        const [shop] = await tx
          .select({ platform: shops.platform })
          .from(shops)
          .where(eq(shops.id, shopId))
          .limit(1)

        const [row] = await tx
          .select({
            id: integrationCredentials.id,
            payloadEncrypted: integrationCredentials.payloadEncrypted,
            expiresAt: integrationCredentials.expiresAt,
            updatedAt: integrationCredentials.updatedAt,
          })
          .from(integrationCredentials)
          .where(
            and(
              eq(integrationCredentials.shopId, shopId),
              eq(integrationCredentials.kind, 'oauth'),
            ),
          )
          .orderBy(desc(integrationCredentials.updatedAt))
          .limit(1)
          .for('update')

        const current: StoredCredential | null = row
          ? { ...row, shopPlatform: shop?.platform ?? null }
          : null

        const locked: LockedCredentialStore = {
          async read() {
            return current
          },

          async write(input) {
            if (!row) {
              throw new Error(`No oauth credential row to update for shop ${shopId}`)
            }

            await tx
              .update(integrationCredentials)
              .set({
                payloadEncrypted: input.payloadEncrypted,
                expiresAt: input.expiresAt,
                updatedAt: new Date(),
              })
              .where(eq(integrationCredentials.id, row.id))

            await tx
              .update(shops)
              .set({
                status: 'active',
                authExpiresAt: input.expiresAt,
                updatedAt: new Date(),
              })
              .where(eq(shops.id, shopId))

            await tx
              .insert(integrationStates)
              .values({ shopId, health: 'idle', lastError: null })
              .onConflictDoUpdate({
                target: integrationStates.shopId,
                set: { health: 'idle', lastError: null },
              })
          },

          async markReauth(reason) {
            const message = `reauth_required: ${reason}`

            // Use the outer connection so the mark survives when the refresh
            // transaction rolls back after throwing ReauthRequiredError.
            await db
              .update(shops)
              .set({ status: 'error', updatedAt: new Date() })
              .where(eq(shops.id, shopId))

            await db
              .insert(integrationStates)
              .values({ shopId, health: 'error', lastError: message })
              .onConflictDoUpdate({
                target: integrationStates.shopId,
                set: { health: 'error', lastError: message },
              })
          },
        }

        return fn(locked)
      })
    },
  }
}
