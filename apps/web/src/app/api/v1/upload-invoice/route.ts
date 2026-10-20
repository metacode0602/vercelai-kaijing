import { NextResponse } from 'next/server'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

import { guardInvoiceFileAccess } from '@/lib/server/auth/invoice-file-access'

const MAX_FILE_BYTES = 20 * 1024 * 1024 // 20MB

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
])

const ACCEPT_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif'])

function extensionFromFilename(name: string): string | null {
  const i = name.lastIndexOf('.')
  if (i < 0 || i === name.length - 1) return null
  const ext = name.slice(i + 1).toLowerCase()
  return ACCEPT_EXTENSIONS.has(ext) ? ext : null
}

function extensionFromMime(mime: string): string | null {
  const m = mime.toLowerCase().split(';')[0]?.trim()
  if (m === 'application/pdf') return 'pdf'
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg'
  if (m === 'image/png') return 'png'
  if (m === 'image/webp') return 'webp'
  if (m === 'image/gif') return 'gif'
  return null
}

/**
 * POST /api/v1/upload-invoice
 * 
 * 上传发票附件（PDF 或图片）到本地存储。
 * 
 * 请求：multipart/form-data
 * - file: 文件（必填）
 * 
 * 响应：{ fileUrl: string, storageKey: string, mimeType: string, size: number }
 */
export async function POST(request: Request) {
  const denied = await guardInvoiceFileAccess(request)
  if (denied) return denied

  const requestId = crypto.randomUUID().slice(0, 8)
  const logPrefix = `[invoice upload] requestId=${requestId}`

  let formData: FormData
  try {
    formData = await request.formData()
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.warn(`${logPrefix} error=invalid_multipart detail=${detail}`)
    return NextResponse.json(
      { error: '无法解析 multipart 请求体', requestId },
      { status: 400 },
    )
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    console.warn(`${logPrefix} error=missing_file_field`)
    return NextResponse.json(
      { error: '缺少 file 字段或类型不是文件', requestId },
      { status: 400 },
    )
  }

  if (file.size <= 0) {
    console.warn(`${logPrefix} error=empty_file`)
    return NextResponse.json({ error: '文件为空', requestId }, { status: 400 })
  }

  if (file.size > MAX_FILE_BYTES) {
    console.warn(
      `${logPrefix} error=file_too_large size=${file.size} max=${MAX_FILE_BYTES}`,
    )
    return NextResponse.json(
      {
        error: '文件超过 20MB 限制',
        requestId,
        maxBytes: MAX_FILE_BYTES,
        size: file.size,
      },
      { status: 413 },
    )
  }

  const extFromName = extensionFromFilename(file.name)
  const extFromType = extensionFromMime(file.type)
  const extension = extFromName ?? extFromType

  if (!extension || !ALLOWED_MIME_TYPES.has(file.type)) {
    console.warn(
      `${logPrefix} error=unsupported_type name=${file.name} type=${file.type}`,
    )
    return NextResponse.json(
      {
        error: '仅支持 PDF、JPG、JPEG、PNG、WEBP、GIF 格式',
        requestId,
        hint: '请使用正确的文件格式',
      },
      { status: 400 },
    )
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16)
    const timestamp = Date.now()
    const filename = `${timestamp}-${hash}.${extension}`
    
    // 使用环境变量指定的存储目录，默认为 /tmp/invoice-attachments
    const uploadDir = process.env.INVOICE_UPLOAD_DIR || '/tmp/invoice-attachments'
    const yearMonth = new Date().toISOString().slice(0, 7) // YYYY-MM
    const dir = join(uploadDir, yearMonth)
    
    await mkdir(dir, { recursive: true })
    
    const filepath = join(dir, filename)
    await writeFile(filepath, buffer)
    
    // 存储路径使用相对路径
    const storageKey = `${yearMonth}/${filename}`

    // 文件 URL - 可以通过 /api/v1/invoice-files/:storageKey 访问
    // 逐段编码而非整体 encodeURIComponent：后者会把分隔符 '/' 编成 %2F，
    // 而 `[...path]` 捕获段在解码后会被当成单个文件名，导致永远匹配不到。
    const fileUrl = `/api/v1/invoice-files/${storageKey.split('/').map(encodeURIComponent).join('/')}`

    console.log(
      `${logPrefix} success storageKey=${storageKey} size=${file.size} type=${file.type}`,
    )

    return NextResponse.json({
      requestId,
      fileUrl,
      storageKey,
      mimeType: file.type,
      size: file.size,
      originalName: file.name,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`${logPrefix} error=upload_failed detail=${message}`)
    return NextResponse.json(
      { error: '文件上传失败', requestId },
      { status: 500 },
    )
  }
}
