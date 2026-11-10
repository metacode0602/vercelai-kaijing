/**
 * 拼图生成（使用 sharp 实现）
 * 输出：背景图 Buffer、拼图块 Buffer、缺口位置 (x, y)
 * 默认图源：public/images/blog 图库随机一张，自动裁剪适配 320×160
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

export const DEFAULT_BG_WIDTH = 320
export const DEFAULT_BG_HEIGHT = 160
export const DEFAULT_PUZZLE_WIDTH = 60
export const DEFAULT_PUZZLE_HEIGHT = 60
const BORDER_WIDTH = 2
const SHADOW_ALPHA = 0.5

export type CreatePuzzleOptions = {
  bgWidth?: number
  bgHeight?: number
  puzzleWidth?: number
  puzzleHeight?: number
  borderWidth?: number
  shadowAlpha?: number
  /** 图库目录（相对 process.cwd()），默认 'public/images/blog' */
  galleryDir?: string
}

export type CreatePuzzleResult = {
  bg: Buffer
  puzzle: Buffer
  x: number
  y: number
}

/**
 * 从图库目录随机取一张图片的绝对路径；无可用图片时返回 null
 * 默认目录必须是静态字面量路径，让 Turbopack 只追踪该子目录，
 * 避免把整个项目（含 public）打进 serverless 函数导致 Vercel 体积超限
 */
export async function getRandomImagePathFromGallery(
  galleryDir?: string
): Promise<string | null> {
  if (galleryDir !== undefined) {
    const dir = path.join(/* turbopackIgnore: true */ process.cwd(), galleryDir)
    let entries: string[]
    try {
      entries = await fs.readdir(/* turbopackIgnore: true */ dir)
    } catch {
      return null
    }
    const files = entries.filter((name) =>
      IMAGE_EXT.has(path.extname(name).toLowerCase())
    )
    if (files.length === 0) return null
    const name = files[Math.floor(Math.random() * files.length)]!
    return path.join(/* turbopackIgnore: true */ dir, name)
  }

  const dir = path.join(process.cwd(), 'public', 'images', 'blog')
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return null
  }
  const files = entries.filter((name) =>
    IMAGE_EXT.has(path.extname(name).toLowerCase())
  )
  if (files.length === 0) return null
  const name = files[Math.floor(Math.random() * files.length)]!
  return path.join(dir, name)
}

/** 生成默认背景图（图库无图时使用），返回 Buffer */
export async function getDefaultSourceBuffer(
  width = DEFAULT_BG_WIDTH,
  height = DEFAULT_BG_HEIGHT
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 220, g: 230, b: 240 },
    },
  })
    .jpeg({ quality: 80 })
    .toBuffer()
}

/**
 * 从源图生成拼图：背景图（带阴影缺口）+ 拼图块，并返回缺口位置 (x, y)
 * 不传 input 时从图库随机选图，并自动裁剪适配 captcha 尺寸（fit: cover）
 */
export async function createPuzzle(
  input?: string | Buffer,
  options: CreatePuzzleOptions = {}
): Promise<CreatePuzzleResult> {
  const bgWidth = options.bgWidth ?? DEFAULT_BG_WIDTH
  const bgHeight = options.bgHeight ?? DEFAULT_BG_HEIGHT
  const puzzleWidth = options.puzzleWidth ?? DEFAULT_PUZZLE_WIDTH
  const puzzleHeight = options.puzzleHeight ?? DEFAULT_PUZZLE_HEIGHT
  const borderWidth = options.borderWidth ?? BORDER_WIDTH
  const shadowAlpha = options.shadowAlpha ?? SHADOW_ALPHA

  let source: sharp.Sharp
  if (input !== undefined && input !== null) {
    if (Buffer.isBuffer(input)) {
      source = sharp(input)
    } else if (input.startsWith('http') || input.startsWith('data:')) {
      const buf = await fetch(input)
        .then((r) => r.arrayBuffer())
        .then((ab) => Buffer.from(ab))
      source = sharp(buf)
    } else {
      source = sharp(input)
    }
  } else {
    const galleryPath = await getRandomImagePathFromGallery(options.galleryDir)
    if (galleryPath) {
      source = sharp(galleryPath)
    } else {
      source = sharp(await getDefaultSourceBuffer(bgWidth, bgHeight))
    }
  }

  const resized = source.resize(bgWidth, bgHeight, { fit: 'cover' })
  const x =
    borderWidth +
    Math.floor(
      Math.random() * Math.max(0, bgWidth - puzzleWidth - 2 * borderWidth)
    )
  const y =
    borderWidth +
    Math.floor(
      Math.random() * Math.max(0, bgHeight - puzzleHeight - 2 * borderWidth)
    )

  const clampedX = Math.max(0, Math.min(bgWidth - puzzleWidth, x))
  const clampedY = Math.max(0, Math.min(bgHeight - puzzleHeight, y))

  const puzzlePiece = await resized
    .clone()
    .extract({
      left: clampedX,
      top: clampedY,
      width: puzzleWidth,
      height: puzzleHeight,
    })
    .extend({
      top: borderWidth,
      bottom: borderWidth,
      left: borderWidth,
      right: borderWidth,
      background: { r: 255, g: 255, b: 255, alpha: 0.9 },
    })
    .jpeg({ quality: 90 })
    .toBuffer()

  const shadowBuffer = await sharp({
    create: {
      width: puzzleWidth,
      height: puzzleHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: shadowAlpha },
    },
  })
    .png()
    .toBuffer()

  const bg = await resized
    .clone()
    .composite([{ input: shadowBuffer, left: clampedX, top: clampedY }])
    .jpeg({ quality: 85 })
    .toBuffer()

  return {
    bg,
    puzzle: puzzlePiece,
    x: clampedX,
    y: clampedY,
  }
}
