/**
 * 种子：LGS/JSB 履约包裹 + 轨迹 + 交接批次（依赖模块1–3）。
 *
 * 用法（仓库根，需 DATABASE_URL；先 migrate 0011）：
 *   pnpm --filter @workspace/db db:seed:commerce-products
 *   pnpm --filter @workspace/db db:seed:commerce-orders
 *   pnpm --filter @workspace/db db:seed:commerce-logistics
 *
 * 环境变量：
 *   SHOP_DEV_ORGANIZATION_ID  可选，默认 org_shop_dev_demo
 */
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { createId } from '@paralleldrive/cuid2'
import { and, eq } from 'drizzle-orm'
import { createPgClient } from '../client'
import {
  fulfillmentBatchPackages,
  fulfillmentBatches,
  orderLines,
  orders,
  organization,
  productVariants,
  shipments,
  shipmentItems,
  shops,
  trackingEvents,
} from '../schema'

config({ path: resolve(process.cwd(), '../../.env') })
config({ path: resolve(process.cwd(), '.env') })

const ORG_ID = process.env.SHOP_DEV_ORGANIZATION_ID?.trim() || 'org_shop_dev_demo'
const WAREHOUSE = 'WH-CN-XMN-001'

type ShopSeed = {
  externalShopId: string
  platform: string
  name: string
  region: string
  currency: string
  country: string
  providerType: string
  providerCode: string
  providerName: string
}

const SHOP_SEEDS: ShopSeed[] = [
  {
    externalShopId: 'lz-my-99011',
    platform: 'lazada',
    name: 'Lazada MY · Demo',
    region: 'MY',
    currency: 'MYR',
    country: 'MY',
    providerType: 'lgs',
    providerCode: 'LGS-MY',
    providerName: 'Lazada Logistics',
  },
  {
    externalShopId: 'dz-lk-88021',
    platform: 'daraz',
    name: 'Daraz LK · Demo',
    region: 'LK',
    currency: 'LKR',
    country: 'LK',
    providerType: 'platform',
    providerCode: 'DARAZ-LK',
    providerName: 'Daraz Logistics',
  },
  {
    externalShopId: 'lz-th-77031',
    platform: 'lazada',
    name: 'Lazada TH · JSB Demo',
    region: 'TH',
    currency: 'THB',
    country: 'TH',
    providerType: 'jsb',
    providerCode: 'JSB-TH',
    providerName: 'JSB',
  },
]

async function ensureShop(
  db: ReturnType<typeof createPgClient>['db'],
  seed: ShopSeed,
) {
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
    sellerId: `seller-demo-${seed.region.toLowerCase()}`,
    status: 'active',
    region: seed.region,
    currency: seed.currency,
    marketplaceCountry: seed.country,
    fulfillmentMode: 'fbm',
    shopGroup: seed.platform === 'lazada' ? 'lazada-sea' : 'daraz',
  })
  const [row] = await db.select().from(shops).where(eq(shops.id, id)).limit(1)
  console.log('created shop', seed.name)
  return row!
}

async function ensureOrderWithLine(
  db: ReturnType<typeof createPgClient>['db'],
  shopId: string,
  externalOrderId: string,
  variant: { id: string; skuCode: string },
  currency: string,
) {
  const [existing] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.shopId, shopId), eq(orders.externalOrderId, externalOrderId)))
    .limit(1)
  if (existing) {
    const [line] = await db
      .select()
      .from(orderLines)
      .where(eq(orderLines.orderId, existing.id))
      .limit(1)
    return { order: existing, line: line! }
  }
  const orderId = createId()
  const now = new Date()
  await db.insert(orders).values({
    id: orderId,
    organizationId: ORG_ID,
    shopId,
    externalOrderId,
    orderNumber: externalOrderId,
    status: 'shipped',
    platformStatus: 'shipped',
    fulfillmentStatus: 'shipped',
    placedAt: now,
    paidAt: now,
    platformUpdatedAt: now,
    currency,
    totalAmount: '59.9000',
    raw: { seed: 'commerce-logistics' },
  })
  const lineId = createId()
  await db.insert(orderLines).values({
    id: lineId,
    orderId,
    organizationId: ORG_ID,
    externalLineId: `${externalOrderId}-1`,
    shopSku: variant.skuCode,
    sku: variant.skuCode,
    sellerSku: variant.skuCode,
    title: `Demo ${variant.skuCode}`,
    qty: 1,
    unitPrice: '59.9000',
    paidPrice: '59.9000',
    variantId: variant.id,
    fulfillmentStatus: 'shipped',
    platformStatus: 'shipped',
  })
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
  const [line] = await db.select().from(orderLines).where(eq(orderLines.id, lineId)).limit(1)
  console.log('created order', externalOrderId)
  return { order: order!, line: line! }
}

async function ensureShipment(opts: {
  db: ReturnType<typeof createPgClient>['db']
  shopId: string
  orderId: string
  lineId: string
  externalPackageId: string
  trackingNumber: string
  providerType: string
  providerCode: string
  providerName: string
  status: string
  events: Array<{
    statusCode: string
    title: string
    description?: string
    location?: string
    source: 'api' | 'manual' | 'import'
    hoursAgo: number
  }>
}) {
  const { db } = opts
  const [existing] = await db
    .select()
    .from(shipments)
    .where(
      and(eq(shipments.shopId, opts.shopId), eq(shipments.externalPackageId, opts.externalPackageId)),
    )
    .limit(1)
  let shipmentId = existing?.id
  if (!existing) {
    shipmentId = createId()
    const shippedAt = new Date(Date.now() - 48 * 3600_000)
    await db.insert(shipments).values({
      id: shipmentId,
      organizationId: ORG_ID,
      shopId: opts.shopId,
      orderId: opts.orderId,
      externalPackageId: opts.externalPackageId,
      trackingNumber: opts.trackingNumber,
      providerCode: opts.providerCode,
      providerName: opts.providerName,
      providerType: opts.providerType,
      warehouseCode: WAREHOUSE,
      status: opts.status,
      platformStatus: opts.status,
      rtsAt: new Date(Date.now() - 50 * 3600_000),
      shippedAt,
      deliveredAt: opts.status === 'delivered' ? new Date(Date.now() - 2 * 3600_000) : null,
      raw: {
        seed: 'commerce-logistics',
        weight: '0.85kg',
        picker: '杨洁',
        remark: '模块4种子包裹',
      },
    })
    await db.insert(shipmentItems).values({
      id: createId(),
      organizationId: ORG_ID,
      shipmentId,
      orderLineId: opts.lineId,
      qty: 1,
    })
    console.log('created shipment', opts.externalPackageId)
  } else {
    console.log('shipment exists', opts.externalPackageId)
  }

  for (const ev of opts.events) {
    const eventTime = new Date(Date.now() - ev.hoursAgo * 3600_000)
    const [hit] = await db
      .select()
      .from(trackingEvents)
      .where(
        and(
          eq(trackingEvents.shipmentId, shipmentId!),
          eq(trackingEvents.statusCode, ev.statusCode),
          eq(trackingEvents.eventTime, eventTime),
        ),
      )
      .limit(1)
    if (hit) continue
    // Idempotency on (shipment, event_time, status_code) — use stable times from hoursAgo
    // Re-query by status only to avoid float drift on re-run
    const [byCode] = await db
      .select()
      .from(trackingEvents)
      .where(
        and(eq(trackingEvents.shipmentId, shipmentId!), eq(trackingEvents.statusCode, ev.statusCode)),
      )
      .limit(1)
    if (byCode) continue
    await db.insert(trackingEvents).values({
      id: createId(),
      organizationId: ORG_ID,
      shipmentId: shipmentId!,
      statusCode: ev.statusCode,
      title: ev.title,
      description: ev.description ?? null,
      location: ev.location ?? null,
      eventTime,
      source: ev.source,
      raw: { seed: 'commerce-logistics', source: ev.source },
    })
  }
  return shipmentId!
}

async function ensureBatch(opts: {
  db: ReturnType<typeof createPgClient>['db']
  batchNo: string
  channel: string
  site: string
  country: string
  carrier: string
  status: string
  shipmentIds: string[]
  trackingSummary?: string
  meta?: Record<string, unknown>
}) {
  const { db } = opts
  const [existing] = await db
    .select()
    .from(fulfillmentBatches)
    .where(
      and(eq(fulfillmentBatches.organizationId, ORG_ID), eq(fulfillmentBatches.batchNo, opts.batchNo)),
    )
    .limit(1)
  let batchId = existing?.id
  if (!existing) {
    batchId = createId()
    await db.insert(fulfillmentBatches).values({
      id: batchId,
      organizationId: ORG_ID,
      batchNo: opts.batchNo,
      channel: opts.channel,
      site: opts.site,
      country: opts.country,
      warehouseCode: WAREHOUSE,
      status: opts.status,
      carrier: opts.carrier,
      trackingSummary: opts.trackingSummary ?? null,
      packageCount: opts.shipmentIds.length,
      handedOverAt: opts.status === 'open' ? null : new Date(Date.now() - 24 * 3600_000),
      submittedAt: opts.status === 'open' ? null : new Date(Date.now() - 30 * 3600_000),
      raw: { seed: 'commerce-logistics', ...(opts.meta ?? {}) },
    })
    console.log('created batch', opts.batchNo)
  } else {
    console.log('batch exists', opts.batchNo)
  }
  for (const shipmentId of opts.shipmentIds) {
    const [link] = await db
      .select()
      .from(fulfillmentBatchPackages)
      .where(
        and(
          eq(fulfillmentBatchPackages.batchId, batchId!),
          eq(fulfillmentBatchPackages.shipmentId, shipmentId),
        ),
      )
      .limit(1)
    if (link) continue
    await db.insert(fulfillmentBatchPackages).values({
      id: createId(),
      organizationId: ORG_ID,
      batchId: batchId!,
      shipmentId,
    })
  }
  return batchId!
}

async function main() {
  const { db, pool } = createPgClient()
  try {
    const [org] = await db.select().from(organization).where(eq(organization.id, ORG_ID)).limit(1)
    if (!org) {
      throw new Error(`organization ${ORG_ID} 不存在，请先跑 db:seed:commerce-products`)
    }

    const [variant] = await db
      .select({ id: productVariants.id, skuCode: productVariants.skuCode, sku: productVariants.sku })
      .from(productVariants)
      .where(eq(productVariants.organizationId, ORG_ID))
      .limit(1)
    if (!variant) throw new Error('缺少 SKU，请先跑 db:seed:commerce-products')
    const sku = { id: variant.id, skuCode: variant.skuCode || variant.sku || 'HSY000001001' }

    const ensuredShops = []
    for (const seed of SHOP_SEEDS) {
      ensuredShops.push({ shop: await ensureShop(db, seed), seed })
    }

    const shipmentIds: Record<string, string> = {}
    for (const { shop, seed } of ensuredShops) {
      const orderExt = `SEED-${seed.region}-LGS-1001`
      const { order, line } = await ensureOrderWithLine(db, shop.id, orderExt, sku, seed.currency)
      const pkgId = `PKG-${seed.region}-1001`
      const status = seed.providerType === 'jsb' ? 'in_transit' : seed.providerType === 'lgs' ? 'in_transit' : 'shipped'
      const id = await ensureShipment({
        db,
        shopId: shop.id,
        orderId: order.id,
        lineId: line.id,
        externalPackageId: pkgId,
        trackingNumber: `TRK-${seed.region}-1001`,
        providerType: seed.providerType,
        providerCode: seed.providerCode,
        providerName: seed.providerName,
        status,
        events:
          seed.providerType === 'jsb'
            ? [
                { statusCode: 'READY_TO_SHIP', title: '自营仓出库', location: '厦门仓', source: 'manual', hoursAgo: 50 },
                { statusCode: 'HANDOVER_JSB', title: '交接 JSB', location: '深圳口岸', source: 'import', hoursAgo: 40 },
                { statusCode: 'CUSTOMS_CLEARING', title: '清关中', location: '曼谷', source: 'import', hoursAgo: 20 },
              ]
            : seed.providerType === 'lgs'
              ? [
                  { statusCode: 'READY_TO_SHIP', title: '仓库拣货完成', location: WAREHOUSE, source: 'manual', hoursAgo: 48 },
                  { statusCode: 'SHIPPED', title: '仓库出库', location: WAREHOUSE, source: 'manual', hoursAgo: 46 },
                  { statusCode: 'COLLECTED', title: 'LGS 揽收', location: '吉隆坡分拨', source: 'api', hoursAgo: 30 },
                ]
              : [
                  { statusCode: 'READY_TO_SHIP', title: '仓库拣货完成', location: WAREHOUSE, source: 'manual', hoursAgo: 36 },
                  { statusCode: 'SHIPPED', title: '仓库出库', location: WAREHOUSE, source: 'api', hoursAgo: 30 },
                ],
      })
      shipmentIds[seed.region] = id
    }

    await ensureBatch({
      db,
      batchNo: 'BATCH-LGS-MY-2026-0001',
      channel: 'lgs',
      site: 'MY',
      country: 'MY',
      carrier: 'LGS',
      status: 'submitted',
      shipmentIds: [shipmentIds.MY!],
      trackingSummary: 'MY LGS 交接演示',
      meta: { events: ['已提交 LGS 交接 · 运营'] },
    })

    await ensureBatch({
      db,
      batchNo: 'BATCH-JSB-TH-2026-0001',
      channel: 'jsb_th',
      site: 'TH',
      country: 'TH',
      carrier: 'JSB',
      status: 'in_transit',
      shipmentIds: [shipmentIds.TH!],
      trackingSummary: 'TH JSB 灰清演示',
      meta: {
        fee: 'THB 1,240',
        customs: '清关中',
        lastMile: '待官方尾程',
        events: ['自营仓出库 · 杨洁', '交接 JSB · 黄发聪', '清关资料提交 · 杨洁'],
        jsbHandover: new Date(Date.now() - 40 * 3600_000).toISOString(),
      },
    })

    console.log('\nDone. 模块4 LGS/JSB 种子已写入。')
    console.log(`  SHOP_DEV_ORGANIZATION_ID=${ORG_ID}`)
    console.log(`  shipments: MY=${shipmentIds.MY} LK=${shipmentIds.LK} TH=${shipmentIds.TH}`)
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
