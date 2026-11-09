/**
 * 种子：采购申请演示数据（依赖商品种子 SKU）。
 *
 * 用法（仓库根，需 DATABASE_URL）：
 *   pnpm --filter @workspace/db db:seed:commerce-products
 *   pnpm --filter @workspace/db db:seed:commerce-purchase
 *
 * 环境变量：
 *   SHOP_DEV_ORGANIZATION_ID  可选，默认 org_shop_dev_demo
 */
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { createId } from '@paralleldrive/cuid2'
import { and, eq, or } from 'drizzle-orm'
import { createPgClient } from '../client'
import { organization, productVariants, purchaseRequestLines, purchaseRequests } from '../schema'

config({ path: resolve(process.cwd(), '../../.env') })
config({ path: resolve(process.cwd(), '.env') })

const ORG_ID = process.env.SHOP_DEV_ORGANIZATION_ID?.trim() || 'org_shop_dev_demo'
const YEAR = new Date().getFullYear()

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

    const seeds = [
      {
        requestNo: `PR-${YEAR}-0001`,
        status: 'draft' as const,
        applicant: '杨洁',
        reason: '备货',
        submittedAt: null as Date | null,
        lines: [
          { sku: variants[0]!, qty: 100, unitPrice: 28 },
          { sku: variants[1]!, qty: 50, unitPrice: 28 },
        ],
      },
      {
        requestNo: `PR-${YEAR}-0002`,
        status: 'pending_approval' as const,
        applicant: '杨洁',
        reason: '补货',
        submittedAt: new Date(),
        lines: [{ sku: variants[0]!, qty: 200, unitPrice: 27.5 }],
      },
    ]

    for (const seed of seeds) {
      const [existing] = await db
        .select({ id: purchaseRequests.id })
        .from(purchaseRequests)
        .where(
          and(
            eq(purchaseRequests.organizationId, ORG_ID),
            eq(purchaseRequests.requestNo, seed.requestNo),
          ),
        )
        .limit(1)
      if (existing) {
        console.log(`skip ${seed.requestNo} (exists)`)
        continue
      }

      const totalAmount = seed.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0)
      const requestId = createId()
      await db.insert(purchaseRequests).values({
        id: requestId,
        organizationId: ORG_ID,
        requestNo: seed.requestNo,
        supplierName: '厦门优品服饰有限公司',
        warehouseCode: 'WH-CN-XMN-001',
        status: seed.status,
        expectedArrivalAt: `${YEAR}-12-20`,
        currency: 'CNY',
        totalAmount: String(totalAmount),
        reason: seed.reason,
        remark: 'seed-commerce-purchase',
        applicantName: seed.applicant,
        approverName: '采购审核岗',
        submittedAt: seed.submittedAt,
      })

      let lineNo = 0
      for (const line of seed.lines) {
        lineNo += 1
        const amount = line.qty * line.unitPrice
        await db.insert(purchaseRequestLines).values({
          id: createId(),
          organizationId: ORG_ID,
          purchaseRequestId: requestId,
          lineNo,
          variantId: line.sku.id,
          skuCode: line.sku.skuCode,
          qty: line.qty,
          unitPrice: String(line.unitPrice),
          amount: String(amount),
        })
      }
      console.log(`created ${seed.requestNo} (${seed.status})`)
    }
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
