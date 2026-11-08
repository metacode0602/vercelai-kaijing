'use client'

import { ProductImageEditor } from '@/components/console/product-images'
import type { ProductImageSet } from '@/lib/crossborder/product-image-store'

export function ListingImagesSection({
  initial,
  onChange,
}: {
  initial: ProductImageSet
  onChange: (next: ProductImageSet) => void | Promise<void>
}) {
  return (
    <ProductImageEditor
      initial={initial}
      onChange={onChange}
      title="刊登图片"
      description="维护平台刊登封面与商品截图；封面用于刊登列表，保存在对象存储并写入刊登 payload。"
    />
  )
}
