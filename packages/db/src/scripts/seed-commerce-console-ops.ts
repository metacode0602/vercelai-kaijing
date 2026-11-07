/**
 * 种子：模块15 console ops（评论 / 承运商 / 品类 / 字典 / 导入模板 / 审计）。
 * 依赖：组织；建议先跑 commerce-products（提供 shop）。
 *
 *   pnpm --filter @workspace/db db:seed:commerce-products
 *   pnpm --filter @workspace/db db:seed:commerce-console-ops
 */
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { createId } from '@paralleldrive/cuid2'
import { and, eq } from 'drizzle-orm'
import { createPgClient } from '../client'
import {
  auditEvents,
  commerceCarriers,
  commerceCategories,
  commerceDictionaries,
  commerceImportTemplates,
  productReviewMedia,
  productReviews,
  shops,
  organization,
} from '../schema'

config({ path: resolve(process.cwd(), '../../.env') })
config({ path: resolve(process.cwd(), '.env') })

const ORG_ID = process.env.SHOP_DEV_ORGANIZATION_ID?.trim() || 'org_shop_dev_demo'

const DICTS = [
  { key: 'product_brand', label: '品牌', description: '商品品牌主数据', values: ['HELLO COSMOS', 'LinkForge', '其他'] },
  { key: 'product_category', label: '商品品类', description: '扁平品类提示；多级在品类树', values: ['服装', '家居', '配饰', '数码/电脑配件'] },
  { key: 'product_color', label: '颜色', description: '规格标准色', values: ['黑色', '白色', '深灰色', '蓝色', '红色'] },
  { key: 'product_size', label: '尺码', description: '规格标准尺码', values: ['M', 'L', 'XL', '2XL'] },
  { key: 'product_pack', label: '包装规格', description: '售卖单元', values: ['单件', '两件装', '礼盒'] },
  { key: 'product_style', label: '款式/版型', description: '商品款式与版型，可在字典页维护', values: ['基础款', '修身', '宽松', '运动款', '商务正装'] },
  { key: 'product_material', label: '材质', description: '商品材质，可在字典页维护', values: ['棉', '涤纶', '尼龙', '混纺', '皮革', '金属'] },
] as const

async function main() {
  const { db, pool } = createPgClient()
  try {
    const [org] = await db.select().from(organization).where(eq(organization.id, ORG_ID)).limit(1)
    if (!org) throw new Error(`组织不存在：${ORG_ID}`)

    const [shop] = await db.select().from(shops).where(eq(shops.organizationId, ORG_ID)).limit(1)

    for (const d of DICTS) {
      const [existing] = await db
        .select()
        .from(commerceDictionaries)
        .where(and(eq(commerceDictionaries.organizationId, ORG_ID), eq(commerceDictionaries.key, d.key)))
        .limit(1)
      if (existing) {
        console.log('skip dict', d.key)
        continue
      }
      const now = new Date()
      await db.insert(commerceDictionaries).values({
        id: createId(),
        organizationId: ORG_ID,
        key: d.key,
        label: d.label,
        description: d.description,
        shared: true,
        values: [...d.values],
        inactiveValues: [],
        createdAt: now,
        updatedAt: now,
      })
      console.log('dict', d.key)
    }

    const carriers = [
      { code: 'CAR-LGS', name: 'LGS', type: 'platform', coverage: 'MY / PH / SG / VN', note: 'Lazada 官方物流主档' },
      { code: 'CAR-DARAZ', name: 'Daraz Express', type: 'platform', coverage: 'LK', note: 'Daraz 官方物流主档' },
      { code: 'CAR-OCEAN', name: '海运拼箱(配置)', type: 'ocean', coverage: 'CN → LK / MY', note: '关联 ocean_shipments；无假报价' },
    ]
    for (const c of carriers) {
      const [existing] = await db
        .select()
        .from(commerceCarriers)
        .where(and(eq(commerceCarriers.organizationId, ORG_ID), eq(commerceCarriers.code, c.code)))
        .limit(1)
      if (existing) {
        console.log('skip carrier', c.code)
        continue
      }
      const now = new Date()
      await db.insert(commerceCarriers).values({
        id: createId(),
        organizationId: ORG_ID,
        code: c.code,
        name: c.name,
        type: c.type,
        coverage: c.coverage,
        contact: '',
        phone: '',
        status: 'active',
        note: c.note,
        createdAt: now,
        updatedAt: now,
      })
      console.log('carrier', c.code)
    }

    const cats = [
      { code: 'APPAREL', name: '服装', parent: null as string | null, sort: 10 },
      { code: 'APPAREL-TOPS', name: '上衣', parent: 'APPAREL', sort: 10 },
      { code: 'ELECTRONICS', name: '数码', parent: null, sort: 20 },
    ]
    const codeToId = new Map<string, string>()
    for (const c of cats) {
      const [existing] = await db
        .select()
        .from(commerceCategories)
        .where(and(eq(commerceCategories.organizationId, ORG_ID), eq(commerceCategories.code, c.code)))
        .limit(1)
      if (existing) {
        codeToId.set(c.code, existing.id)
        console.log('skip category', c.code)
        continue
      }
      const id = createId()
      const now = new Date()
      await db.insert(commerceCategories).values({
        id,
        organizationId: ORG_ID,
        code: c.code,
        name: c.name,
        parentId: c.parent ? codeToId.get(c.parent) ?? null : null,
        sort: c.sort,
        status: 'active',
        note: '',
        screenshots: [],
        createdAt: now,
        updatedAt: now,
      })
      codeToId.set(c.code, id)
      console.log('category', c.code)
    }

    const [tpl] = await db
      .select()
      .from(commerceImportTemplates)
      .where(eq(commerceImportTemplates.organizationId, ORG_ID))
      .limit(1)
    if (!tpl) {
      const now = new Date()
      await db.insert(commerceImportTemplates).values({
        id: createId(),
        organizationId: ORG_ID,
        kind: '商品 / SKU',
        version: 'v2026-11',
        fields: 'SPU, SKU, 颜色, 尺码, 包装, 重量',
        duplicateStrategy: '仅更新允许字段',
        rollbackStrategy: '允许回滚',
        status: 'active',
        note: '种子模板；批处理作业待接入',
        createdAt: now,
        updatedAt: now,
      })
      console.log('import template')
    }

    if (shop) {
      const [rev] = await db
        .select()
        .from(productReviews)
        .where(and(eq(productReviews.organizationId, ORG_ID), eq(productReviews.externalReviewId, 'seed-review-1')))
        .limit(1)
      if (!rev) {
        const id = createId()
        const now = new Date()
        await db.insert(productReviews).values({
          id,
          organizationId: ORG_ID,
          shopId: shop.id,
          externalItemId: 'ITEM-SEED-001',
          sellerSku: 'TEE-001',
          externalReviewId: 'seed-review-1',
          rating: 5,
          title: 'Great tee',
          content: 'Soft fabric, good fit.',
          contentZh: '面料柔软，尺码合适。',
          contentLang: 'en',
          reviewAt: now,
          buyerDisplayName: 'A***k',
          isAnonymous: false,
          source: 'manual',
          status: 'active',
          replyStatus: 'none',
          raw: { tags: ['正面'], seed: true },
          fetchedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        await db.insert(productReviewMedia).values({
          id: createId(),
          organizationId: ORG_ID,
          reviewId: id,
          mediaType: 'image',
          url: 'https://placehold.co/120x120/png',
          sortOrder: 0,
          createdAt: now,
        })
        console.log('review seed-review-1')
      } else {
        console.log('skip review')
      }
    } else {
      console.log('skip reviews (no shop)')
    }

    const [aud] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.organizationId, ORG_ID), eq(auditEvents.action, 'seed.console_ops')))
      .limit(1)
    if (!aud) {
      await db.insert(auditEvents).values({
        id: createId(),
        organizationId: ORG_ID,
        actorLabel: 'seed',
        action: 'seed.console_ops',
        entityType: 'system',
        entityId: 'module15',
        result: 'success',
        detail: '模块15 console ops 种子写入',
        createdAt: new Date(),
      })
      console.log('audit seed')
    }

    console.log('done commerce-console-ops')
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
