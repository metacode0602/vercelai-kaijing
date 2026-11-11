/**
 * 平台字典 / 内部品类树 / 承运商名称 / 导入模板目录，以及组织入驻初始化。
 *
 * - 目录由 `ensure*Catalog` 幂等写入（只补缺失，不覆盖运营已改行）。
 * - 企业入驻审核通过时调用 `initializeOrganizationCatalogs`：只拷贝 active 项，
 *   已有业务键不覆盖；品类 parent_id 映射到本组织新节点。
 * - 不要把演示商品、品牌、供应商、仓库、未复核税率写入这些目录。
 */
import { createId } from "@paralleldrive/cuid2"
import { eq } from "drizzle-orm"
import type { DbLike } from "./platform-basics"
import { ensurePlatformBasicsCatalog, initializePlatformBasicsForOrganization } from "./platform-basics"
import {
  commerceCarriers,
  commerceCategories,
  commerceDictionaries,
  commerceImportTemplates,
  organizationSettings,
  platformCarriersCatalog,
  platformCategoryTreesCatalog,
  platformDictionariesCatalog,
  platformImportTemplatesCatalog,
  type PlatformCatalogStatus,
  type PlatformCarriersCatalogRow,
  type PlatformDictionariesCatalogRow,
  type PlatformImportTemplatesCatalogRow,
} from "./commerce-schema"

/** 品牌 / 品类已有独立实体，禁止写入平台字典目录或租户初始化。 */
export const EXCLUDED_DICTIONARY_KEYS = ["product_brand", "product_category"] as const

/** 新组织偏好的默认展示币种。USD 仍在有效币种目录中，供运价卡等使用。 */
export const DEFAULT_ORGANIZATION_DISPLAY_CURRENCY = "CNY"
export const DEFAULT_ORGANIZATION_TIMEZONE = "Asia/Shanghai"

export type CatalogInsertResult = { inserted: number }

export type OrganizationCatalogInitResult = {
  platformBasics: number
  dictionaries: number
  categories: number
  carriers: number
  importTemplates: number
  organizationSettings: number
}

export type PlatformDictionaryRecord = {
  key: string
  label: string
  description: string
  values: string[]
  valueTitles: Record<string, string>
  inactiveValues: string[]
  status: PlatformCatalogStatus
  sortOrder: number
}

export type PlatformCategoryRecord = {
  code: string
  name: string
  parentCode: string | null
  sort: number
  status: PlatformCatalogStatus
  note: string
}

export type PlatformCarrierRecord = {
  code: string
  name: string
  type: string
  coverage: string
  note: string
  status: PlatformCatalogStatus
  sortOrder: number
}

export type PlatformImportTemplateRecord = {
  kind: string
  version: string
  fields: string
  duplicateStrategy: string
  rollbackStrategy: string
  note: string
  status: PlatformCatalogStatus
  sortOrder: number
}

export const DEFAULT_PLATFORM_DICTIONARIES: PlatformDictionaryRecord[] = [
  {
    key: "product_color",
    label: "颜色",
    description: "商品规格标准色；别名可归一到标准值",
    values: ["黑色", "白色", "深灰色", "蓝色", "红色"],
    valueTitles: {},
    inactiveValues: [],
    status: "active",
    sortOrder: 10,
  },
  {
    key: "product_size",
    label: "尺码",
    description: "商品规格标准尺码",
    values: ["S", "M", "L", "XL", "2XL", "3XL", "4XL"],
    valueTitles: {},
    inactiveValues: [],
    status: "active",
    sortOrder: 20,
  },
  {
    key: "product_pack",
    label: "包装规格",
    description: "商品售卖单元（单件/两件装/礼盒）；箱规单独维护并引用此值",
    values: ["单件", "两件装", "礼盒"],
    valueTitles: {},
    inactiveValues: [],
    status: "active",
    sortOrder: 30,
  },
  {
    key: "product_style",
    label: "款式/版型",
    description: "商品款式与版型，可在字典页维护",
    values: ["基础款", "修身", "宽松", "运动款", "商务正装"],
    valueTitles: {},
    inactiveValues: [],
    status: "active",
    sortOrder: 40,
  },
  {
    key: "product_material",
    label: "材质",
    description: "商品材质，可在字典页维护",
    values: ["棉", "涤纶", "尼龙", "混纺", "皮革", "金属"],
    valueTitles: {},
    inactiveValues: [],
    status: "active",
    sortOrder: 50,
  },
  {
    key: "fulfillment_mode",
    label: "履约模式",
    description: "店铺可选；与新建店铺表单对齐",
    values: ["自营仓发货", "平台仓（LGS）", "JSB 灰清", "混合"],
    valueTitles: {},
    inactiveValues: [],
    status: "active",
    sortOrder: 60,
  },
  {
    key: "warehouse_type",
    label: "仓库类型",
    description: "仓库主档使用；与 WMS 页面枚举对齐",
    values: ["自营仓", "LGS", "JSB", "第三方仓"],
    valueTitles: {},
    inactiveValues: [],
    status: "active",
    sortOrder: 70,
  },
  {
    key: "purchase_reason",
    label: "采购原因",
    description: "采购申请和采购单共用；按单据类型限制可选值",
    values: ["常规补货", "新品首单", "活动备货", "缺货补单", "样品采购"],
    valueTitles: {},
    inactiveValues: [],
    status: "active",
    sortOrder: 80,
  },
  {
    key: "purchase_priority",
    label: "采购优先级",
    description: "采购申请和采购单共用；决定审批与排期顺序",
    values: ["普通", "紧急", "低"],
    valueTitles: {},
    inactiveValues: [],
    status: "active",
    sortOrder: 90,
  },
  {
    key: "stock_in_type",
    label: "入库类型",
    description: "仅入库单使用；不同入库类型对应不同来源单据",
    values: ["采购入库", "调拨入库", "退货入库", "盘盈入库", "其他入库"],
    valueTitles: {},
    inactiveValues: [],
    status: "active",
    sortOrder: 100,
  },
  {
    key: "stock_out_type",
    label: "出库类型",
    description: "仅出库单使用；不同出库类型对应不同去向",
    values: ["销售出库", "调拨出库", "采购退货", "盘亏出库", "其他出库"],
    valueTitles: {},
    inactiveValues: [],
    status: "active",
    sortOrder: 110,
  },
  {
    key: "stock_adjustment_type",
    label: "库存调整类型",
    description: "仅盘点与调整使用；区分盘盈、盘亏和报废",
    values: ["盘盈", "盘亏", "质量报废", "库位调整"],
    valueTitles: {},
    inactiveValues: [],
    status: "active",
    sortOrder: 120,
  },
  {
    key: "aftersale_type",
    label: "售后类型",
    description: "售后单使用；决定后续质检和回库流程",
    values: ["仅退款", "退货退款", "换货", "补发"],
    valueTitles: {},
    inactiveValues: [],
    status: "active",
    sortOrder: 130,
  },
  {
    key: "qc_status",
    label: "质检状态",
    description: "退货质检使用；可售、残次、报废多级结果",
    values: ["待检", "可售", "残次", "报废"],
    valueTitles: {},
    inactiveValues: [],
    status: "active",
    sortOrder: 140,
  },
  {
    key: "package_condition",
    label: "外包装状况",
    description: "退货质检和入库验收使用",
    values: ["完好", "轻微破损", "严重破损", "缺件"],
    valueTitles: {},
    inactiveValues: [],
    status: "active",
    sortOrder: 150,
  },
  {
    key: "platform_sync_status",
    label: "平台同步状态",
    description: "刊登、售后和订单同步展示用。底层同步状态机仍以代码为准",
    values: ["待同步", "同步中", "已同步", "同步失败"],
    valueTitles: {},
    inactiveValues: [],
    status: "active",
    sortOrder: 160,
  },
  {
    key: "review_sentiment",
    label: "评论情感",
    description: "评论分析使用；支持按业务需要新增自定义标签",
    values: ["正面", "中性", "负面"],
    valueTitles: {},
    inactiveValues: [],
    status: "active",
    sortOrder: 170,
  },
]

/** 内部经营分类默认树（不是 Lazada / Daraz 平台类目）。 */
export const DEFAULT_PLATFORM_CATEGORY_TREE: PlatformCategoryRecord[] = [
  { code: "APPAREL", name: "服装", parentCode: null, sort: 10, status: "active", note: "" },
  { code: "APPAREL-TOPS", name: "上衣", parentCode: "APPAREL", sort: 10, status: "active", note: "" },
  {
    code: "APPAREL-TOPS-TEE",
    name: "T恤",
    parentCode: "APPAREL-TOPS",
    sort: 10,
    status: "active",
    note: "",
  },
  { code: "APPAREL-BOTTOMS", name: "下装", parentCode: "APPAREL", sort: 20, status: "active", note: "" },
  { code: "ELECTRONICS", name: "数码", parentCode: null, sort: 20, status: "active", note: "" },
  {
    code: "ELECTRONICS-ACCESSORIES",
    name: "电脑配件",
    parentCode: "ELECTRONICS",
    sort: 10,
    status: "active",
    note: "",
  },
  { code: "HOME", name: "家居", parentCode: null, sort: 30, status: "active", note: "" },
  { code: "HOME-KITCHEN", name: "厨房用品", parentCode: "HOME", sort: 10, status: "active", note: "" },
  { code: "SPORTS", name: "运动", parentCode: null, sort: 40, status: "active", note: "" },
]

export const DEFAULT_PLATFORM_CARRIERS: PlatformCarrierRecord[] = [
  {
    code: "CAR-LGS",
    name: "LGS",
    type: "platform",
    coverage: "MY / PH / SG / TH / VN / ID",
    note: "Lazada 官方物流名称模板，不含联系人与报价",
    status: "active",
    sortOrder: 10,
  },
  {
    code: "CAR-DARAZ",
    name: "Daraz Express",
    type: "platform",
    coverage: "LK",
    note: "Daraz 官方物流名称模板，不含联系人与报价",
    status: "active",
    sortOrder: 20,
  },
]

export const DEFAULT_PLATFORM_IMPORT_TEMPLATES: PlatformImportTemplateRecord[] = [
  {
    kind: "商品 / SKU",
    version: "v1",
    fields: "SPU, SKU, 颜色, 尺码, 包装, 重量",
    duplicateStrategy: "仅更新允许字段",
    rollbackStrategy: "允许回滚",
    note: "平台标准导入字段说明，不含商品数据行",
    status: "active",
    sortOrder: 10,
  },
]

export function isActiveCatalogStatus(status: string | null | undefined): boolean {
  return status === "active"
}

/**
 * 返回自身及祖先链均为 active 的节点（用于拷贝，避免子节点悬空）。
 * 环或缺失父节点时跳过该分支。
 */
export function categoryNodesReadyToCopy<T extends { id: string; parentId: string | null; status: string }>(
  nodes: T[],
): T[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const memo = new Map<string, boolean>()
  const visiting = new Set<string>()

  const chainActive = (id: string): boolean => {
    if (memo.has(id)) return memo.get(id)!
    if (visiting.has(id)) {
      memo.set(id, false)
      return false
    }
    const node = byId.get(id)
    if (!node || !isActiveCatalogStatus(node.status)) {
      memo.set(id, false)
      return false
    }
    if (!node.parentId) {
      memo.set(id, true)
      return true
    }
    visiting.add(id)
    const ok = chainActive(node.parentId)
    visiting.delete(id)
    memo.set(id, ok)
    return ok
  }

  return nodes.filter((node) => chainActive(node.id))
}

function isExcludedDictionaryKey(key: string) {
  return (EXCLUDED_DICTIONARY_KEYS as readonly string[]).includes(key)
}

function dictionaryFromRow(row: PlatformDictionariesCatalogRow): PlatformDictionaryRecord | null {
  if (isExcludedDictionaryKey(row.key)) return null
  return {
    key: row.key,
    label: row.label,
    description: row.description ?? "",
    values: Array.isArray(row.values) ? row.values.map(String) : [],
    valueTitles:
      row.valueTitles && typeof row.valueTitles === "object"
        ? Object.fromEntries(Object.entries(row.valueTitles).map(([value, title]) => [value, String(title)]))
        : {},
    inactiveValues: Array.isArray(row.inactiveValues) ? row.inactiveValues.map(String) : [],
    status: row.status === "inactive" ? "inactive" : "active",
    sortOrder: Number(row.sortOrder ?? 0),
  }
}

export async function ensurePlatformDictionariesCatalog(db: DbLike): Promise<CatalogInsertResult> {
  const existing = await db.select({ key: platformDictionariesCatalog.key }).from(platformDictionariesCatalog)
  const present = new Set(existing.map((row) => row.key))
  const now = new Date()
  const rows = DEFAULT_PLATFORM_DICTIONARIES.filter(
    (record) => !present.has(record.key) && !isExcludedDictionaryKey(record.key),
  ).map((record) => ({
    id: createId(),
    key: record.key,
    label: record.label,
    description: record.description,
    values: record.values,
    valueTitles: record.valueTitles,
    inactiveValues: record.inactiveValues,
    status: record.status,
    sortOrder: record.sortOrder,
    createdAt: now,
    updatedAt: now,
  }))
  if (rows.length > 0) {
    await db.insert(platformDictionariesCatalog).values(rows)
  }
  return { inserted: rows.length }
}

export async function initializeDictionariesForOrganization(
  db: DbLike,
  organizationId: string,
): Promise<CatalogInsertResult> {
  const catalog = await db
    .select()
    .from(platformDictionariesCatalog)
    .orderBy(platformDictionariesCatalog.sortOrder, platformDictionariesCatalog.key)
  if (catalog.length === 0) return { inserted: 0 }

  const existing = await db
    .select({ key: commerceDictionaries.key })
    .from(commerceDictionaries)
    .where(eq(commerceDictionaries.organizationId, organizationId))
  const present = new Set(existing.map((row) => row.key))
  const now = new Date()
  const rows = catalog.flatMap((row) => {
    const record = dictionaryFromRow(row)
    if (!record || !isActiveCatalogStatus(record.status) || present.has(record.key)) return []
    return [
      {
        id: createId(),
        organizationId,
        sourceId: row.id,
        key: record.key,
        label: record.label,
        description: record.description,
        shared: true,
        values: record.values,
        valueTitles: record.valueTitles,
        inactiveValues: record.inactiveValues,
        createdAt: now,
        updatedAt: now,
      },
    ]
  })
  if (rows.length > 0) {
    await db.insert(commerceDictionaries).values(rows)
  }
  return { inserted: rows.length }
}

export async function ensurePlatformCategoryTreesCatalog(db: DbLike): Promise<CatalogInsertResult> {
  const existing = await db
    .select({ id: platformCategoryTreesCatalog.id, code: platformCategoryTreesCatalog.code })
    .from(platformCategoryTreesCatalog)
  const codeToId = new Map(existing.map((row) => [row.code, row.id]))
  const now = new Date()
  let inserted = 0
  for (const record of DEFAULT_PLATFORM_CATEGORY_TREE) {
    if (codeToId.has(record.code)) continue
    const id = createId()
    const parentId = record.parentCode ? (codeToId.get(record.parentCode) ?? null) : null
    await db.insert(platformCategoryTreesCatalog).values({
      id,
      code: record.code,
      name: record.name,
      parentId,
      sort: record.sort,
      status: record.status,
      note: record.note,
      createdAt: now,
      updatedAt: now,
    })
    codeToId.set(record.code, id)
    inserted += 1
  }
  return { inserted }
}

export async function initializeCategoryTreeForOrganization(
  db: DbLike,
  organizationId: string,
): Promise<CatalogInsertResult> {
  const catalog = await db.select().from(platformCategoryTreesCatalog)
  if (catalog.length === 0) return { inserted: 0 }

  const copyable = categoryNodesReadyToCopy(catalog)
  const existing = await db
    .select({ id: commerceCategories.id, code: commerceCategories.code })
    .from(commerceCategories)
    .where(eq(commerceCategories.organizationId, organizationId))
  const orgCodeToId = new Map(existing.map((row) => [row.code, row.id]))
  const catalogById = new Map(catalog.map((row) => [row.id, row]))

  const pending = copyable.filter((row) => !orgCodeToId.has(row.code))
  if (pending.length === 0) return { inserted: 0 }

  const now = new Date()
  let inserted = 0
  const remaining = [...pending]
  // 按父先子后插入；最多 pending.length 轮，防止异常环卡住
  while (remaining.length > 0) {
    const index = remaining.findIndex((row) => {
      if (!row.parentId) return true
      const parent = catalogById.get(row.parentId)
      if (!parent) return false
      return orgCodeToId.has(parent.code)
    })
    if (index < 0) break
    const [row] = remaining.splice(index, 1)
    if (!row) break
    const parent = row.parentId ? catalogById.get(row.parentId) : null
    const id = createId()
    await db.insert(commerceCategories).values({
      id,
      organizationId,
      sourceId: row.id,
      code: row.code,
      name: row.name,
      parentId: parent ? (orgCodeToId.get(parent.code) ?? null) : null,
      sort: row.sort,
      status: "active",
      note: row.note ?? "",
      screenshots: [],
      createdAt: now,
      updatedAt: now,
    })
    orgCodeToId.set(row.code, id)
    inserted += 1
  }
  return { inserted }
}

export async function ensurePlatformCarriersCatalog(db: DbLike): Promise<CatalogInsertResult> {
  const existing = await db.select({ code: platformCarriersCatalog.code }).from(platformCarriersCatalog)
  const present = new Set(existing.map((row) => row.code))
  const now = new Date()
  const rows = DEFAULT_PLATFORM_CARRIERS.filter((record) => !present.has(record.code)).map((record) => ({
    id: createId(),
    code: record.code,
    name: record.name,
    type: record.type,
    coverage: record.coverage,
    note: record.note,
    status: record.status,
    sortOrder: record.sortOrder,
    createdAt: now,
    updatedAt: now,
  }))
  if (rows.length > 0) {
    await db.insert(platformCarriersCatalog).values(rows)
  }
  return { inserted: rows.length }
}

export async function initializeCarriersForOrganization(
  db: DbLike,
  organizationId: string,
): Promise<CatalogInsertResult> {
  const catalog = await db
    .select()
    .from(platformCarriersCatalog)
    .orderBy(platformCarriersCatalog.sortOrder, platformCarriersCatalog.code)
  if (catalog.length === 0) return { inserted: 0 }
  const existing = await db
    .select({ code: commerceCarriers.code })
    .from(commerceCarriers)
    .where(eq(commerceCarriers.organizationId, organizationId))
  const present = new Set(existing.map((row) => row.code))
  const now = new Date()
  const rows = catalog.flatMap((row: PlatformCarriersCatalogRow) => {
    if (!isActiveCatalogStatus(row.status) || present.has(row.code)) return []
    return [
      {
        id: createId(),
        organizationId,
        sourceId: row.id,
        code: row.code,
        name: row.name,
        type: row.type,
        coverage: row.coverage,
        contact: "",
        phone: "",
        status: "active",
        note: row.note ?? "",
        createdAt: now,
        updatedAt: now,
      },
    ]
  })
  if (rows.length > 0) {
    await db.insert(commerceCarriers).values(rows)
  }
  return { inserted: rows.length }
}

export async function ensurePlatformImportTemplatesCatalog(db: DbLike): Promise<CatalogInsertResult> {
  const existing = await db
    .select({ kind: platformImportTemplatesCatalog.kind, version: platformImportTemplatesCatalog.version })
    .from(platformImportTemplatesCatalog)
  const present = new Set(existing.map((row) => `${row.kind}:${row.version}`))
  const now = new Date()
  const rows = DEFAULT_PLATFORM_IMPORT_TEMPLATES.filter(
    (record) => !present.has(`${record.kind}:${record.version}`),
  ).map((record) => ({
    id: createId(),
    kind: record.kind,
    version: record.version,
    fields: record.fields,
    duplicateStrategy: record.duplicateStrategy,
    rollbackStrategy: record.rollbackStrategy,
    note: record.note,
    status: record.status,
    sortOrder: record.sortOrder,
    createdAt: now,
    updatedAt: now,
  }))
  if (rows.length > 0) {
    await db.insert(platformImportTemplatesCatalog).values(rows)
  }
  return { inserted: rows.length }
}

export async function initializeImportTemplatesForOrganization(
  db: DbLike,
  organizationId: string,
): Promise<CatalogInsertResult> {
  const catalog = await db
    .select()
    .from(platformImportTemplatesCatalog)
    .orderBy(platformImportTemplatesCatalog.sortOrder, platformImportTemplatesCatalog.kind)
  if (catalog.length === 0) return { inserted: 0 }
  const existing = await db
    .select({ kind: commerceImportTemplates.kind, version: commerceImportTemplates.version })
    .from(commerceImportTemplates)
    .where(eq(commerceImportTemplates.organizationId, organizationId))
  const present = new Set(existing.map((row) => `${row.kind}:${row.version}`))
  const now = new Date()
  const rows = catalog.flatMap((row: PlatformImportTemplatesCatalogRow) => {
    if (!isActiveCatalogStatus(row.status) || present.has(`${row.kind}:${row.version}`)) return []
    return [
      {
        id: createId(),
        organizationId,
        sourceId: row.id,
        kind: row.kind,
        version: row.version,
        fields: row.fields,
        duplicateStrategy: row.duplicateStrategy,
        rollbackStrategy: row.rollbackStrategy,
        status: "active",
        note: row.note ?? "",
        createdAt: now,
        updatedAt: now,
      },
    ]
  })
  if (rows.length > 0) {
    await db.insert(commerceImportTemplates).values(rows)
  }
  return { inserted: rows.length }
}

/** 若组织尚无偏好行，插入默认设置（展示币种 CNY）。已有行不覆盖。 */
export async function ensureOrganizationSettingsForOrganization(
  db: DbLike,
  organizationId: string,
): Promise<CatalogInsertResult> {
  const existing = await db
    .select({ organizationId: organizationSettings.organizationId })
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, organizationId))
    .limit(1)
  if (existing.length > 0) return { inserted: 0 }
  const now = new Date()
  await db.insert(organizationSettings).values({
    organizationId,
    timezone: DEFAULT_ORGANIZATION_TIMEZONE,
    displayCurrency: DEFAULT_ORGANIZATION_DISPLAY_CURRENCY,
    tableDensity: "comfortable",
    dingtalkEnabled: false,
    createdAt: now,
    updatedAt: now,
  })
  return { inserted: 1 }
}

export async function ensureAllPlatformCatalogs(db: DbLike): Promise<{
  platformBasics: number
  dictionaries: number
  categories: number
  carriers: number
  importTemplates: number
}> {
  const platformBasics = await ensurePlatformBasicsCatalog(db)
  const dictionaries = await ensurePlatformDictionariesCatalog(db)
  const categories = await ensurePlatformCategoryTreesCatalog(db)
  const carriers = await ensurePlatformCarriersCatalog(db)
  const importTemplates = await ensurePlatformImportTemplatesCatalog(db)
  return {
    platformBasics: platformBasics.inserted,
    dictionaries: dictionaries.inserted,
    categories: categories.inserted,
    carriers: carriers.inserted,
    importTemplates: importTemplates.inserted,
  }
}

/**
 * 审核通过或回补时：先补齐缺失的默认目录行（不覆盖运营已改内容），再只拷 active 项到组织。
 * 调用方应放在同一事务内，失败则整笔回滚。
 */
export async function initializeOrganizationCatalogs(
  db: DbLike,
  organizationId: string,
): Promise<OrganizationCatalogInitResult> {
  await ensureAllPlatformCatalogs(db)
  const platformBasics = await initializePlatformBasicsForOrganization(db, organizationId)
  const dictionaries = await initializeDictionariesForOrganization(db, organizationId)
  const categories = await initializeCategoryTreeForOrganization(db, organizationId)
  const carriers = await initializeCarriersForOrganization(db, organizationId)
  const importTemplates = await initializeImportTemplatesForOrganization(db, organizationId)
  const settings = await ensureOrganizationSettingsForOrganization(db, organizationId)
  return {
    platformBasics: platformBasics.inserted,
    dictionaries: dictionaries.inserted,
    categories: categories.inserted,
    carriers: carriers.inserted,
    importTemplates: importTemplates.inserted,
    organizationSettings: settings.inserted,
  }
}

