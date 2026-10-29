'use client'

/**
 * products + product_variants 原型会话 store（schema §2.1 / §2.2）。
 * 头行分离：先建 SPU 主信息，再在详情加 SKU 规格行。
 */

import { createDemoStore } from '@/lib/crossborder/local-store'
import {
  ERP_DEMO_PRODUCTS,
  type DemoProduct,
  type DemoSku,
  type DemoStatus,
} from '@/lib/crossborder/erp-ued-data'

export type ProductRecord = DemoProduct
export type VariantRecord = DemoSku

export type CreateProductInput = {
  name: string
  brand: string
  category: string
  owner: string
  material: string
  style: string
  status?: DemoStatus
  coverImage?: string
  images?: string[]
}

export type UpdateProductInput = Partial<
  Pick<
    DemoProduct,
    'name' | 'brand' | 'category' | 'owner' | 'material' | 'style' | 'status' | 'coverImage' | 'images'
  >
>

export type CreateVariantInput = {
  spu: string
  color: string
  size: string
  pack: string
  barcode?: string
  weight: number
  status?: DemoStatus
  coverImage?: string
  images?: string[]
}

export type UpdateVariantInput = Partial<
  Pick<DemoSku, 'color' | 'size' | 'pack' | 'barcode' | 'weight' | 'status' | 'coverImage' | 'images'>
>

export type SkuListRow = DemoSku & {
  id: string
  sku: string
  spu: string
  name: string
  brand: string
  category: string
  owner: string
}

function nextSpuCode(products: ProductRecord[]): string {
  let max = 0
  for (const product of products) {
    const matched = /^HSY(\d+)$/i.exec(product.spu.trim())
    if (matched) max = Math.max(max, Number(matched[1]))
  }
  return `HSY${String(max + 1).padStart(6, '0')}`
}

function nextVariantCode(spu: string, variants: DemoSku[]): string {
  let max = 0
  const escaped = spu.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`^${escaped}(\\d{3})$`, 'i')
  for (const variant of variants) {
    const matched = re.exec(variant.code.trim())
    if (matched) max = Math.max(max, Number(matched[1]))
  }
  return `${spu}${String(max + 1).padStart(3, '0')}`
}

function withSkuCount(product: ProductRecord): ProductRecord {
  return { ...product, skuCount: product.variants.length }
}

const seed = structuredClone(ERP_DEMO_PRODUCTS) as ProductRecord[]
const store = createDemoStore<ProductRecord[]>('open-shop.console.demo.products.v1', seed)

export function useProducts() {
  return store.useStore()
}

export function getProducts() {
  return store.get()
}

export function getProductBySpu(spu: string) {
  return store.get().find((item) => item.spu === spu)
}

export function createProduct(input: CreateProductInput): ProductRecord {
  const spu = nextSpuCode(store.get())
  const row = withSkuCount({
    spu,
    name: input.name.trim(),
    brand: input.brand.trim(),
    category: input.category.trim(),
    owner: input.owner.trim(),
    material: input.material.trim(),
    style: input.style.trim(),
    status: input.status ?? '待确认',
    skuCount: 0,
    coverImage: input.coverImage,
    images: input.images,
    variants: [],
  })
  store.set([...store.get(), row])
  return row
}

export function updateProduct(spu: string, patch: UpdateProductInput): ProductRecord | null {
  const list = store.get()
  const index = list.findIndex((item) => item.spu === spu)
  if (index < 0) return null
  const next = withSkuCount({ ...list[index]!, ...patch })
  const copy = [...list]
  copy[index] = next
  store.set(copy)
  return next
}

export function createVariant(input: CreateVariantInput): VariantRecord | null {
  const list = store.get()
  const index = list.findIndex((item) => item.spu === input.spu)
  if (index < 0) return null
  const product = list[index]!
  const code = nextVariantCode(product.spu, product.variants)
  const variant: DemoSku = {
    code,
    color: input.color.trim(),
    size: input.size.trim(),
    pack: input.pack.trim(),
    barcode: input.barcode?.trim() || '待补充',
    weight: Number(input.weight) || 0,
    status: input.status ?? '待确认',
    coverImage: input.coverImage ?? product.coverImage,
    images: input.images ?? product.images,
  }
  const next = withSkuCount({
    ...product,
    variants: [...product.variants, variant],
  })
  const copy = [...list]
  copy[index] = next
  store.set(copy)
  return variant
}

export function updateVariant(
  spu: string,
  code: string,
  patch: UpdateVariantInput,
): VariantRecord | null {
  const list = store.get()
  const index = list.findIndex((item) => item.spu === spu)
  if (index < 0) return null
  const product = list[index]!
  const variantIndex = product.variants.findIndex((item) => item.code === code)
  if (variantIndex < 0) return null
  const nextVariant = { ...product.variants[variantIndex]!, ...patch }
  const variants = [...product.variants]
  variants[variantIndex] = nextVariant
  const copy = [...list]
  copy[index] = withSkuCount({ ...product, variants })
  store.set(copy)
  return nextVariant
}

export function listSkuRows(products: ProductRecord[] = store.get()): SkuListRow[] {
  return products.flatMap((product) =>
    product.variants.map((variant) => ({
      ...variant,
      id: variant.code,
      sku: variant.code,
      spu: product.spu,
      name: product.name,
      brand: product.brand,
      category: product.category,
      owner: product.owner,
    })),
  )
}

export function findSkuRow(
  code: string,
  products: ProductRecord[] = store.get(),
): SkuListRow | undefined {
  return listSkuRows(products).find((item) => item.sku === code)
}

export function skuCodeOptions(products: ProductRecord[] = store.get()): string[] {
  return listSkuRows(products).map((item) => item.sku)
}
