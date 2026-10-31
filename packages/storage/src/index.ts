import { createHmac } from 'node:crypto'
import { getS3Config } from './s3'

/**
 * 统一存储配置：阿里云 OSS（Signature V1）、S3 / S3 兼容存储（Signature V4）与本地磁盘。
 *
 * 支持的环境变量（同一变量可提供多个名称，取第一个非空值）：
 * - STORAGE_ACCESS_KEY_ID / OSS_ACCESS_KEY_ID
 * - STORAGE_SECRET_ACCESS_KEY / OSS_ACCESS_KEY_SECRET
 * - STORAGE_BUCKET_NAME / OSS_BUCKET
 * - STORAGE_REGION / OSS_REGION（默认 cn-hangzhou）
 * - STORAGE_ENDPOINT / OSS_ENDPOINT（默认 https://{bucket}.{region-host}.aliyuncs.com）
 * - STORAGE_PUBLIC_URL / OSS_PUBLIC_BASE_URL（对象可公开访问的基地址）
 * - STORAGE_OSS_INTERNAL（默认 false，使用内网 endpoint 提升性能）
 * - STORAGE_OSS_SECURE（默认 true，使用 HTTPS）
 * - STORAGE_DRIVER（可选：local | oss | s3；默认在 OSS 已配置时使用 oss，否则在 S3 已配置时使用 s3，最后回退 local）
 */

export type StorageDriver = 'oss' | 's3' | 'local'

export const OSS_SCHEME = 'oss://'
export const LOCAL_SCHEME = 'local://'

export interface OssConfig {
  accessKeyId: string
  accessKeySecret: string
  bucket: string
  region: string
  /** 形如 oss-cn-hangzhou.aliyuncs.com 或包含协议的完整地址 */
  endpoint: string
  publicBaseUrl: string
  internal: boolean
  secure: boolean
  /** 内网 endpoint（host 形式，STORAGE_ENDPOINT 或自动推导后拼接 -internal） */
  internalEndpoint: string
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
  return value.toLowerCase() === 'true' || value === '1'
}

function normalizeRegionHost(region: string): string {
  return region.startsWith('oss-') ? region : `oss-${region}`
}

/**
 * 读取 OSS 配置；未配置完整凭据时返回 null（由调用方决定回退本地存储）。
 */
export function getOssConfig(): OssConfig | null {
  const accessKeyId = env('STORAGE_ACCESS_KEY_ID', 'OSS_ACCESS_KEY_ID')
  const accessKeySecret = env('STORAGE_SECRET_ACCESS_KEY', 'OSS_ACCESS_KEY_SECRET')
  const bucket = env('STORAGE_BUCKET_NAME', 'OSS_BUCKET')
  if (!accessKeyId || !accessKeySecret || !bucket) {
    return null
  }

  const region = env('STORAGE_REGION', 'OSS_REGION') ?? 'cn-hangzhou'
  const secure = toBool(env('STORAGE_OSS_SECURE'), true)
  const protocol = secure ? 'https' : 'http'
  const regionHost = normalizeRegionHost(region)
  const autoEndpoint = `${bucket}.${regionHost}.aliyuncs.com`
  const endpoint = env('STORAGE_ENDPOINT', 'OSS_ENDPOINT') ?? autoEndpoint
  const rawPublicBaseUrl =
    env('STORAGE_PUBLIC_URL', 'OSS_PUBLIC_BASE_URL') ?? `${protocol}://${autoEndpoint}`
  const publicBaseUrl = rawPublicBaseUrl.replace(/\/+$/, '')

  const internal = toBool(env('STORAGE_OSS_INTERNAL'), false)
  const internalEndpoint = internal
    ? `${bucket}.${regionHost}-internal.aliyuncs.com`
    : endpoint

  return {
    accessKeyId,
    accessKeySecret,
    bucket,
    region,
    endpoint,
    publicBaseUrl,
    internal,
    secure,
    internalEndpoint,
  }
}

/**
 * 解析当前生效的存储驱动：
 * 1. 优先读取全局 STORAGE_DRIVER（local / oss）；
 * 2. 兼容历史按模块的环境变量（如 PROJECT_ACTIVITY_STORAGE_DRIVER）；
 * 3. 默认 oss；若 OSS 未配置则回退 local。
 */
export function resolveStorageDriver(legacyEnvName?: string): StorageDriver {
  const legacy = legacyEnvName ? env(legacyEnvName) : undefined
  if (legacy === 'local' || legacy === 'oss' || legacy === 's3') {
    if (legacy === 'local') return 'local'
    if (legacy === 'oss') return getOssConfig() ? 'oss' : 'local'
    return getS3Config() ? 's3' : 'local'
  }

  const global = env('STORAGE_DRIVER')
  if (global === 'local') return 'local'
  if (global === 'oss') return getOssConfig() ? 'oss' : 'local'
  if (global === 's3') return getS3Config() ? 's3' : 'local'

  return getOssConfig() ? 'oss' : getS3Config() ? 's3' : 'local'
}

export type StorageUri = string

export function ossUri(bucket: string, objectKey: string): StorageUri {
  return `${OSS_SCHEME}${bucket}/${objectKey}`
}

export function isOssUri(uri: string): boolean {
  return uri.startsWith(OSS_SCHEME)
}

export function isLocalUri(uri: string): boolean {
  return uri.startsWith(LOCAL_SCHEME)
}

export interface ParsedOssUri {
  bucket: string
  objectKey: string
}

export function parseOssUri(uri: string): ParsedOssUri | null {
  if (!isOssUri(uri)) return null
  const rest = uri.slice(OSS_SCHEME.length)
  const slash = rest.indexOf('/')
  if (slash <= 0) return null
  return {
    bucket: rest.slice(0, slash),
    objectKey: rest.slice(slash + 1),
  }
}

export function resolveOssConfig(uri?: string): OssConfig {
  const cfg = getOssConfig()
  if (!cfg) {
    throw new Error('OSS 存储未配置：请设置 STORAGE_ACCESS_KEY_ID、STORAGE_SECRET_ACCESS_KEY、STORAGE_BUCKET_NAME')
  }
  if (uri) {
    const parsed = parseOssUri(uri)
    if (parsed && parsed.bucket !== cfg.bucket) {
      throw new Error('OSS bucket 不匹配')
    }
  }
  return cfg
}

/**
 * 对象请求基地址（path-style，形如 https://oss-cn-hangzhou.aliyuncs.com）。
 * 默认走 endpoint；启用内网时优先走 STORAGE_ENDPOINT（内网地址），否则自动拼 -internal。
 */
function requestBase(cfg: OssConfig): string {
  const protocol = cfg.secure ? 'https' : 'http'
  const host = cfg.internal ? cfg.internalEndpoint : cfg.endpoint
  if (!/^https?:\/\//i.test(host)) {
    return `${protocol}://${host}`
  }
  return host.replace(/\/+$/, '')
}

export function buildOssAuthorization(
  method: string,
  contentType: string,
  date: string,
  resource: string,
  accessKeyId: string,
  accessKeySecret: string,
): string {
  const stringToSign = [method, '', contentType, date, resource].join('\n')
  const signature = createHmac('sha1', accessKeySecret).update(stringToSign).digest('base64')
  return `OSS ${accessKeyId}:${signature}`
}

type SignedHeaders = Record<string, string>

function signRequest(
  cfg: OssConfig,
  operation: { method: 'PUT' | 'GET' | 'DELETE'; objectKey: string; contentType?: string },
): { url: string; headers: SignedHeaders } {
  const objectKey = operation.objectKey
  const resource = `/${cfg.bucket}/${objectKey}`
  const date = new Date().toUTCString()
  const authorization = buildOssAuthorization(
    operation.method,
    operation.contentType ?? '',
    date,
    resource,
    cfg.accessKeyId,
    cfg.accessKeySecret,
  )
  const base = requestBase(cfg)
  const headers: SignedHeaders = {
    Authorization: authorization,
    Date: date,
  }
  if (operation.contentType) {
    headers['Content-Type'] = operation.contentType
  }
  return { url: `${base}/${cfg.bucket}/${objectKey}`, headers }
}

export async function ossPut(
  cfg: OssConfig,
  objectKey: string,
  buffer: Buffer,
  contentType = 'application/octet-stream',
): Promise<void> {
  const { url, headers } = signRequest(cfg, { method: 'PUT', objectKey, contentType })
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...headers, 'Content-Length': String(buffer.length) },
    body: new Uint8Array(buffer),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`上传到 OSS 失败 (${res.status}): ${detail.slice(0, 200)}`)
  }
}

export async function ossGet(cfg: OssConfig, objectKey: string): Promise<Buffer> {
  const { url, headers } = signRequest(cfg, { method: 'GET', objectKey })
  const res = await fetch(url, { method: 'GET', headers })
  if (!res.ok) {
    throw new Error(`从 OSS 读取文件失败 (${res.status})`)
  }
  return Buffer.from(await res.arrayBuffer())
}

export async function ossDelete(cfg: OssConfig, objectKey: string): Promise<void> {
  const { url, headers } = signRequest(cfg, { method: 'DELETE', objectKey })
  const res = await fetch(url, { method: 'DELETE', headers })
  if (!res.ok && res.status !== 404) {
    throw new Error(`删除 OSS 对象失败 (${res.status})`)
  }
}

/** 按前缀列出对象 key（list-type=2，自动分页）。 */
export async function ossListByPrefix(cfg: OssConfig, prefix: string): Promise<string[]> {
  const base = requestBase(cfg)
  const keys: string[] = []
  let continuationToken: string | undefined

  for (;;) {
    const params = new URLSearchParams({
      'list-type': '2',
      prefix,
      'max-keys': '1000',
    })
    if (continuationToken) params.set('continuation-token', continuationToken)

    const resource = `/${cfg.bucket}?${params.toString()}`
    const date = new Date().toUTCString()
    const authorization = buildOssAuthorization(
      'GET',
      '',
      date,
      resource,
      cfg.accessKeyId,
      cfg.accessKeySecret,
    )

    const res = await fetch(`${base}/${cfg.bucket}?${params.toString()}`, {
      method: 'GET',
      headers: { Authorization: authorization, Date: date },
    })
    if (!res.ok) {
      throw new Error(`列出 OSS 对象失败 (${res.status})`)
    }
    const xml = await res.text()

    const keyMatches = Array.from(xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g))
    for (const m of keyMatches) {
      keys.push(m[1] as string)
    }

    const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml)
    const nextMatch = xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)
    if (!truncated || !nextMatch) {
      break
    }
    continuationToken = nextMatch[1]
  }

  return keys
}

/** 删除指定前缀下的所有对象。 */
export async function ossDeleteByPrefix(cfg: OssConfig, prefix: string): Promise<void> {
  const keys = await ossListByPrefix(cfg, prefix)
  await Promise.all(keys.map((objectKey) => ossDelete(cfg, objectKey).catch(() => undefined)))
}

/** 浏览器直传 OSS 的预签名 PUT URL（Signature V1 query 认证）。 */
export function createOssPresignedPutUrl(
  cfg: OssConfig,
  objectKey: string,
  contentType: string,
  expiresSec = 600,
): { url: string; expiresAt: string } {
  const expires = Math.floor(Date.now() / 1000) + expiresSec
  const resource = `/${cfg.bucket}/${objectKey}`
  const stringToSign = ['PUT', '', contentType, String(expires), resource].join('\n')
  const signature = createHmac('sha1', cfg.accessKeySecret).update(stringToSign).digest('base64')
  const base = requestBase(cfg)
  const url =
    `${base}/${cfg.bucket}/${objectKey}` +
    `?OSSAccessKeyId=${encodeURIComponent(cfg.accessKeyId)}` +
    `&Expires=${expires}` +
    `&Signature=${encodeURIComponent(signature)}`
  return { url, expiresAt: new Date(expires * 1000).toISOString() }
}

/** 生成 OSS 可读预签名 GET URL（Signature V1 query 认证）。 */
export function createOssPresignedGetUrl(cfg: OssConfig, objectKey: string, expiresSec = 600): string {
  const expires = Math.floor(Date.now() / 1000) + expiresSec
  const resource = `/${cfg.bucket}/${objectKey}`
  const stringToSign = ['GET', '', '', String(expires), resource].join('\n')
  const signature = createHmac('sha1', cfg.accessKeySecret).update(stringToSign).digest('base64')
  const base = requestBase(cfg)
  return (
    `${base}/${cfg.bucket}/${objectKey}` +
    `?OSSAccessKeyId=${encodeURIComponent(cfg.accessKeyId)}` +
    `&Expires=${expires}` +
    `&Signature=${encodeURIComponent(signature)}`
  )
}

/** 基于 STORAGE_PUBLIC_URL 的对象公开访问地址（bucket 需允许公网读）。 */
export function publicStorageUrl(cfg: OssConfig, objectKey: string): string {
  return `${cfg.publicBaseUrl}/${objectKey}`
}

export function sanitizeStorageFileName(name: string): string {
  return name.replace(/[^\w.\-()\u4e00-\u9fff]+/g, '_').slice(0, 200)
}

export function generateStoredFileName(originalName: string): string {
  return `${crypto.randomUUID()}_${sanitizeStorageFileName(originalName)}`
}

export { normalizeRegionHost }

export * from './s3'
