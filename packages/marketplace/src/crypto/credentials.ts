/**
 * AES-256-GCM helpers for `integration_credentials.payload_encrypted`.
 * Key: `MARKETPLACE_CREDENTIALS_KEY` (32-byte hex or utf8) or fallback `BETTER_AUTH_SECRET`.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

export interface CredentialPayload {
  accessToken: string
  refreshToken?: string
  expiresAt?: string | null
  refreshExpiresAt?: string | null
  meta?: Record<string, unknown>
}

function resolveKeyMaterial(): Buffer {
  const raw =
    process.env.MARKETPLACE_CREDENTIALS_KEY?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim() ||
    ""
  if (!raw) {
    throw new Error(
      "Missing MARKETPLACE_CREDENTIALS_KEY (or BETTER_AUTH_SECRET) for credential encryption",
    )
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex")
  }
  return createHash("sha256").update(raw, "utf8").digest()
}

/** Returns `v1.<iv_b64>.<tag_b64>.<cipher_b64>`. */
function encryptString(plaintext: string): string {
  const key = resolveKeyMaterial()
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(plaintext, "utf8")),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".")
}

function decryptString(blob: string): string {
  const [version, ivB64, tagB64, dataB64] = blob.split(".")
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Unsupported credential ciphertext format")
  }
  const key = resolveKeyMaterial()
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"))
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ])
  return decrypted.toString("utf8")
}

export function encryptCredentialPayload(payload: CredentialPayload): string {
  return encryptString(JSON.stringify(payload))
}

export function decryptCredentialPayload(blob: string): CredentialPayload {
  return JSON.parse(decryptString(blob)) as CredentialPayload
}

/** Encrypt tenant-owned app secrets (App Secret) with the same AES-256-GCM format. */
export function encryptSecret(value: string): string {
  return encryptString(value)
}

export function decryptSecret(blob: string): string {
  return decryptString(blob)
}

export function maskToken(token: string | undefined | null, visible = 4): string {
  if (!token) return "····"
  if (token.length <= visible) return `····${token}`
  return `····${token.slice(-visible)}`
}
