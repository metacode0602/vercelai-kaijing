/**
 * 种子：费用模板（进口税 / 平台费）— 模块5。
 * 迁入 LK apparel/electronics/home_sports + Lazada MY 占位 + platform_fee。
 *
 * 用法（仓库根，需 DATABASE_URL；先 migrate 0012）：
 *   pnpm --filter @workspace/db db:migrate
 *   pnpm --filter @workspace/db db:seed:commerce-fee-templates
 *
 * 环境变量：
 *   SHOP_DEV_ORGANIZATION_ID  可选，默认 org_shop_dev_demo
 */
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { createId } from '@paralleldrive/cuid2'
import { and, eq } from 'drizzle-orm'
import { createPgClient } from '../client'
import { feeTemplates, feeTemplateVersions, organization } from '../schema'

config({ path: resolve(process.cwd(), '../../.env') })
config({ path: resolve(process.cwd(), '.env') })

const ORG_ID = process.env.SHOP_DEV_ORGANIZATION_ID?.trim() || 'org_shop_dev_demo'

type FeeComponent = {
  code: string
  labelZh: string
  rate: number
  unit: 'pct' | 'usd'
  baseHint?: string
  note?: string
}

const LK_SEED_RATES = {
  apparel: {
    customs: 0.15,
    cess: 0.1,
    pal: 0.1,
    vat: 0.18,
    sscl: 0.025,
    hsHint: '6109.10',
    labelZh: '服装（示例）',
  },
  electronics: {
    customs: 0.1,
    cess: 0.05,
    pal: 0.1,
    vat: 0.18,
    sscl: 0.025,
    hsHint: '8471.80',
    labelZh: '3C 电子（示例）',
  },
  home_sports: {
    customs: 0.12,
    cess: 0.08,
    pal: 0.1,
    vat: 0.18,
    sscl: 0.025,
    hsHint: '9506.91',
    labelZh: '家居/运动（示例）',
  },
} as const

function ratesToComponents(profile: keyof typeof LK_SEED_RATES): FeeComponent[] {
  const rates = LK_SEED_RATES[profile]
  return [
    { code: 'customs', labelZh: 'Customs Duty', rate: rates.customs, unit: 'pct', baseHint: 'CIF', note: '税基 CIF' },
    { code: 'cess', labelZh: 'CESS', rate: rates.cess, unit: 'pct', baseHint: 'CIF', note: 'EDB CESS' },
    { code: 'pal', labelZh: 'PAL', rate: rates.pal, unit: 'pct', baseHint: 'CIF', note: 'PAL on CIF' },
    { code: 'vat', labelZh: 'VAT', rate: rates.vat, unit: 'pct', baseHint: 'v+10%v+d+c+p', note: '叠税基' },
    { code: 'sscl', labelZh: 'SSCL', rate: rates.sscl, unit: 'pct', baseHint: 'v+10%v+d+c+p', note: '叠税基' },
  ]
}

type SeedTpl = {
  code: string
  name: string
  platform: string
  country: string
  fulfillmentPool: string
  fulfillmentLogistics: string
  type: 'import_tax' | 'platform_fee'
  status: 'draft' | 'active' | 'disabled'
  note: string
  version: {
    effectiveFrom: string
    priority: number
    formulaProfile: string
    components: FeeComponent[]
    status: 'draft' | 'published'
    reviewNeeded: boolean
    note: string
  }
}

const SEEDS: SeedTpl[] = [
  {
    code: 'daraz_lk_import_apparel',
    name: 'Daraz LK 进口税 · 服装',
    platform: 'daraz',
    country: 'LK',
    fulfillmentPool: 'daraz_lk_sea_lot',
    fulfillmentLogistics: '',
    type: 'import_tax',
    status: 'active',
    note: '自 TARIFF_PROFILES.apparel 迁出 · 待报关行复核',
    version: {
      effectiveFrom: '2026-01-01',
      priority: 10,
      formulaProfile: 'apparel',
      components: ratesToComponents('apparel'),
      status: 'published',
      reviewNeeded: true,
      note: '示例 · 待报关行复核 · HS 示意 6109.10',
    },
  },
  {
    code: 'daraz_lk_import_electronics',
    name: 'Daraz LK 进口税 · 3C 电子',
    platform: 'daraz',
    country: 'LK',
    fulfillmentPool: 'daraz_lk_sea_lot',
    fulfillmentLogistics: '',
    type: 'import_tax',
    status: 'active',
    note: '自 TARIFF_PROFILES.electronics 迁出 · 待报关行复核',
    version: {
      effectiveFrom: '2026-01-01',
      priority: 10,
      formulaProfile: 'electronics',
      components: ratesToComponents('electronics'),
      status: 'published',
      reviewNeeded: true,
      note: '示例 · 待报关行复核 · HS 示意 8471.80',
    },
  },
  {
    code: 'daraz_lk_import_home_sports',
    name: 'Daraz LK 进口税 · 家居/运动',
    platform: 'daraz',
    country: 'LK',
    fulfillmentPool: 'daraz_lk_sea_lot',
    fulfillmentLogistics: '',
    type: 'import_tax',
    status: 'active',
    note: '自 TARIFF_PROFILES.home_sports 迁出 · 待报关行复核',
    version: {
      effectiveFrom: '2026-01-01',
      priority: 10,
      formulaProfile: 'home_sports',
      components: ratesToComponents('home_sports'),
      status: 'published',
      reviewNeeded: true,
      note: '示例 · 待报关行复核 · HS 示意 9506.91',
    },
  },
  {
    code: 'lazada_my_import_tax',
    name: 'Lazada MY 进口税（占位）',
    platform: 'lazada',
    country: 'MY',
    fulfillmentPool: 'lazada_cn_spot_xmn',
    fulfillmentLogistics: '',
    type: 'import_tax',
    status: 'draft',
    note: '首期国别占位税率 · 待报关行复核（C5-A）',
    version: {
      effectiveFrom: '2026-10-01',
      priority: 5,
      formulaProfile: 'lazada_my_placeholder',
      components: [
        { code: 'import_duty', labelZh: '进口关税（占位）', rate: 0.05, unit: 'pct', baseHint: 'CIF', note: '待复核' },
        { code: 'sst', labelZh: 'SST（占位）', rate: 0.1, unit: 'pct', baseHint: 'CIF+duty', note: '待复核' },
      ],
      status: 'published',
      reviewNeeded: true,
      note: 'Lazada 首期进口税叠占位 · 待报关行复核',
    },
  },
  {
    code: 'daraz_lk_platform_fee',
    name: 'Daraz LK 平台费（佣金/支付）',
    platform: 'daraz',
    country: 'LK',
    fulfillmentPool: 'daraz_lk_sea_lot',
    fulfillmentLogistics: '',
    type: 'platform_fee',
    status: 'active',
    note: '佣金与支付费占位，测算时可与进口税组合引用',
    version: {
      effectiveFrom: '2026-01-01',
      priority: 10,
      formulaProfile: 'platform_fee_v1',
      components: [
        { code: 'commission', labelZh: '平台佣金', rate: 0.08, unit: 'pct', baseHint: '售价', note: '占位' },
        { code: 'payment_fee', labelZh: '支付手续费', rate: 0.02, unit: 'pct', baseHint: '售价', note: '占位' },
      ],
      status: 'published',
      reviewNeeded: false,
      note: '佣金/支付费示例',
    },
  },
  {
    code: 'lazada_my_platform_fee',
    name: 'Lazada MY 平台费（佣金/支付）',
    platform: 'lazada',
    country: 'MY',
    fulfillmentPool: 'lazada_cn_spot_xmn',
    fulfillmentLogistics: '',
    type: 'platform_fee',
    status: 'active',
    note: '佣金与支付费占位',
    version: {
      effectiveFrom: '2026-01-01',
      priority: 10,
      formulaProfile: 'platform_fee_v1',
      components: [
        { code: 'commission', labelZh: '平台佣金', rate: 0.06, unit: 'pct', baseHint: '售价', note: '占位' },
        { code: 'payment_fee', labelZh: '支付手续费', rate: 0.025, unit: 'pct', baseHint: '售价', note: '占位' },
      ],
      status: 'published',
      reviewNeeded: false,
      note: '佣金/支付费示例',
    },
  },
]

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

    for (const seed of SEEDS) {
      const [existing] = await db
        .select({ id: feeTemplates.id })
        .from(feeTemplates)
        .where(and(eq(feeTemplates.organizationId, ORG_ID), eq(feeTemplates.code, seed.code)))
        .limit(1)

      let templateId = existing?.id
      if (!templateId) {
        templateId = createId()
        await db.insert(feeTemplates).values({
          id: templateId,
          organizationId: ORG_ID,
          code: seed.code,
          name: seed.name,
          platform: seed.platform,
          country: seed.country,
          fulfillmentPool: seed.fulfillmentPool || null,
          fulfillmentLogistics: seed.fulfillmentLogistics || null,
          type: seed.type,
          status: seed.status,
          note: seed.note,
        })
        console.log(`created template ${seed.code}`)
      } else {
        console.log(`template ${seed.code} exists`)
      }

      const [vExisting] = await db
        .select({ id: feeTemplateVersions.id })
        .from(feeTemplateVersions)
        .where(
          and(
            eq(feeTemplateVersions.organizationId, ORG_ID),
            eq(feeTemplateVersions.templateId, templateId),
            eq(feeTemplateVersions.versionNo, 1),
          ),
        )
        .limit(1)

      if (vExisting) {
        console.log(`  version v1 exists`)
        continue
      }

      const published = seed.version.status === 'published'
      await db.insert(feeTemplateVersions).values({
        id: createId(),
        organizationId: ORG_ID,
        templateId,
        versionNo: 1,
        effectiveFrom: new Date(`${seed.version.effectiveFrom}T00:00:00.000Z`),
        effectiveTo: null,
        priority: seed.version.priority,
        formulaProfile: seed.version.formulaProfile,
        components: seed.version.components,
        published,
        reviewNeeded: seed.version.reviewNeeded,
        status: seed.version.status,
        note: seed.version.note,
        reviewedBy: published ? 'seed' : null,
        reviewedAt: published ? new Date() : null,
      })
      console.log(`  created version v1 (${seed.version.status})`)
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
