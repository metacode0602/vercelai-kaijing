/**
 * 种子：店铺 + listings + seller_sku_mappings + mapping_exceptions（依赖商品种子）。
 *
 * 用法（仓库根，需 DATABASE_URL）：
 *   pnpm --filter @workspace/db db:seed:commerce-products
 *   pnpm --filter @workspace/db db:seed:commerce-listings
 *
 * 环境变量：
 *   SHOP_DEV_ORGANIZATION_ID  可选，默认 org_shop_dev_demo
 */
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { createId } from '@paralleldrive/cuid2'
import { and, eq, isNull, or } from 'drizzle-orm'
import { createPgClient } from '../client'
import {
  listings,
  mappingExceptions,
  organization,
  productVariants,
  products,
  sellerSkuMappings,
  shops,
} from '../schema'

config({ path: resolve(process.cwd(), '../../.env') })
config({ path: resolve(process.cwd(), '.env') })

const ORG_ID = process.env.SHOP_DEV_ORGANIZATION_ID?.trim() || 'org_shop_dev_demo'

const SHOP_SEEDS = [
  {
    key: 'daraz-lk',
    platform: 'daraz',
    name: 'Daraz LK · Demo',
    externalShopId: 'dz-lk-88021',
    sellerId: 'seller-demo-lk',
    region: 'LK',
    currency: 'LKR',
    marketplaceCountry: 'LK',
  },
  {
    key: 'lazada-my',
    platform: 'lazada',
    name: 'Lazada MY · Sandbox',
    externalShopId: 'lz-my-22011',
    sellerId: 'seller-demo-my',
    region: 'MY',
    currency: 'MYR',
    marketplaceCountry: 'MY',
  },
] as const

async function ensureShop(
  db: ReturnType<typeof createPgClient>['db'],
  seed: (typeof SHOP_SEEDS)[number],
) {
  let [shop] = await db
    .select()
    .from(shops)
    .where(
      and(eq(shops.organizationId, ORG_ID), eq(shops.externalShopId, seed.externalShopId)),
    )
    .limit(1)
  if (!shop) {
    const id = createId()
    await db.insert(shops).values({
      id,
      organizationId: ORG_ID,
      platform: seed.platform,
      name: seed.name,
      externalShopId: seed.externalShopId,
      sellerId: seed.sellerId,
      status: 'active',
      region: seed.region,
      currency: seed.currency,
      marketplaceCountry: seed.marketplaceCountry,
      fulfillmentMode: 'fbm',
    })
    ;[shop] = await db.select().from(shops).where(eq(shops.id, id)).limit(1)
    console.log(`created shop ${seed.name}`)
  } else {
    console.log(`shop exists ${shop.name}`)
  }
  if (!shop) throw new Error(`shop missing ${seed.name}`)
  return shop
}

async function main() {
  const { db, pool } = createPgClient()
  try {
    const [org] = await db.select().from(organization).where(eq(organization.id, ORG_ID)).limit(1)
    if (!org) {
      throw new Error(`organization ${ORG_ID} 不存在，请先跑 db:seed:commerce-products`)
    }

    const skuCodes = ['HSY000001001', 'HSY000001002', 'HSY000002001']
    const variantByCode = new Map<
      string,
      { id: string; skuCode: string; productId: string; spuCode: string }
    >()
    for (const code of skuCodes) {
      const [variant] = await db
        .select({
          id: productVariants.id,
          skuCode: productVariants.skuCode,
          sku: productVariants.sku,
          productId: productVariants.productId,
        })
        .from(productVariants)
        .where(
          and(
            eq(productVariants.organizationId, ORG_ID),
            or(eq(productVariants.skuCode, code), eq(productVariants.sku, code)),
          ),
        )
        .limit(1)
      if (!variant) throw new Error(`缺少 SKU ${code}，请先跑 db:seed:commerce-products`)
      const [product] = await db
        .select({ spuCode: products.spuCode })
        .from(products)
        .where(and(eq(products.id, variant.productId), isNull(products.deletedAt)))
        .limit(1)
      variantByCode.set(code, {
        id: variant.id,
        skuCode: variant.skuCode || variant.sku,
        productId: variant.productId,
        spuCode: product?.spuCode || code.slice(0, 9),
      })
    }

    const shopDaraz = await ensureShop(db, SHOP_SEEDS[0])
    const shopLazada = await ensureShop(db, SHOP_SEEDS[1])

    const listingSeeds = [
      {
        key: 'lst-daraz-tee-blk',
        shop: shopDaraz,
        sku: 'HSY000001001',
        sellerSku: 'TEE-BLK-L-LK',
        title: 'Oversized Cotton Tee · Black L (Daraz LK)',
        status: 'live',
        publishState: 'published',
        price: '12.9000',
        currency: 'USD',
        externalItemId: 'LK-ITEM-5201',
        platformSkuId: 'LK-SKU-5201-BLK-L',
        brandName: 'HELLO COSMOS',
        categoryPath: 'Fashion > Men > T-Shirts',
        stockOnHand: 46,
        warehouseCode: 'WH-CN-XMN-001',
        logisticsChannel: 'Daraz Logistics',
        mappingStatus: 'active',
        color: 'Black',
        size: 'L',
      },
      {
        key: 'lst-daraz-hub',
        shop: shopDaraz,
        sku: 'HSY000002001',
        sellerSku: 'DZ-HUB-01',
        title: 'USB-C Hub 7-in-1 · Standard (Daraz LK)',
        status: 'live',
        publishState: 'published',
        price: '24.5000',
        currency: 'USD',
        externalItemId: 'LK-ITEM-9011',
        platformSkuId: 'LK-SKU-9011-01',
        brandName: 'LinkForge',
        categoryPath: 'Electronics > Computer Accessories > Hubs',
        stockOnHand: 85,
        warehouseCode: 'WH-CN-XMN-001',
        logisticsChannel: 'Daraz Logistics',
        mappingStatus: 'active',
        color: 'Grey',
        size: 'Standard',
      },
      {
        key: 'lst-lazada-tee-wht',
        shop: shopLazada,
        sku: 'HSY000001002',
        sellerSku: 'TEE-WHT-L',
        title: 'Oversized Cotton Tee · White L (Lazada MY)',
        status: 'draft',
        publishState: 'unpublished',
        price: '39.9000',
        currency: 'MYR',
        externalItemId: null,
        platformSkuId: null,
        brandName: 'HELLO COSMOS',
        categoryPath: 'Fashion > Men > T-Shirts',
        stockOnHand: 0,
        warehouseCode: 'WH-CN-XMN-001',
        logisticsChannel: 'Lazada LGS',
        mappingStatus: 'pending',
        color: 'White',
        size: 'L',
      },
      {
        key: 'lst-lazada-failed',
        shop: shopLazada,
        sku: 'HSY000001001',
        sellerSku: 'TEE-BLK-L',
        title: 'Oversized Cotton Tee · Black L (Lazada MY · 属性缺失示例)',
        status: 'failed',
        publishState: 'sync_failed',
        price: '42.0000',
        currency: 'MYR',
        externalItemId: 'MY-ITEM-8802',
        platformSkuId: 'MY-SKU-8802-BLK-L',
        brandName: 'HELLO COSMOS',
        categoryPath: 'Fashion > Men > T-Shirts',
        stockOnHand: 12,
        warehouseCode: 'WH-CN-XMN-001',
        logisticsChannel: 'Lazada LGS',
        mappingStatus: 'exception',
        color: 'Black',
        size: 'L',
        lastError: '类目属性缺失（seed 示例）',
      },
    ] as const

    for (const seed of listingSeeds) {
      const variant = variantByCode.get(seed.sku)!
      let [listing] = await db
        .select()
        .from(listings)
        .where(
          and(
            eq(listings.organizationId, ORG_ID),
            eq(listings.shopId, seed.shop.id),
            eq(listings.primaryVariantId, variant.id),
            eq(listings.title, seed.title),
          ),
        )
        .limit(1)

      if (!listing && seed.externalItemId) {
        ;[listing] = await db
          .select()
          .from(listings)
          .where(
            and(
              eq(listings.organizationId, ORG_ID),
              eq(listings.shopId, seed.shop.id),
              eq(listings.externalItemId, seed.externalItemId),
            ),
          )
          .limit(1)
      }

      if (!listing) {
        const id = createId()
        const now = new Date()
        await db.insert(listings).values({
          id,
          organizationId: ORG_ID,
          shopId: seed.shop.id,
          productId: variant.productId,
          variantId: variant.id,
          primaryVariantId: variant.id,
          status: seed.status,
          title: seed.title,
          listingTitle: seed.title,
          externalItemId: seed.externalItemId,
          brandName: seed.brandName,
          categoryPath: seed.categoryPath,
          priceAmount: seed.price,
          priceCurrency: seed.currency,
          stockOnHand: seed.stockOnHand,
          warehouseCode: seed.warehouseCode,
          logisticsChannel: seed.logisticsChannel,
          publishState: seed.publishState,
          lastError: 'lastError' in seed ? seed.lastError : null,
          payload: {
            note: 'commerce-listings seed',
            sellerSku: seed.sellerSku,
            primarySku: variant.skuCode,
            spuCode: variant.spuCode,
            shopName: seed.shop.name,
            platform: seed.shop.platform,
            site: seed.shop.marketplaceCountry,
            seedKey: seed.key,
          },
          submittedAt: seed.status === 'draft' ? null : now,
          liveAt: seed.status === 'live' ? now : null,
        })
        ;[listing] = await db.select().from(listings).where(eq(listings.id, id)).limit(1)
        console.log(`created listing ${seed.key}`)
      } else {
        console.log(`listing exists ${seed.key}`)
      }
      if (!listing) throw new Error(`listing missing ${seed.key}`)

      const [mapping] = await db
        .select()
        .from(sellerSkuMappings)
        .where(
          and(
            eq(sellerSkuMappings.organizationId, ORG_ID),
            eq(sellerSkuMappings.shopId, seed.shop.id),
            eq(sellerSkuMappings.sellerSku, seed.sellerSku),
          ),
        )
        .limit(1)
      if (!mapping) {
        await db.insert(sellerSkuMappings).values({
          id: createId(),
          organizationId: ORG_ID,
          shopId: seed.shop.id,
          listingId: listing.id,
          itemId: seed.externalItemId,
          platformSkuId: seed.platformSkuId,
          sellerSku: seed.sellerSku,
          variantId: variant.id,
          status: seed.mappingStatus,
          source: 'seed',
          meta: {
            color: seed.color,
            size: seed.size,
            listingStatus: seed.status === 'live' ? '在线' : seed.status === 'draft' ? '草稿' : '待同步',
            site: seed.shop.marketplaceCountry,
            platform: seed.shop.platform,
            internalSku: variant.skuCode,
            seedKey: seed.key,
          },
        })
        console.log(`  mapping ${seed.sellerSku}`)
      } else {
        // 绑定 listingId（若订单种子已建映射）
        if (!mapping.listingId) {
          await db
            .update(sellerSkuMappings)
            .set({ listingId: listing.id, updatedAt: new Date() })
            .where(eq(sellerSkuMappings.id, mapping.id))
          console.log(`  mapping ${seed.sellerSku} linked to listing`)
        } else {
          console.log(`  mapping ${seed.sellerSku} exists`)
        }
      }
    }

    // 未映射异常示例（阻断占库）
    const [exOpen] = await db
      .select()
      .from(mappingExceptions)
      .where(
        and(
          eq(mappingExceptions.organizationId, ORG_ID),
          eq(mappingExceptions.sellerSku, 'TEE-OLD-BLACK'),
          eq(mappingExceptions.status, 'open'),
        ),
      )
      .limit(1)
    if (!exOpen) {
      await db.insert(mappingExceptions).values({
        id: createId(),
        organizationId: ORG_ID,
        shopId: shopDaraz.id,
        sellerSku: 'TEE-OLD-BLACK',
        platformSkuId: 'LK-SKU-9011-OLD',
        externalOrderId: 'DZ-10031',
        reason: 'unmapped',
        detail: '平台订单行 Seller SKU 在本店无启用映射',
        status: 'open',
        meta: {
          shop: shopDaraz.name,
          platform: 'daraz',
          order: 'DZ-10031',
          itemId: 'LK-ITEM-9901',
          internalSku: '—',
          blocksReservation: true,
          payloadSummary: '平台订单行 Seller SKU 在本店无启用映射',
        },
      })
      console.log('created mapping exception TEE-OLD-BLACK')
    } else {
      console.log('mapping exception TEE-OLD-BLACK exists')
    }

    const [exDisabled] = await db
      .select()
      .from(mappingExceptions)
      .where(
        and(
          eq(mappingExceptions.organizationId, ORG_ID),
          eq(mappingExceptions.externalOrderId, 'LZ-2201'),
        ),
      )
      .limit(1)
    if (!exDisabled) {
      await db.insert(mappingExceptions).values({
        id: createId(),
        organizationId: ORG_ID,
        shopId: shopLazada.id,
        sellerSku: 'TEE-BLK-L',
        platformSkuId: 'MY-SKU-8802-BLK-L',
        externalOrderId: 'LZ-2201',
        reason: 'disabled_variant',
        detail: '内部 SKU 状态异常或映射标记异常，禁止自动占库（seed）',
        status: 'open',
        meta: {
          shop: shopLazada.name,
          platform: 'lazada',
          order: 'LZ-2201',
          itemId: 'MY-ITEM-8802',
          internalSku: 'HSY000001001',
          blocksReservation: true,
          payloadSummary: '映射状态异常，禁止自动占库',
        },
      })
      console.log('created mapping exception LZ-2201')
    } else {
      console.log('mapping exception LZ-2201 exists')
    }

    console.log('\nDone.')
    console.log(`  SHOP_DEV_ORGANIZATION_ID=${ORG_ID}`)
    console.log(`  shops: ${shopDaraz.id}, ${shopLazada.id}`)
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
