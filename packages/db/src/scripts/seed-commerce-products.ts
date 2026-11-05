/**
 * 种子：跨境 ERP 演示组织 + 若干 SPU / 内部 SKU。
 *
 * 用法（仓库根，需 DATABASE_URL）：
 *   pnpm --filter @workspace/db db:seed:commerce-products
 *
 * 环境变量：
 *   SHOP_DEV_ORGANIZATION_ID  可选，默认 org_shop_dev_demo
 */
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { createId } from '@paralleldrive/cuid2'
import { and, eq, isNull } from 'drizzle-orm'
import { createPgClient } from '../client'
import { organization, productVariants, products } from '../schema'

config({ path: resolve(process.cwd(), '../../.env') })
config({ path: resolve(process.cwd(), '.env') })

const ORG_ID = process.env.SHOP_DEV_ORGANIZATION_ID?.trim() || 'org_shop_dev_demo'

const SEED_PRODUCTS = [
  {
    spu: 'HSY000001',
    title: '基础圆领短袖 T 恤',
    brand: 'HELLO COSMOS',
    category: '服装 / 上衣 / T恤',
    material: '棉',
    style: '宽松',
    owner: '杨洁',
    status: 'active',
    variants: [
      { code: 'HSY000001001', color: '黑色', size: 'L', pack: '单件', barcode: '6900000000011', weight: 220 },
      { code: 'HSY000001002', color: '白色', size: 'L', pack: '单件', barcode: '6900000000012', weight: 220 },
    ],
  },
  {
    spu: 'HSY000002',
    title: '轻薄防晒外套',
    brand: 'LinkForge',
    category: '服装 / 外套',
    material: '尼龙',
    style: '修身',
    owner: '杨洁',
    status: 'draft',
    variants: [
      { code: 'HSY000002001', color: '深灰色', size: 'XL', pack: '单件', barcode: '6900000000021', weight: 380 },
    ],
  },
] as const

async function main() {
  const { db, pool } = createPgClient()
  try {
    const [org] = await db.select().from(organization).where(eq(organization.id, ORG_ID)).limit(1)
    if (!org) {
      await db.insert(organization).values({
        id: ORG_ID,
        name: 'Open Shop 演示租户',
        slug: 'shop-dev-demo',
        createdAt: new Date(),
        orgType: 'tenant',
        status: 'active',
        entryApproved: true,
      })
      console.log(`created organization ${ORG_ID}`)
    } else {
      console.log(`organization ${ORG_ID} exists`)
    }

    for (const seed of SEED_PRODUCTS) {
      const [existing] = await db
        .select({ id: products.id })
        .from(products)
        .where(
          and(
            eq(products.organizationId, ORG_ID),
            eq(products.spuCode, seed.spu),
            isNull(products.deletedAt),
          ),
        )
        .limit(1)

      let productId = existing?.id
      if (!productId) {
        productId = createId()
        await db.insert(products).values({
          id: productId,
          organizationId: ORG_ID,
          spuCode: seed.spu,
          title: seed.title,
          status: seed.status,
          source: 'manual',
          brand: seed.brand,
          categoryHint: seed.category,
          material: seed.material,
          style: seed.style,
          images: [],
          payload: { ownerName: seed.owner },
        })
        console.log(`created product ${seed.spu}`)
      } else {
        console.log(`product ${seed.spu} exists`)
      }

      for (const variant of seed.variants) {
        const [v] = await db
          .select({ id: productVariants.id })
          .from(productVariants)
          .where(
            and(
              eq(productVariants.organizationId, ORG_ID),
              eq(productVariants.skuCode, variant.code),
            ),
          )
          .limit(1)
        if (v) {
          console.log(`  sku ${variant.code} exists`)
          continue
        }
        await db.insert(productVariants).values({
          id: createId(),
          organizationId: ORG_ID,
          productId,
          sku: variant.code,
          skuCode: variant.code,
          barcode: variant.barcode,
          status: 'active',
          weightGrams: variant.weight,
          attrs: {
            color: variant.color,
            size: variant.size,
            pack: variant.pack,
            images: [],
          },
        })
        console.log(`  created sku ${variant.code}`)
      }
    }

    console.log('\nDone.')
    console.log(`Export for apps/shop .env:`)
    console.log(`  SHOP_DEV_ORGANIZATION_ID=${ORG_ID}`)
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
