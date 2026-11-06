/**
 * Pure import-template field/kind validation (no DB).
 */

export const IMPORT_TEMPLATE_KINDS = [
  '仓库 / 库位',
  '商品 / SKU',
  'Seller SKU 映射',
  '期初库存',
  '历史订单',
] as const

export type ImportTemplateKind = (typeof IMPORT_TEMPLATE_KINDS)[number]

const HEADER_RE = /^[\w.\u4e00-\u9fff][\w.\-\/\u4e00-\u9fff\s]{0,63}$/u

/** Split fields text into column headers (comma / newline / semicolon). */
export function parseFieldHeaders(fields: string): string[] {
  return fields
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function validateImportTemplateFields(fields: string, kind?: string): { headers: string[]; normalized: string } {
  if (kind && !(IMPORT_TEMPLATE_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`不支持的导入类型：${kind}`)
  }
  const headers = parseFieldHeaders(fields)
  if (headers.length === 0) {
    throw new Error('字段清单不能为空')
  }
  if (headers.length > 64) {
    throw new Error('字段列数过多（最多 64）')
  }
  const seen = new Set<string>()
  for (const h of headers) {
    if (!HEADER_RE.test(h)) {
      throw new Error(`非法列名：${h}`)
    }
    const key = h.toLowerCase()
    if (seen.has(key)) {
      throw new Error(`重复列名：${h}`)
    }
    seen.add(key)
  }
  return { headers, normalized: headers.join(', ') }
}

export function assertImportTemplateKind(kind: string): ImportTemplateKind {
  const k = kind.trim()
  if (!(IMPORT_TEMPLATE_KINDS as readonly string[]).includes(k)) {
    throw new Error(`不支持的导入类型：${k}`)
  }
  return k as ImportTemplateKind
}
