import { NextResponse } from 'next/server'

import { auth } from '@/lib/auth'

function guessMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'pdf':
      return 'application/pdf'
    default:
      return 'application/octet-stream'
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ uri: string[] }> },
) {
  const session = await auth.api.getSession({ headers: _req.headers })
  if (!session?.user?.id) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 })
  }

  const { uri } = await params
  const storageUri = uri.join('/')

  // Only allow local:// and oss:// URIs
  if (!storageUri.startsWith('local://') && !storageUri.startsWith('oss://')) {
    return NextResponse.json({ error: '不支持的存储类型' }, { status: 400 })
  }

  try {
    const { readOnboardingDocument } = await import(
      '@/lib/server/dataaccess/supplier/supplier-onboarding-storage'
    )
    const buffer = await readOnboardingDocument(storageUri)

    // Extract filename from URI
    const parts = storageUri.split('/')
    const rawName = parts[parts.length - 1] ?? 'file'
    // Remove UUID prefix added during save
    const fileName = rawName.replace(/^[0-9a-f-]{36}_/i, '')
    const mimeType = guessMimeType(fileName)
    const encodedName = encodeURIComponent(fileName)

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `inline; filename*=UTF-8''${encodedName}`,
        'Content-Length': String(buffer.length),
      },
    })
  } catch {
    return NextResponse.json({ error: '文件读取失败' }, { status: 500 })
  }
}
