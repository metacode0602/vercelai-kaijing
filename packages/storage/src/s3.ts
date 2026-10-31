import { createHash, createHmac } from "node:crypto"

/**
 * S3 / S3 兼容对象存储（AWS Signature V4）。
 *
 * 支持的环境变量（同一变量可提供多个名称，取第一个非空值）：
 * - STORAGE_S3_ACCESS_KEY_ID / S3_ACCESS_KEY_ID
 * - STORAGE_S3_SECRET_ACCESS_KEY / S3_SECRET_ACCESS_KEY
 * - STORAGE_S3_BUCKET / S3_BUCKET
 * - STORAGE_S3_REGION / S3_REGION（默认 us-east-1）
 * - STORAGE_S3_ENDPOINT / S3_ENDPOINT（默认 https://s3.{region}.amazonaws.com）
 * - STORAGE_S3_PUBLIC_URL / S3_PUBLIC_URL（对象可公开访问的基地址）
 * - STORAGE_S3_FORCE_PATH_STYLE / S3_FORCE_PATH_STYLE（默认 true，兼容 MinIO / R2）
 * - STORAGE_S3_SESSION_TOKEN / S3_SESSION_TOKEN（临时凭证）
 * - STORAGE_S3_SECURE（默认 true，endpoint 未带协议时使用）
 */

export const S3_SCHEME = "s3://"

export interface S3Config {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  bucket: string
  region: string
  endpoint: string
  publicBaseUrl: string
  forcePathStyle: boolean
  secure: boolean
}

function env(...names: Array<string | undefined>): string | undefined {
  for (const name of names) {
    const value = name ? process.env[name] : undefined
    if (value) return value.trim()
  }
  return undefined
}

function toBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  return value.toLowerCase() === "true" || value === "1"
}

function endpointUrl(endpoint: string, secure: boolean): URL {
  const raw = /^https?:\/\//i.test(endpoint)
    ? endpoint
    : `${secure ? "https" : "http"}://${endpoint}`
  return new URL(raw)
}

function defaultPublicBaseUrl(cfg: Omit<S3Config, "publicBaseUrl">): string {
  const endpoint = endpointUrl(cfg.endpoint, cfg.secure)
  const basePath = endpoint.pathname.replace(/\/+$/, "")
  if (cfg.forcePathStyle) {
    return `${endpoint.origin}${basePath}/${cfg.bucket}`
  }
  return `${endpoint.protocol}//${cfg.bucket}.${endpoint.host}${basePath}`
}

/**
 * 读取 S3 配置；未配置完整凭据时返回 null。
 */
export function getS3Config(): S3Config | null {
  const accessKeyId = env("STORAGE_S3_ACCESS_KEY_ID", "S3_ACCESS_KEY_ID")
  const secretAccessKey = env(
    "STORAGE_S3_SECRET_ACCESS_KEY",
    "S3_SECRET_ACCESS_KEY"
  )
  const bucket = env("STORAGE_S3_BUCKET", "S3_BUCKET")
  if (!accessKeyId || !secretAccessKey || !bucket) {
    return null
  }

  const region = env("STORAGE_S3_REGION", "S3_REGION") ?? "us-east-1"
  const secure = toBool(env("STORAGE_S3_SECURE"), true)
  const forcePathStyle = toBool(
    env("STORAGE_S3_FORCE_PATH_STYLE", "S3_FORCE_PATH_STYLE"),
    true
  )
  const endpoint =
    env("STORAGE_S3_ENDPOINT", "S3_ENDPOINT") ??
    `https://s3.${region}.amazonaws.com`
  const partial = {
    accessKeyId,
    secretAccessKey,
    sessionToken: env("STORAGE_S3_SESSION_TOKEN", "S3_SESSION_TOKEN"),
    bucket,
    region,
    endpoint,
    forcePathStyle,
    secure,
  }
  const publicBaseUrl = (
    env("STORAGE_S3_PUBLIC_URL", "S3_PUBLIC_URL") ??
    defaultPublicBaseUrl(partial)
  ).replace(/\/+$/, "")

  return { ...partial, publicBaseUrl }
}

export function resolveS3Config(uri?: string): S3Config {
  const cfg = getS3Config()
  if (!cfg) {
    throw new Error(
      "S3 存储未配置：请设置 STORAGE_S3_ACCESS_KEY_ID、STORAGE_S3_SECRET_ACCESS_KEY、STORAGE_S3_BUCKET"
    )
  }
  if (uri) {
    const parsed = parseS3Uri(uri)
    if (parsed && parsed.bucket !== cfg.bucket) {
      throw new Error("S3 bucket 不匹配")
    }
  }
  return cfg
}

export function s3Uri(bucket: string, objectKey: string): string {
  return `${S3_SCHEME}${bucket}/${objectKey}`
}

export function isS3Uri(uri: string): boolean {
  return uri.startsWith(S3_SCHEME)
}

export interface ParsedS3Uri {
  bucket: string
  objectKey: string
}

export function parseS3Uri(uri: string): ParsedS3Uri | null {
  if (!isS3Uri(uri)) return null
  const rest = uri.slice(S3_SCHEME.length)
  const slash = rest.indexOf("/")
  if (slash <= 0) return null
  return {
    bucket: rest.slice(0, slash),
    objectKey: rest.slice(slash + 1),
  }
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  )
}

function encodeObjectKey(objectKey: string): string {
  return objectKey.split("/").map(encodeRfc3986).join("/")
}

function objectUrl(cfg: S3Config, objectKey: string): string {
  const endpoint = endpointUrl(cfg.endpoint, cfg.secure)
  const basePath = endpoint.pathname.replace(/\/+$/, "")
  if (cfg.forcePathStyle) {
    return `${endpoint.origin}${basePath}/${encodeRfc3986(cfg.bucket)}/${encodeObjectKey(objectKey)}`
  }
  return `${endpoint.protocol}//${cfg.bucket}.${endpoint.host}${basePath}/${encodeObjectKey(objectKey)}`
}

function canonicalQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${encodeRfc3986(key)}=${encodeRfc3986(params[key] ?? "")}`)
    .join("&")
}

function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex")
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest()
}

function signingKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string
): Buffer {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp)
  const regionKey = hmac(dateKey, region)
  const serviceKey = hmac(regionKey, "s3")
  return hmac(serviceKey, "aws4_request")
}

function amzDate(date = new Date()): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "")
}

type S3Method = "GET" | "PUT" | "DELETE"

function signRequest(
  cfg: S3Config,
  method: S3Method,
  objectKey: string,
  payloadHash: string,
  extraHeaders: Record<string, string> = {},
  query: Record<string, string> = {}
): { url: string; headers: Record<string, string> } {
  const now = amzDate()
  const dateStamp = now.slice(0, 8)
  const url = objectUrl(cfg, objectKey)
  const host = new URL(url).host
  const headers: Record<string, string> = {
    ...extraHeaders,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": now,
  }
  if (cfg.sessionToken) headers["x-amz-security-token"] = cfg.sessionToken

  const canonicalHeaderMap: Record<string, string> = { host }
  for (const [key, value] of Object.entries(headers)) {
    canonicalHeaderMap[key.toLowerCase()] = value
  }
  const sortedHeaderKeys = Object.keys(canonicalHeaderMap).sort()
  const canonicalHeaders = sortedHeaderKeys
    .map((key) => `${key}:${canonicalHeaderMap[key]?.trim() ?? ""}\n`)
    .join("")
  const signedHeaders = sortedHeaderKeys.join(";")
  const credentialScope = `${dateStamp}/${cfg.region}/s3/aws4_request`
  const canonicalRequest = [
    method,
    new URL(url).pathname,
    canonicalQuery(query),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n")
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    now,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n")
  const signature = createHmac(
    "sha256",
    signingKey(cfg.secretAccessKey, dateStamp, cfg.region)
  )
    .update(stringToSign)
    .digest("hex")
  const authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  const queryString = canonicalQuery(query)

  return {
    url: queryString ? `${url}?${queryString}` : url,
    headers: { ...headers, Authorization: authorization },
  }
}

export async function s3Put(
  cfg: S3Config,
  objectKey: string,
  buffer: Buffer,
  contentType = "application/octet-stream"
): Promise<void> {
  const { url, headers } = signRequest(
    cfg,
    "PUT",
    objectKey,
    sha256Hex(buffer),
    {
      "content-type": contentType,
    }
  )
  const res = await fetch(url, {
    method: "PUT",
    headers,
    body: new Uint8Array(buffer),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`上传到 S3 失败 (${res.status}): ${detail.slice(0, 200)}`)
  }
}

export async function s3Get(cfg: S3Config, objectKey: string): Promise<Buffer> {
  const { url, headers } = signRequest(cfg, "GET", objectKey, sha256Hex(""))
  const res = await fetch(url, { method: "GET", headers })
  if (!res.ok) {
    throw new Error(`从 S3 读取文件失败 (${res.status})`)
  }
  return Buffer.from(await res.arrayBuffer())
}

export async function s3Delete(
  cfg: S3Config,
  objectKey: string
): Promise<void> {
  const { url, headers } = signRequest(cfg, "DELETE", objectKey, sha256Hex(""))
  const res = await fetch(url, { method: "DELETE", headers })
  if (!res.ok && res.status !== 404) {
    throw new Error(`删除 S3 对象失败 (${res.status})`)
  }
}

/** 浏览器直传 S3 的预签名 PUT URL（Signature V4 query 认证）。 */
export function createS3PresignedPutUrl(
  cfg: S3Config,
  objectKey: string,
  contentType = "application/octet-stream",
  expiresSec = 600
): { url: string; expiresAt: string } {
  const now = amzDate()
  const dateStamp = now.slice(0, 8)
  const url = objectUrl(cfg, objectKey)
  const host = new URL(url).host
  const credentialScope = `${dateStamp}/${cfg.region}/s3/aws4_request`
  const signedHeaders = "content-type;host"
  const canonicalHeaders = `content-type:${contentType.trim()}\nhost:${host}\n`
  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${cfg.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": now,
    "X-Amz-Expires": String(expiresSec),
    "X-Amz-SignedHeaders": signedHeaders,
  }
  if (cfg.sessionToken) query["X-Amz-Security-Token"] = cfg.sessionToken
  const canonicalRequest = [
    "PUT",
    new URL(url).pathname,
    canonicalQuery(query),
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n")
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    now,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n")
  const signature = createHmac(
    "sha256",
    signingKey(cfg.secretAccessKey, dateStamp, cfg.region)
  )
    .update(stringToSign)
    .digest("hex")
  query["X-Amz-Signature"] = signature

  return {
    url: `${url}?${canonicalQuery(query)}`,
    expiresAt: new Date(
      (Math.floor(Date.now() / 1000) + expiresSec) * 1000
    ).toISOString(),
  }
}

/** 生成 S3 可读预签名 GET URL（Signature V4 query 认证）。 */
export function createS3PresignedGetUrl(
  cfg: S3Config,
  objectKey: string,
  expiresSec = 600
): string {
  const now = amzDate()
  const dateStamp = now.slice(0, 8)
  const url = objectUrl(cfg, objectKey)
  const host = new URL(url).host
  const credentialScope = `${dateStamp}/${cfg.region}/s3/aws4_request`
  const signedHeaders = "host"
  const canonicalHeaders = `host:${host}\n`
  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${cfg.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": now,
    "X-Amz-Expires": String(expiresSec),
    "X-Amz-SignedHeaders": signedHeaders,
  }
  if (cfg.sessionToken) query["X-Amz-Security-Token"] = cfg.sessionToken
  const canonicalRequest = [
    "GET",
    new URL(url).pathname,
    canonicalQuery(query),
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n")
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    now,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n")
  const signature = createHmac(
    "sha256",
    signingKey(cfg.secretAccessKey, dateStamp, cfg.region)
  )
    .update(stringToSign)
    .digest("hex")
  query["X-Amz-Signature"] = signature

  return `${url}?${canonicalQuery(query)}`
}

/** 基于 STORAGE_S3_PUBLIC_URL 的对象公开访问地址（bucket 需允许公网读）。 */
export function publicS3Url(cfg: S3Config, objectKey: string): string {
  return `${cfg.publicBaseUrl}/${encodeObjectKey(objectKey)}`
}
