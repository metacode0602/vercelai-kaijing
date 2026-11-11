import { and, count, desc, eq, exists, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { listings, productVariants, products, shops } from '@workspace/db/schema'
import { resolveBrandForProduct } from '@/lib/server/dataaccess/brands'
import { assertHsCompliance, normalizeHsCode } from '@/lib/server/dataaccess/compliance'
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
import { toDbListingStatus } from '@/lib/server/mappers/listings'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'
import { withUniqueGuard } from '@/lib/server/errors/unique-constraint'

function variantUniqueMessages(code: string) {
  return {
    product_variants_org_sku_uidx: `内部 SKU ${code} 已存在`,
    product_variants_org_sku_code_uidx: `内部 SKU 编码 ${code} 已存在`,
  }
}

export type ProductListItem = {
  id: string
  spu: string
  name: string
  brandId: string
  brand: string
  category: string
  owner: string
  material: string
  style: string
  hsCode: string
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
  remark: string
  hsCode: string
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
  brandId?: string
  brand?: string
  category: string
  owner: string
  material: string
  style: string
  status?: UiProductStatus
  coverImage?: string
  images?: string[]
  hsCode?: string
}

export type UpdateProductInput = Partial<
  Pick<
    CreateProductInput,
    'name' | 'brand' | 'category' | 'owner' | 'material' | 'style' | 'status' | 'coverImage' | 'images' | 'hsCode'
  >
> & {
  brandId?: string | null
}

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
  remark?: string
  coverImage?: string
  images?: string[]
  hsCode?: string
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
    | 'remark'
    | 'coverImage'
    | 'images'
    | 'hsCode'
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
    remark: typeof attrs.remark === 'string' ? attrs.remark : '',
    hsCode: row.hsCode ?? '',
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
    ilike(products.hsCode, pattern),
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
      brandId: products.brandId,
      categoryHint: products.categoryHint,
      material: products.material,
      style: products.style,
      hsCode: products.hsCode,
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
      brandId: row.brandId ?? '',
      brand: row.brand ?? '',
      category: row.categoryHint ?? '',
      owner: payload.ownerName ?? '',
      material: row.material ?? '',
      style: row.style ?? '',
      hsCode: row.hsCode ?? '',
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
    brandId: row.brandId ?? '',
    brand: row.brand ?? '',
    category: row.categoryHint ?? '',
    owner: payload.ownerName ?? '',
    material: row.material ?? '',
    style: row.style ?? '',
    hsCode: row.hsCode ?? '',
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

    const resolved = await resolveBrandForProduct(tx, organizationId, {
      brandId: input.brandId,
      brand: input.brand,
    })
    if (!resolved.brandId) {
      throw new Error('请选择品牌（请先在「品牌」主档维护并启用）')
    }

    const hsCode = normalizeHsCode(input.hsCode) || null
    await assertHsCompliance(tx, organizationId, { hsCode })

    await withUniqueGuard(
      () =>
        tx.insert(products).values({
          id,
          organizationId,
          spuCode,
          title: input.name.trim(),
          status: toDbStatus(input.status, 'draft'),
          source: 'manual',
          brand: resolved.brandName,
          brandId: resolved.brandId,
          categoryHint: input.category.trim(),
          material: input.material.trim(),
          style: input.style.trim(),
          hsCode,
          ownerUserId: ownerUserId ?? null,
          images: imageRefs,
          payload: { ownerName: input.owner.trim() },
        }),
      { products_org_spu_uidx: `SPU 编码 ${spuCode} 已存在，请重试` },
      `SPU 编码 ${spuCode} 已存在，请重试`,
    )

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

    let nextBrand = existing.brand
    let nextBrandId = existing.brandId
    if (patch.brandId !== undefined || patch.brand !== undefined) {
      const resolved = await resolveBrandForProduct(tx, organizationId, {
        brandId: patch.brandId === undefined ? existing.brandId : patch.brandId,
        brand: patch.brand,
      })
      if (patch.brandId !== undefined || patch.brand) {
        if (!resolved.brandId) {
          throw new Error('请选择品牌（请先在「品牌」主档维护并启用）')
        }
        nextBrand = resolved.brandName
        nextBrandId = resolved.brandId
      }
    }

    const hsCode =
      patch.hsCode !== undefined ? normalizeHsCode(patch.hsCode) || null : existing.hsCode
    await assertHsCompliance(tx, organizationId, {
      hsCode,
      productId: existing.id,
    })

    await tx
      .update(products)
      .set({
        title: patch.name?.trim() ?? existing.title,
        brand: nextBrand,
        brandId: nextBrandId,
        categoryHint: patch.category?.trim() ?? existing.categoryHint,
        material: patch.material?.trim() ?? existing.material,
        style: patch.style?.trim() ?? existing.style,
        hsCode,
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


function variantComboKey(color: string, size: string, pack: string): string {
  return `${color.trim()}\0${size.trim()}\0${pack.trim()}`
}

async function listVariantComboKeys(
  db: DbLike,
  organizationId: string,
  productId: string,
): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: productVariants.id, attrs: productVariants.attrs, skuCode: productVariants.skuCode, sku: productVariants.sku })
    .from(productVariants)
    .where(
      and(
        eq(productVariants.organizationId, organizationId),
        eq(productVariants.productId, productId),
      ),
    )
  const map = new Map<string, string>()
  for (const row of rows) {
    const attrs = readVariantAttrs(row.attrs)
    const key = variantComboKey(String(attrs.color ?? ''), String(attrs.size ?? ''), String(attrs.pack ?? ''))
    map.set(key, row.skuCode ?? row.sku)
  }
  return map
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

    const comboKey = variantComboKey(input.color, input.size, input.pack)
    const existingCombos = await listVariantComboKeys(tx, organizationId, product.id)
    if (existingCombos.has(comboKey)) {
      throw new Error(
        `规格组合已存在：${input.color.trim()} / ${input.size.trim()} / ${input.pack.trim()}（${existingCombos.get(comboKey)}）`,
      )
    }

    const code = await nextVariantCode(tx, organizationId, product.id, product.spuCode)
    const id = createId()
    const images = input.images ?? []
    const hsCode = input.hsCode !== undefined ? normalizeHsCode(input.hsCode) || null : null
    if (input.hsCode !== undefined && input.hsCode.trim()) {
      await assertHsCompliance(tx, organizationId, {
        hsCode,
        productId: product.id,
      })
    }

    await withUniqueGuard(
      () =>
        tx.insert(productVariants).values({
          id,
          organizationId,
          productId: product.id,
          sku: code,
          skuCode: code,
          barcode: input.barcode?.trim() || null,
          hsCode,
          status: toDbStatus(input.status, 'draft'),
          weightGrams: Math.round(Number(input.weight) || 0),
          lengthMm: Math.round(Number(input.lengthMm) || 0) || null,
          widthMm: Math.round(Number(input.widthMm) || 0) || null,
          heightMm: Math.round(Number(input.heightMm) || 0) || null,
          attrs: {
            color: input.color.trim(),
            size: input.size.trim(),
            pack: input.pack.trim(),
            remark: input.remark?.trim() || undefined,
            coverImage: input.coverImage,
            images,
          },
        }),
      variantUniqueMessages(code),
      `内部 SKU ${code} 已存在`,
    )

    const [row] = await tx
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, id))
      .limit(1)
    return row ? mapVariantRow(row) : null
  })
}


export type BatchCreateVariantsInput = {
  spu: string
  colors: string[]
  sizes: string[]
  packs: string[]
  weight?: number
  status?: UiProductStatus
  barcode?: string
  lengthMm?: number
  widthMm?: number
  heightMm?: number
  hsCode?: string
}

export type BatchCreateVariantsResult = {
  created: VariantDto[]
  createdCount: number
  skippedCount: number
  totalRequested: number
}

export async function batchCreateVariants(
  db: AppDatabase,
  organizationId: string,
  input: BatchCreateVariantsInput,
): Promise<BatchCreateVariantsResult | null> {
  const colors = Array.from(new Set(input.colors.map((item) => item.trim()).filter(Boolean)))
  const sizes = Array.from(new Set(input.sizes.map((item) => item.trim()).filter(Boolean)))
  const packs = Array.from(new Set(input.packs.map((item) => item.trim()).filter(Boolean)))
  if (colors.length === 0 || sizes.length === 0 || packs.length === 0) {
    throw new Error('请至少选择一个颜色、尺码和包装规格')
  }

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

    const hsCode = input.hsCode !== undefined ? normalizeHsCode(input.hsCode) || null : null
    if (input.hsCode !== undefined && input.hsCode.trim()) {
      await assertHsCompliance(tx, organizationId, {
        hsCode,
        productId: product.id,
      })
    }

    const existingCombos = await listVariantComboKeys(tx, organizationId, product.id)
    const created: VariantDto[] = []
    let skippedCount = 0
    let totalRequested = 0

    for (const color of colors) {
      for (const size of sizes) {
        for (const pack of packs) {
          totalRequested += 1
          const comboKey = variantComboKey(color, size, pack)
          if (existingCombos.has(comboKey)) {
            skippedCount += 1
            continue
          }

          const code = await nextVariantCode(tx, organizationId, product.id, product.spuCode)
          const id = createId()
          await withUniqueGuard(
            () =>
              tx.insert(productVariants).values({
                id,
                organizationId,
                productId: product.id,
                sku: code,
                skuCode: code,
                barcode: input.barcode?.trim() || null,
                hsCode,
                status: toDbStatus(input.status, 'draft'),
                weightGrams: Math.round(Number(input.weight) || 0),
                lengthMm: Math.round(Number(input.lengthMm) || 0) || null,
                widthMm: Math.round(Number(input.widthMm) || 0) || null,
                heightMm: Math.round(Number(input.heightMm) || 0) || null,
                attrs: {
                  color,
                  size,
                  pack,
                  images: [],
                },
              }),
            variantUniqueMessages(code),
            `内部 SKU ${code} 已存在`,
          )

          existingCombos.set(comboKey, code)
          const [row] = await tx
            .select()
            .from(productVariants)
            .where(eq(productVariants.id, id))
            .limit(1)
          if (row) created.push(mapVariantRow(row))
        }
      }
    }

    return {
      created,
      createdCount: created.length,
      skippedCount,
      totalRequested,
    }
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

    if (patch.hsCode !== undefined && patch.hsCode.trim()) {
      await assertHsCompliance(tx, organizationId, {
        hsCode: normalizeHsCode(patch.hsCode),
        productId: product.id,
        variantId: existing.id,
      })
    }

    const attrs = readVariantAttrs(existing.attrs)
    const nextAttrs = {
      ...attrs,
      color: patch.color?.trim() ?? attrs.color,
      size: patch.size?.trim() ?? attrs.size,
      pack: patch.pack?.trim() ?? attrs.pack,
      remark:
        patch.remark !== undefined ? patch.remark.trim() || undefined : attrs.remark,
      coverImage: patch.coverImage ?? attrs.coverImage,
      images: patch.images ?? attrs.images,
    }

    const nextCombo = variantComboKey(
      String(nextAttrs.color ?? ''),
      String(nextAttrs.size ?? ''),
      String(nextAttrs.pack ?? ''),
    )
    const prevCombo = variantComboKey(
      String(attrs.color ?? ''),
      String(attrs.size ?? ''),
      String(attrs.pack ?? ''),
    )
    if (nextCombo !== prevCombo) {
      const existingCombos = await listVariantComboKeys(tx, organizationId, product.id)
      const conflictCode = existingCombos.get(nextCombo)
      if (conflictCode && conflictCode !== (existing.skuCode ?? existing.sku)) {
        throw new Error(
          `规格组合已存在：${String(nextAttrs.color ?? '')} / ${String(nextAttrs.size ?? '')} / ${String(nextAttrs.pack ?? '')}（${conflictCode}）`,
        )
      }
    }

    await tx
      .update(productVariants)
      .set({
        barcode: patch.barcode !== undefined ? patch.barcode.trim() || null : existing.barcode,
        hsCode:
          patch.hsCode !== undefined ? normalizeHsCode(patch.hsCode) || null : existing.hsCode,
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

export type CatalogRowDto = {
  sku: string
  variantId: string
  productId: string
  spu: string
  title: string
  status: UiProductStatus
  coverImage?: string
  images: string[]
  shop: string
  platform: string
  shopCount: number
  listing: string
  priceAmount: number
  priceCurrency: string
  updatedAt: string
  lastError: string | null
}

/** /console/products 列表：SKU + 主刊登摘要（DB 分页）。 */
export async function listCatalogRows(
  db: AppDatabase,
  organizationId: string,
  input: {
    page?: number
    pageSize?: number
    q?: string
    listing?: string
    platform?: string
    shopId?: string
  } = {},
): Promise<PaginatedResult<CatalogRowDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const conditions: SQL[] = [
    eq(productVariants.organizationId, organizationId),
    isNull(products.deletedAt),
  ]
  const term = input.q?.trim()
  if (term) {
    const pattern = `%${term}%`
    const search = or(
      ilike(productVariants.skuCode, pattern),
      ilike(productVariants.sku, pattern),
      ilike(products.title, pattern),
      ilike(products.spuCode, pattern),
    )
    if (search) conditions.push(search)
  }
  // 刊登状态 / 平台 / 店铺筛选进 SQL（EXISTS 关联本 SKU 的刊登），保证分页与 total 正确。
  const listingStatus = input.listing?.trim()
  if (listingStatus && listingStatus !== 'all') {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(listings)
          .where(
            and(
              eq(listings.organizationId, organizationId),
              eq(listings.primaryVariantId, productVariants.id),
              eq(listings.status, toDbListingStatus(listingStatus)),
            ),
          ),
      ),
    )
  }
  const platform = input.platform?.trim()
  if (platform && platform !== 'all') {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(listings)
          .innerJoin(shops, eq(shops.id, listings.shopId))
          .where(
            and(
              eq(listings.organizationId, organizationId),
              eq(listings.primaryVariantId, productVariants.id),
              eq(shops.platform, platform),
              isNull(shops.deletedAt),
            ),
          ),
      ),
    )
  }
  const shopFilter = input.shopId?.trim()
  if (shopFilter && shopFilter !== 'all') {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(listings)
          .where(
            and(
              eq(listings.organizationId, organizationId),
              eq(listings.primaryVariantId, productVariants.id),
              eq(listings.shopId, shopFilter),
            ),
          ),
      ),
    )
  }
  const where = and(...conditions)

  const [totalRow] = await db
    .select({ value: count() })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(where)
  const total = Number(totalRow?.value ?? 0)

  const rows = await db
    .select({ variant: productVariants, product: products })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(where)
    .orderBy(desc(productVariants.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const variantIds = rows.map((r) => r.variant.id)
  const listingRows =
    variantIds.length === 0
      ? []
      : await db
          .select({
            listing: listings,
            shopName: shops.name,
            platform: shops.platform,
          })
          .from(listings)
          .leftJoin(shops, eq(shops.id, listings.shopId))
          .where(
            and(eq(listings.organizationId, organizationId), inArray(listings.primaryVariantId, variantIds)),
          )
          .orderBy(desc(listings.updatedAt))

  const byVariant = new Map<string, typeof listingRows>()
  for (const row of listingRows) {
    const vid = row.listing.primaryVariantId
    if (!vid) continue
    const list = byVariant.get(vid) ?? []
    list.push(row)
    byVariant.set(vid, list)
  }

  const items: CatalogRowDto[] = rows.map(({ variant, product }) => {
    const mapped = mapVariantRow(variant)
    const ls = byVariant.get(variant.id) ?? []
    const primary = ls[0]
    const listingStatus = primary?.listing.status ?? 'draft'
    return {
      sku: mapped.code,
      variantId: variant.id,
      productId: product.id,
      spu: product.spuCode ?? '',
      title: product.title,
      status: mapped.status,
      coverImage: mapped.coverImage,
      images: mapped.images,
      shop: primary?.shopName ?? '—',
      platform: primary?.platform ?? '—',
      shopCount: new Set(ls.map((x) => x.listing.shopId).filter(Boolean)).size,
      listing: listingStatus,
      priceAmount: Number(primary?.listing.priceAmount ?? 0) || 0,
      priceCurrency: primary?.listing.priceCurrency ?? 'LKR',
      updatedAt: (variant.updatedAt ?? product.updatedAt)?.toISOString?.()?.slice(0, 10) ?? '—',
      lastError: (primary?.listing.lastError as string | null) ?? null,
    }
  })

  return { items, total, page, pageSize }
}
