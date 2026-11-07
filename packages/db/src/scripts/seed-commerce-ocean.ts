/**
 * 种子：海运柜次演示数据（依赖商品种子 SKU）。
 *
 * 用法（仓库根，需 DATABASE_URL）：
 *   pnpm --filter @workspace/db db:seed:commerce-products
 *   pnpm --filter @workspace/db db:seed:commerce-ocean
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
  commerceWarehouses,
  inventoryBalances,
  oceanShipmentBoxes,
  oceanShipmentLines,
  oceanShipments,
  organization,
  productVariants,
  skuCosts,
} from '../schema'

config({ path: resolve(process.cwd(), '../../.env') })
config({ path: resolve(process.cwd(), '.env') })

const ORG_ID = process.env.SHOP_DEV_ORGANIZATION_ID?.trim() || 'org_shop_dev_demo'
const WH = 'WH-LK-CMB-001'
const BIN = 'STAGING'

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

    const [warehouse] = await db
      .select({ id: commerceWarehouses.id })
      .from(commerceWarehouses)
      .where(
        and(eq(commerceWarehouses.organizationId, ORG_ID), eq(commerceWarehouses.code, WH)),
      )
      .limit(1)
    let destinationWarehouseId: string
    if (warehouse) {
      destinationWarehouseId = warehouse.id
    } else {
      destinationWarehouseId = createId()
      await db.insert(commerceWarehouses).values({
        id: destinationWarehouseId,
        organizationId: ORG_ID,
        code: WH,
        name: '科伦坡本地仓',
        type: 'self_operated',
        country: 'LK',
        timezone: 'Asia/Colombo',
        operatingCurrency: 'LKR',
        status: 'active',
        note: 'Daraz LK 海运目的仓',
      })
      console.log(`created warehouse ${WH}`)
    }

    const seeds = [
      {
        lotCode: 'LOT-CMB-2026-10-01',
        status: 'departed',
        containerNo: 'MSKU7834219',
        containerType: '40HQ',
        freightMode: 'FCL40',
        etd: '2026-09-15',
        etaPort: '2026-11-05',
        etaWarehouse: '2026-11-12',
        notes: '海运约 50 天；未入厦门现货池',
        lines: [
          { variant: variants[0]!, qtyShipped: 400 },
          { variant: variants[1]!, qtyShipped: 120 },
        ],
        boxes: [{ boxNo: 'FCL-1', leadRef: 'LEAD-FCL-001', cbm: '58.0000', weightKg: '18500.000' }],
        apply: 'depart' as const,
      },
      {
        lotCode: 'LOT-CMB-2026-09-02',
        status: 'customs',
        containerNo: 'TGHU9928103',
        containerType: '20GP',
        freightMode: 'LCL',
        etd: '2026-08-20',
        etaPort: '2026-10-10',
        etaWarehouse: '2026-10-18',
        notes: 'PAL/CESS 单据待补',
        lines: [
          { variant: variants[2]!, qtyShipped: 200 },
          { variant: variants[0]!, qtyShipped: 80 },
        ],
        boxes: [
          { boxNo: 'BX-01', leadRef: 'LEAD-LCL-88', cbm: '2.4000', weightKg: '310.000' },
          { boxNo: 'BX-02', leadRef: 'LEAD-LCL-88', cbm: '2.1000', weightKg: '280.000' },
        ],
        apply: 'customs' as const,
      },
      {
        lotCode: 'LOT-CMB-2026-08-01',
        status: 'received',
        containerNo: 'CMAU5510288',
        containerType: '40HQ',
        freightMode: 'FCL40',
        etd: '2026-07-01',
        etaPort: '2026-08-20',
        etaWarehouse: '2026-08-28',
        notes: '已上架 Colombo',
        lines: [
          { variant: variants[0]!, qtyShipped: 300, qtyReceived: 292, qtyDamaged: 8 },
          { variant: variants[1]!, qtyShipped: 480, qtyReceived: 480, qtyDamaged: 0 },
        ],
        boxes: [{ boxNo: 'FCL-1', leadRef: 'LEAD-FCL-AUG', cbm: '60.0000', weightKg: '19200.000' }],
        apply: 'receive' as const,
      },
    ]

    for (const seed of seeds) {
      const [existing] = await db
        .select({ id: oceanShipments.id })
        .from(oceanShipments)
        .where(and(eq(oceanShipments.organizationId, ORG_ID), eq(oceanShipments.lotCode, seed.lotCode)))
        .limit(1)
      if (existing) {
        console.log(`skip ${seed.lotCode} (exists)`)
        continue
      }

      const shipmentId = createId()
      await db.insert(oceanShipments).values({
        id: shipmentId,
        organizationId: ORG_ID,
        lotCode: seed.lotCode,
        containerNo: seed.containerNo,
        containerType: seed.containerType,
        freightMode: seed.freightMode,
        platform: 'daraz',
        originPort: 'CNXMN',
        destPort: 'LKCMB',
        destinationWarehouseId,
        destinationWarehouseCode: WH,
        status: seed.status,
        etd: seed.etd,
        etaPort: seed.etaPort,
        etaWarehouse: seed.etaWarehouse,
        notes: seed.notes,
        packingDetails: {
          boxCount: seed.boxes.length,
          leadRefs: [...new Set(seed.boxes.map((b) => b.leadRef))],
        },
      })

      const lineIds: { id: string; variantId: string; qtyShipped: number; qtyReceived: number; qtyDamaged: number }[] =
        []
      for (const line of seed.lines) {
        const lineId = createId()
        const qtyReceived = 'qtyReceived' in line ? line.qtyReceived : 0
        const qtyDamaged = 'qtyDamaged' in line ? line.qtyDamaged : 0
        await db.insert(oceanShipmentLines).values({
          id: lineId,
          organizationId: ORG_ID,
          shipmentId,
          variantId: line.variant.id,
          skuCode: line.variant.skuCode,
          qtyShipped: line.qtyShipped,
          qtyReceived,
          qtyDamaged,
        })
        lineIds.push({
          id: lineId,
          variantId: line.variant.id,
          qtyShipped: line.qtyShipped,
          qtyReceived,
          qtyDamaged,
        })
      }

      for (const box of seed.boxes) {
        await db.insert(oceanShipmentBoxes).values({
          id: createId(),
          organizationId: ORG_ID,
          shipmentId,
          boxNo: box.boxNo,
          leadRef: box.leadRef,
          cbm: box.cbm,
          weightKg: box.weightKg,
        })
      }

      // 直接写入余额投影（演示态；运行时推进会用幂等流水）
      for (const line of lineIds) {
        const [bal] = await db
          .select()
          .from(inventoryBalances)
          .where(
            and(
              eq(inventoryBalances.organizationId, ORG_ID),
              eq(inventoryBalances.warehouseCode, WH),
              eq(inventoryBalances.binCode, BIN),
              eq(inventoryBalances.variantId, line.variantId),
            ),
          )
          .limit(1)

        let inTransit = bal?.inTransit ?? 0
        let customs = bal?.customsClearing ?? 0
        let onHand = bal?.onHand ?? 0
        let damaged = bal?.damaged ?? 0
        if (seed.apply === 'depart') inTransit += line.qtyShipped
        if (seed.apply === 'customs') customs += line.qtyShipped
        if (seed.apply === 'receive') {
          onHand += line.qtyReceived
          damaged += line.qtyDamaged
        }

        if (!bal) {
          await db.insert(inventoryBalances).values({
            id: createId(),
            organizationId: ORG_ID,
            warehouseCode: WH,
            binCode: BIN,
            variantId: line.variantId,
            onHand,
            damaged,
            inTransit,
            customsClearing: customs,
          })
        } else {
          await db
            .update(inventoryBalances)
            .set({
              onHand,
              damaged,
              inTransit,
              customsClearing: customs,
              version: bal.version + 1,
              updatedAt: new Date(),
            })
            .where(eq(inventoryBalances.id, bal.id))
        }
      }

      if (seed.apply === 'receive') {
        const v = seed.lines[0]!.variant
        await db.insert(skuCosts).values({
          id: createId(),
          organizationId: ORG_ID,
          variantId: v.id,
          kind: 'landed_unit',
          amount: '4.8200',
          currency: 'USD',
          note: `seed ${seed.lotCode}`,
          versionNo: 1,
          containerLotId: shipmentId,
          taxTemplateCode: 'LK_PAL_CESS_VAT_SSCL',
          landedUnitCost: '4.8200',
          effectiveFrom: new Date('2026-08-28T00:00:00Z'),
          calculatorSnapshot: { seed: true, freightMode: seed.freightMode },
        })
      }

      console.log(`seeded ${seed.lotCode} status=${seed.status}`)
    }

    console.log('seed-commerce-ocean done')
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
