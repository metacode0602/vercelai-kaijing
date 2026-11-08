"use client"

import * as React from "react"
import {
  Image as ImageIcon,
  ImagePlus,
  Star,
  Trash2,
  Upload,
} from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { DetailSection } from "@/components/console/detail"
import { cn } from "@workspace/ui/lib/utils"
import {
  setProductImageSet,
  useProductImageSet,
  type DemoImageSet,
} from "@/lib/crossborder/product-image-store"

const MAX_FILE_BYTES = 8 * 1024 * 1024
const MAX_GALLERY_IMAGES = 8
const MAX_IMAGE_EDGE = 1280

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

async function prepareImage(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("请选择图片文件")
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("单张图片不能超过 8MB")
  }
  const dataUrl = await readAsDataUrl(file)
  if (file.type === "image/svg+xml") return dataUrl

  const image = await loadImage(dataUrl)
  const scale = Math.min(
    1,
    MAX_IMAGE_EDGE / Math.max(image.width, image.height)
  )
  if (scale === 1 && file.size < 400 * 1024) return dataUrl

  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))
  const context = canvas.getContext("2d")
  if (!context) return dataUrl
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL("image/jpeg", 0.82)
}

export function ProductCover({
  src,
  alt,
  className,
}: {
  src?: string
  alt: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted",
        className
      )}
    >
      {src ? (
        <img src={src} alt={alt} className="size-full object-cover" />
      ) : (
        <ImageIcon className="size-5 text-muted-foreground" />
      )}
    </div>
  )
}

export function ProductCoverCell({
  imageKey,
  fallback,
  alt,
}: {
  imageKey: string
  fallback?: DemoImageSet
  alt: string
}) {
  const value = useProductImageSet(imageKey, fallback)
  return <ProductCover src={value.cover ?? value.images[0]} alt={alt} />
}

export function ProductImageField({
  value,
  onChange,
  label = "商品图片",
  description = "封面图用于列表展示；截图可上传多张，用于商品详情与素材归档。",
}: {
  value: DemoImageSet
  onChange: (next: DemoImageSet) => void
  label?: string
  description?: string
}) {
  const coverInputRef = React.useRef<HTMLInputElement>(null)
  const galleryInputRef = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const displayCover = value.cover ?? value.images[0]

  async function handleFiles(
    files: FileList | null,
    target: "cover" | "gallery"
  ) {
    if (!files || files.length === 0) return
    setBusy(true)
    setError("")
    try {
      const prepared = await Promise.all(Array.from(files).map(prepareImage))
      if (target === "cover") {
        const cover = prepared[0]
        if (cover) onChange({ ...value, cover })
      } else {
        const remaining = Math.max(0, MAX_GALLERY_IMAGES - value.images.length)
        const nextImages = [...value.images, ...prepared.slice(0, remaining)]
        onChange({
          ...value,
          images: nextImages,
          cover: value.cover ?? nextImages[0],
        })
        if (prepared.length > remaining) {
          setError(`截图最多保留 ${MAX_GALLERY_IMAGES} 张，超出部分未添加。`)
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "图片处理失败")
    } finally {
      setBusy(false)
      if (coverInputRef.current) coverInputRef.current.value = ""
      if (galleryInputRef.current) galleryInputRef.current.value = ""
    }
  }

  function removeGalleryImage(index: number) {
    const nextImages = value.images.filter((_, current) => current !== index)
    onChange({
      ...value,
      images: nextImages,
      cover: value.cover === value.images[index] ? nextImages[0] : value.cover,
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">封面图</p>
          <div className="flex size-28 items-center justify-center overflow-hidden rounded-lg border bg-muted">
            {displayCover ? (
              <img
                src={displayCover}
                alt="商品封面"
                className="size-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center gap-1 text-muted-foreground">
                <ImageIcon className="size-6" />
                <span className="text-xs">暂无封面</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => coverInputRef.current?.click()}
            >
              <Upload data-icon="inline-start" />
              上传封面
            </Button>
            {value.cover ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => onChange({ ...value, cover: value.images[0] })}
              >
                移除
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              商品截图（{value.images.length}/{MAX_GALLERY_IMAGES}）
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || value.images.length >= MAX_GALLERY_IMAGES}
              onClick={() => galleryInputRef.current?.click()}
            >
              <ImagePlus data-icon="inline-start" />
              上传截图
            </Button>
          </div>
          {value.images.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {value.images.map((src, index) => (
                <div
                  key={`${src.slice(-24)}-${index}`}
                  className="group relative size-20 overflow-hidden rounded-md border bg-muted"
                >
                  <img
                    src={src}
                    alt={`商品截图 ${index + 1}`}
                    className="size-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-background/80 px-1 py-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground hover:text-foreground"
                      title="设为封面"
                      onClick={() => onChange({ ...value, cover: src })}
                    >
                      <Star
                        className={cn(
                          "size-3.5",
                          value.cover === src && "fill-current text-primary"
                        )}
                      />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground hover:text-destructive"
                      title="移除截图"
                      onClick={() => removeGalleryImage(index)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-20 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
              暂无截图
            </div>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        支持 JPG / PNG / WebP，单张不超过
        8MB。图片暂仅保存在当前浏览器本地，不会上传云端。
      </p>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void handleFiles(event.target.files, "cover")}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => void handleFiles(event.target.files, "gallery")}
      />
    </div>
  )
}

export function ProductImagePanel({
  imageKey,
  fallback,
  label,
  description,
}: {
  imageKey: string
  fallback?: DemoImageSet
  label?: string
  description?: string
}) {
  const value = useProductImageSet(imageKey, fallback)
  return (
    <ProductImageField
      value={value}
      onChange={(next) => setProductImageSet(imageKey, next)}
      label={label}
      description={description}
    />
  )
}

export function ProductImageEditor({
  imageKey,
  fallback,
  title = "商品图片",
  description = "维护封面图与多张商品截图；封面图会展示在商品 / SKU 列表中。",
}: {
  imageKey: string
  fallback?: DemoImageSet
  title?: string
  description?: string
}) {
  return (
    <DetailSection title={title} description={description}>
      <ProductImagePanel
        imageKey={imageKey}
        fallback={fallback}
        label={title}
        description={description}
      />
    </DetailSection>
  )
}
