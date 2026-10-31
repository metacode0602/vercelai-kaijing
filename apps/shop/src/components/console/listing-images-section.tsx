'use client'

import { ProductImageEditor } from '@/components/console/product-images'

export function ListingImagesSection({
  listingId,
  cover,
  images,
}: {
  listingId: string
  cover?: string
  images?: string[]
}) {
  return (
    <ProductImageEditor
      imageKey={`listing:${listingId}`}
      fallback={{ cover, images: images ?? [] }}
      title="刊登图片"
      description="维护平台刊登封面与商品截图；封面用于刊登列表。原型阶段本地预览，接入后统一存 OSS / S3。"
    />
  )
}
