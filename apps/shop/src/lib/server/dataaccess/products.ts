import { and, count, desc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { productVariants, products } from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import {
  imagesToUrls,
  normalizeImages,
  readProductPayload,
  readVariantAttrs,
  toDbStatus,
  toUiStatus,
  type UiProductStatus,
} from '@/lib/server/mappers/products'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'

export type ProductListItem = {
  id: string
  spu: string
  name: string
  brand: string
  category: string
  owner: string
  material: string
  style: string
  status: UiProductStatus
  skuCount: number
  coverImage?: string
  images: string[]
  updatedAt: Date | null
}

export type VariantDto = {
  id: string
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
  images: string[]
}

export type ProductDetail = ProductListItem & {
  variants: VariantDto[]
}

export type SkuListItem = VariantDto & {
  sku: string
  spu: string
  name: string
  brand: string
  category: string
  owner: string
  productId: string
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
    CreateProductInput,
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
    CreateVariantInput,
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

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

function coverFromImages(images: string[], fallback?: string | null): string | undefined {
  return images[0] ?? fallback ?? undefined
}

function mapVariantRow(row: typeof productVariants.$inferSelect): VariantDto {
  const attrs = readVariantAttrs(row.attrs)
  const images = Array.isArray(attrs.images)
    ? attrs.images.filter((item): item is string => typeof item === 'string')
    : []
  return {
    id: row.id,
    code: row.skuCode ?? row.sku,
    color: String(attrs.color ?? ''),
    size: String(attrs.size ?? ''),
    pack: String(attrs.pack ?? ''),
    barcode: row.barcode ?? '',
    weight: row.weightGrams ?? 0,
    lengthMm: row.lengthMm ?? 0,
    widthMm: row.widthMm ?? 0,
    heightMm: row.heightMm ?? 0,
    status: toUiStatus(row.status),
    coverImage: typeof attrs.coverImage === 'string' ? attrs.coverImage : images[0],
    images,
  }
}

async function nextSpuCode(db: DbLike, organizationId: string): Promise<string> {
  const [row] = await db
    .select({
      maxNum: sql<number>`coalesce(max(nullif(regexp_replace(${products.spuCode}, '^HSY', ''), '')::int), 0)`,
    })
    .from(products)
    .where(and(eq(products.organizationId, organizationId), isNull(products.deletedAt)))

  const next = Number(row?.maxNum ?? 0) + 1
  return `HSY${String(next).padStart(6, '0')}`
}

async function nextVariantCode(
  db: DbLike,
  organizationId: string,
  productId: string,
  spuCode: string,
): Promise<string> {
  const [row] = await db
    .select({
      maxNum: sql<number>`coalesce(max(nullif(right(${productVariants.skuCode}, 3), '')::int), 0)`,
    })
    .from(productVariants)
    .where(
      and(
        eq(productVariants.organizationId, organizationId),
        eq(productVariants.productId, productId),
      ),
    )
  const next = Number(row?.maxNum ?? 0) + 1
  return `${spuCode}${String(next).padStart(3, '0')}`
}

function productSearchClause(q: string | undefined): SQL | undefined {
  const term = q?.trim()
  if (!term) return undefined
  const pattern = `%${term}%`
  return or(
    ilike(products.spuCode, pattern),
    ilike(products.title, pattern),
    ilike(products.brand, pattern),
    ilike(products.categoryHint, pattern),
    ilike(products.material, pattern),
    ilike(products.style, pattern),
  )
}

export async function listProducts(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string; status?: string } = {},
): Promise<PaginatedResult<ProductListItem>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const offset = (page - 1) * pageSize

  const conditions: SQL[] = [eq(products.organizationId, organizationId), isNull(products.deletedAt)]
  const search = productSearchClause(input.q)
  if (search) conditions.push(search)
  if (input.status && input.status !== '全部') {
    conditions.push(eq(products.status, toDbStatus(input.status)))
  }
  const where = and(...conditions)

  const [totalRow] = await db.select({ value: count() }).from(products).where(where)
  const total = Number(totalRow?.value ?? 0)

  const rows = await db
    .select({
      id: products.id,
      spuCode: products.spuCode,
      title: products.title,
      brand: products.brand,
      categoryHint: products.categoryHint,
      material: products.material,
      style: products.style,
      status: products.status,
      images: products.images,
      payload: products.payload,
      updatedAt: products.updatedAt,
      skuCount: sql<number>`(
        select count(*)::int from ${productVariants}
        where ${productVariants.productId} = ${products.id}
      )`,
    })
    .from(products)
    .where(where)
    .orderBy(desc(products.updatedAt), desc(products.createdAt))
    .limit(pageSize)
    .offset(offset)

  const items: ProductListItem[] = rows.map((row) => {
    const images = imagesToUrls(normalizeImages(row.images))
    const payload = readProductPayload(row.payload)
    return {
      id: row.id,
      spu: row.spuCode ?? '',
      name: row.title,
      brand: row.brand ?? '',
      category: row.categoryHint ?? '',
      owner: payload.ownerName ?? '',
      material: row.material ?? '',
      style: row.style ?? '',
      status: toUiStatus(row.status),
      skuCount: Number(row.skuCount ?? 0),
      coverImage: coverFromImages(images),
      images,
      updatedAt: row.updatedAt,
    }
  })

  return { items, total, page, pageSize }
}

export async function getProductBySpu(
  db: DbLike,
  organizationId: string,
  spu: string,
): Promise<ProductDetail | null> {
  const [row] = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.organizationId, organizationId),
        eq(products.spuCode, spu),
        isNull(products.deletedAt),
      ),
    )
    .limit(1)

  if (!row) return null

  const variants = await db
    .select()
    .from(productVariants)
    .where(
      and(eq(productVariants.organizationId, organizationId), eq(productVariants.productId, row.id)),
    )
    .orderBy(productVariants.skuCode)

  const images = imagesToUrls(normalizeImages(row.images))
  const payload = readProductPayload(row.payload)
  const variantDtos = variants.map(mapVariantRow)

  return {
    id: row.id,
    spu: row.spuCode ?? '',
    name: row.title,
    brand: row.brand ?? '',
    category: row.categoryHint ?? '',
    owner: payload.ownerName ?? '',
    material: row.material ?? '',
    style: row.style ?? '',
    status: toUiStatus(row.status),
    skuCount: variantDtos.length,
    coverImage: coverFromImages(images),
    images,
    updatedAt: row.updatedAt,
    variants: variantDtos,
  }
}

export async function createProduct(
  db: AppDatabase,
  organizationId: string,
  input: CreateProductInput,
  ownerUserId?: string | null,
): Promise<ProductDetail> {
  return db.transaction(async (tx) => {
    const spuCode = await nextSpuCode(tx, organizationId)
    const imageRefs = normalizeImages(input.images ?? (input.coverImage ? [input.coverImage] : []))
    const id = createId()

    await tx.insert(products).values({
      id,
      organizationId,
      spuCode,
      title: input.name.trim(),
      status: toDbStatus(input.status, 'draft'),
      source: 'manual',
      brand: input.brand.trim(),
      categoryHint: input.category.trim(),
      material: input.material.trim(),
      style: input.style.trim(),
      ownerUserId: ownerUserId ?? null,
      images: imageRefs,
      payload: { ownerName: input.owner.trim() },
    })

    const detail = await getProductBySpu(tx, organizationId, spuCode)
    if (!detail) throw new Error('创建 SPU 后读取失败')
    return detail
  })
}

export async function updateProduct(
  db: AppDatabase,
  organizationId: string,
  spu: string,
  patch: UpdateProductInput,
): Promise<ProductDetail | null> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(products)
      .where(
        and(
          eq(products.organizationId, organizationId),
          eq(products.spuCode, spu),
          isNull(products.deletedAt),
        ),
      )
      .limit(1)
    if (!existing) return null

    const payload = readProductPayload(existing.payload)
    const nextImages =
      patch.images !== undefined || patch.coverImage !== undefined
        ? normalizeImages(
            patch.images ??
              (patch.coverImage
                ? [patch.coverImage]
                : imagesToUrls(normalizeImages(existing.images))),
          )
        : undefined

    await tx
      .update(products)
      .set({
        title: patch.name?.trim() ?? existing.title,
        brand: patch.brand?.trim() ?? existing.brand,
        categoryHint: patch.category?.trim() ?? existing.categoryHint,
        material: patch.material?.trim() ?? existing.material,
        style: patch.style?.trim() ?? existing.style,
        status: patch.status ? toDbStatus(patch.status) : existing.status,
        images: nextImages ?? existing.images,
        payload: {
          ...payload,
          ownerName: patch.owner?.trim() ?? payload.ownerName,
        },
        updatedAt: new Date(),
      })
      .where(eq(products.id, existing.id))

    return getProductBySpu(tx, organizationId, spu)
  })
}

export async function createVariant(
  db: AppDatabase,
  organizationId: string,
  input: CreateVariantInput,
): Promise<VariantDto | null> {
  return db.transaction(async (tx) => {
    const [product] = await tx
      .select()
      .from(products)
      .where(
        and(
          eq(products.organizationId, organizationId),
          eq(products.spuCode, input.spu),
          isNull(products.deletedAt),
        ),
      )
      .limit(1)
    if (!product || !product.spuCode) return null

    const code = await nextVariantCode(tx, organizationId, product.id, product.spuCode)
    const id = createId()
    const images = input.images ?? []

    await tx.insert(productVariants).values({
      id,
      organizationId,
      productId: product.id,
      sku: code,
      skuCode: code,
      barcode: input.barcode?.trim() || null,
      status: toDbStatus(input.status, 'draft'),
      weightGrams: Math.round(Number(input.weight) || 0),
      lengthMm: Math.round(Number(input.lengthMm) || 0) || null,
      widthMm: Math.round(Number(input.widthMm) || 0) || null,
      heightMm: Math.round(Number(input.heightMm) || 0) || null,
      attrs: {
        color: input.color.trim(),
        size: input.size.trim(),
        pack: input.pack.trim(),
        coverImage: input.coverImage,
        images,
      },
    })

    const [row] = await tx
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, id))
      .limit(1)
    return row ? mapVariantRow(row) : null
  })
}

export async function updateVariant(
  db: AppDatabase,
  organizationId: string,
  spu: string,
  code: string,
  patch: UpdateVariantInput,
): Promise<VariantDto | null> {
  return db.transaction(async (tx) => {
    const [product] = await tx
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          eq(products.organizationId, organizationId),
          eq(products.spuCode, spu),
          isNull(products.deletedAt),
        ),
      )
      .limit(1)
    if (!product) return null

    const [existing] = await tx
      .select()
      .from(productVariants)
      .where(
        and(
          eq(productVariants.organizationId, organizationId),
          eq(productVariants.productId, product.id),
          or(eq(productVariants.skuCode, code), eq(productVariants.sku, code)),
        ),
      )
      .limit(1)
    if (!existing) return null

    const attrs = readVariantAttrs(existing.attrs)
    const nextAttrs = {
      ...attrs,
      color: patch.color?.trim() ?? attrs.color,
      size: patch.size?.trim() ?? attrs.size,
      pack: patch.pack?.trim() ?? attrs.pack,
      coverImage: patch.coverImage ?? attrs.coverImage,
      images: patch.images ?? attrs.images,
    }

    await tx
      .update(productVariants)
      .set({
        barcode: patch.barcode !== undefined ? patch.barcode.trim() || null : existing.barcode,
        status: patch.status ? toDbStatus(patch.status) : existing.status,
        weightGrams:
          patch.weight !== undefined ? Math.round(Number(patch.weight) || 0) : existing.weightGrams,
        lengthMm:
          patch.lengthMm !== undefined
            ? Math.round(Number(patch.lengthMm) || 0) || null
            : existing.lengthMm,
        widthMm:
          patch.widthMm !== undefined
            ? Math.round(Number(patch.widthMm) || 0) || null
            : existing.widthMm,
        heightMm:
          patch.heightMm !== undefined
            ? Math.round(Number(patch.heightMm) || 0) || null
            : existing.heightMm,
        attrs: nextAttrs,
        updatedAt: new Date(),
      })
      .where(eq(productVariants.id, existing.id))

    const [row] = await tx
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, existing.id))
      .limit(1)
    return row ? mapVariantRow(row) : null
  })
}

export async function listSkus(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string; status?: string; spu?: string } = {},
): Promise<PaginatedResult<SkuListItem>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const offset = (page - 1) * pageSize

  const conditions: SQL[] = [
    eq(productVariants.organizationId, organizationId),
    isNull(products.deletedAt),
  ]
  if (input.spu) conditions.push(eq(products.spuCode, input.spu))
  if (input.status && input.status !== '全部') {
    conditions.push(eq(productVariants.status, toDbStatus(input.status)))
  }
  const term = input.q?.trim()
  if (term) {
    const pattern = `%${term}%`
    const search = or(
      ilike(productVariants.skuCode, pattern),
      ilike(productVariants.sku, pattern),
      ilike(productVariants.barcode, pattern),
      ilike(products.title, pattern),
      ilike(products.spuCode, pattern),
    )
    if (search) conditions.push(search)
  }
  const where = and(...conditions)

  const [totalRow] = await db
    .select({ value: count() })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(where)
  const total = Number(totalRow?.value ?? 0)

  const rows = await db
    .select({
      variant: productVariants,
      product: products,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(where)
    .orderBy(desc(productVariants.updatedAt), desc(productVariants.createdAt))
    .limit(pageSize)
    .offset(offset)

  const items: SkuListItem[] = rows.map(({ variant, product }) => {
    const mapped = mapVariantRow(variant)
    const payload = readProductPayload(product.payload)
    return {
      ...mapped,
      sku: mapped.code,
      spu: product.spuCode ?? '',
      name: product.title,
      brand: product.brand ?? '',
      category: product.categoryHint ?? '',
      owner: payload.ownerName ?? '',
      productId: product.id,
    }
  })

  return { items, total, page, pageSize }
}

export async function getSkuByCode(
  db: AppDatabase,
  organizationId: string,
  code: string,
): Promise<SkuListItem | null> {
  const [row] = await db
    .select({
      variant: productVariants,
      product: products,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(
      and(
        eq(productVariants.organizationId, organizationId),
        isNull(products.deletedAt),
        or(eq(productVariants.skuCode, code), eq(productVariants.sku, code)),
      ),
    )
    .limit(1)

  if (!row) return null
  const mapped = mapVariantRow(row.variant)
  const payload = readProductPayload(row.product.payload)
  return {
    ...mapped,
    sku: mapped.code,
    spu: row.product.spuCode ?? '',
    name: row.product.title,
    brand: row.product.brand ?? '',
    category: row.product.categoryHint ?? '',
    owner: payload.ownerName ?? '',
    productId: row.product.id,
  }
}

export async function listSkuCodes(
  db: AppDatabase,
  organizationId: string,
): Promise<string[]> {
  const rows = await db
    .select({ code: productVariants.skuCode, sku: productVariants.sku })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(and(eq(productVariants.organizationId, organizationId), isNull(products.deletedAt)))
    .orderBy(productVariants.skuCode)

  return rows.map((row) => row.code ?? row.sku).filter(Boolean)
}

export async function productStats(
  db: AppDatabase,
  organizationId: string,
): Promise<{ spuTotal: number; enabled: number; pending: number; skuTotal: number }> {
  const base = and(eq(products.organizationId, organizationId), isNull(products.deletedAt))
  const [spuTotalRow] = await db.select({ value: count() }).from(products).where(base)
  const [enabledRow] = await db
    .select({ value: count() })
    .from(products)
    .where(and(base, eq(products.status, 'active')))
  const [pendingRow] = await db
    .select({ value: count() })
    .from(products)
    .where(and(base, eq(products.status, 'draft')))
  const [skuTotalRow] = await db
    .select({ value: count() })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(and(eq(productVariants.organizationId, organizationId), isNull(products.deletedAt)))

  return {
    spuTotal: Number(spuTotalRow?.value ?? 0),
    enabled: Number(enabledRow?.value ?? 0),
    pending: Number(pendingRow?.value ?? 0),
    skuTotal: Number(skuTotalRow?.value ?? 0),
  }
}
