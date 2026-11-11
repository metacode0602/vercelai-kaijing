/**
 * 种子：店铺 + 映射 + 库存余额 + 演示订单（依赖商品种子）。
 *
 * 用法（仓库根，需 DATABASE_URL；仅演示组织，手工执行，幂等）：
 *   pnpm --filter @workspace/db db:seed:commerce-products
 *   pnpm --filter @workspace/db db:seed:commerce-orders
 *   # 近 7/30/90 天订单时间序列请再跑 db:seed:commerce-dashboard（不要用增量同步假装平台成功）
 *
 * 环境变量：
 *   SHOP_DEV_ORGANIZATION_ID  可选，默认 org_shop_dev_demo
 */
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { createId } from '@paralleldrive/cuid2'
import { and, eq, or } from 'drizzle-orm'
import { createPgClient } from '../client'
import {
  inventoryBalances,
  organization,
  productVariants,
  sellerSkuMappings,
  shops,
} from '../schema'

config({ path: resolve(process.cwd(), '../../.env') })
config({ path: resolve(process.cwd(), '.env') })

const ORG_ID = process.env.SHOP_DEV_ORGANIZATION_ID?.trim() || 'org_shop_dev_demo'
const WAREHOUSE = 'WH-CN-XMN-001'

async function main() {
  const { db, pool } = createPgClient()
  try {
    const [org] = await db.select().from(organization).where(eq(organization.id, ORG_ID)).limit(1)
    if (!org) {
      throw new Error(`organization ${ORG_ID} 不存在，请先跑 db:seed:commerce-products`)
    }

    const skus = ['HSY000001001', 'HSY000001002']
    const variants: { id: string; skuCode: string }[] = []
    for (const code of skus) {
      const [row] = await db
        .select({ id: productVariants.id, skuCode: productVariants.skuCode, sku: productVariants.sku })
        .from(productVariants)
        .where(
          and(
            eq(productVariants.organizationId, ORG_ID),
            or(eq(productVariants.skuCode, code), eq(productVariants.sku, code)),
          ),
        )
        .limit(1)
      if (!row) throw new Error(`缺少 SKU ${code}，请先跑 db:seed:commerce-products`)
      variants.push({ id: row.id, skuCode: row.skuCode || row.sku })
    }

    let [shop] = await db
      .select()
      .from(shops)
      .where(
        and(eq(shops.organizationId, ORG_ID), eq(shops.externalShopId, 'dz-lk-88021')),
      )
      .limit(1)
    if (!shop) {
      const id = createId()
      await db.insert(shops).values({
        id,
        organizationId: ORG_ID,
        platform: 'daraz',
        name: 'Daraz LK · Demo',
        externalShopId: 'dz-lk-88021',
        sellerId: 'seller-demo-lk',
        status: 'active',
        region: 'LK',
        currency: 'LKR',
        marketplaceCountry: 'LK',
        fulfillmentMode: 'fbm',
      })
      ;[shop] = await db.select().from(shops).where(eq(shops.id, id)).limit(1)
      console.log('created shop Daraz LK · Demo')
    } else {
      console.log('shop exists', shop.name)
    }
    if (!shop) throw new Error('shop missing')

    for (const v of variants) {
      const [m] = await db
        .select()
        .from(sellerSkuMappings)
        .where(
          and(
            eq(sellerSkuMappings.organizationId, ORG_ID),
            eq(sellerSkuMappings.shopId, shop.id),
            eq(sellerSkuMappings.sellerSku, v.skuCode),
          ),
        )
        .limit(1)
      if (!m) {
        await db.insert(sellerSkuMappings).values({
          id: createId(),
          organizationId: ORG_ID,
          shopId: shop.id,
          sellerSku: v.skuCode,
          platformSkuId: v.skuCode,
          variantId: v.id,
          status: 'active',
          source: 'seed',
        })
        console.log(`mapping ${v.skuCode}`)
      } else {
        console.log(`mapping ${v.skuCode} exists`)
      }
    }

    const bins = [
      { sku: variants[0]!, bin: 'A-01-01', onHand: 200 },
      { sku: variants[1]!, bin: 'A-01-02', onHand: 150 },
    ]
    for (const b of bins) {
      const [bal] = await db
        .select()
        .from(inventoryBalances)
        .where(
          and(
            eq(inventoryBalances.organizationId, ORG_ID),
            eq(inventoryBalances.warehouseCode, WAREHOUSE),
            eq(inventoryBalances.binCode, b.bin),
            eq(inventoryBalances.variantId, b.sku.id),
          ),
        )
        .limit(1)
      if (!bal) {
        await db.insert(inventoryBalances).values({
          id: createId(),
          organizationId: ORG_ID,
          warehouseCode: WAREHOUSE,
          binCode: b.bin,
          variantId: b.sku.id,
          onHand: b.onHand,
          reserved: 0,
        })
        console.log(`balance ${b.sku.skuCode} @ ${b.bin} = ${b.onHand}`)
      } else {
        console.log(`balance ${b.sku.skuCode} @ ${b.bin} exists (onHand=${bal.onHand})`)
      }
    }

    console.log('\nDone. 已确保演示店铺 / 映射 / 库存余额（未调用平台同步）。')
    console.log('  若需仪表盘近 7/30/90 天订单时间序列，请再跑：')
    console.log('    pnpm --filter @workspace/db db:seed:commerce-dashboard')
    console.log(`  SHOP_DEV_ORGANIZATION_ID=${ORG_ID}`)
    console.log(`  shopId=${shop.id}`)
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
