import { mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  LOCAL_STORAGE_SUBDIRS,
  resolveModuleStoragePath,
  sanitizeStorageFileName,
} from '../local-storage-root'
import {
  isOssUri,
  ossDelete,
  ossDeleteByPrefix,
  ossGet,
  ossPut,
  ossUri,
  parseOssUri,
  resolveOssConfig,
  resolveStorageDriver,
} from '@workspace/storage'

const FINANCE_IMPORT_PREFIX = 'finance-imports'

function resolveStoragePath(relativePath: string): string {
  return resolveModuleStoragePath(LOCAL_STORAGE_SUBDIRS.financeImports, relativePath)
}

function resolveRel(billingPeriodId: string, fileType: string, fileName: string): string {
  return path
    .join(billingPeriodId, fileType, fileName)
    .replace(/\\/g, '/')
}

export async function saveImportSourceFile(input: {
  billingPeriodId: string
  fileType: string
  batchId: string
  fileName: string
  buffer: Buffer
}): Promise<string> {
  const rel = resolveRel(
    input.billingPeriodId,
    input.fileType,
    `${input.batchId}_${sanitizeStorageFileName(input.fileName)}`,
  )

  if (resolveStorageDriver() === 'oss') {
    const cfg = resolveOssConfig()
    const objectKey = `${FINANCE_IMPORT_PREFIX}/${rel}`
    await ossPut(cfg, objectKey, input.buffer, 'application/octet-stream')
    return ossUri(cfg.bucket, objectKey)
  }

  const abs = resolveStoragePath(rel)
  await mkdir(path.dirname(abs), { recursive: true })
  await writeFile(abs, input.buffer)
  return rel
}

export async function saveImportErrorReport(input: {
  billingPeriodId: string
  fileType: string
  batchId: string
  buffer: Buffer
}): Promise<string> {
  const rel = resolveRel(input.billingPeriodId, input.fileType, `${input.batchId}_errors.xlsx`)

  if (resolveStorageDriver() === 'oss') {
    const cfg = resolveOssConfig()
    const objectKey = `${FINANCE_IMPORT_PREFIX}/${rel}`
    await ossPut(cfg, objectKey, input.buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    return ossUri(cfg.bucket, objectKey)
  }

  const abs = resolveStoragePath(rel)
  await mkdir(path.dirname(abs), { recursive: true })
  await writeFile(abs, input.buffer)
  return rel
}

export async function readStorageFile(relativePath: string): Promise<Buffer> {
  if (isOssUri(relativePath)) {
    const cfg = resolveOssConfig(relativePath)
    const parsed = parseOssUri(relativePath)
    if (!parsed) throw new Error('无效的 OSS 存储 URI')
    return ossGet(cfg, parsed.objectKey)
  }
  return readFile(resolveStoragePath(relativePath))
}

export async function deleteStorageFile(relativePath: string | null | undefined): Promise<void> {
  if (!relativePath) return
  if (isOssUri(relativePath)) {
    const cfg = resolveOssConfig(relativePath)
    const parsed = parseOssUri(relativePath)
    if (!parsed) return
    await ossDelete(cfg, parsed.objectKey).catch(() => undefined)
    return
  }
  try {
    await unlink(resolveStoragePath(relativePath))
  } catch {
    /* ignore missing */
  }
}

export async function deletePeriodImportDirectory(billingPeriodId: string): Promise<void> {
  if (resolveStorageDriver() === 'oss') {
    const cfg = resolveOssConfig()
    await ossDeleteByPrefix(cfg, `${FINANCE_IMPORT_PREFIX}/${billingPeriodId}`)
    return
  }
  const abs = resolveStoragePath(billingPeriodId)
  try {
    await rm(abs, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}