import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  generateStoredFileName,
  isLocalUri,
  isOssUri,
  ossGet,
  ossPut,
  ossUri,
  parseOssUri,
  resolveOssConfig,
  resolveStorageDriver,
} from '@workspace/storage'
import {
  LOCAL_STORAGE_SUBDIRS,
  LOCAL_STORAGE_URI_PREFIX,
  resolveModuleStoragePath,
  sanitizeStorageFileName,
} from '../local-storage-root'

export type OnboardingDocumentKind = 'businessLicense' | 'legalPersonId' | 'other'

export interface OnboardingDocumentRef {
  fileName: string
  storageUri: string
  mimeType?: string
  kind: OnboardingDocumentKind
}

function resolveLocalPath(relativePath: string): string {
  return resolveModuleStoragePath(
    LOCAL_STORAGE_SUBDIRS.supplierOnboardingDocuments,
    relativePath,
  )
}

export async function saveOnboardingDocument(input: {
  organizationId: string
  fileName: string
  buffer: Buffer
  mimeType?: string
}): Promise<string> {
  if (resolveStorageDriver('SUPPLIER_ACTIVITY_STORAGE_DRIVER') === 'oss') {
    return saveToOss(input)
  }
  return saveToLocal(input)
}

async function saveToLocal(input: {
  organizationId: string
  fileName: string
  buffer: Buffer
}): Promise<string> {
  const rel = path
    .join(
      input.organizationId,
      generateStoredFileName(input.fileName),
    )
    .replace(/\\/g, '/')
  const abs = resolveLocalPath(rel)
  await mkdir(path.dirname(abs), { recursive: true })
  await writeFile(abs, input.buffer)
  return `${LOCAL_STORAGE_URI_PREFIX}${rel}`
}

async function saveToOss(input: {
  organizationId: string
  fileName: string
  buffer: Buffer
  mimeType?: string
}): Promise<string> {
  const cfg = resolveOssConfig()
  const objectKey = [
    'supplier-onboarding-documents',
    input.organizationId,
    generateStoredFileName(input.fileName),
  ].join('/')
  await ossPut(cfg, objectKey, input.buffer, input.mimeType || 'application/octet-stream')
  return ossUri(cfg.bucket, objectKey)
}

export async function readOnboardingDocument(storageUri: string): Promise<Buffer> {
  if (isLocalUri(storageUri)) {
    const rel = storageUri.slice(LOCAL_STORAGE_URI_PREFIX.length)
    return readFile(resolveLocalPath(rel))
  }

  if (isOssUri(storageUri)) {
    const cfg = resolveOssConfig(storageUri)
    const parsed = parseOssUri(storageUri)
    if (!parsed) throw new Error('无效的 OSS 存储 URI')
    return ossGet(cfg, parsed.objectKey)
  }

  throw new Error('不支持的存储 URI')
}