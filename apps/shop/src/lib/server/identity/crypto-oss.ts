import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import {
  createOssPresignedGetUrl as buildOssPresignedGetUrl,
  createOssPresignedPutUrl as buildOssPresignedPutUrl,
  parseOssUri,
  resolveOssConfig,
} from "@workspace/storage"

const ALG = "aes-256-gcm"

function getPiiKey(): Buffer {
  const secret =
    process.env.IDENTITY_PII_SECRET?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim() ||
    "dev-identity-pii-secret"
  return createHash("sha256").update(secret).digest()
}

export function encryptIdNumber(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALG, getPiiKey(), iv)
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`
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

export function maskIdNumber(idNumber: string): string {
  if (idNumber.length < 8) return "****"
  return `${idNumber.slice(0, 3)}***********${idNumber.slice(-4)}`
}

export function hashIdNumber(idNumber: string): string {
  return createHash("sha256").update(idNumber).digest("hex")
}

export function isValidChineseIdNumber(id: string): boolean {
  if (!/^\d{17}[\dXx]$/.test(id)) return false
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
  const checks = ["1", "0", "X", "9", "8", "7", "6", "5", "4", "3", "2"]
  let sum = 0
  for (let i = 0; i < 17; i++) sum += Number(id[i]) * weights[i]!
  const expected = checks[sum % 11]
  return id[17]!.toUpperCase() === expected
}

export function isValidUscc(uscc: string): boolean {
  return /^[0-9A-Z]{18}$/.test(uscc)
}

export function isValidMobile(mobile: string): boolean {
  return /^1\d{10}$/.test(mobile)
}

/** Aliyun OSS signed PUT URL for browser upload */
export function createOssPresignedPutUrl(input: {
  objectKey: string
  contentType: string
  expiresSec?: number
}): { uploadUrl: string; storageKey: string; expiresAt: string } {
  const cfg = resolveOssConfig()
  const { url, expiresAt } = buildOssPresignedPutUrl(
    cfg,
    input.objectKey,
    input.contentType,
    input.expiresSec ?? 600,
  )
  return {
    uploadUrl: url,
    storageKey: `oss://${cfg.bucket}/${input.objectKey}`,
    expiresAt,
  }
}

export function createOssPresignedGetUrl(
  storageKey: string,
  expiresSec = 600,
): string {
  const cfg = resolveOssConfig(storageKey)
  const parsed = parseOssUri(storageKey)
  if (!parsed) throw new Error("无效的 OSS URI")
  return buildOssPresignedGetUrl(cfg, parsed.objectKey, expiresSec)
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.\-()\u4e00-\u9fff]+/g, "_").slice(0, 200)
}