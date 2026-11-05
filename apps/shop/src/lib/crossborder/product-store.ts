/**
 * 商品 SPU / 内部 SKU 类型与纯函数助手。
 *
 * 主路径已切到 tRPC → dataaccess → PostgreSQL（见 `@/lib/server/dataaccess/products`）。
 * 本文件不再读写 localStorage / mock；页面请使用 `trpc.products.*`。
 *
 * 仍依赖本文件类型或 `listSkuRows` 的模块（如映射 stub）应改为 `trpc.products.listSkuCodes`。
 */

import type { UiProductStatus } from '@/lib/server/mappers/products'

export type DemoStatus = UiProductStatus

export type VariantRecord = {
  id?: string
  code: string
  color: string
  size: string
  pack: string
  barcode: string
  weight: number
  lengthMm: number
  widthMm: number
  heightMm: number
  status: UiProductStatus
  coverImage?: string
  images?: string[]
}

export type ProductRecord = {
  id?: string
  spu: string
  name: string
  brand: string
  category: string
  owner: string
  status: UiProductStatus
  skuCount: number
  material: string
  style: string
  coverImage?: string
  images?: string[]
  variants: VariantRecord[]
}

export type CreateProductInput = {
  name: string
  brand: string
  category: string
  owner: string
  material: string
  style: string
  status?: UiProductStatus
  coverImage?: string
  images?: string[]
}

export type UpdateProductInput = Partial<
  Pick<
    ProductRecord,
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
  lengthMm?: number
  widthMm?: number
  heightMm?: number
  status?: UiProductStatus
  coverImage?: string
  images?: string[]
}

export type UpdateVariantInput = Partial<
  Pick<
    VariantRecord,
    | 'color'
    | 'size'
    | 'pack'
    | 'barcode'
    | 'weight'
    | 'lengthMm'
    | 'widthMm'
    | 'heightMm'
    | 'status'
    | 'coverImage'
    | 'images'
  >
>

export type SkuListRow = VariantRecord & {
  id: string
  sku: string
  spu: string
  name: string
  brand: string
  category: string
  owner: string
}

/** @deprecated 主路径已禁用 localStorage；保留空实现避免误用编译失败。 */
export function useProducts(): ProductRecord[] {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      '[product-store] useProducts() 已停用 localStorage。请改用 trpc.products.list / bySpu。',
    )
  }
  return []
}

export function getProducts(): ProductRecord[] {
  return []
}

export function getProductBySpu(_spu: string): ProductRecord | undefined {
  return undefined
}

export function createProduct(_input: CreateProductInput): ProductRecord {
  throw new Error('createProduct 已迁移至 trpc.products.create，请勿再调用本地 store')
}

export function updateProduct(_spu: string, _patch: UpdateProductInput): ProductRecord | null {
  throw new Error('updateProduct 已迁移至 trpc.products.update')
}

export function createVariant(_input: CreateVariantInput): VariantRecord | null {
  throw new Error('createVariant 已迁移至 trpc.products.createVariant')
}

export function updateVariant(
  _spu: string,
  _code: string,
  _patch: UpdateVariantInput,
): VariantRecord | null {
  throw new Error('updateVariant 已迁移至 trpc.products.updateVariant')
}

export function listSkuRows(products: ProductRecord[]): SkuListRow[] {
  return products.flatMap((product) =>
    product.variants.map((variant) => ({
      ...variant,
      id: variant.id ?? variant.code,
      sku: variant.code,
      spu: product.spu,
      name: product.name,
      brand: product.brand,
      category: product.category,
      owner: product.owner,
    })),
  )
}

export function findSkuRow(code: string, products: ProductRecord[]): SkuListRow | undefined {
  return listSkuRows(products).find((item) => item.sku === code)
}

export function skuCodeOptions(products: ProductRecord[]): string[] {
  return listSkuRows(products).map((item) => item.sku)
}
