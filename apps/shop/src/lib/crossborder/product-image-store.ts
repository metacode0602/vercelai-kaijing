"use client"

/**
 * 商品 / 品牌 / 刊登图片：浏览器压缩 → 上传对象存储（OSS / S3 / 本地）→ 返回存储 URI。
 * 主路径不再使用 localStorage；展示通过 resolveProductImageUrl 统一转换。
 * @see apps/shop/src/app/api/upload/image/route.ts
 */

export type ProductImageSet = {
  cover?: string
  images: string[]
}

const MAX_FILE_BYTES = 8 * 1024 * 1024
const MAX_GALLERY_IMAGES = 8
const MAX_IMAGE_EDGE = 1280
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"]

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("读取图片失败"))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("解析图片失败"))
    image.src = src
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("图片压缩失败"))),
      type,
      quality,
    )
  })
}

/** 校验并压缩为适合上传的 Blob（超过 400KB 或超长边时转 JPEG 1280px）。 */
export async function prepareImageUpload(file: File): Promise<Blob> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("仅支持 JPG / PNG / WebP 图片")
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("单张图片不能超过 8MB")
  }
  const dataUrl = await readAsDataUrl(file)
  const image = await loadImage(dataUrl)
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.width, image.height))
  if (scale === 1 && file.size < 400 * 1024) return file

  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))
  const context = canvas.getContext("2d")
  if (!context) return file
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvasToBlob(canvas, "image/jpeg", 0.82)
}

/**
 * 上传图片到对象存储，返回存储 URI（oss:// / s3:// / local://）。
 * 服务端按 organization 隔离对象前缀：product-images/{organizationId}/…
 */
export async function uploadProductImage(file: File): Promise<string> {
  const blob = await prepareImageUpload(file)
  const form = new FormData()
  form.append("file", blob, file.name || "image.jpg")
  const res = await fetch("/api/upload/image", { method: "POST", body: form })
  const body = (await res.json().catch(() => null)) as { uri?: string; error?: string } | null
  if (!res.ok || !body?.uri) {
    throw new Error(body?.error || `上传失败（${res.status}）`)
  }
  return body.uri
}

/** 把存储 URI（或历史 http(s) / data URL）转换为可直接用于 <img src> 的地址。 */
export function resolveProductImageUrl(uri?: string | null): string | undefined {
  if (!uri) return undefined
  const trimmed = uri.trim()
  if (!trimmed) return undefined
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:")) return trimmed
  if (
    trimmed.startsWith("oss://") ||
    trimmed.startsWith("s3://") ||
    trimmed.startsWith("local://")
  ) {
    return `/api/upload/image?key=${encodeURIComponent(trimmed)}`
  }
  return trimmed
}

export const MAX_PRODUCT_GALLERY_IMAGES = MAX_GALLERY_IMAGES
