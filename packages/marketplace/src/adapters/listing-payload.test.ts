import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildCreateProductPayload,
  buildPriceQuantityPayload,
  buildUpdateProductPayload,
  chunkPriceQuantityItems,
  parseListingPayloadExtras,
  platformSupportsPriceQuantityWrite,
  unsupportedPriceQuantityWriteMessage,
} from "./listing-payload"

describe("buildCreateProductPayload", () => {
  it("按官方结构组装 Request/Product", () => {
    const payload = buildCreateProductPayload({
      title: "测试商品",
      categoryExternalId: "10002019",
      priceAmount: "12.50",
      priceCurrency: "LKR",
      payload: {
        images: ["https://cdn.example.com/a.jpg"],
        description: "描述",
        brand: "No Brand",
        skus: [
          {
            sellerSku: "SELLER-1",
            quantity: 5,
            price: "12.50",
            packageWeight: "0.5",
            attributes: { color_family: "Black" },
          },
        ],
      },
    })

    const product = (payload.Request as Record<string, unknown>)
      .Product as Record<string, unknown>
    assert.equal(product.PrimaryCategory, "10002019")
    assert.deepEqual(product.Images, { Image: ["https://cdn.example.com/a.jpg"] })
    const attributes = product.Attributes as Record<string, unknown>
    assert.equal(attributes.name, "测试商品")
    assert.equal(attributes.description, "描述")
    assert.equal(attributes.brand, "No Brand")

    const skus = (product.Skus as { Sku: Record<string, unknown>[] }).Sku
    assert.equal(skus.length, 1)
    assert.equal(skus[0].SellerSku, "SELLER-1")
    assert.equal(skus[0].quantity, 5)
    assert.equal(skus[0].price, "12.50")
    assert.equal(skus[0].package_weight, "0.5")
    assert.equal(skus[0].color_family, "Black")
    // 不再出现旧实现的扁平字段
    assert.equal(payload.name, undefined)
    assert.equal(payload.primary_category, undefined)
  })

  it("无 skus 时用 payload.sellerSku 兜底", () => {
    const payload = buildCreateProductPayload({
      title: "t",
      categoryExternalId: "42",
      priceAmount: "9.99",
      priceCurrency: "USD",
      payload: { sellerSku: "S-1" },
    })
    const product = (payload.Request as Record<string, unknown>)
      .Product as Record<string, unknown>
    const skus = (product.Skus as { Sku: Record<string, unknown>[] }).Sku
    assert.equal(skus.length, 1)
    assert.equal(skus[0].SellerSku, "S-1")
    assert.equal(skus[0].price, "9.99")
  })

  it("product 覆盖字段并入 Product", () => {
    const payload = buildCreateProductPayload({
      title: "t",
      categoryExternalId: "1",
      priceAmount: "1",
      priceCurrency: "USD",
      payload: { product: { SPUId: "SPU-9" } },
    })
    const product = (payload.Request as Record<string, unknown>)
      .Product as Record<string, unknown>
    assert.equal(product.SPUId, "SPU-9")
  })
})

describe("buildUpdateProductPayload", () => {
  it("带 ItemId 并保留增量字段", () => {
    const payload = buildUpdateProductPayload("ITEM-1", {
      title: "改名",
      priceAmount: "20",
      payload: { skus: [{ sellerSku: "S-1", price: "20" }] },
    })
    const product = (payload.Request as Record<string, unknown>)
      .Product as Record<string, unknown>
    assert.equal(product.ItemId, "ITEM-1")
    const attributes = product.Attributes as Record<string, unknown>
    assert.equal(attributes.name, "改名")
    const skus = (product.Skus as { Sku: Record<string, unknown>[] }).Sku
    assert.equal(skus[0].price, "20")
  })
})

describe("parseListingPayloadExtras", () => {
  it("容错：非法输入返回空扩展", () => {
    assert.deepEqual(parseListingPayloadExtras(undefined), {
      images: [],
      description: undefined,
      shortDescription: undefined,
      brand: undefined,
      model: undefined,
      attributes: undefined,
      skus: undefined,
      product: {},
    })
    const extras = parseListingPayloadExtras({
      images: ["", " https://a ", 3],
      skus: [{ sellerSku: "  " }, { sellerSku: "ok" }],
    })
    assert.deepEqual(extras.images, ["https://a"])
    assert.equal(extras.skus?.length, 1)
    assert.equal(extras.skus?.[0].sellerSku, "ok")
  })
})

describe("buildPriceQuantityPayload", () => {
  it("只带本次要改的 Price / Quantity，并使用官方 ItemId / SellerSku 字段", () => {
    const payload = buildPriceQuantityPayload([
      {
        externalItemId: "111",
        skus: [
          { sellerSku: "TEE-1", platformSkuId: "sku-9", price: "19.90", quantity: 7 },
        ],
      },
    ])
    const product = (payload as { Request: { Product: Array<Record<string, unknown>> } }).Request.Product[0]
    assert.equal(product.ItemId, "111")
    const sku = (product.Skus as { Sku: Array<Record<string, unknown>> }).Sku[0]
    assert.deepEqual(sku, { SellerSku: "TEE-1", SkuId: "sku-9", Price: "19.90", Quantity: 7 })
  })

  it("仅改价时不带 Quantity，缺少 SKU 或变更字段的项会被丢掉", () => {
    const payload = buildPriceQuantityPayload([
      { externalItemId: "111", skus: [{ sellerSku: "A", price: "8" }] },
      { externalItemId: "222", skus: [{ sellerSku: "B" }] },
      { externalItemId: "", skus: [{ sellerSku: "C", quantity: 1 }] },
    ])
    const products = (payload as { Request: { Product: unknown[] } }).Request.Product
    assert.equal(products.length, 1)
    const sku = ((products[0] as { Skus: { Sku: Array<Record<string, unknown>> } }).Skus.Sku[0])
    assert.equal(sku.Price, "8")
    assert.equal("Quantity" in sku, false)
  })
})

describe("chunkPriceQuantityItems", () => {
  it("按 20 个商品一批拆分", () => {
    const items = Array.from({ length: 21 }, (_, i) => ({
      externalItemId: String(i + 1),
      skus: [{ sellerSku: `S-${i}`, quantity: 1 }],
    }))
    const batches = chunkPriceQuantityItems(items)
    assert.equal(batches.length, 2)
    assert.equal(batches[0].length, 20)
    assert.equal(batches[1].length, 1)
  })
})

describe("platformSupportsPriceQuantityWrite", () => {
  it("wires Daraz / Lazada and is honest for other platforms", () => {
    assert.equal(platformSupportsPriceQuantityWrite("daraz"), true)
    assert.equal(platformSupportsPriceQuantityWrite("lazada"), true)
    assert.equal(platformSupportsPriceQuantityWrite("tiktok_shop"), false)
    assert.equal(platformSupportsPriceQuantityWrite("shopee"), false)
    assert.match(unsupportedPriceQuantityWriteMessage("tiktok_shop"), /tiktok_shop/)
    assert.match(unsupportedPriceQuantityWriteMessage("shopee"), /暂无已接入/)
  })
})
