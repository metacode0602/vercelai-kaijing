import { NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { stat } from 'node:fs/promises'

import { guardInvoiceFileAccess } from '@/lib/server/auth/invoice-file-access'

const MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
}

/**
 * GET /api/v1/invoice-files/[...path]
 * 
 * 提供发票附件下载/预览服务
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const denied = await guardInvoiceFileAccess(request)
  if (denied) return denied

  const requestId = crypto.randomUUID().slice(0, 8)
  const logPrefix = `[invoice file] requestId=${requestId}`

  try {
    const { path: pathParts } = await params
    if (!pathParts || pathParts.length === 0) {
      return NextResponse.json({ error: '缺少文件路径' }, { status: 400 })
    }

    // 安全检查：防止路径遍历攻击
    for (const part of pathParts) {
      if (part.includes('..') || part.includes('/') || part.includes('\\')) {
        console.warn(`${logPrefix} error=path_traversal path=${pathParts.join('/')}`)
        return NextResponse.json({ error: '无效的文件路径' }, { status: 400 })
      }
    }

    const uploadDir = process.env.INVOICE_UPLOAD_DIR || '/tmp/invoice-attachments'
    const relativePath = pathParts.join('/')
    const filepath = join(uploadDir, relativePath)

    // 检查文件是否存在
    const fileStats = await stat(filepath)
    if (!fileStats.isFile()) {
      return NextResponse.json({ error: '文件不存在' }, { status: 404 })
    }

    const buffer = await readFile(filepath)
    
    // 根据文件扩展名确定 MIME 类型
    const ext = relativePath.split('.').pop()?.toLowerCase()
    const mimeType = ext ? MIME_TYPES[ext] || 'application/octet-stream' : 'application/octet-stream'

    console.log(
      `${logPrefix} success path=${relativePath} size=${buffer.length} mime=${mimeType}`,
    )

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': mimeType,
        // 发票是财务凭证，禁止共享缓存留存（此前为 public + immutable，
        // 会把含税号/金额的文件留在 CDN 与中间代理缓存里）。
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Length': buffer.length.toString(),
      },
    })
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
      console.warn(`${logPrefix} error=file_not_found`)
      return NextResponse.json({ error: '文件不存在' }, { status: 404 })
    }

    const message = err instanceof Error ? err.message : String(err)
    console.error(`${logPrefix} error=serve_failed detail=${message}`)
    return NextResponse.json({ error: '文件读取失败' }, { status: 500 })
  }
}
