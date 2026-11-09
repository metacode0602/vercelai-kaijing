import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import {
  getOssConfig,
  getS3Config,
  LOCAL_SCHEME,
  ossGet,
  parseOssUri,
  parseS3Uri,
  sanitizeStorageFileName,
  s3Get,
} from '@workspace/storage'
import { auth } from '@/lib/auth'
import { isPlatformAdminUserId } from '@/lib/auth/platform-admin'
import { verifyOnboardingFileSignature } from '@/lib/server/onboarding-file'

export const runtime = 'nodejs'

function parseKey(uri: string): { driver: 'local' | 'oss' | 's3'; key: string } | null {
  if (uri.startsWith(LOCAL_SCHEME)) {
    return { driver: 'local', key: uri.slice(LOCAL_SCHEME.length) }
  }
  const oss = parseOssUri(uri)
  if (oss) return { driver: 'oss', key: oss.objectKey }
  const s3 = parseS3Uri(uri)
  if (s3) return { driver: 's3', key: s3.objectKey }
  return null
}

function contentTypeFor(key: string): string {
  const ext = path.extname(key).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.pdf') return 'application/pdf'
  return 'application/octet-stream'
}

async function readLocal(key: string): Promise<Buffer> {
  const configured = process.env.STORAGE_LOCAL_DIR?.trim() || '.storage'
  const candidates = [
    path.resolve(/* turbopackIgnore: true */ process.cwd(), configured),
    path.resolve(/* turbopackIgnore: true */ process.cwd(), '../shop/.storage'),
    path.resolve(/* turbopackIgnore: true */ process.cwd(), '../../apps/shop/.storage'),
  ]
  for (const root of candidates) {
    try {
      return await readFile(/* turbopackIgnore: true */ path.join(root, key))
    } catch {
      // try next candidate
    }
  }
  throw new Error('文件不存在')
}

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user || !(await isPlatformAdminUserId(session.user.id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const uri = request.nextUrl.searchParams.get('key') ?? ''
  const parsed = parseKey(uri)
  if (!parsed || !parsed.key.startsWith('tenant-onboarding/') || parsed.key.includes('..')) {
    return NextResponse.json({ error: 'invalid key' }, { status: 400 })
  }
  if (
    !verifyOnboardingFileSignature({
      key: parsed.key,
      expires: request.nextUrl.searchParams.get('expires'),
      sig: request.nextUrl.searchParams.get('sig'),
    })
  ) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 403 })
  }

  try {
    let buffer: Buffer
    if (parsed.driver === 'oss') {
      const cfg = getOssConfig()
      if (!cfg) throw new Error('OSS 未配置')
      buffer = await ossGet(cfg, parsed.key)
    } else if (parsed.driver === 's3') {
      const cfg = getS3Config()
      if (!cfg) throw new Error('S3 未配置')
      buffer = await s3Get(cfg, parsed.key)
    } else {
      buffer = await readLocal(parsed.key)
    }

    const name = sanitizeStorageFileName(
      request.nextUrl.searchParams.get('name') || path.basename(parsed.key),
    )
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentTypeFor(parsed.key),
        'Content-Disposition': `inline; filename="${name}"`,
        'Cache-Control': 'private, max-age=60',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '读取文件失败' },
      { status: 404 },
    )
  }
}
