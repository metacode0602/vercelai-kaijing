/**
 * 种子：仪表盘演示时间序列（诚实写库，不调用平台同步）。
 *
 * 仅写入沙箱演示组织（id=org_shop_dev_demo 或 slug=shop-dev-demo）。
 * 禁止用于生产或已入驻真实租户；不会在入驻审核或部署流水线自动执行。请手工运行，可重复执行（幂等）。
 *
 * 依赖：commerce-products（组织 / SKU）。建议同时跑 orders / purchase / aftersales / finance：
 *   pnpm --filter @workspace/db db:seed:commerce-products
 *   pnpm --filter @workspace/db db:seed:commerce-orders
 *   pnpm --filter @workspace/db db:seed:commerce-purchase
 *   pnpm --filter @workspace/db db:seed:commerce-aftersales
 *   pnpm --filter @workspace/db db:seed:commerce-finance
 *   pnpm --filter @workspace/db db:seed:commerce-dashboard
 *
 * 环境变量：
 *   SHOP_DEV_ORGANIZATION_ID  可选，默认 org_shop_dev_demo
 *   若指向其他组织，该组织必须已是演示租户（slug=shop-dev-demo），否则拒绝写入。
 */
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { createId } from '@paralleldrive/cuid2'
import { and, eq, like } from 'drizzle-orm'
import { createPgClient } from '../client'
import {
  inventoryBalances,
  inventoryMovements,
  logisticsFeeDetails,
  orderLines,
  orders,
  organization,
  productVariants,
  reverseOrders,
  sellerSkuMappings,
  settlementLines,
  settlements,
  shops,
} from '../schema'

config({ path: resolve(process.cwd(), '../../.env') })
config({ path: resolve(process.cwd(), '.env') })

const ORG_ID = process.env.SHOP_DEV_ORGANIZATION_ID?.trim() || 'org_shop_dev_demo'
const WAREHOUSE = 'WH-CN-XMN-001'
const SEED_SOURCE = 'commerce-dashboard'
const SEED_META = { seed: true, source: 'seed', script: SEED_SOURCE }

type Db = ReturnType<typeof createPgClient>['db']

type ShopSeed = {
  externalShopId: string
  platform: string
  name: string
  region: string
  currency: string
  country: string
  unitMin: number
  unitStep: number
}

const SHOP_SEEDS: ShopSeed[] = [
  {
    externalShopId: 'dz-lk-88021',
    platform: 'daraz',
    name: 'Daraz LK · Demo',
    region: 'LK',
    currency: 'LKR',
    country: 'LK',
    unitMin: 1890,
    unitStep: 420,
  },
  {
    externalShopId: 'lz-my-99011',
    platform: 'lazada',
    name: 'Lazada MY · Demo',
    region: 'MY',
    currency: 'MYR',
    country: 'MY',
    unitMin: 29,
    unitStep: 8,
  },
  {
    externalShopId: 'lz-th-77031',
    platform: 'lazada',
    name: 'Lazada TH · JSB Demo',
    region: 'TH',
    currency: 'THB',
    country: 'TH',
    unitMin: 190,
    unitStep: 35,
  },
]

function startOfLocalDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function money(value: number): string {
  return value.toFixed(4)
}

async function assertDemoOrg(db: Db) {
  const [org] = await db.select().from(organization).where(eq(organization.id, ORG_ID)).limit(1)
  if (!org) {
    throw new Error(`organization ${ORG_ID} 不存在，请先跑 db:seed:commerce-products`)
  }
  const allowed = org.id === 'org_shop_dev_demo' || org.slug === 'shop-dev-demo'
  if (!allowed) {
    throw new Error(
      `拒绝写入非演示组织 ${ORG_ID}（需要 id=org_shop_dev_demo 或 slug=shop-dev-demo）。演示种子不得写入生产或已入驻真实租户。`,
    )
  }
  return org
}

async function ensureShop(db: Db, seed: ShopSeed) {
  const [existing] = await db
    .select()
    .from(shops)
    .where(and(eq(shops.organizationId, ORG_ID), eq(shops.externalShopId, seed.externalShopId)))
    .limit(1)
  if (existing) {
    console.log('shop exists', existing.name)
    return existing
  }
  const id = createId()
  await db.insert(shops).values({
    id,
    organizationId: ORG_ID,
    platform: seed.platform,
    name: seed.name,
    externalShopId: seed.externalShopId,
    sellerId: `seller-demo-${seed.country.toLowerCase()}`,
    status: 'active',
    region: seed.region,
    currency: seed.currency,
    marketplaceCountry: seed.country,
    fulfillmentMode: 'fbm',
    meta: SEED_META,
  })
  const [shop] = await db.select().from(shops).where(eq(shops.id, id)).limit(1)
  if (!shop) throw new Error(`failed to create shop ${seed.name}`)
  console.log('created shop', shop.name)
  return shop
}

async function ensureMapping(
  db: Db,
  shopId: string,
  variant: { id: string; skuCode: string },
) {
  const [existing] = await db
    .select()
    .from(sellerSkuMappings)
    .where(
      and(
        eq(sellerSkuMappings.organizationId, ORG_ID),
        eq(sellerSkuMappings.shopId, shopId),
        eq(sellerSkuMappings.sellerSku, variant.skuCode),
      ),
    )
    .limit(1)
  if (existing) return
  await db.insert(sellerSkuMappings).values({
    id: createId(),
    organizationId: ORG_ID,
    shopId,
    sellerSku: variant.skuCode,
    platformSkuId: variant.skuCode,
    variantId: variant.id,
    status: 'active',
    source: 'seed',
  })
  console.log(`mapping ${variant.skuCode} @ ${shopId}`)
}

async function ensureBalance(
  db: Db,
  variant: { id: string; skuCode: string },
  bin: string,
  onHand: number,
) {
  const [existing] = await db
    .select()
    .from(inventoryBalances)
    .where(
      and(
        eq(inventoryBalances.organizationId, ORG_ID),
        eq(inventoryBalances.warehouseCode, WAREHOUSE),
        eq(inventoryBalances.binCode, bin),
        eq(inventoryBalances.variantId, variant.id),
      ),
    )
    .limit(1)
  if (existing) {
    if (existing.onHand !== onHand && bin === 'A-01-03') {
      await db
        .update(inventoryBalances)
        .set({ onHand, reserved: 0 })
        .where(eq(inventoryBalances.id, existing.id))
      console.log(`balance ${variant.skuCode} @ ${bin} updated to ${onHand}`)
    } else {
      console.log(`balance ${variant.skuCode} @ ${bin} exists (onHand=${existing.onHand})`)
    }
    return
  }
  await db.insert(inventoryBalances).values({
    id: createId(),
    organizationId: ORG_ID,
    warehouseCode: WAREHOUSE,
    binCode: bin,
    variantId: variant.id,
    onHand,
    reserved: 0,
  })
  console.log(`balance ${variant.skuCode} @ ${bin} = ${onHand}`)
}

function planStatus(offset: number, seq: number): {
  status: string
  fulfillmentStatus: string
  isCancelPending: boolean
} {
  if (offset <= 10 && (offset + seq) % 5 === 0) {
    return { status: 'ready_to_ship', fulfillmentStatus: 'ready_to_ship', isCancelPending: false }
  }
  if (offset <= 20 && (offset + seq) % 7 === 0) {
    return { status: 'paid', fulfillmentStatus: 'unfulfilled', isCancelPending: false }
  }
  if ((offset + seq) % 11 === 0) {
    return { status: 'cancel_pending', fulfillmentStatus: 'unfulfilled', isCancelPending: true }
  }
  return { status: 'shipped', fulfillmentStatus: 'shipped', isCancelPending: false }
}

function ordersPerShop(country: string, offset: number): number {
  if (country === 'LK') {
    if (offset < 7) return 3
    if (offset < 30) return 2
    return offset % 2 === 0 ? 1 : 2
  }
  if (country === 'MY') return offset % 3 === 0 ? 1 : 0
  return offset % 5 === 0 ? 1 : 0
}

async function upsertDashboardOrder(
  db: Db,
  shop: { id: string },
  shopSeed: ShopSeed,
  variant: { id: string; skuCode: string },
  offset: number,
  seq: number,
) {
  const externalOrderId = `SEED-DASH-${shopSeed.country}-D${String(offset).padStart(3, '0')}-${seq}`
  const day = addDays(startOfLocalDay(new Date()), -offset)
  const placedAt = new Date(day)
  placedAt.setHours(10 + seq, 15 + (offset % 20), 0, 0)
  const qty = 1 + ((offset + seq) % 3)
  const unit = shopSeed.unitMin + ((offset + seq) % 5) * shopSeed.unitStep
  const total = unit * qty
  const planned = planStatus(offset, seq)

  const [existing] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.shopId, shop.id), eq(orders.externalOrderId, externalOrderId)))
    .limit(1)

  let orderId = existing?.id
  let lineId: string | undefined

  if (existing) {
    await db
      .update(orders)
      .set({
        placedAt,
        paidAt: placedAt,
        platformUpdatedAt: placedAt,
        status: planned.status,
        platformStatus: planned.status,
        fulfillmentStatus: planned.fulfillmentStatus,
        isCancelPending: planned.isCancelPending,
        currency: shopSeed.currency,
        totalAmount: money(total),
        raw: { ...SEED_META, dayOffset: offset },
      })
      .where(eq(orders.id, existing.id))
    const [line] = await db.select().from(orderLines).where(eq(orderLines.orderId, existing.id)).limit(1)
    if (line) {
      lineId = line.id
      await db
        .update(orderLines)
        .set({
          qty,
          unitPrice: money(unit),
          paidPrice: money(unit),
          fulfillmentStatus: planned.fulfillmentStatus,
          platformStatus: planned.status,
        })
        .where(eq(orderLines.id, line.id))
    }
  } else {
    orderId = createId()
    lineId = createId()
    await db.insert(orders).values({
      id: orderId,
      organizationId: ORG_ID,
      shopId: shop.id,
      externalOrderId,
      orderNumber: externalOrderId,
      status: planned.status,
      platformStatus: planned.status,
      fulfillmentStatus: planned.fulfillmentStatus,
      placedAt,
      paidAt: placedAt,
      platformUpdatedAt: placedAt,
      currency: shopSeed.currency,
      totalAmount: money(total),
      isCancelPending: planned.isCancelPending,
      raw: { ...SEED_META, dayOffset: offset },
    })
    await db.insert(orderLines).values({
      id: lineId,
      orderId,
      organizationId: ORG_ID,
      externalLineId: `${externalOrderId}-1`,
      shopSku: variant.skuCode,
      sku: variant.skuCode,
      sellerSku: variant.skuCode,
      title: `Demo ${variant.skuCode}`,
      qty,
      unitPrice: money(unit),
      paidPrice: money(unit),
      variantId: variant.id,
      fulfillmentStatus: planned.fulfillmentStatus,
      platformStatus: planned.status,
    })
  }

  if (!orderId) throw new Error(`missing order ${externalOrderId}`)

  if (planned.fulfillmentStatus === 'shipped') {
    const idempotencyKey = `seed:dashboard:mv:${externalOrderId}`
    const [mv] = await db
      .select({ id: inventoryMovements.id })
      .from(inventoryMovements)
      .where(
        and(eq(inventoryMovements.organizationId, ORG_ID), eq(inventoryMovements.idempotencyKey, idempotencyKey)),
      )
      .limit(1)
    if (!mv) {
      await db.insert(inventoryMovements).values({
        id: createId(),
        organizationId: ORG_ID,
        shopId: shop.id,
        variantId: variant.id,
        warehouseCode: WAREHOUSE,
        binCode: 'A-01-01',
        movementType: 'order_ship',
        qtyDelta: -qty,
        onHandAfter: 0,
        reservedAfter: 0,
        sourceType: 'seed',
        sourceId: orderId,
        operator: 'seed',
        idempotencyKey,
        occurredAt: placedAt,
        raw: SEED_META,
      })
    } else {
      await db
        .update(inventoryMovements)
        .set({ qtyDelta: -qty, occurredAt: placedAt, sourceId: orderId })
        .where(eq(inventoryMovements.id, mv.id))
    }
  }

  return { orderId, lineId, externalOrderId, planned, total, placedAt, qty }
}

async function ensureLogisticsFee(
  db: Db,
  shopId: string,
  order: { orderId: string; externalOrderId: string; total: number; placedAt: Date },
  currency: string,
) {
  const [existing] = await db
    .select({ id: logisticsFeeDetails.id })
    .from(logisticsFeeDetails)
    .where(
      and(
        eq(logisticsFeeDetails.organizationId, ORG_ID),
        eq(logisticsFeeDetails.orderId, order.orderId),
        eq(logisticsFeeDetails.feeCode, 'SEED_SHIP'),
      ),
    )
    .limit(1)
  if (existing) return
  const amount = Math.max(1, Math.round(order.total * 0.06 * 100) / 100)
  await db.insert(logisticsFeeDetails).values({
    id: createId(),
    organizationId: ORG_ID,
    shopId,
    orderId: order.orderId,
    externalOrderId: order.externalOrderId,
    feeCode: 'SEED_SHIP',
    feeName: '演示尾程运费（种子）',
    amount: money(amount),
    currency,
    feeCreatedAt: order.placedAt,
    raw: SEED_META,
  })
}

async function ensureCommissionLine(
  db: Db,
  settlementId: string,
  order: { orderId: string; externalOrderId: string; total: number },
  currency: string,
) {
  const txn = `SEED-DASH-COMM-${order.externalOrderId}`
  const [existing] = await db
    .select({ id: settlementLines.id })
    .from(settlementLines)
    .where(
      and(eq(settlementLines.organizationId, ORG_ID), eq(settlementLines.externalTransactionId, txn)),
    )
    .limit(1)
  if (existing) return
  const amount = Math.max(1, Math.round(order.total * 0.08 * 100) / 100)
  await db.insert(settlementLines).values({
    id: createId(),
    settlementId,
    organizationId: ORG_ID,
    orderId: order.orderId,
    feeKind: 'platform',
    feeType: 'commission',
    feeName: '演示平台佣金（种子）',
    amount: money(amount),
    currency,
    externalTransactionId: txn,
    externalOrderNo: order.externalOrderId,
    note: 'seed',
  })
}

async function ensureDashSettlement(db: Db, shopId: string, currency: string) {
  const extId = 'SEED-DASH-SETTLE-LK'
  const [existing] = await db
    .select()
    .from(settlements)
    .where(and(eq(settlements.shopId, shopId), eq(settlements.externalSettlementId, extId)))
    .limit(1)
  if (existing) return existing
  const id = createId()
  const today = startOfLocalDay(new Date())
  await db.insert(settlements).values({
    id,
    organizationId: ORG_ID,
    shopId,
    externalSettlementId: extId,
    periodStart: addDays(today, -14),
    periodEnd: today,
    currency,
    payoutStatus: 'pending',
    status: 'open',
    platformUpdatedAt: today,
    raw: { ...SEED_META, note: '仪表盘种子结算，非平台 API' },
  })
  const [row] = await db.select().from(settlements).where(eq(settlements.id, id)).limit(1)
  if (!row) throw new Error('failed to create dashboard settlement')
  console.log('settlement', extId)
  return row
}

async function ensurePendingReverse(
  db: Db,
  shopId: string,
  order: { orderId: string; externalOrderId: string; lineId?: string; placedAt: Date },
) {
  const externalReverseOrderId = `SEED-DASH-RO-${order.externalOrderId}`
  const [existing] = await db
    .select({ id: reverseOrders.id })
    .from(reverseOrders)
    .where(
      and(eq(reverseOrders.shopId, shopId), eq(reverseOrders.externalReverseOrderId, externalReverseOrderId)),
    )
    .limit(1)
  if (existing) return
  await db.insert(reverseOrders).values({
    id: createId(),
    organizationId: ORG_ID,
    shopId,
    externalReverseOrderId,
    orderId: order.orderId,
    externalTradeOrderId: order.externalOrderId,
    requestType: 'RETURN',
    platformStatus: 'pending',
    fulfillmentStatus: 'pending',
    platformCreatedAt: order.placedAt,
    platformUpdatedAt: order.placedAt,
    raw: SEED_META,
  })
  console.log('reverse_order', externalReverseOrderId)
}

async function main() {
  const { db, pool } = createPgClient()
  try {
    await assertDemoOrg(db)

    const variantRows = await db
      .select({ id: productVariants.id, skuCode: productVariants.skuCode, sku: productVariants.sku })
      .from(productVariants)
      .where(eq(productVariants.organizationId, ORG_ID))
    const variants = variantRows.map((row) => ({ id: row.id, skuCode: row.skuCode || row.sku }))
    if (variants.length === 0) {
      throw new Error('缺少 SKU，请先跑 db:seed:commerce-products')
    }

    const ensuredShops = []
    for (const seed of SHOP_SEEDS) {
      const shop = await ensureShop(db, seed)
      for (const variant of variants) {
        await ensureMapping(db, shop.id, variant)
      }
      ensuredShops.push({ shop, seed })
    }

    const primary = variants[0]!
    const lowStock =
      variants.find((v) => v.skuCode === 'HSY000002001') ?? variants[variants.length - 1]!
    await ensureBalance(db, primary, 'A-01-01', 200)
    if (variants[1]) await ensureBalance(db, variants[1], 'A-01-02', 150)
    await ensureBalance(db, lowStock, 'A-01-03', 12)

    let createdOrUpdated = 0
    const lkShipped: Array<{
      orderId: string
      externalOrderId: string
      total: number
      placedAt: Date
      lineId?: string
    }> = []
    let pendingReverse: {
      orderId: string
      externalOrderId: string
      lineId?: string
      placedAt: Date
    } | null = null

    for (const { shop, seed } of ensuredShops) {
      for (let offset = 0; offset < 90; offset++) {
        const count = ordersPerShop(seed.country, offset)
        for (let seq = 1; seq <= count; seq++) {
          const variant = variants[(offset + seq) % variants.length]!
          const row = await upsertDashboardOrder(db, shop, seed, variant, offset, seq)
          createdOrUpdated += 1
          if (seed.country === 'LK' && row.planned.fulfillmentStatus === 'shipped') {
            lkShipped.push({
              orderId: row.orderId,
              externalOrderId: row.externalOrderId,
              total: row.total,
              placedAt: row.placedAt,
              lineId: row.lineId,
            })
          }
          if (!pendingReverse && seed.country === 'LK' && offset === 3 && !row.planned.isCancelPending) {
            pendingReverse = {
              orderId: row.orderId,
              externalOrderId: row.externalOrderId,
              lineId: row.lineId,
              placedAt: row.placedAt,
            }
          }
        }
      }
    }

    const lkShop = ensuredShops.find((s) => s.seed.country === 'LK')!
    const settlement = await ensureDashSettlement(db, lkShop.shop.id, lkShop.seed.currency)
    const feeTargets = lkShipped.filter((_, index) => index % 3 === 0).slice(0, 40)
    for (const order of feeTargets) {
      await ensureLogisticsFee(db, lkShop.shop.id, order, lkShop.seed.currency)
      await ensureCommissionLine(db, settlement.id, order, lkShop.seed.currency)
    }

    if (pendingReverse) {
      await ensurePendingReverse(db, lkShop.shop.id, pendingReverse)
    }

    const [seedOrderCount] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.organizationId, ORG_ID), like(orders.externalOrderId, 'SEED-DASH-%')))

    console.log('\nDone. 仪表盘演示种子已写入（诚实 seed，未调用平台同步）。')
    console.log(`  SHOP_DEV_ORGANIZATION_ID=${ORG_ID}`)
    console.log(`  upserted_orders=${createdOrUpdated}`)
    console.log(`  low_stock_sku=${lowStock.skuCode} available=12`)
    console.log('  可重复执行；记录 raw.seed / source=seed，店铺名保持「· Demo」。')
    if (seedOrderCount) {
      console.log(`  sample=${seedOrderCount.id}`)
    }
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
