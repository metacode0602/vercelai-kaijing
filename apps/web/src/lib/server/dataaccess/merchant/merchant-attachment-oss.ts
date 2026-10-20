import {
  generateStoredFileName,
  isOssUri,
  ossGet,
  ossPut,
  ossUri,
  parseOssUri,
  resolveOssConfig,
} from '@workspace/storage'

export async function saveMerchantAttachmentToOss(input: {
  subdirKey: 'activity' | 'recharge'
  merchantId: string
  parentId: string
  fileName: string
  buffer: Buffer
  mimeType?: string
}): Promise<string> {
  const cfg = resolveOssConfig()
  const prefix = input.subdirKey === 'activity' ? 'merchant-activities' : 'merchant-recharge'
  const objectKey = [
    prefix,
    input.merchantId,
    input.parentId,
    generateStoredFileName(input.fileName),
  ].join('/')
  await ossPut(cfg, objectKey, input.buffer, input.mimeType || 'application/octet-stream')
  return ossUri(cfg.bucket, objectKey)
}

export async function readMerchantAttachmentFromOss(storageUri: string): Promise<Buffer> {
  if (!isOssUri(storageUri)) {
    throw new Error('无效的 OSS URI')
  }
  const cfg = resolveOssConfig(storageUri)
  const parsed = parseOssUri(storageUri)
  if (!parsed) throw new Error('无效的 OSS URI')
  return ossGet(cfg, parsed.objectKey)
}