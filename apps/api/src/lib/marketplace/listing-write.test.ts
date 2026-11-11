import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { listings, productVariants, products, sellerSkuMappings, shops } from "@workspace/db"
import { buildListingInput, parseListingWriteTarget } from "./listing-write"

type ListingRow = typeof listings.$inferSelect
type ShopRow = typeof shops.$inferSelect
type MappingRow = typeof sellerSkuMappings.$inferSelect
type VariantRow = typeof productVariants.$inferSelect
type ProductRow = typeof products.$inferSelect

const now = new Date("2026-01-01T00:00:00.000Z")

function listingRow(patch: Partial<ListingRow>): ListingRow {
  return {
    id: "lst_1",
    organizationId: "org_1",
    shopId: "shop_1",
    productId: "prd_1",
    marketplaceId: "daraz",
    externalItemId: null,
    variantId: null,
    primaryVariantId: null,
    brandExternalId: null,
    brandName: null,
    categoryExternalId: null,
    categoryPath: null,
    attributes: {},
    status: "draft",
    publishState: "unpublished",
    title: "Wireless Earbuds",
    listingTitle: "Wireless Earbuds Pro",
    priceAmount: "19.9900",
    priceCurrency: "USD",
    stockOnHand: 25,
    warehouseCode: null,
    logisticsChannel: null,
    payload: null,
    lastError: null,
    submittedAt: null,
    liveAt: null,
    createdAt: now,
    updatedAt: now,
    ...patch,
  } as ListingRow
}

function shopRow(patch: Partial<ShopRow>): ShopRow {
  return {
    id: "shop_1",
    organizationId: "org_1",
    platform: "daraz",
    name: "LK Main",
    externalShopId: null,
    sellerId: null,
    shopGroup: null,
    fulfillmentMode: "fbm",
    inventoryPoolId: null,
    status: "connected",
    region: "LK",
    currency: "USD",
    timezone: null,
    sellerName: null,
    marketplaceCountry: null,
    authExpiresAt: null,
    lastSyncAt: null,
    meta: {},
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...patch,
  } as ShopRow
}

function mappingRow(patch: Partial<MappingRow>): MappingRow {
  return {
    id: "map_1",
    organizationId: "org_1",
    shopId: "shop_1",
    listingId: "lst_1",
    variantId: null,
    itemId: null,
    platformSkuId: null,
    sellerSku: "SKU-1",
    status: "confirmed",
    source: "platform_sync",
    syncedAt: now,
    meta: { color: "Black", size: "M" },
    createdAt: now,
    updatedAt: now,
    ...patch,
  } as MappingRow
}

describe("parseListingWriteTarget", () => {
  it("缺省 action 视为 publish", () => {
    assert.deepEqual(parseListingWriteTarget("listing:lst_abc"), {
      listingId: "lst_abc",
      action: "publish",
    })
  })

  it("解析 #deactivate / #update", () => {
    assert.deepEqual(parseListingWriteTarget("listing:lst_abc#deactivate"), {
      listingId: "lst_abc",
      action: "deactivate",
    })
    assert.deepEqual(parseListingWriteTarget("listing:lst_abc#update"), {
      listingId: "lst_abc",
      action: "update",
    })
  })

  it("非法 target 返回 null", () => {
    assert.equal(parseListingWriteTarget(null), null)
    assert.equal(parseListingWriteTarget(""), null)
    assert.equal(parseListingWriteTarget("product:123"), null)
    assert.equal(parseListingWriteTarget("listing:abc#bogus"), null)
    assert.equal(parseListingWriteTarget("listing:"), null)
  })
})

describe("buildListingInput", () => {
  it("组装官方 payload：图片/描述/SKU 尺寸从变体换算 mm→cm、g→kg", () => {
    const input = buildListingInput({
      listing: listingRow({
        categoryExternalId: "100023",
        categoryPath: "Mobiles > Headphones",
        brandName: "Acme",
        payload: {
          images: ["https://cdn.example/1.jpg", "https://cdn.example/2.jpg"],
          cover: "https://cdn.example/0.jpg",
        } as Record<string, unknown>,
      }),
      shop: shopRow({}),
      mappingRows: [
        mappingRow({}),
        mappingRow({
          id: "map_2",
          sellerSku: "  ",
          meta: null,
        }),
        mappingRow({
          id: "map_3",
          sellerSku: "SKU-2",
          meta: { color: "Red" },
        }),
      ],
      variant: {
        id: "var_1",
        lengthMm: 150,
        widthMm: 80,
        heightMm: 30,
        weightGrams: 120,
      } as VariantRow,
      product: { title: "Earbuds product title" } as ProductRow,
    })

    assert.equal(input.title, "Wireless Earbuds Pro")
    assert.equal(input.categoryExternalId, "100023")
    assert.equal(input.priceAmount, "19.9900")
    assert.equal(input.priceCurrency, "USD")
    assert.equal(input.payload?.brand, "Acme")
    assert.equal(input.payload?.description, "Wireless Earbuds Pro")

    const images = input.payload?.images as string[]
    assert.deepEqual(images, [
      "https://cdn.example/0.jpg",
      "https://cdn.example/1.jpg",
      "https://cdn.example/2.jpg",
    ])

    const skus = input.payload?.skus as Array<Record<string, unknown>>
    assert.equal(skus.length, 2)
    assert.equal(skus[0]?.sellerSku, "SKU-1")
    assert.equal(skus[0]?.quantity, 25)
    assert.equal(skus[0]?.price, "19.9900")
    assert.equal(skus[0]?.packageLength, "15")
    assert.equal(skus[0]?.packageWidth, "8")
    assert.equal(skus[0]?.packageHeight, "3")
    assert.equal(skus[0]?.packageWeight, "0.12")
    assert.deepEqual(skus[0]?.attributes, { color_family: "Black", size: "M" })
    assert.deepEqual(skus[1]?.attributes, { color_family: "Red" })

    const productExtra = input.payload?.product as Record<string, unknown>
    assert.equal(productExtra?.category_path, "Mobiles > Headphones")
  })

  it("无变体尺寸时省略包装字段；缺失价格回退 0", () => {
    const input = buildListingInput({
      listing: listingRow({ priceAmount: null, priceCurrency: null, payload: null }),
      shop: shopRow({ currency: "LKR" }),
      mappingRows: [mappingRow({})],
      variant: null,
      product: null,
    })
    const skus = input.payload?.skus as Array<Record<string, unknown>>
    assert.equal(input.priceAmount, "0")
    assert.equal(input.priceCurrency, "LKR")
    assert.equal(skus[0]?.packageLength, undefined)
    assert.equal(skus[0]?.packageWeight, undefined)
  })
})
