import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'
import {
  getOssConfig,
  getS3Config,
  LOCAL_SCHEME,
  ossPut,
  ossUri,
  resolveStorageDriver,
  s3Put,
  s3Uri,
} from '@workspace/storage'
import { auth } from '@/lib/auth'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
}

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '请选择文件' }, { status: 400 })
  }
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: '文件大小需在 10MB 以内' }, { status: 400 })
  }
  const ext = ALLOWED_TYPES[file.type]
  if (!ext) {
    return NextResponse.json({ error: '仅支持 JPG / PNG / PDF 文件' }, { status: 400 })
  }

  const objectKey = `tenant-onboarding/${session.user.id}/${randomUUID()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const driver = resolveStorageDriver()

  try {
    if (driver === 'oss') {
      const cfg = getOssConfig()
      if (!cfg) throw new Error('OSS 未配置')
      await ossPut(cfg, objectKey, buffer, file.type)
      return NextResponse.json({
        key: ossUri(cfg.bucket, objectKey),
        name: file.name,
        size: file.size,
        contentType: file.type,
      })
    }

    if (driver === 's3') {
      const cfg = getS3Config()
      if (!cfg) throw new Error('S3 未配置')
      await s3Put(cfg, objectKey, buffer, file.type)
      return NextResponse.json({
        key: s3Uri(cfg.bucket, objectKey),
        name: file.name,
        size: file.size,
        contentType: file.type,
      })
    }

    const localRoot =
      process.env.STORAGE_LOCAL_DIR?.trim() || path.join(process.cwd(), '.storage')
    const target = path.join(localRoot, objectKey)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, buffer)
    return NextResponse.json({
      key: `${LOCAL_SCHEME}${objectKey}`,
      name: file.name,
      size: file.size,
      contentType: file.type,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '上传失败'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
