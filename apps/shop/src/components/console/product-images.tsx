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
  MAX_PRODUCT_GALLERY_IMAGES,
  resolveProductImageUrl,
  uploadProductImage,
  type ProductImageSet,
} from "@/lib/crossborder/product-image-store"

export function ProductCover({
  src,
  alt,
  className,
}: {
  src?: string
  alt: string
  className?: string
}) {
  const resolved = resolveProductImageUrl(src)
  return (
    <div
      className={cn(
        "flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted",
        className,
      )}
    >
      {resolved ? (
        <img src={resolved} alt={alt} className="size-full object-cover" />
      ) : (
        <ImageIcon className="size-5 text-muted-foreground" />
      )}
    </div>
  )
}

export function ProductCoverCell({
  fallback,
  alt,
}: {
  fallback?: ProductImageSet
  alt: string
}) {
  return <ProductCover src={fallback?.cover ?? fallback?.images[0]} alt={alt} />
}

export function ProductImageField({
  value,
  onChange,
  label = "商品图片",
  description = "封面图用于列表展示；截图可上传多张，用于商品详情与素材归档。图片保存在对象存储（OSS）。",
}: {
  value: ProductImageSet
  onChange: (next: ProductImageSet) => void
  label?: string
  description?: string
}) {
  const coverInputRef = React.useRef<HTMLInputElement>(null)
  const galleryInputRef = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const displayCover = value.cover ?? value.images[0]
  const maxGallery = MAX_PRODUCT_GALLERY_IMAGES

  async function handleFiles(
    files: FileList | null,
    target: "cover" | "gallery",
  ) {
    if (!files || files.length === 0) return
    setBusy(true)
    setError("")
    try {
      const uploaded = await Promise.all(
        Array.from(files).map((file) => uploadProductImage(file)),
      )
      if (target === "cover") {
        const cover = uploaded[0]
        if (cover) onChange({ ...value, cover })
      } else {
        const remaining = Math.max(0, maxGallery - value.images.length)
        const nextImages = [...value.images, ...uploaded.slice(0, remaining)]
        onChange({
          ...value,
          images: nextImages,
          cover: value.cover ?? nextImages[0],
        })
        if (uploaded.length > remaining) {
          setError(`截图最多保留 ${maxGallery} 张，超出部分未添加。`)
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "图片上传失败")
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

  const displayCoverUrl = resolveProductImageUrl(displayCover)

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
            {displayCoverUrl ? (
              <img
                src={displayCoverUrl}
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
              {busy ? "上传中…" : "上传封面"}
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
              商品截图（{value.images.length}/{maxGallery}）
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || value.images.length >= maxGallery}
              onClick={() => galleryInputRef.current?.click()}
            >
              <ImagePlus data-icon="inline-start" />
              上传截图
            </Button>
          </div>
          {value.images.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {value.images.map((src, index) => {
                const url = resolveProductImageUrl(src)
                return (
                  <div
                    key={`${src.slice(-24)}-${index}`}
                    className="group relative size-20 overflow-hidden rounded-md border bg-muted"
                  >
                    {url ? (
                      <img
                        src={url}
                        alt={`商品截图 ${index + 1}`}
                        className="size-full object-cover"
                      />
                    ) : null}
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
                            value.cover === src && "fill-current text-primary",
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
                )
              })}
            </div>
          ) : (
            <div className="flex h-20 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
              暂无截图
            </div>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        支持 JPG / PNG / WebP，单张不超过 8MB；上传后保存在对象存储并随本页写入数据库。
      </p>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <input
        ref={coverInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => void handleFiles(event.target.files, "cover")}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(event) => void handleFiles(event.target.files, "gallery")}
      />
    </div>
  )
}

/**
 * 图片编辑器：内部维护草稿，任何上传/删除立即通过 onChange 持久化（页面接 tRPC）。
 * initial 变化（如查询刷新）时同步草稿。
 */
export function ProductImageEditor({
  initial,
  onChange,
  title = "商品图片",
  description = "维护封面图与多张商品截图；封面图会展示在商品 / SKU 列表中。图片保存在对象存储并写入数据库。",
}: {
  initial: ProductImageSet
  onChange: (next: ProductImageSet) => void | Promise<void>
  title?: string
  description?: string
}) {
  const [draft, setDraft] = React.useState<ProductImageSet>(initial)
  const [saveError, setSaveError] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const initialKey = React.useMemo(() => JSON.stringify(initial), [initial])
  const lastInitialKey = React.useRef(initialKey)

  if (lastInitialKey.current !== initialKey) {
    lastInitialKey.current = initialKey
    if (JSON.stringify(draft) !== initialKey) {
      setDraft(initial)
    }
  }

  async function update(next: ProductImageSet) {
    setDraft(next)
    setSaveError("")
    setSaving(true)
    try {
      await onChange(next)
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "保存图片失败")
      setDraft(initial)
    } finally {
      setSaving(false)
    }
  }

  return (
    <DetailSection
      title={title}
      description={description}
      action={
        saving ? (
          <span className="text-xs text-muted-foreground">保存中…</span>
        ) : saveError ? (
          <span role="alert" className="text-xs text-destructive">
            {saveError}
          </span>
        ) : null
      }
    >
      <ProductImageField
        value={draft}
        onChange={(next) => void update(next)}
        label={title}
        description={description}
      />
    </DetailSection>
  )
}
