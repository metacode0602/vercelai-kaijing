/**
 * 种子：箱规主数据（模块16）。
 * 依赖：组织。
 *
 *   pnpm --filter @workspace/db db:seed:commerce-carton-specs
 */
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { createId } from '@paralleldrive/cuid2'
import { and, eq } from 'drizzle-orm'
import { createPgClient } from '../client'
import { commerceCartonSpecs, organization } from '../schema'

config({ path: resolve(process.cwd(), '../../.env') })
config({ path: resolve(process.cwd(), '.env') })

const ORG_ID = process.env.SHOP_DEV_ORGANIZATION_ID?.trim() || 'org_shop_dev_demo'

const SPECS = [
  {
    code: 'CTN-0001',
    name: '标准快递箱',
    applicablePack: '单件',
    lengthCm: '40',
    widthCm: '30',
    heightCm: '20',
    grossWeightKg: '12',
    unitsPerCarton: 40,
    note: '空运 DDP 常用',
  },
  {
    code: 'CTN-0002',
    name: '两件装礼盒箱',
    applicablePack: '两件装',
    lengthCm: '35',
    widthCm: '25',
    heightCm: '15',
    grossWeightKg: '8',
    unitsPerCarton: 20,
    note: '礼盒装商品使用',
  },
  {
    code: 'CTN-0003',
    name: '海运整箱',
    applicablePack: '单件',
    lengthCm: '60',
    widthCm: '45',
    heightCm: '35',
    grossWeightKg: '18',
    unitsPerCarton: 80,
    note: '海运拼箱/整柜装载；可被 ocean 柜次引用 code',
  },
] as const

async function main() {
  const { db, pool } = createPgClient()
  try {
    const [org] = await db.select().from(organization).where(eq(organization.id, ORG_ID)).limit(1)
    if (!org) throw new Error(`组织不存在：${ORG_ID}`)

    for (const s of SPECS) {
      const [existing] = await db
        .select()
        .from(commerceCartonSpecs)
        .where(and(eq(commerceCartonSpecs.organizationId, ORG_ID), eq(commerceCartonSpecs.code, s.code)))
        .limit(1)
      if (existing) {
        console.log('skip', s.code)
        continue
      }
      const now = new Date()
      await db.insert(commerceCartonSpecs).values({
        id: createId(),
        organizationId: ORG_ID,
        code: s.code,
        name: s.name,
        applicablePack: s.applicablePack,
        lengthCm: s.lengthCm,
        widthCm: s.widthCm,
        heightCm: s.heightCm,
        grossWeightKg: s.grossWeightKg,
        unitsPerCarton: s.unitsPerCarton,
        status: 'active',
        note: s.note,
        createdAt: now,
        updatedAt: now,
      })
      console.log('carton', s.code)
    }
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
