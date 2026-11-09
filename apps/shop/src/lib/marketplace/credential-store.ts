import {
  createDbCredentialStore as createPackageDbCredentialStore,
  loadCredentialMeta as loadPackageCredentialMeta,
  type CredentialStore,
} from "@workspace/marketplace"
import { db } from "@/lib/db"

/** Read non-secret credential metadata (e.g. TikTok shop_cipher) for live sync. */
export function loadCredentialMeta(
  shopId: string
): Promise<Record<string, unknown> | null> {
  return loadPackageCredentialMeta(db, shopId)
}

/** Postgres-backed credential store for the marketplace token provider. */
export function createDbCredentialStore(): CredentialStore {
  return createPackageDbCredentialStore(db)
}
