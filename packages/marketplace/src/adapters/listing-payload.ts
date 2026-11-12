/**
 * Lazop（Daraz / Lazada）商品写入 payload 组装 — 纯函数，无网络。
 *
 * 官方结构（docs/design/platform-apis/lazada/lazada-products-api.md §6.1、
 * docs/design/platform-apis/daraz/daraz-products-api.md §4.1）：
 *   { "Request": { "Product": { PrimaryCategory, Images, Attributes, Skus: { Sku: [...] } } } }
 *
 * 旧实现把扁平字段直接 JSON.stringify 提交，平台会拒绝；此处统一按官方结构组装。
 * 具体类目属性 / 单位仍需用官方 API Tester 联调确认。
 */
import type {
  DomainListingInput,
  DomainPriceQuantityItem,
} from "../domain/types"

export type ListingPayloadSku = {
  sellerSku: string
  quantity?: string | number
  price?: string | number
  /** 包装尺寸重量（单位按站点规范；调用方负责换算）。 */
  packageLength?: string | number
  packageWidth?: string | number
  packageHeight?: string | number
  packageWeight?: string | number
  packageContent?: string
  images?: string[]
  /** 类目定义的销售属性，如 color_family / size。 */
  attributes?: Record<string, unknown>
}

export type ListingPayloadExtras = {
  images?: string[]
  description?: string
  shortDescription?: string
  brand?: string
  model?: string
  /** 直接并入 Attributes 的类目属性。 */
  attributes?: Record<string, unknown>
  skus?: ListingPayloadSku[]
  /** 直接并入 Product 的平台特有字段（覆盖同名内置字段）。 */
  product?: Record<string, unknown>
}

function asRecordSafe(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function nonEmptyStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === "string" && !!item.trim())
    .map((item) => item.trim())
}

export function parseListingPayloadExtras(
  payload: Record<string, unknown> | undefined,
): ListingPayloadExtras {
  const raw = asRecordSafe(payload)
  const attributes = asRecordSafe(raw.attributes)
  const skus = Array.isArray(raw.skus)
    ? (raw.skus as unknown[])
        .map((item) => asRecordSafe(item))
        .filter((item) => typeof item.sellerSku === "string" && !!String(item.sellerSku).trim())
        .map((item) => ({
          sellerSku: String(item.sellerSku).trim(),
          quantity: item.quantity as string | number | undefined,
          price: item.price as string | number | undefined,
          packageLength: item.packageLength as string | number | undefined,
          packageWidth: item.packageWidth as string | number | undefined,
          packageHeight: item.packageHeight as string | number | undefined,
          packageWeight: item.packageWeight as string | number | undefined,
          packageContent:
            typeof item.packageContent === "string" ? item.packageContent : undefined,
          images: nonEmptyStrings(item.images),
          attributes: asRecordSafe(item.attributes),
        }))
    : undefined
  return {
    images: nonEmptyStrings(raw.images),
    description: typeof raw.description === "string" ? raw.description : undefined,
    shortDescription:
      typeof raw.shortDescription === "string" ? raw.shortDescription : undefined,
    brand: typeof raw.brand === "string" ? raw.brand : undefined,
    model: typeof raw.model === "string" ? raw.model : undefined,
    attributes: Object.keys(attributes).length ? attributes : undefined,
    skus: skus?.length ? skus : undefined,
    product: asRecordSafe(raw.product),
  }
}

function buildAttributes(
  input: Pick<DomainListingInput, "title">,
  extras: ListingPayloadExtras,
): Record<string, unknown> {
  const attributes: Record<string, unknown> = {
    ...(extras.attributes ?? {}),
    name: input.title,
  }
  if (extras.description) attributes.description = extras.description
  if (extras.shortDescription) attributes.short_description = extras.shortDescription
  if (extras.brand) attributes.brand = extras.brand
  if (extras.model) attributes.model = extras.model
  return attributes
}

function buildSkuRow(
  sku: ListingPayloadSku,
  fallback: { priceAmount: string; images: string[] },
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    SellerSku: sku.sellerSku,
    quantity: sku.quantity ?? 0,
    price: sku.price ?? fallback.priceAmount,
  }
  if (sku.packageLength != null) row.package_length = sku.packageLength
  if (sku.packageWidth != null) row.package_width = sku.packageWidth
  if (sku.packageHeight != null) row.package_height = sku.packageHeight
  if (sku.packageWeight != null) row.package_weight = sku.packageWeight
  if (sku.packageContent) row.package_content = sku.packageContent
  const images = sku.images?.length ? sku.images : undefined
  if (images?.length) row.Images = { Image: images }
  if (sku.attributes && Object.keys(sku.attributes).length) {
    Object.assign(row, sku.attributes)
  }
  return row
}

/** 组装 CreateProduct payload：`{ Request: { Product: { … } } }`。 */
export function buildCreateProductPayload(input: DomainListingInput): Record<string, unknown> {
  const extras = parseListingPayloadExtras(input.payload)
  const images = extras.images
  const skus = extras.skus ?? [
    {
      sellerSku: String(
        (input.payload?.sellerSku as string | undefined) ?? "",
      ).trim(),
      price: input.priceAmount,
      quantity: (input.payload?.quantity as string | number | undefined) ?? 0,
    },
  ]

  const product: Record<string, unknown> = {
    PrimaryCategory: input.categoryExternalId,
    Attributes: buildAttributes(input, extras),
    Skus: {
      Sku: skus
        .filter((sku) => sku.sellerSku)
        .map((sku) =>
          buildSkuRow(sku, { priceAmount: input.priceAmount, images: images ?? [] }),
        ),
    },
    ...(extras.product ?? {}),
  }
  if (images?.length) product.Images = { Image: images }

  return { Request: { Product: product } }
}

/** 组装 UpdateProduct payload：结构同 create，额外带 ItemId。 */
export function buildUpdateProductPayload(
  externalId: string,
  input: Partial<DomainListingInput>,
): Record<string, unknown> {
  const extras = parseListingPayloadExtras(input.payload)
  const title = input.title ?? ""
  const product: Record<string, unknown> = {
    ItemId: externalId,
    ...(input.categoryExternalId ? { PrimaryCategory: input.categoryExternalId } : {}),
    ...(title ? { Attributes: buildAttributes({ title }, extras) } : {}),
    ...(extras.skus?.length
      ? {
          Skus: {
            Sku: extras.skus
              .filter((sku) => sku.sellerSku)
              .map((sku) =>
                buildSkuRow(sku, {
                  priceAmount: input.priceAmount ?? "",
                  images: extras.images ?? [],
                }),
              ),
          },
        }
      : {}),
    ...(extras.product ?? {}),
  }
  if (extras.images?.length) product.Images = { Image: extras.images }
  return { Request: { Product: product } }
}

const PRICE_QUANTITY_BATCH_SIZE = 20

/** 把待推送项按官方建议拆成每批最多 20 个商品。 */
export function chunkPriceQuantityItems(
  items: DomainPriceQuantityItem[],
  size = PRICE_QUANTITY_BATCH_SIZE,
): DomainPriceQuantityItem[][] {
  const batches: DomainPriceQuantityItem[][] = []
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size))
  }
  return batches
}

/**
 * 组装 UpdatePriceQuantity payload：`{ Request: { Product: [...] } }`。
 * 只带本次要改的字段（Price / Quantity），不编造促销价。
 * @see docs/design/platform-apis/lazada/lazada-products-api.md §8.1
 * @see docs/design/platform-apis/daraz/daraz-products-api.md §6
 */
export function buildPriceQuantityPayload(
  items: DomainPriceQuantityItem[],
): Record<string, unknown> {
  const products = items
    .filter((item) => item.externalItemId.trim() && item.skus.length > 0)
    .map((item) => {
      const skus = item.skus
        .filter((sku) => sku.sellerSku.trim())
        .map((sku) => {
          const row: Record<string, unknown> = { SellerSku: sku.sellerSku.trim() }
          if (sku.platformSkuId?.trim()) row.SkuId = sku.platformSkuId.trim()
          if (sku.price != null && String(sku.price).trim() !== "") row.Price = String(sku.price).trim()
          if (sku.quantity != null && Number.isFinite(sku.quantity)) {
            row.Quantity = Math.max(0, Math.floor(sku.quantity))
          }
          return row
        })
        .filter((row) => "Price" in row || "Quantity" in row)
      return {
        ItemId: item.externalItemId.trim(),
        Skus: { Sku: skus },
      }
    })
    .filter((product) => Array.isArray((product.Skus as { Sku: unknown[] }).Sku) && (product.Skus as { Sku: unknown[] }).Sku.length > 0)
  return { Request: { Product: products } }
}

/** Daraz / Lazada 已接入 UpdatePriceQuantity；其余平台需如实失败。 */
export function platformSupportsPriceQuantityWrite(platform: string | null | undefined): boolean {
  const value = (platform ?? "").trim().toLowerCase()
  return value === "daraz" || value === "lazada"
}

export function unsupportedPriceQuantityWriteMessage(platform: string | null | undefined): string {
  const value = (platform ?? "").trim() || "未知平台"
  return `${value} 暂无已接入的库存/价格写入接口，无法推送到平台`
}
