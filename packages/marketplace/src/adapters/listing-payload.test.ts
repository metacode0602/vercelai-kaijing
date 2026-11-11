import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildCreateProductPayload,
  buildUpdateProductPayload,
  parseListingPayloadExtras,
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
