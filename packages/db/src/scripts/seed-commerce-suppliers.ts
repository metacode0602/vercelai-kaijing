/**
 * 种子：供应商主档 + 供应商货号 + 订单履约异常来源（依赖商品；复用既有演示店铺，不另造无关店铺）。
 *
 * 用法（仓库根，需 DATABASE_URL）：
 *   pnpm --filter @workspace/db db:seed:commerce-products
 *   pnpm --filter @workspace/db db:seed:commerce-orders   # 可选，确保店铺/库存
 *   pnpm --filter @workspace/db db:seed:commerce-suppliers
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
  commerceSuppliers,
  fulfillmentAttempts,
  mappingExceptions,
  orderExceptionCases,
  orderLines,
  orders,
  organization,
  productVariants,
  purchaseRequestLines,
  purchaseRequests,
  shops,
  stockOutbounds,
  supplierSkus,
} from '../schema'

config({ path: resolve(process.cwd(), '../../.env') })
config({ path: resolve(process.cwd(), '.env') })

const ORG_ID = process.env.SHOP_DEV_ORGANIZATION_ID?.trim() || 'org_shop_dev_demo'

const SUPPLIER_SEEDS = [
  {
    code: 'SUP-0001',
    name: '厦门优品服饰有限公司',
    contact: '陈先生',
    phone: '138****1022',
    email: 'chen@xmyoupin.example',
    settlement: '月结 30 天',
    status: 'active' as const,
    note: 'T恤类主力供应商',
  },
  {
    code: 'SUP-0002',
    name: '泉州联创数码配件厂',
    contact: '林女士',
    phone: '159****8841',
    email: 'lin@qzliangchuang.example',
    settlement: '月结 15 天',
    status: 'active' as const,
    note: '数码配件供应商',
  },
  {
    code: 'SUP-0003',
    name: '汕头华彩印务',
    contact: '待补充',
    phone: '—',
    email: '—',
    settlement: '现结',
    status: 'disabled' as const,
    note: '包装印刷备选供应商',
  },
] as const

const SKU_SEEDS = [
  {
    supplierCode: 'SUP-0001',
    sku: 'HSY000001001',
    factoryCode: 'TEE-001-BK-L',
    price: '28',
    moq: 100,
    leadDays: 12,
    preferred: true,
    status: 'active' as const,
  },
  {
    supplierCode: 'SUP-0001',
    sku: 'HSY000001002',
    factoryCode: 'TEE-001-WH-L',
    price: '29',
    moq: 100,
    leadDays: 12,
    preferred: true,
    status: 'active' as const,
  },
  {
    supplierCode: 'SUP-0002',
    sku: 'HSY000002001',
    factoryCode: 'HUB-01',
    price: '62',
    moq: 50,
    leadDays: 18,
    preferred: true,
    status: 'active' as const,
  },
  {
    supplierCode: 'SUP-0003',
    sku: 'HSY000001001',
    factoryCode: 'TEE-ALT-BK-L',
    price: '26.5',
    moq: 200,
    leadDays: 20,
    preferred: false,
    status: 'disabled' as const,
  },
] as const

async function main() {
  const { db, pool } = createPgClient()
  try {
    const [org] = await db.select().from(organization).where(eq(organization.id, ORG_ID)).limit(1)
    if (!org) throw new Error(`organization ${ORG_ID} 不存在，请先跑 db:seed:commerce-products`)

    const supplierByCode = new Map<string, string>()
    for (const seed of SUPPLIER_SEEDS) {
      let [row] = await db
        .select()
        .from(commerceSuppliers)
        .where(
          and(eq(commerceSuppliers.organizationId, ORG_ID), eq(commerceSuppliers.code, seed.code)),
        )
        .limit(1)
      if (!row) {
        const id = createId()
        await db.insert(commerceSuppliers).values({
          id,
          organizationId: ORG_ID,
          ...seed,
        })
        ;[row] = await db.select().from(commerceSuppliers).where(eq(commerceSuppliers.id, id)).limit(1)
        console.log(`created supplier ${seed.code} ${seed.name}`)
      } else {
        console.log(`supplier exists ${seed.code}`)
      }
      if (!row) throw new Error(`supplier missing ${seed.code}`)
      supplierByCode.set(seed.code, row.id)
    }

    const variantBySku = new Map<string, { id: string; skuCode: string }>()
    for (const code of ['HSY000001001', 'HSY000001002', 'HSY000002001']) {
      const [row] = await db
        .select({
          id: productVariants.id,
          skuCode: productVariants.skuCode,
          sku: productVariants.sku,
        })
        .from(productVariants)
        .where(
          and(
            eq(productVariants.organizationId, ORG_ID),
            or(eq(productVariants.skuCode, code), eq(productVariants.sku, code)),
          ),
        )
        .limit(1)
      if (!row) throw new Error(`缺少 SKU ${code}，请先跑 db:seed:commerce-products`)
      variantBySku.set(code, { id: row.id, skuCode: row.skuCode || row.sku || code })
    }

    for (const seed of SKU_SEEDS) {
      const supplierId = supplierByCode.get(seed.supplierCode)
      const variant = variantBySku.get(seed.sku)
      if (!supplierId || !variant) continue
      const [existing] = await db
        .select({ id: supplierSkus.id })
        .from(supplierSkus)
        .where(
          and(
            eq(supplierSkus.organizationId, ORG_ID),
            eq(supplierSkus.supplierId, supplierId),
            eq(supplierSkus.skuCode, variant.skuCode),
            eq(supplierSkus.factoryCode, seed.factoryCode),
          ),
        )
        .limit(1)
      if (existing) {
        console.log(`supplier_sku exists ${seed.sku} ${seed.factoryCode}`)
        continue
      }
      await db.insert(supplierSkus).values({
        id: createId(),
        organizationId: ORG_ID,
        supplierId,
        variantId: variant.id,
        skuCode: variant.skuCode,
        factoryCode: seed.factoryCode,
        unitPrice: seed.price,
        currency: 'CNY',
        moq: seed.moq,
        leadDays: seed.leadDays,
        effectiveFrom: '2026-10-01',
        preferred: seed.preferred,
        status: seed.status,
      })
      console.log(`created supplier_sku ${seed.sku} ↔ ${seed.factoryCode}`)
    }

    // 挂接既有采购申请的供应商 ID / 货号（按名称匹配，不改单号）
    const prs = await db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.organizationId, ORG_ID))
      .limit(50)
    for (const pr of prs) {
      const matched = SUPPLIER_SEEDS.find((s) => s.name === pr.supplierName)
      const supplierId = matched ? supplierByCode.get(matched.code) : undefined
      if (supplierId && !pr.supplierId) {
        await db
          .update(purchaseRequests)
          .set({ supplierId, updatedAt: new Date() })
          .where(eq(purchaseRequests.id, pr.id))
        console.log(`linked PR ${pr.requestNo} → ${matched!.code}`)
      }
      const lines = await db
        .select()
        .from(purchaseRequestLines)
        .where(eq(purchaseRequestLines.purchaseRequestId, pr.id))
      for (const line of lines) {
        if (line.supplierSkuId) continue
        const [ssk] = await db
          .select()
          .from(supplierSkus)
          .where(
            and(
              eq(supplierSkus.organizationId, ORG_ID),
              eq(supplierSkus.skuCode, line.skuCode),
              eq(supplierSkus.preferred, true),
              eq(supplierSkus.status, 'active'),
            ),
          )
          .limit(1)
        if (!ssk) continue
        await db
          .update(purchaseRequestLines)
          .set({
            supplierSkuId: ssk.id,
            supplierSku: ssk.factoryCode,
            updatedAt: new Date(),
          })
          .where(eq(purchaseRequestLines.id, line.id))
        console.log(`linked PR line ${line.skuCode} → ${ssk.factoryCode}`)
      }
    }

    // —— 订单异常来源：复用已有 Daraz LK 演示店铺，不另造无关店铺 ——
    let [shop] = await db
      .select()
      .from(shops)
      .where(and(eq(shops.organizationId, ORG_ID), eq(shops.externalShopId, 'dz-lk-88021')))
      .limit(1)
    if (!shop) {
      ;[shop] = await db
        .select()
        .from(shops)
        .where(eq(shops.organizationId, ORG_ID))
        .limit(1)
    }
    if (!shop) {
      console.log('skip exception seeds: 无店铺（请先 seed products/orders/listings）')
    } else {
      const variant = variantBySku.get('HSY000001001')!
      const paidAt = new Date(Date.now() - 72 * 3600 * 1000)

      // 超时未发货订单
      let [timeoutOrder] = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.organizationId, ORG_ID),
            eq(orders.shopId, shop.id),
            eq(orders.externalOrderId, 'DZ-EX-TIMEOUT-001'),
          ),
        )
        .limit(1)
      if (!timeoutOrder) {
        const orderId = createId()
        await db.insert(orders).values({
          id: orderId,
          organizationId: ORG_ID,
          shopId: shop.id,
          externalOrderId: 'DZ-EX-TIMEOUT-001',
          orderNumber: 'DZ-EX-TIMEOUT-001',
          status: 'paid',
          fulfillmentStatus: 'unfulfilled',
          paidAt,
          currency: shop.currency || 'USD',
          totalAmount: '12.50',
        })
        await db.insert(orderLines).values({
          id: createId(),
          organizationId: ORG_ID,
          orderId,
          externalLineId: '1',
          sellerSku: 'DZ-TEE-001',
          sku: variant.skuCode,
          title: '超时未发货演示行',
          qty: 1,
          unitPrice: '12.50',
          variantId: variant.id,
          warehouseCode: 'WH-CN-XMN-001',
        })
        console.log('created timeout order DZ-EX-TIMEOUT-001')
        ;[timeoutOrder] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
      } else {
        console.log('timeout order exists')
      }

      // 占库失败：开放 mapping_exception 挂同一店铺订单号
      const [mapEx] = await db
        .select()
        .from(mappingExceptions)
        .where(
          and(
            eq(mappingExceptions.organizationId, ORG_ID),
            eq(mappingExceptions.externalOrderId, 'DZ-EX-RESERVE-001'),
          ),
        )
        .limit(1)
      if (!mapEx) {
        let [reserveOrder] = await db
          .select()
          .from(orders)
          .where(
            and(
              eq(orders.organizationId, ORG_ID),
              eq(orders.shopId, shop.id),
              eq(orders.externalOrderId, 'DZ-EX-RESERVE-001'),
            ),
          )
          .limit(1)
        if (!reserveOrder) {
          const orderId = createId()
          await db.insert(orders).values({
            id: orderId,
            organizationId: ORG_ID,
            shopId: shop.id,
            externalOrderId: 'DZ-EX-RESERVE-001',
            orderNumber: 'DZ-EX-RESERVE-001',
            status: 'paid',
            fulfillmentStatus: 'unfulfilled',
            paidAt: new Date(),
            currency: shop.currency || 'USD',
            totalAmount: '12.50',
          })
          await db.insert(orderLines).values({
            id: createId(),
            organizationId: ORG_ID,
            orderId,
            externalLineId: '1',
            sellerSku: 'DZ-UNMAPPED-X',
            sku: '',
            title: '占库失败演示（未映射）',
            qty: 1,
            unitPrice: '12.50',
            warehouseCode: 'WH-CN-XMN-001',
          })
          ;[reserveOrder] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
          console.log('created reserve-fail order DZ-EX-RESERVE-001')
        }
        await db.insert(mappingExceptions).values({
          id: createId(),
          organizationId: ORG_ID,
          shopId: shop.id,
          sellerSku: 'DZ-UNMAPPED-X',
          externalOrderId: 'DZ-EX-RESERVE-001',
          reason: 'unmapped',
          detail: '种子：Seller SKU 未映射，阻断占库',
          status: 'open',
        })
        console.log('created mapping_exception for DZ-EX-RESERVE-001')
      } else {
        console.log('mapping_exception reserve seed exists')
      }

      // 拣货异常出库
      const [pickOb] = await db
        .select()
        .from(stockOutbounds)
        .where(
          and(
            eq(stockOutbounds.organizationId, ORG_ID),
            eq(stockOutbounds.outboundNo, 'OB-EX-PICK-001'),
          ),
        )
        .limit(1)
      if (!pickOb && timeoutOrder) {
        await db.insert(stockOutbounds).values({
          id: createId(),
          organizationId: ORG_ID,
          outboundNo: 'OB-EX-PICK-001',
          outboundType: 'order',
          warehouseCode: 'WH-CN-XMN-001',
          shopId: shop.id,
          orderId: timeoutOrder.id,
          externalOrderId: timeoutOrder.externalOrderId,
          status: 'picking',
          idempotencyKey: `seed:pickex:${ORG_ID}:OB-EX-PICK-001`,
          reason: '短拣异常：库位缺货',
          remark: '种子拣货异常',
        })
        console.log('created picking exception outbound OB-EX-PICK-001')
      } else {
        console.log('picking outbound seed exists or no timeout order')
      }

      // 同步失败：fulfillment_attempts
      const [attempt] = await db
        .select()
        .from(fulfillmentAttempts)
        .where(
          and(
            eq(fulfillmentAttempts.organizationId, ORG_ID),
            eq(fulfillmentAttempts.idempotencyKey, 'seed:syncfail:rts:1'),
          ),
        )
        .limit(1)
      if (!attempt && timeoutOrder) {
        await db.insert(fulfillmentAttempts).values({
          id: createId(),
          organizationId: ORG_ID,
          shopId: shop.id,
          orderId: timeoutOrder.id,
          externalPackageId: 'PKG-EX-SYNC-001',
          action: 'ready_to_ship',
          idempotencyKey: 'seed:syncfail:rts:1',
          attemptNo: 1,
          result: 'failed',
          errorCode: 'PLATFORM_TIMEOUT',
          errorMessage: '种子：平台 RTS 同步超时',
          retryable: true,
        })
        console.log('created fulfillment_attempt sync failure')
      } else {
        console.log('fulfillment_attempt seed exists or skipped')
      }

      // 直接确保至少有一条 open case（扫描幂等）——也可由控制台点扫描
      const [anyCase] = await db
        .select({ id: orderExceptionCases.id })
        .from(orderExceptionCases)
        .where(eq(orderExceptionCases.organizationId, ORG_ID))
        .limit(1)
      if (!anyCase && timeoutOrder) {
        await db.insert(orderExceptionCases).values({
          id: createId(),
          organizationId: ORG_ID,
          caseNo: `OEX-${new Date().getFullYear()}-0001`,
          kind: 'timeout_unshipped',
          status: 'open',
          shopId: shop.id,
          orderId: timeoutOrder.id,
          externalOrderId: timeoutOrder.externalOrderId,
          sourceType: 'order',
          sourceId: timeoutOrder.id,
          sellerSku: 'DZ-TEE-001',
          internalSku: variant.skuCode,
          title: `超时未发货 · ${timeoutOrder.externalOrderId}`,
          detail: '种子案件：已支付超过 48 小时未发货',
          blocksFulfillment: true,
          lastScannedAt: new Date(),
        })
        console.log('created seed order_exception_case')
      }
    }

    console.log('\nDone. 供应商 / 货号 / 履约异常来源已就绪。')
    console.log(`  SHOP_DEV_ORGANIZATION_ID=${ORG_ID}`)
    console.log('  控制台可打开 /console/supplier-skus 与 /console/order-exceptions，点「扫描规则」。')
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
