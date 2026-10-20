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
  type StorageDriver,
} from '@workspace/storage'

export type SupplierActivityStorageDriver = StorageDriver

export function getSupplierActivityStorageDriver(): SupplierActivityStorageDriver {
  return resolveStorageDriver('SUPPLIER_ACTIVITY_STORAGE_DRIVER')
}

async function saveToOss(input: {
  supplierId: string
  activityId: string
  fileName: string
  buffer: Buffer
  mimeType?: string
}): Promise<string> {
  const cfg = resolveOssConfig()
  const objectKey = [
    'supplier-activities',
    input.supplierId,
    input.activityId,
    generateStoredFileName(input.fileName),
  ].join('/')
  await ossPut(cfg, objectKey, input.buffer, input.mimeType || 'application/octet-stream')
  return ossUri(cfg.bucket, objectKey)
}

export async function saveSupplierActivityFile(input: {
  supplierId: string
  activityId: string
  fileName: string
  buffer: Buffer
  mimeType?: string
}): Promise<string> {
  if (getSupplierActivityStorageDriver() === 'oss') {
    return saveToOss(input)
  }
  const { saveLocalSupplierActivityFile } = await import('./supplier-activity-local-storage')
  return saveLocalSupplierActivityFile(input)
}

export async function readSupplierActivityFile(storageUri: string): Promise<Buffer> {
  if (isLocalUri(storageUri)) {
    const { readLocalSupplierActivityFile } = await import('./supplier-activity-local-storage')
    return readLocalSupplierActivityFile(storageUri)
  }

  if (isOssUri(storageUri)) {
    const cfg = resolveOssConfig(storageUri)
    const parsed = parseOssUri(storageUri)
    if (!parsed) throw new Error('无效的 OSS 存储 URI')
    return ossGet(cfg, parsed.objectKey)
  }

  throw new Error('不支持的存储 URI')
}

export function resolveSupplierActivityDownloadUrl(attachmentId: string): string {
  return `/api/supplier/activities/attachments/${attachmentId}`
}