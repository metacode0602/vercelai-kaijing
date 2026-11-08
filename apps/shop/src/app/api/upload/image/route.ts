import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import {
  LOCAL_SCHEME,
  getOssConfig,
  getS3Config,
  ossGet,
  ossPut,
  parseOssUri,
  parseS3Uri,
  resolveStorageDriver,
  s3Get,
  s3Put,
} from '@workspace/storage'
import { auth } from '@/lib/auth'

export const runtime = 'nodejs'

const MAX_FILE_SIZE = 8 * 1024 * 1024
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
const KEY_PREFIX = 'product-images/'

type SessionLike = {
  user?: { id?: string }
  session?: { activeOrganizationId?: string | null }
  activeOrganizationId?: string | null
}

function activeOrgId(session: SessionLike): string | null {
  return session.session?.activeOrganizationId ?? session.activeOrganizationId ?? null
}

/** 解析存储 URI；仅允许 product-images/ 前缀，拒绝路径穿越。 */
function parseImageKey(uri: string): { driver: 'local' | 'oss' | 's3'; key: string } | null {
  if (uri.startsWith(LOCAL_SCHEME)) {
    const key = uri.slice(LOCAL_SCHEME.length)
    if (!key.startsWith(KEY_PREFIX) || key.includes('..')) return null
    return { driver: 'local', key }
  }
  const oss = parseOssUri(uri)
  if (oss) {
    if (!oss.objectKey.startsWith(KEY_PREFIX) || oss.objectKey.includes('..')) return null
    return { driver: 'oss', key: oss.objectKey }
  }
  const s3 = parseS3Uri(uri)
  if (s3) {
    if (!s3.objectKey.startsWith(KEY_PREFIX) || s3.objectKey.includes('..')) return null
    return { driver: 's3', key: s3.objectKey }
  }
  return null
}

function contentTypeFor(key: string): string {
  const ext = path.extname(key).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  return 'application/octet-stream'
}

async function readLocal(key: string): Promise<Buffer> {
  const root =
    process.env.STORAGE_LOCAL_DIR?.trim() || path.join(process.cwd(), '.storage')
  const base = path.resolve(/* turbopackIgnore: true */ process.cwd(), root)
  const target = path.resolve(base, key)
  if (!target.startsWith(base + path.sep)) throw new Error('非法路径')
  return readFile(/* turbopackIgnore: true */ target)
}

async function writeLocal(key: string, buffer: Buffer): Promise<void> {
  const root =
    process.env.STORAGE_LOCAL_DIR?.trim() || path.join(process.cwd(), '.storage')
  const base = path.resolve(/* turbopackIgnore: true */ process.cwd(), root)
  const target = path.resolve(base, key)
  if (!target.startsWith(base + path.sep)) throw new Error('非法路径')
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, buffer)
}

/** GET：按存储 URI 读取图片（<img> 无法携带会话头，凭前缀与路径约束限制范围）。 */
export async function GET(request: NextRequest) {
  const uri = request.nextUrl.searchParams.get('key') ?? ''
  const parsed = parseImageKey(uri)
  if (!parsed) {
    return NextResponse.json({ error: '无效的图片地址' }, { status: 400 })
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
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentTypeFor(parsed.key),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '读取图片失败' },
      { status: 404 },
    )
  }
}

/** POST：上传商品/品牌/刊登图片到对象存储，返回存储 URI。 */
export async function POST(request: Request) {
  const session = (await auth.api.getSession({ headers: request.headers })) as SessionLike | null
  if (!session?.user?.id) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 })
  }
  const organizationId = activeOrgId(session)
  if (!organizationId) {
    return NextResponse.json({ error: '请先切换组织后再上传图片' }, { status: 400 })
  }

  const formData = await request.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '请选择图片文件' }, { status: 400 })
  }
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: '图片大小需在 8MB 以内' }, { status: 400 })
  }
  const ext = ALLOWED_TYPES[file.type]
  if (!ext) {
    return NextResponse.json({ error: '仅支持 JPG / PNG / WebP 图片' }, { status: 400 })
  }

  const objectKey = `${KEY_PREFIX}${organizationId}/${randomUUID()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const driver = resolveStorageDriver()

  try {
    if (driver === 'oss') {
      const cfg = getOssConfig()
      if (!cfg) throw new Error('OSS 未配置')
      await ossPut(cfg, objectKey, buffer, file.type)
      return NextResponse.json({ uri: `oss://${cfg.bucket}/${objectKey}` })
    }
    if (driver === 's3') {
      const cfg = getS3Config()
      if (!cfg) throw new Error('S3 未配置')
      await s3Put(cfg, objectKey, buffer, file.type)
      return NextResponse.json({ uri: `s3://${cfg.bucket}/${objectKey}` })
    }
    await writeLocal(objectKey, buffer)
    return NextResponse.json({ uri: `${LOCAL_SCHEME}${objectKey}` })
  } catch (error) {
    const message = error instanceof Error ? error.message : '上传失败'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
