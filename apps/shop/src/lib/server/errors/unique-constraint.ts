/**
 * 将 Postgres/Drizzle 唯一约束冲突（23505）转成可展示的中文错误，
 * 避免把 SQL 或裸 23505 直接抛给前端。
 */

export const UNIQUE_CONSTRAINT_MESSAGES: Record<string, string> = {
  commerce_brands_org_name_uidx: '品牌名称已存在，请更换名称',
  commerce_brands_org_code_uidx: '品牌编码已存在，请更换编码',
  products_org_spu_uidx: 'SPU 编码已存在，请重试',
  product_variants_org_sku_uidx: '内部 SKU 已存在，请更换编码',
  product_variants_org_sku_code_uidx: '内部 SKU 编码已存在，请更换编码',
  commerce_categories_org_code_uidx: '品类编码已存在，请更换编码',
  commerce_suppliers_org_code_uidx: '供应商编码已存在，请更换编码',
  supplier_skus_org_sup_sku_factory_uidx: '同一供应商下该 SKU 与厂家款号已存在',
  commerce_warehouses_org_code_uidx: '仓库编码已存在，请更换编码',
  commerce_bins_wh_code_uidx: '同一仓库下该库位编码已存在',
  commerce_warehouse_zones_wh_code_uidx: '同一仓库下该库区编码已存在',
  inventory_pools_org_code_uidx: '库存池编码已存在，请更换编码',
  commerce_carton_specs_org_code_uidx: '箱规编码已存在，请更换编码',
  commerce_carriers_org_code_uidx: '承运商编码已存在，请更换编码',
  fee_templates_org_code_uidx: '费用模板编码已存在，请更换编码',
  commerce_freight_rate_cards_org_code_uidx: '运价卡编码已存在，请更换编码',
  commerce_dictionaries_org_key_uidx: '该字典键已存在',
  compliance_hs_rules_org_hs_uidx: '该 HS 编码已存在，请编辑或停用原记录',
  ocean_shipments_org_lot_uidx: '柜次号已存在',
  seller_sku_mappings_shop_seller_sku_uidx: '该店铺下 Seller SKU 已存在',
  listings_shop_ext_item_uidx: '该店铺下已存在相同的平台商品',
  commerce_platform_basics_org_kind_code_uidx: '该基础资料代码已存在',
  marketplace_app_credentials_org_platform_region_uidx: '该平台与站点已存在配置，请直接编辑',
}

export const DEFAULT_UNIQUE_MESSAGE = '该记录已存在，请检查名称或编码是否与已有数据重复'

const SQL_DUMP_RE =
  /failed query|duplicate key value|violates (?:unique|foreign key|not-null|check) constraint|insert into\s|update\s+".*"\s+set\s|syntax error at|permission denied for/i

function walkErrors(error: unknown): unknown[] {
  const out: unknown[] = []
  const seen = new Set<unknown>()
  let current: unknown = error
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    out.push(current)
    const obj = current as { cause?: unknown; originalError?: unknown }
    current = obj.cause ?? obj.originalError
  }
  return out
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

export function getUniqueConstraintName(error: unknown): string | undefined {
  for (const item of walkErrors(error)) {
    const obj = item as Record<string, unknown>
    const name = readString(obj.constraint) ?? readString(obj.constraint_name) ?? readString(obj.constraintName)
    if (name) return name
    const text = `${readString(obj.message) ?? ''} ${readString(obj.detail) ?? ''}`
    const matched =
      /unique constraint "([^"]+)"/i.exec(text) ??
      /constraint "([^"]+)"/i.exec(text)
    if (matched?.[1]) return matched[1]
  }
  return undefined
}

export function isUniqueViolation(error: unknown): boolean {
  return walkErrors(error).some((item) => {
    const obj = item as Record<string, unknown>
    if (obj.code === '23505') return true
    const text = `${readString(obj.message) ?? ''} ${readString(obj.detail) ?? ''}`
    return /duplicate key value|unique constraint|already exists/i.test(text)
  })
}

export function uniqueViolationMessage(
  error: unknown,
  overrides?: Record<string, string>,
  fallback: string = DEFAULT_UNIQUE_MESSAGE,
): string | null {
  if (!isUniqueViolation(error)) return null
  const constraint = getUniqueConstraintName(error)
  if (constraint) {
    const mapped = overrides?.[constraint] ?? UNIQUE_CONSTRAINT_MESSAGES[constraint]
    if (mapped) return mapped
  }
  return fallback
}

export function rethrowUnique(
  error: unknown,
  overrides?: Record<string, string>,
  fallback?: string,
): never {
  const message = uniqueViolationMessage(error, overrides, fallback)
  if (message) throw new Error(message)
  throw error
}

export async function withUniqueGuard<T>(
  fn: () => Promise<T>,
  overrides?: Record<string, string>,
  fallback?: string,
): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    rethrowUnique(error, overrides, fallback)
  }
}

export function isSqlDumpMessage(message: string): boolean {
  return SQL_DUMP_RE.test(message)
}

export function isLikelyUserFacingMessage(message: string): boolean {
  const trimmed = message.trim()
  if (!trimmed) return false
  if (isSqlDumpMessage(trimmed)) return false
  if (/[\u4e00-\u9fff]/.test(trimmed)) return true
  return trimmed.length <= 80 && !/^\s*error:/i.test(trimmed)
}
