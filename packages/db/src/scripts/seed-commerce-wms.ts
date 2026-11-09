/**
 * 种子：WMS 仓库/库位/余额/非订单出库/调整演示（依赖商品种子 SKU）。
 *
 * 用法：
 *   pnpm --filter @workspace/db db:seed:commerce-products
 *   pnpm --filter @workspace/db db:seed:commerce-wms
 *
 * 环境变量：SHOP_DEV_ORGANIZATION_ID 可选，默认 org_shop_dev_demo
 */
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { createId } from '@paralleldrive/cuid2'
import { and, eq, or } from 'drizzle-orm'
import { createPgClient } from '../client'
import {
  binBindingHistory,
  commerceBinBindings,
  commerceBins,
  commerceWarehouseZones,
  commerceWarehouses,
  inventoryBalances,
  inventoryMovements,
  inventoryPools,
  organization,
  productVariants,
  shops,
  stockAdjustmentLines,
  stockAdjustments,
  stockOutboundLines,
  stockOutbounds,
} from '../schema'

config({ path: resolve(process.cwd(), '../../.env') })
config({ path: resolve(process.cwd(), '.env') })

const ORG_ID = process.env.SHOP_DEV_ORGANIZATION_ID?.trim() || 'org_shop_dev_demo'
const WH = 'WH-CN-XMN-001'

async function main() {
  const { db, pool } = createPgClient()
  try {
    const [org] = await db.select().from(organization).where(eq(organization.id, ORG_ID)).limit(1)
    if (!org) throw new Error(`organization ${ORG_ID} 不存在，请先跑 db:seed:commerce-products`)

    const skuCodes = ['HSY000001001', 'HSY000001002', 'HSY000002001']
    const variants: { id: string; skuCode: string }[] = []
    for (const code of skuCodes) {
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

    // warehouse
    let warehouseId: string
    const [existingWh] = await db
      .select()
      .from(commerceWarehouses)
      .where(and(eq(commerceWarehouses.organizationId, ORG_ID), eq(commerceWarehouses.code, WH)))
      .limit(1)
    const zoneSeeds = [
      { code: 'A', name: 'A 区', purpose: '服装与配饰拣货区', status: 'active', note: null },
      { code: 'B', name: 'B 区', purpose: '数码配件与家居存储区', status: 'active', note: null },
      { code: 'C', name: 'C 区', purpose: '退货质检与残次暂存区', status: 'active', note: null },
    ]

    if (existingWh) {
      warehouseId = existingWh.id
      console.log(`skip warehouse ${WH}`)
    } else {
      warehouseId = createId()
      await db.insert(commerceWarehouses).values({
        id: warehouseId,
        organizationId: ORG_ID,
        code: WH,
        name: '好时运厦门自营仓',
        type: 'self_operated',
        country: 'CN',
        timezone: 'Asia/Shanghai',
        operatingCurrency: 'CNY',
        address: '福建省厦门市',
        status: 'active',
        note: 'Lazada 五站 + Daraz 共用现货仓（演示）',
      })
      console.log(`created warehouse ${WH}`)
    }

    for (const zone of zoneSeeds) {
      const [existingZone] = await db
        .select({ id: commerceWarehouseZones.id })
        .from(commerceWarehouseZones)
        .where(
          and(
            eq(commerceWarehouseZones.organizationId, ORG_ID),
            eq(commerceWarehouseZones.warehouseId, warehouseId),
            eq(commerceWarehouseZones.code, zone.code),
          ),
        )
        .limit(1)
      if (existingZone) {
        console.log(`skip zone ${zone.code}`)
        continue
      }
      await db.insert(commerceWarehouseZones).values({
        id: createId(),
        organizationId: ORG_ID,
        warehouseId,
        code: zone.code,
        name: zone.name,
        purpose: zone.purpose,
        status: zone.status,
        note: zone.note,
      })
      console.log(`created zone ${zone.code}`)
    }

    // Colombo local (ocean destination) — master only
    const WH_LK = 'WH-LK-CMB-001'
    const [lk] = await db
      .select({ id: commerceWarehouses.id })
      .from(commerceWarehouses)
      .where(and(eq(commerceWarehouses.organizationId, ORG_ID), eq(commerceWarehouses.code, WH_LK)))
      .limit(1)
    let colomboWarehouseId: string
    if (lk) {
      colomboWarehouseId = lk.id
    } else {
      colomboWarehouseId = createId()
      await db.insert(commerceWarehouses).values({
        id: colomboWarehouseId,
        organizationId: ORG_ID,
        code: WH_LK,
        name: '科伦坡本地仓',
        type: 'self_operated',
        country: 'LK',
        timezone: 'Asia/Colombo',
        operatingCurrency: 'LKR',
        status: 'active',
        note: 'Daraz LK 海运目的仓',
      })
      console.log(`created warehouse ${WH_LK}`)
    }

    const poolSeeds = [
      {
        code: 'POOL-LAZADA-5C',
        name: 'Lazada 五国共享池',
        warehouseId,
        note: 'Lazada 五站共用厦门现货',
        platforms: ['lazada'],
      },
      {
        code: 'POOL-DARAZ-LK',
        name: 'Daraz LK 本地池',
        warehouseId: colomboWarehouseId,
        note: 'Daraz 斯里兰卡本地库存池',
        platforms: ['daraz'],
      },
    ]
    const poolIds = new Map<string, string>()
    for (const pool of poolSeeds) {
      const [existingPool] = await db
        .select({ id: inventoryPools.id })
        .from(inventoryPools)
        .where(and(eq(inventoryPools.organizationId, ORG_ID), eq(inventoryPools.code, pool.code)))
        .limit(1)
      const poolId = existingPool?.id ?? createId()
      if (existingPool) {
        console.log(`skip inventory pool ${pool.code}`)
      } else {
        await db.insert(inventoryPools).values({
          id: poolId,
          organizationId: ORG_ID,
          code: pool.code,
          name: pool.name,
          warehouseId: pool.warehouseId,
          status: 'active',
          note: pool.note,
        })
        console.log(`created inventory pool ${pool.code}`)
      }
      poolIds.set(pool.platforms[0]!, poolId)
    }

    for (const [platform, poolId] of poolIds) {
      const updated = await db
        .update(shops)
        .set({ inventoryPoolId: poolId, updatedAt: new Date() })
        .where(and(eq(shops.organizationId, ORG_ID), eq(shops.platform, platform)))
        .returning({ id: shops.id })
      console.log(`assigned pool ${platform} → ${poolId} (${updated.length})`)
    }

    const binSeeds = [
      { code: 'A-01-01-01', zone: 'A', sku: variants[0]!.skuCode, status: 'occupied' },
      { code: 'A-01-01-02', zone: 'A', sku: variants[1]!.skuCode, status: 'occupied' },
      { code: 'B-02-01-01', zone: 'B', sku: variants[2]!.skuCode, status: 'occupied' },
      { code: 'C-01-01-01', zone: 'C', sku: null, status: 'empty' },
    ]
    for (const b of binSeeds) {
      const [ex] = await db
        .select({ id: commerceBins.id })
        .from(commerceBins)
        .where(
          and(
            eq(commerceBins.organizationId, ORG_ID),
            eq(commerceBins.warehouseId, warehouseId),
            eq(commerceBins.code, b.code),
          ),
        )
        .limit(1)
      const binId = ex?.id ?? createId()
      if (ex) {
        console.log(`skip bin ${b.code}`)
      } else {
        await db.insert(commerceBins).values({
          id: binId,
          organizationId: ORG_ID,
          warehouseId,
          warehouseCode: WH,
          zoneCode: b.zone,
          code: b.code,
          name: b.code,
          boundSku: b.sku,
          status: b.status,
        })
        console.log(`created bin ${b.code}`)
      }

      if (!b.sku) continue
      const variant = variants.find((item) => item.skuCode === b.sku)
      if (!variant) continue
      const [activeBinding] = await db
        .select({ id: commerceBinBindings.id })
        .from(commerceBinBindings)
        .where(
          and(
            eq(commerceBinBindings.organizationId, ORG_ID),
            eq(commerceBinBindings.binId, binId),
            eq(commerceBinBindings.state, 'active'),
          ),
        )
        .limit(1)
      if (activeBinding) {
        console.log(`skip binding ${b.code} → ${b.sku}`)
        continue
      }
      const bindingId = createId()
      await db.insert(commerceBinBindings).values({
        id: bindingId,
        organizationId: ORG_ID,
        warehouseId,
        binId,
        variantId: variant.id,
        state: 'active',
        boundBy: 'seed',
      })
      await db.insert(binBindingHistory).values({
        id: createId(),
        organizationId: ORG_ID,
        warehouseId,
        binId,
        variantId: variant.id,
        bindingId,
        action: 'bind',
        reason: 'WMS 种子初始化',
        operatorId: 'seed',
      })
      console.log(`created binding ${b.code} → ${b.sku}`)
    }

    const balSeeds = [
      { variant: variants[0]!, bin: 'A-01-01-01', onHand: 46, reserved: 8, damaged: 2 },
      { variant: variants[1]!, bin: 'A-01-01-02', onHand: 12, reserved: 3, damaged: 0 },
      { variant: variants[2]!, bin: 'B-02-01-01', onHand: 85, reserved: 5, damaged: 1 },
    ]
    for (const b of balSeeds) {
      const [ex] = await db
        .select({ id: inventoryBalances.id })
        .from(inventoryBalances)
        .where(
          and(
            eq(inventoryBalances.organizationId, ORG_ID),
            eq(inventoryBalances.warehouseCode, WH),
            eq(inventoryBalances.binCode, b.bin),
            eq(inventoryBalances.variantId, b.variant.id),
          ),
        )
        .limit(1)
      if (ex) {
        console.log(`skip balance ${b.variant.skuCode}@${b.bin}`)
        continue
      }
      const balId = createId()
      await db.insert(inventoryBalances).values({
        id: balId,
        organizationId: ORG_ID,
        warehouseCode: WH,
        binCode: b.bin,
        variantId: b.variant.id,
        onHand: b.onHand,
        reserved: b.reserved,
        damaged: b.damaged,
        qcHold: 0,
        inTransit: 0,
        pendingInbound: 0,
        customsClearing: 0,
        version: 1,
      })
      const idem = `ledger:migration_opening:${WH}:${b.bin}:${b.variant.id}`
      const [dupMov] = await db
        .select({ id: inventoryMovements.id })
        .from(inventoryMovements)
        .where(and(eq(inventoryMovements.organizationId, ORG_ID), eq(inventoryMovements.idempotencyKey, idem)))
        .limit(1)
      if (!dupMov) {
        await db.insert(inventoryMovements).values({
          id: createId(),
          organizationId: ORG_ID,
          variantId: b.variant.id,
          warehouseCode: WH,
          binCode: b.bin,
          movementType: 'purchase_stock_in',
          qtyDelta: b.onHand,
          onHandAfter: b.onHand,
          reservedAfter: b.reserved,
          qcHoldAfter: 0,
          damagedAfter: b.damaged,
          sourceType: 'migration',
          sourceId: balId,
          operator: 'seed',
          idempotencyKey: idem,
          raw: { note: 'WMS 期初种子' },
        })
      }
      console.log(`created balance ${b.variant.skuCode}@${b.bin}`)
    }

    // sample non-order outbound (pending)
    const [exOut] = await db
      .select({ id: stockOutbounds.id })
      .from(stockOutbounds)
      .where(and(eq(stockOutbounds.organizationId, ORG_ID), eq(stockOutbounds.outboundNo, 'SO-WMS-SEED-001')))
      .limit(1)
    if (!exOut) {
      const outId = createId()
      await db.insert(stockOutbounds).values({
        id: outId,
        organizationId: ORG_ID,
        outboundNo: 'SO-WMS-SEED-001',
        outboundType: 'sample',
        warehouseCode: WH,
        status: 'pending_pick',
        idempotencyKey: 'wms_outbound:SO-WMS-SEED-001',
        reason: '样品领用演示',
        remark: 'seed',
        picker: '仓管员',
      })
      await db.insert(stockOutboundLines).values({
        id: createId(),
        organizationId: ORG_ID,
        stockOutboundId: outId,
        lineNo: 1,
        variantId: variants[0]!.id,
        skuCode: variants[0]!.skuCode,
        binCode: 'A-01-01-01',
        qty: 2,
        note: '样品',
      })
      console.log('created outbound SO-WMS-SEED-001')
    } else {
      console.log('skip outbound SO-WMS-SEED-001')
    }

    // sample adjustment draft
    const [exAdj] = await db
      .select({ id: stockAdjustments.id })
      .from(stockAdjustments)
      .where(and(eq(stockAdjustments.organizationId, ORG_ID), eq(stockAdjustments.adjustmentNo, 'ADJ-SEED-001')))
      .limit(1)
    if (!exAdj) {
      const adjId = createId()
      await db.insert(stockAdjustments).values({
        id: adjId,
        organizationId: ORG_ID,
        adjustmentNo: 'ADJ-SEED-001',
        kind: 'stocktake',
        warehouseCode: WH,
        status: 'pending_approval',
        reason: '月度盘点演示',
        applicant: '仓管员',
        idempotencyKey: 'stock_adjust:ADJ-SEED-001',
      })
      await db.insert(stockAdjustmentLines).values({
        id: createId(),
        organizationId: ORG_ID,
        stockAdjustmentId: adjId,
        lineNo: 1,
        variantId: variants[1]!.id,
        skuCode: variants[1]!.skuCode,
        binCode: 'A-01-01-02',
        qtySystem: 12,
        qtyCounted: 11,
        qtyDiff: -1,
        note: '少一件',
      })
      console.log('created adjustment ADJ-SEED-001')
    } else {
      console.log('skip adjustment ADJ-SEED-001')
    }

    console.log('WMS seed done')
    console.log(`  SHOP_DEV_ORGANIZATION_ID=${ORG_ID}`)
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
