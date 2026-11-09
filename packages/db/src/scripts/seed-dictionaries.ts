/**
 * 种子：commerce_dictionaries 必要数据字典。
 * 默认初始化全部 tenant 组织；可用 SHOP_DEV_ORGANIZATION_ID 限定单个组织。
 * 幂等：已存在的字典 key 不覆盖，仅补齐缺失项。
 *
 *   pnpm --filter @workspace/db db:seed:dictionaries
 */
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { createId } from '@paralleldrive/cuid2'
import { and, eq, inArray } from 'drizzle-orm'
import { createPgClient } from '../client'
import { commerceDictionaries, organization } from '../schema'

config({ path: resolve(process.cwd(), '../../.env') })
config({ path: resolve(process.cwd(), '.env') })

/** 品牌 / 品类已有独立实体与维护页，不再作为普通字典。 */
const EXCLUDED_KEYS = ['product_brand', 'product_category']

type SeedDictionary = {
  key: string
  label: string
  description: string
  values: string[]
}

const DICTIONARIES: SeedDictionary[] = [
  {
    key: 'product_color',
    label: '颜色',
    description: '商品规格标准色；别名可归一到标准值',
    values: ['黑色', '白色', '深灰色', '蓝色', '红色'],
  },
  {
    key: 'product_size',
    label: '尺码',
    description: '商品规格标准尺码',
    values: ['M', 'L', 'XL', '2XL', '3XL', '4XL'],
  },
  {
    key: 'product_pack',
    label: '包装规格',
    description: '商品售卖单元（单件/两件装/礼盒）；箱规单独维护并引用此值',
    values: ['单件', '两件装', '礼盒'],
  },
  {
    key: 'product_style',
    label: '款式/版型',
    description: '商品款式与版型，可在字典页维护',
    values: ['基础款', '修身', '宽松', '运动款', '商务正装'],
  },
  {
    key: 'product_material',
    label: '材质',
    description: '商品材质，可在字典页维护',
    values: ['棉', '涤纶', '尼龙', '混纺', '皮革', '金属'],
  },
  {
    key: 'fulfillment_mode',
    label: '履约模式',
    description: '店铺可选；决定包裹状态流程',
    values: ['LGS', 'JSB 灰清'],
  },
  {
    key: 'warehouse_type',
    label: '仓库类型',
    description: '仓库主档使用',
    values: ['自营仓', '3PL 仓', '供应商仓'],
  },
  {
    key: 'purchase_reason',
    label: '采购原因',
    description: '采购申请和采购单共用；按单据类型限制可选值',
    values: ['常规补货', '新品首单', '活动备货', '缺货补单', '样品采购'],
  },
  {
    key: 'purchase_priority',
    label: '采购优先级',
    description: '采购申请和采购单共用；决定审批与排期顺序',
    values: ['普通', '紧急', '低'],
  },
  {
    key: 'stock_in_type',
    label: '入库类型',
    description: '仅入库单使用；不同入库类型对应不同来源单据',
    values: ['采购入库', '调拨入库', '退货入库', '盘盈入库', '其他入库'],
  },
  {
    key: 'stock_out_type',
    label: '出库类型',
    description: '仅出库单使用；不同出库类型对应不同去向',
    values: ['销售出库', '调拨出库', '采购退货', '盘亏出库', '其他出库'],
  },
  {
    key: 'stock_adjustment_type',
    label: '库存调整类型',
    description: '仅盘点与调整使用；区分盘盈、盘亏和报废',
    values: ['盘盈', '盘亏', '质量报废', '库位调整'],
  },
  {
    key: 'aftersale_type',
    label: '售后类型',
    description: '售后单使用；决定后续质检和回库流程',
    values: ['仅退款', '退货退款', '换货', '补发'],
  },
  {
    key: 'qc_status',
    label: '质检状态',
    description: '退货质检使用；可售、残次、报废多级结果',
    values: ['待检', '可售', '残次', '报废'],
  },
  {
    key: 'package_condition',
    label: '外包装状况',
    description: '退货质检和入库验收使用',
    values: ['完好', '轻微破损', '严重破损', '缺件'],
  },
  {
    key: 'platform_sync_status',
    label: '平台同步状态',
    description: '刊登、售后和订单同步共用',
    values: ['待同步', '同步中', '已同步', '同步失败'],
  },
  {
    key: 'review_sentiment',
    label: '评论情感',
    description: '评论分析使用；支持按业务需要新增自定义标签',
    values: ['正面', '中性', '负面'],
  },
]

async function main() {
  const { db, pool } = createPgClient()
  try {
    const targetOrgId = process.env.SHOP_DEV_ORGANIZATION_ID?.trim()
    const orgs = targetOrgId
      ? await db.select({ id: organization.id, name: organization.name }).from(organization).where(eq(organization.id, targetOrgId))
      : await db.select({ id: organization.id, name: organization.name }).from(organization).where(eq(organization.orgType, 'tenant'))

    if (orgs.length === 0) {
      throw new Error(
        targetOrgId ? `组织不存在：${targetOrgId}` : '未找到 tenant 组织，请先完成入驻或设置 SHOP_DEV_ORGANIZATION_ID',
      )
    }

    for (const org of orgs) {
      const existing = await db
        .select({ key: commerceDictionaries.key })
        .from(commerceDictionaries)
        .where(eq(commerceDictionaries.organizationId, org.id))
      const existingKeys = new Set(existing.map((row) => row.key))
      const now = new Date()
      const rows = DICTIONARIES.filter((dict) => !existingKeys.has(dict.key)).map((dict) => ({
        id: createId(),
        organizationId: org.id,
        key: dict.key,
        label: dict.label,
        description: dict.description,
        shared: true,
        values: dict.values,
        inactiveValues: [],
        createdAt: now,
        updatedAt: now,
      }))

      if (rows.length > 0) {
        await db.insert(commerceDictionaries).values(rows)
      }
      const removed = await db
        .delete(commerceDictionaries)
        .where(
          and(
            eq(commerceDictionaries.organizationId, org.id),
            inArray(commerceDictionaries.key, EXCLUDED_KEYS),
          ),
        )
        .returning({ key: commerceDictionaries.key })
      console.log(
        `${org.name} (${org.id}): 新增 ${rows.length} 个字典，已存在 ${existingKeys.size} 个，移除 ${removed.length} 个品牌/品类字典`,
      )
    }
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
