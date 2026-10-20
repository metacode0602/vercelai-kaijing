import {
  createOssPresignedGetUrl as buildOssPresignedGetUrl,
  parseOssUri,
  resolveOssConfig,
} from '@workspace/storage'

export function createOssPresignedGetUrl(storageKey: string, expiresSec = 600): string {
  const cfg = resolveOssConfig(storageKey)
  const parsed = parseOssUri(storageKey)
  if (!parsed) throw new Error('无效的 OSS URI')
  return buildOssPresignedGetUrl(cfg, parsed.objectKey, expiresSec)
}