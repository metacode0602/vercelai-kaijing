import {
  isLocalUri,
  isOssUri,
  ossGet,
  parseOssUri,
  ossPut,
  resolveOssConfig,
  resolveStorageDriver,
  ossUri,
  generateStoredFileName,
  type StorageDriver,
} from '@workspace/storage'

export type ProjectActivityStorageDriver = StorageDriver

export function getProjectActivityStorageDriver(): ProjectActivityStorageDriver {
  return resolveStorageDriver('PROJECT_ACTIVITY_STORAGE_DRIVER')
}

async function saveToOss(input: {
  projectId: string
  activityId: string
  fileName: string
  buffer: Buffer
  mimeType?: string
}): Promise<string> {
  const cfg = resolveOssConfig()
  const objectKey = [
    'project-activities',
    input.projectId,
    input.activityId,
    generateStoredFileName(input.fileName),
  ].join('/')
  await ossPut(cfg, objectKey, input.buffer, input.mimeType || 'application/octet-stream')
  return ossUri(cfg.bucket, objectKey)
}

export async function saveProjectActivityFile(input: {
  projectId: string
  activityId: string
  fileName: string
  buffer: Buffer
  mimeType?: string
}): Promise<string> {
  if (getProjectActivityStorageDriver() === 'oss') {
    return saveToOss(input)
  }
  const { saveLocalProjectActivityFile } = await import('./project-activity-local-storage')
  return saveLocalProjectActivityFile(input)
}

export async function readProjectActivityFile(storageUri: string): Promise<Buffer> {
  if (isLocalUri(storageUri)) {
    const { readLocalProjectActivityFile } = await import('./project-activity-local-storage')
    return readLocalProjectActivityFile(storageUri)
  }

  if (isOssUri(storageUri)) {
    const cfg = resolveOssConfig(storageUri)
    const parsed = parseOssUri(storageUri)
    if (!parsed) throw new Error('无效的 OSS 存储 URI')
    return ossGet(cfg, parsed.objectKey)
  }

  throw new Error('不支持的存储 URI')
}

export function resolveProjectActivityDownloadUrl(attachmentId: string): string {
  return `/api/crm/project-activities/attachments/${attachmentId}`
}