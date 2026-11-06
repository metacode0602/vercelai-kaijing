/**
 * 种子：同步任务 + 结算/成本/物流费用（模块13）。
 * 依赖：商品种子（店铺/SKU）；建议先跑 commerce-orders / commerce-fee-templates。
 *
 *   pnpm --filter @workspace/db db:seed:commerce-products
 *   pnpm --filter @workspace/db db:seed:commerce-orders
 *   pnpm --filter @workspace/db db:seed:commerce-fee-templates
 *   pnpm --filter @workspace/db db:seed:commerce-finance
 */
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { createId } from '@paralleldrive/cuid2'
import { and, eq } from 'drizzle-orm'
import { createPgClient } from '../client'
import {
  integrationLogs,
  logisticsFeeDetails,
  organization,
  productVariants,
  settlementLines,
  settlements,
  shops,
  skuCosts,
  syncJobRuns,
  syncTasks,
} from '../schema'

config({ path: resolve(process.cwd(), '../../.env') })
config({ path: resolve(process.cwd(), '.env') })

const ORG_ID = process.env.SHOP_DEV_ORGANIZATION_ID?.trim() || 'org_shop_dev_demo'

async function main() {
  const { db, pool } = createPgClient()
  try {
    const [org] = await db.select().from(organization).where(eq(organization.id, ORG_ID)).limit(1)
    if (!org) {
      throw new Error(`组织不存在：${ORG_ID}。请先 seed products 或创建组织。`)
    }

    const shopRows = await db.select().from(shops).where(eq(shops.organizationId, ORG_ID)).limit(5)
    const shop = shopRows[0]
    if (!shop) throw new Error('无店铺：请先 db:seed:commerce-products / commerce-orders')

    const variants = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.organizationId, ORG_ID))
      .limit(10)
    if (variants.length === 0) throw new Error('无 SKU：请先 db:seed:commerce-products')

    // sync tasks
    const taskSeeds = [
      {
        taskNo: 'TASK-2026-20001',
        type: 'inventory',
        target: `${variants[0]!.sku} × 刊登库存`,
        status: 'success',
        progressDone: 6,
        progressTotal: 6,
        error: null as string | null,
      },
      {
        taskNo: 'TASK-2026-20002',
        type: 'price',
        target: '价格同步批次',
        status: 'partial_failed',
        progressDone: 2,
        progressTotal: 3,
        error: 'ITEM_NOT_FOUND (示例，未调真实平台)',
      },
      {
        taskNo: 'TASK-2026-20003',
        type: 'orders',
        target: '订单增量拉取',
        status: 'queued',
        progressDone: 0,
        progressTotal: 1,
        error: null,
      },
    ]

    for (const seed of taskSeeds) {
      const [existing] = await db
        .select()
        .from(syncTasks)
        .where(and(eq(syncTasks.organizationId, ORG_ID), eq(syncTasks.taskNo, seed.taskNo)))
        .limit(1)
      const requestId = `req_seed_${seed.taskNo.slice(-5)}`
      let taskId = existing?.id
      if (!existing) {
        taskId = createId()
        const now = new Date()
        await db.insert(syncTasks).values({
          id: taskId,
          organizationId: ORG_ID,
          shopId: shop.id,
          taskNo: seed.taskNo,
          type: seed.type,
          target: seed.target,
          status: seed.status,
          progressDone: seed.progressDone,
          progressTotal: seed.progressTotal,
          error: seed.error,
          retries: seed.status === 'partial_failed' ? 1 : 0,
          requestId,
          enqueuedAt: now,
          lastRunAt: now,
          note: 'seed：仅请求记录，非真实平台联调',
          raw: { seed: true },
        })
        await db.insert(syncJobRuns).values({
          id: createId(),
          organizationId: ORG_ID,
          syncTaskId: taskId,
          runNo: 1,
          status: seed.status,
          requestId,
          message: 'seed run',
          detail: '本地种子，未调用 OpenAPI',
          actor: 'seed',
          startedAt: now,
          finishedAt: seed.status === 'queued' ? null : now,
        })
        await db.insert(integrationLogs).values({
          id: createId(),
          shopId: shop.id,
          direction: 'out',
          action: `sync.${seed.type}.seed`,
          requestId,
          status: seed.status,
          message: `seed ${seed.taskNo}`,
          payloadSummary: JSON.stringify({ taskNo: seed.taskNo }),
        })
        console.log('sync_task', seed.taskNo)
      } else {
        console.log('sync_task exists', seed.taskNo)
      }
    }

    // sku costs
    for (const [i, variant] of variants.slice(0, 3).entries()) {
      const [existing] = await db
        .select()
        .from(skuCosts)
        .where(
          and(
            eq(skuCosts.organizationId, ORG_ID),
            eq(skuCosts.variantId, variant.id),
            eq(skuCosts.kind, 'landed'),
          ),
        )
        .limit(1)
      if (existing) {
        console.log('sku_cost exists', variant.sku)
        continue
      }
      await db.insert(skuCosts).values({
        id: createId(),
        organizationId: ORG_ID,
        variantId: variant.id,
        kind: 'landed',
        amount: String(18 + i * 4),
        currency: 'CNY',
        note: 'seed landed cost',
        versionNo: 1,
        landedUnitCost: String(22 + i * 4),
        effectiveFrom: new Date('2026-10-01T00:00:00Z'),
      })
      console.log('sku_cost', variant.sku)
    }

    // settlement
    const extId = 'DZ-SETTLE-SEED-202610-LK'
    let [settlement] = await db
      .select()
      .from(settlements)
      .where(and(eq(settlements.shopId, shop.id), eq(settlements.externalSettlementId, extId)))
      .limit(1)
    if (!settlement) {
      const sid = createId()
      await db.insert(settlements).values({
        id: sid,
        organizationId: ORG_ID,
        shopId: shop.id,
        externalSettlementId: extId,
        periodStart: new Date('2026-10-01T00:00:00Z'),
        periodEnd: new Date('2026-10-15T23:59:59Z'),
        currency: shop.currency || 'LKR',
        billAmount: '4820.55',
        itemRevenue: '4620.50',
        otherRevenueTotal: '200.05',
        refundsAmount: '42.50',
        shipmentFee: '310.20',
        feesTotal: '867.00',
        payoutAmount: '3953.55',
        payoutStatus: 'pending',
        status: 'diff',
        platformUpdatedAt: new Date('2026-10-20T08:00:00Z'),
        raw: { seed: true, note: '本地导入占位，非平台 API' },
      })
      await db.insert(settlementLines).values([
        {
          id: createId(),
          settlementId: sid,
          organizationId: ORG_ID,
          feeKind: 'platform',
          feeType: 'commission',
          feeName: '平台佣金',
          amount: '420.10',
          currency: shop.currency || 'LKR',
          externalTransactionId: 'SEED-TXN-1',
          note: 'seed',
        },
        {
          id: createId(),
          settlementId: sid,
          organizationId: ORG_ID,
          feeKind: 'logistics',
          feeType: 'shipping',
          feeName: '物流费',
          amount: '310.20',
          currency: shop.currency || 'LKR',
          externalTransactionId: 'SEED-TXN-2',
          note: 'seed',
        },
        {
          id: createId(),
          settlementId: sid,
          organizationId: ORG_ID,
          feeKind: 'ads',
          feeType: 'ads',
          feeName: '推广费',
          amount: '88.00',
          currency: shop.currency || 'LKR',
          externalTransactionId: 'SEED-TXN-3',
          note: 'seed',
        },
        {
          id: createId(),
          settlementId: sid,
          organizationId: ORG_ID,
          feeKind: 'refund',
          feeType: 'refund',
          feeName: '退款扣回',
          amount: '42.50',
          currency: shop.currency || 'LKR',
          externalTransactionId: 'SEED-TXN-4',
          note: 'seed',
        },
      ])
      await db.insert(logisticsFeeDetails).values({
        id: createId(),
        organizationId: ORG_ID,
        shopId: shop.id,
        settlementId: sid,
        feeCode: 'SHIP_FEE',
        feeName: '尾程运费',
        amount: '12.5',
        currency: shop.currency || 'LKR',
        feeCreatedAt: new Date('2026-10-12T10:00:00Z'),
        raw: { seed: true },
      })
      console.log('settlement', extId)
    } else {
      console.log('settlement exists', extId)
    }

    console.log('commerce-finance seed done for', ORG_ID)
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
