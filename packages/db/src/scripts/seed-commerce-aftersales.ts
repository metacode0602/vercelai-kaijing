/**
 * 种子：售后演示数据（模块6）— 1 取消待审 / 1 退货待质检 / 1 已回库。
 * 依赖：commerce-products + commerce-orders（店铺/SKU/库存余额）。
 *
 * 用法（仓库根，需 DATABASE_URL；表已在 migration 0008）：
 *   pnpm --filter @workspace/db db:migrate
 *   pnpm --filter @workspace/db db:seed:commerce-products
 *   pnpm --filter @workspace/db db:seed:commerce-orders
 *   pnpm --filter @workspace/db db:seed:commerce-aftersales
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
  inventoryMovements,
  inventoryReservations,
  orderLines,
  orders,
  organization,
  productVariants,
  refunds,
  returnShipments,
  reverseOrderEvents,
  reverseOrderItems,
  reverseOrders,
  reverseQcRecords,
  shops,
} from '../schema'

config({ path: resolve(process.cwd(), '../../.env') })
config({ path: resolve(process.cwd(), '.env') })

const ORG_ID = process.env.SHOP_DEV_ORGANIZATION_ID?.trim() || 'org_shop_dev_demo'
const WAREHOUSE = 'WH-CN-XMN-001'
const BIN = 'A-01-01'
const BIN_RETURN = 'B-02-01-01'

type Db = ReturnType<typeof createPgClient>['db']

async function ensureShop(db: Db) {
  const [shop] = await db
    .select()
    .from(shops)
    .where(and(eq(shops.organizationId, ORG_ID), eq(shops.externalShopId, 'dz-lk-88021')))
    .limit(1)
  if (!shop) throw new Error('缺少 Daraz LK 店铺，请先跑 db:seed:commerce-orders')
  return shop
}

async function ensureVariant(db: Db, code: string) {
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
  return { id: row.id, skuCode: row.skuCode || row.sku || code }
}

async function ensureOrder(
  db: Db,
  shopId: string,
  externalOrderId: string,
  variant: { id: string; skuCode: string },
  opts: { status: string; fulfillmentStatus: string; qty?: number },
) {
  const [existing] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.shopId, shopId), eq(orders.externalOrderId, externalOrderId)))
    .limit(1)
  if (existing) {
    const [line] = await db.select().from(orderLines).where(eq(orderLines.orderId, existing.id)).limit(1)
    return { order: existing, line: line! }
  }
  const orderId = createId()
  const lineId = createId()
  const now = new Date()
  const qty = opts.qty ?? 1
  await db.insert(orders).values({
    id: orderId,
    organizationId: ORG_ID,
    shopId,
    externalOrderId,
    orderNumber: externalOrderId,
    status: opts.status,
    platformStatus: opts.status,
    fulfillmentStatus: opts.fulfillmentStatus,
    placedAt: now,
    paidAt: now,
    platformUpdatedAt: now,
    currency: 'LKR',
    totalAmount: '129.9000',
    isCancelPending: opts.status === 'cancel_pending',
    raw: { seed: 'commerce-aftersales' },
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
    unitPrice: '129.9000',
    paidPrice: '129.9000',
    variantId: variant.id,
    fulfillmentStatus: opts.fulfillmentStatus,
    platformStatus: opts.status,
  })
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
  const [line] = await db.select().from(orderLines).where(eq(orderLines.id, lineId)).limit(1)
  console.log('created order', externalOrderId)
  return { order: order!, line: line! }
}

async function ensureReservation(
  db: Db,
  shopId: string,
  orderId: string,
  orderLineId: string,
  variantId: string,
  qty: number,
) {
  const [existing] = await db
    .select()
    .from(inventoryReservations)
    .where(
      and(
        eq(inventoryReservations.shopId, shopId),
        eq(inventoryReservations.orderLineId, orderLineId),
      ),
    )
    .limit(1)
  if (existing) {
    if (existing.status !== 'active') {
      await db
        .update(inventoryReservations)
        .set({ status: 'active', releasedAt: null, qty, updatedAt: new Date() })
        .where(eq(inventoryReservations.id, existing.id))
    }
    return existing.id
  }
  const id = createId()
  await db.insert(inventoryReservations).values({
    id,
    organizationId: ORG_ID,
    shopId,
    orderId,
    orderLineId,
    variantId,
    warehouseCode: WAREHOUSE,
    binCode: BIN,
    qty,
    status: 'active',
  })
  // bump reserved on balance if present
  const [bal] = await db
    .select()
    .from(inventoryBalances)
    .where(
      and(
        eq(inventoryBalances.organizationId, ORG_ID),
        eq(inventoryBalances.warehouseCode, WAREHOUSE),
        eq(inventoryBalances.binCode, BIN),
        eq(inventoryBalances.variantId, variantId),
      ),
    )
    .limit(1)
  if (bal) {
    const reserved = Number(bal.reserved || 0) + qty
    await db
      .update(inventoryBalances)
      .set({ reserved, updatedAt: new Date() })
      .where(eq(inventoryBalances.id, bal.id))
  }
  console.log('created reservation for line', orderLineId)
  return id
}

async function ensureReverse(opts: {
  db: Db
  shopId: string
  externalReverseOrderId: string
  externalTradeOrderId: string
  orderId: string | null
  requestType: string
  platformStatus: string
  fulfillmentStatus: string
  uiId: string
  typeLabel: string
  sku: string
  warehouse: string
  bin: string
  qty: number
  refundAmount: number
  currency: string
  reason: string
  reasonCode: string
  statusUi: string
  cancelStatus?: string
  returnStatus?: string
  releaseReserved?: number
  qc?: string
  restock?: number
  scrap?: number
  variantId?: string
  orderLineId?: string
}) {
  const { db } = opts
  const [existing] = await db
    .select()
    .from(reverseOrders)
    .where(
      and(
        eq(reverseOrders.shopId, opts.shopId),
        eq(reverseOrders.externalReverseOrderId, opts.externalReverseOrderId),
      ),
    )
    .limit(1)
  if (existing) {
    console.log('reverse exists', opts.externalReverseOrderId)
    const [line] = await db
      .select()
      .from(reverseOrderItems)
      .where(eq(reverseOrderItems.reverseOrderId, existing.id))
      .limit(1)
    return { reverse: existing, line: line! }
  }

  const reverseId = createId()
  const lineId = createId()
  const now = new Date()
  const raw: Record<string, unknown> = {
    uiId: opts.uiId,
    typeLabel: opts.typeLabel,
    sku: opts.sku,
    warehouse: opts.warehouse,
    bin: opts.bin,
    qty: opts.qty,
    returned: opts.requestType === 'RETURN' ? opts.qty : 0,
    releaseReserved: opts.releaseReserved ?? 0,
    reason: opts.reason,
    reasonCode: opts.reasonCode,
    uiStatus: opts.statusUi,
    cancelStatus: opts.cancelStatus,
    returnStatus: opts.returnStatus,
    qc: opts.qc || (opts.requestType === 'RETURN' ? '待质检' : '不适用'),
    restock: opts.restock ?? 0,
    scrap: opts.scrap ?? 0,
    seed: 'commerce-aftersales',
  }
  await db.insert(reverseOrders).values({
    id: reverseId,
    organizationId: ORG_ID,
    shopId: opts.shopId,
    externalReverseOrderId: opts.externalReverseOrderId,
    orderId: opts.orderId,
    externalTradeOrderId: opts.externalTradeOrderId,
    requestType: opts.requestType,
    platformStatus: opts.platformStatus,
    fulfillmentStatus: opts.fulfillmentStatus,
    platformCreatedAt: now,
    platformUpdatedAt: now,
    raw,
  })
  await db.insert(reverseOrderItems).values({
    id: lineId,
    organizationId: ORG_ID,
    shopId: opts.shopId,
    reverseOrderId: reverseId,
    externalReverseLineId: `${opts.externalReverseOrderId}-L1`,
    orderLineId: opts.orderLineId || null,
    externalOrderLineId: opts.orderLineId ? undefined : `${opts.externalTradeOrderId}-1`,
    reverseStatus: opts.fulfillmentStatus,
    reasonCode: opts.reasonCode,
    reasonText: opts.reason,
    refundAmount: String(opts.refundAmount.toFixed(4)),
    currency: opts.currency,
    isNeedRefund: true,
    raw: { sku: opts.sku, qty: opts.qty, variantId: opts.variantId },
  })
  await db.insert(refunds).values({
    id: createId(),
    organizationId: ORG_ID,
    shopId: opts.shopId,
    reverseOrderId: reverseId,
    reverseOrderLineId: lineId,
    externalRefundId: `RF-${opts.externalReverseOrderId}`,
    amount: String(opts.refundAmount.toFixed(4)),
    currency: opts.currency,
    status: 'pending',
    raw: { seed: true },
  })
  await db.insert(reverseOrderEvents).values({
    id: createId(),
    organizationId: ORG_ID,
    reverseOrderId: reverseId,
    reverseOrderLineId: lineId,
    direction: 'inbound',
    eventType: 'seed_created',
    content: `种子创建 ${opts.typeLabel} ${opts.uiId}`,
    eventTime: now,
    raw: {},
  })
  console.log('created reverse', opts.uiId, opts.typeLabel)
  const [reverse] = await db.select().from(reverseOrders).where(eq(reverseOrders.id, reverseId)).limit(1)
  const [line] = await db.select().from(reverseOrderItems).where(eq(reverseOrderItems.id, lineId)).limit(1)
  return { reverse: reverse!, line: line! }
}

async function main() {
  const { db, pool } = createPgClient()
  try {
    const [org] = await db.select().from(organization).where(eq(organization.id, ORG_ID)).limit(1)
    if (!org) throw new Error(`organization ${ORG_ID} 不存在，请先跑 db:seed:commerce-products`)

    const shop = await ensureShop(db)
    const v1 = await ensureVariant(db, 'HSY000001001')
    const v2 = await ensureVariant(db, 'HSY000002001')

    // 1) 取消待审：未发货订单 + active 占库
    const cancelOrder = await ensureOrder(db, shop.id, 'DZ-AS-CANCEL-01', v1, {
      status: 'ready_to_ship',
      fulfillmentStatus: 'reserved',
      qty: 2,
    })
    await ensureReservation(db, shop.id, cancelOrder.order.id, cancelOrder.line.id, v1.id, 2)
    await ensureReverse({
      db,
      shopId: shop.id,
      externalReverseOrderId: 'REV-CANCEL-SEED-01',
      externalTradeOrderId: 'DZ-AS-CANCEL-01',
      orderId: cancelOrder.order.id,
      orderLineId: cancelOrder.line.id,
      requestType: 'CANCEL',
      platformStatus: 'REVERSE_PENDING',
      fulfillmentStatus: 'pending_review',
      uiId: 'AS-C-SEED-01',
      typeLabel: '取消订单',
      sku: v1.skuCode,
      warehouse: WAREHOUSE,
      bin: BIN,
      qty: 2,
      refundAmount: 259.8,
      currency: 'LKR',
      reason: '买家取消（种子）',
      reasonCode: 'buyer_cancel',
      statusUi: '待确认',
      cancelStatus: '待确认',
      releaseReserved: 2,
      variantId: v1.id,
    })

    // 2) 退货待质检：已收货
    const returnOrder = await ensureOrder(db, shop.id, 'DZ-AS-RETURN-01', v2, {
      status: 'shipped',
      fulfillmentStatus: 'shipped',
      qty: 1,
    })
    const ret = await ensureReverse({
      db,
      shopId: shop.id,
      externalReverseOrderId: 'REV-RETURN-SEED-01',
      externalTradeOrderId: 'DZ-AS-RETURN-01',
      orderId: returnOrder.order.id,
      orderLineId: returnOrder.line.id,
      requestType: 'RETURN',
      platformStatus: 'RETURN_RECEIVED',
      fulfillmentStatus: 'pending_qc',
      uiId: 'AS-R-SEED-01',
      typeLabel: '退货退款',
      sku: v2.skuCode,
      warehouse: WAREHOUSE,
      bin: BIN_RETURN,
      qty: 1,
      refundAmount: 129.9,
      currency: 'LKR',
      reason: '商品不符（种子）',
      reasonCode: 'not_as_described',
      statusUi: '待确认',
      returnStatus: '待质检',
      qc: '待质检',
      variantId: v2.id,
    })
    const [shipExisting] = await db
      .select()
      .from(returnShipments)
      .where(eq(returnShipments.reverseOrderId, ret.reverse.id))
      .limit(1)
    if (!shipExisting) {
      const shipId = createId()
      const receivedAt = new Date()
      await db.insert(returnShipments).values({
        id: shipId,
        organizationId: ORG_ID,
        shopId: shop.id,
        reverseOrderId: ret.reverse.id,
        reverseOrderLineId: ret.line.id,
        trackingNumber: 'LK-RTN-SEED-001',
        providerCode: 'DARAZ-LK',
        providerName: 'Daraz Logistics',
        status: 'received',
        shippedAt: new Date(receivedAt.getTime() - 86400000),
        receivedAt,
        raw: {
          warehouse: WAREHOUSE,
          bin: BIN_RETURN,
          qty: 1,
          packageCondition: '完好',
          uiShipmentId: `RS-${shipId.slice(0, 8)}`,
        },
      })
      await db
        .update(reverseOrders)
        .set({
          raw: {
            ...(ret.reverse.raw as Record<string, unknown>),
            returnShipmentId: shipId,
            tracking: 'LK-RTN-SEED-001',
            receivedAt: receivedAt.toISOString(),
            packageCondition: '完好',
          },
          updatedAt: new Date(),
        })
        .where(eq(reverseOrders.id, ret.reverse.id))
      console.log('created return shipment for AS-R-SEED-01')
    }

    // 3) 已回库示例
    const doneOrder = await ensureOrder(db, shop.id, 'DZ-AS-RESTOCK-01', v1, {
      status: 'shipped',
      fulfillmentStatus: 'shipped',
      qty: 1,
    })
    const done = await ensureReverse({
      db,
      shopId: shop.id,
      externalReverseOrderId: 'REV-RESTOCK-SEED-01',
      externalTradeOrderId: 'DZ-AS-RESTOCK-01',
      orderId: doneOrder.order.id,
      orderLineId: doneOrder.line.id,
      requestType: 'RETURN',
      platformStatus: 'RETURN_COMPLETED',
      fulfillmentStatus: 'restocked',
      uiId: 'AS-R-SEED-02',
      typeLabel: '退货退款',
      sku: v1.skuCode,
      warehouse: WAREHOUSE,
      bin: BIN_RETURN,
      qty: 1,
      refundAmount: 129.9,
      currency: 'LKR',
      reason: '尺码不合适（种子·已回库）',
      reasonCode: 'size_issue',
      statusUi: '已入库',
      returnStatus: '已回库',
      qc: '质检完成：可售',
      restock: 1,
      scrap: 0,
      variantId: v1.id,
    })
    const [ship2] = await db
      .select()
      .from(returnShipments)
      .where(eq(returnShipments.reverseOrderId, done.reverse.id))
      .limit(1)
    if (!ship2) {
      const shipId = createId()
      const receivedAt = new Date(Date.now() - 2 * 86400000)
      await db.insert(returnShipments).values({
        id: shipId,
        organizationId: ORG_ID,
        shopId: shop.id,
        reverseOrderId: done.reverse.id,
        reverseOrderLineId: done.line.id,
        trackingNumber: 'LK-RTN-SEED-002',
        providerCode: 'DARAZ-LK',
        providerName: 'Daraz Logistics',
        status: 'received',
        shippedAt: new Date(receivedAt.getTime() - 86400000),
        receivedAt,
        raw: { warehouse: WAREHOUSE, bin: BIN_RETURN, qty: 1, packageCondition: '完好' },
      })
      const qcId = createId()
      await db.insert(reverseQcRecords).values({
        id: qcId,
        organizationId: ORG_ID,
        reverseOrderLineId: done.line.id,
        qcDecision: 'pass',
        qcAt: new Date(receivedAt.getTime() + 3600000),
        warehouseCode: WAREHOUSE,
        raw: { qcPass: 1, qcDefect: 0, restock: 1, scrap: 0 },
      })
      const idem = `ledger:aftersale_restock:AS-R-SEED-02`
      const [mov] = await db
        .select()
        .from(inventoryMovements)
        .where(and(eq(inventoryMovements.organizationId, ORG_ID), eq(inventoryMovements.idempotencyKey, idem)))
        .limit(1)
      if (!mov) {
        let [bal] = await db
          .select()
          .from(inventoryBalances)
          .where(
            and(
              eq(inventoryBalances.organizationId, ORG_ID),
              eq(inventoryBalances.warehouseCode, WAREHOUSE),
              eq(inventoryBalances.binCode, BIN_RETURN),
              eq(inventoryBalances.variantId, v1.id),
            ),
          )
          .limit(1)
        if (!bal) {
          const balId = createId()
          await db.insert(inventoryBalances).values({
            id: balId,
            organizationId: ORG_ID,
            warehouseCode: WAREHOUSE,
            binCode: BIN_RETURN,
            variantId: v1.id,
            onHand: 1,
            reserved: 0,
            qcHold: 0,
            damaged: 0,
          })
          ;[bal] = await db.select().from(inventoryBalances).where(eq(inventoryBalances.id, balId)).limit(1)
        } else {
          const onHand = Number(bal.onHand || 0) + 1
          await db
            .update(inventoryBalances)
            .set({
              onHand,
              updatedAt: new Date(),
            })
            .where(eq(inventoryBalances.id, bal.id))
          ;[bal] = await db.select().from(inventoryBalances).where(eq(inventoryBalances.id, bal.id)).limit(1)
        }
        await db.insert(inventoryMovements).values({
          id: createId(),
          organizationId: ORG_ID,
          shopId: shop.id,
          variantId: v1.id,
          warehouseCode: WAREHOUSE,
          binCode: BIN_RETURN,
          movementType: 'aftersale_restock',
          qtyDelta: 1,
          onHandAfter: Number(bal!.onHand || 1),
          reservedAfter: Number(bal!.reserved || 0),
          qcHoldAfter: Number(bal!.qcHold || 0),
          damagedAfter: Number(bal!.damaged || 0),
          sourceType: 'aftersale',
          sourceId: done.reverse.id,
          operator: 'seed',
          idempotencyKey: idem,
          raw: { seed: true, uiId: 'AS-R-SEED-02' },
        })
      }
      await db
        .update(reverseOrders)
        .set({
          raw: {
            ...(done.reverse.raw as Record<string, unknown>),
            returnShipmentId: shipId,
            tracking: 'LK-RTN-SEED-002',
            qcPass: 1,
            qcDefect: 0,
            restock: 1,
            scrap: 0,
            restockLedgerId: idem,
            qcDecision: '可售回库',
            inspectedAt: new Date(receivedAt.getTime() + 3600000).toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(reverseOrders.id, done.reverse.id))
      console.log('created restocked return AS-R-SEED-02 + movement')
    }

    console.log('\nDone. 售后种子：AS-C-SEED-01(取消待审) / AS-R-SEED-01(待质检) / AS-R-SEED-02(已回库)')
    console.log(`  SHOP_DEV_ORGANIZATION_ID=${ORG_ID}`)
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
