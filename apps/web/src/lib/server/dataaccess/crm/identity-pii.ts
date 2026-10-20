import { createDecipheriv, createHash } from "node:crypto"

const ALG = "aes-256-gcm"

function getPiiKey(): Buffer {
  const secret =
    process.env.IDENTITY_PII_SECRET?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim() ||
    "dev-identity-pii-secret"
  return createHash("sha256").update(secret).digest()
}

export function decryptIdNumber(cipherText: string): string {
  const [ivB64, tagB64, dataB64] = cipherText.split(".")
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("invalid cipher")
  const decipher = createDecipheriv(ALG, getPiiKey(), Buffer.from(ivB64, "base64url"))
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"))
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8")
}
