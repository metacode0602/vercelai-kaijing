/**
 * 组织级 HS/SLSI 清单、商品证书，以及建档/上架阻断。
 * 不预置官方或演示清单；未填 HS 不阻断。
 */
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import {
  complianceHsRules,
  productComplianceCerts,
  productVariants,
  products,
} from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

export class ComplianceBlockError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ComplianceBlockError'
  }
}

export function normalizeHsCode(raw: string | null | undefined): string {
  if (!raw) return ''
  const cleaned = raw
    .trim()
    .replace(/\s+/g, '')
    .replace(/[．。]/g, '.')
    .replace(/[^0-9.]/g, '')
    .replace(/\.+/g, '.')
    .replace(/^\.+|\.+$/g, '')
  if (!cleaned) return ''
  const digits = cleaned.replace(/\./g, '')
  if (digits.length < 4 || digits.length > 12 || !/^\d+$/.test(digits)) return ''
  if (cleaned.includes('.')) return cleaned
  if (digits.length === 6) return `${digits.slice(0, 4)}.${digits.slice(4)}`
  if (digits.length === 8) return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`
  if (digits.length === 10) {
    return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}.${digits.slice(8)}`
  }
  return digits
}

export function hsDigits(code: string): string {
  return normalizeHsCode(code).replace(/\./g, '')
}

function parseOptionalDate(value: string | Date | null | undefined, endOfDay = false): Date | null {
  if (value == null || value === '') return null
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return value
  }
  const text = String(value).trim()
  if (!text) return null
  const dateOnly = /^(\d{4}-\d{2}-\d{2})$/.exec(text)
  if (dateOnly) {
    const iso = endOfDay ? `${dateOnly[1]}T23:59:59.999Z` : `${dateOnly[1]}T00:00:00.000Z`
    const parsed = new Date(iso)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function parseBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  const text = String(value ?? '')
    .trim()
    .toLowerCase()
  if (!text) return fallback
  if (['1', 'true', 'yes', 'y', '是', '强制', '阻断'].includes(text)) return true
  if (['0', 'false', 'no', 'n', '否', '不'].includes(text)) return false
  return fallback
}

function parseStatus(value: unknown): 'enabled' | 'disabled' {
  const text = String(value ?? '')
    .trim()
    .toLowerCase()
  if (['disabled', '停用', '禁用', 'invalid'].includes(text)) return 'disabled'
  return 'enabled'
}

export type HsRuleDto = {
  id: string
  hsCode: string
  description: string
  slsiRequired: boolean
  certName: string
  blockCreate: boolean
  source: 'manual' | 'import'
  validFrom: string | null
  validTo: string | null
  status: 'enabled' | 'disabled'
  notes: string
  updatedAt: string | null
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

function mapRule(row: typeof complianceHsRules.$inferSelect): HsRuleDto {
  return {
    id: row.id,
    hsCode: row.hsCode,
    description: row.description ?? '',
    slsiRequired: row.slsiRequired,
    certName: row.certName ?? '',
    blockCreate: row.blockCreate,
    source: row.source === 'import' ? 'import' : 'manual',
    validFrom: toIso(row.validFrom),
    validTo: toIso(row.validTo),
    status: row.status === 'disabled' ? 'disabled' : 'enabled',
    notes: row.notes ?? '',
    updatedAt: toIso(row.updatedAt),
  }
}

function ruleInForce(row: typeof complianceHsRules.$inferSelect, now: Date): boolean {
  if (row.status !== 'enabled') return false
  if (row.validFrom && row.validFrom > now) return false
  if (row.validTo && row.validTo < now) return false
  return true
}

function ruleMatchesHs(ruleHs: string, inputHs: string): boolean {
  const ruleDigits = hsDigits(ruleHs)
  const inputDigits = hsDigits(inputHs)
  if (!ruleDigits || !inputDigits) return false
  if (ruleDigits === inputDigits) return true
  return inputDigits.startsWith(ruleDigits) && ruleDigits.length >= 6
}

async function findMatchingEnabledRule(
  db: DbLike,
  organizationId: string,
  hsCode: string,
  now = new Date(),
): Promise<typeof complianceHsRules.$inferSelect | null> {
  const rows = await db
    .select()
    .from(complianceHsRules)
    .where(and(eq(complianceHsRules.organizationId, organizationId), eq(complianceHsRules.status, 'enabled')))
  const matched = rows
    .filter((row) => ruleInForce(row, now) && ruleMatchesHs(row.hsCode, hsCode))
    .sort((a, b) => hsDigits(b.hsCode).length - hsDigits(a.hsCode).length)
  return matched[0] ?? null
}

async function findValidCert(
  db: DbLike,
  organizationId: string,
  input: { productId: string; variantId?: string | null; hsCode: string },
  now = new Date(),
): Promise<typeof productComplianceCerts.$inferSelect | null> {
  const rows = await db
    .select()
    .from(productComplianceCerts)
    .where(
      and(
        eq(productComplianceCerts.organizationId, organizationId),
        eq(productComplianceCerts.productId, input.productId),
        eq(productComplianceCerts.status, 'enabled'),
      ),
    )
  const inputDigits = hsDigits(input.hsCode)
  return (
    rows.find((row) => {
      if (row.expiresAt && row.expiresAt < now) return false
      if (row.variantId && input.variantId && row.variantId !== input.variantId) return false
      if (row.variantId && !input.variantId) return false
      if (row.hsCode) {
        const certDigits = hsDigits(row.hsCode)
        if (certDigits && certDigits !== inputDigits && !inputDigits.startsWith(certDigits)) return false
      }
      return true
    }) ?? null
  )
}

export type ComplianceCheckResult = {
  checked: boolean
  hsCode: string | null
  blocked: boolean
  slsiRequired: boolean
  blockCreate: boolean
  certName: string
  waivedByCertId?: string
  message: string
}

export async function evaluateHsCompliance(
  db: DbLike,
  organizationId: string,
  input: { hsCode?: string | null; productId?: string | null; variantId?: string | null },
): Promise<ComplianceCheckResult> {
  const hsCode = normalizeHsCode(input.hsCode)
  if (!hsCode) {
    return {
      checked: false,
      hsCode: null,
      blocked: false,
      slsiRequired: false,
      blockCreate: false,
      certName: '',
      message: '未填 HS，未做合规校验',
    }
  }
  const rule = await findMatchingEnabledRule(db, organizationId, hsCode)
  if (!rule) {
    return {
      checked: true,
      hsCode,
      blocked: false,
      slsiRequired: false,
      blockCreate: false,
      certName: '',
      message: `HS ${hsCode} 未命中启用中的认证清单`,
    }
  }
  if (!(rule.slsiRequired && rule.blockCreate)) {
    return {
      checked: true,
      hsCode,
      blocked: false,
      slsiRequired: rule.slsiRequired,
      blockCreate: rule.blockCreate,
      certName: rule.certName ?? '',
      message: rule.slsiRequired
        ? `HS ${hsCode} 需要「${rule.certName || 'SLSI 认证'}」，但未设置为阻断建档`
        : `HS ${hsCode} 命中清单，无需强制认证`,
    }
  }
  if (input.productId) {
    const cert = await findValidCert(db, organizationId, {
      productId: input.productId,
      variantId: input.variantId,
      hsCode,
    })
    if (cert) {
      return {
        checked: true,
        hsCode,
        blocked: false,
        slsiRequired: true,
        blockCreate: true,
        certName: rule.certName ?? '',
        waivedByCertId: cert.id,
        message: `HS ${hsCode} 命中「${rule.certName || 'SLSI 强制认证'}」，已凭有效证书 ${cert.certNumber} 放行`,
      }
    }
  }
  const needSaveFirst = !input.productId
  return {
    checked: true,
    hsCode,
    blocked: true,
    slsiRequired: true,
    blockCreate: true,
    certName: rule.certName ?? '',
    message: needSaveFirst
      ? `HS ${hsCode} 命中强制认证「${rule.certName || 'SLSI 认证'}」。请先保存商品并上传有效证书，再填写该 HS 编码。`
      : `HS ${hsCode} 命中强制认证「${rule.certName || 'SLSI 认证'}」，当前商品没有仍在有效期内的证书，已阻断建档/上架。请先上传有效证书。`,
  }
}

export async function assertHsCompliance(
  db: DbLike,
  organizationId: string,
  input: { hsCode?: string | null; productId?: string | null; variantId?: string | null },
): Promise<ComplianceCheckResult> {
  const result = await evaluateHsCompliance(db, organizationId, input)
  if (result.blocked) {
    throw new ComplianceBlockError(result.message)
  }
  return result
}

export async function listHsRules(
  db: AppDatabase,
  organizationId: string,
  input: {
    page?: number
    pageSize?: number
    q?: string
    slsiRequired?: boolean
    blockCreate?: boolean
    status?: string
  } = {},
): Promise<PaginatedResult<HsRuleDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const conditions: SQL[] = [eq(complianceHsRules.organizationId, organizationId)]
  const q = input.q?.trim()
  if (q) {
    const pattern = `%${q}%`
    conditions.push(or(ilike(complianceHsRules.hsCode, pattern), ilike(complianceHsRules.description, pattern), ilike(complianceHsRules.certName, pattern))!)
  }
  if (input.slsiRequired != null) conditions.push(eq(complianceHsRules.slsiRequired, input.slsiRequired))
  if (input.blockCreate != null) conditions.push(eq(complianceHsRules.blockCreate, input.blockCreate))
  if (input.status === 'enabled' || input.status === 'disabled') {
    conditions.push(eq(complianceHsRules.status, input.status))
  }
  const where = and(...conditions)
  const [totalRow] = await db.select({ value: count() }).from(complianceHsRules).where(where)
  const rows = await db
    .select()
    .from(complianceHsRules)
    .where(where)
    .orderBy(desc(complianceHsRules.updatedAt), complianceHsRules.hsCode)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  return {
    items: rows.map(mapRule),
    total: Number(totalRow?.value ?? 0),
    page,
    pageSize,
  }
}

export type UpsertHsRuleInput = {
  id?: string
  hsCode: string
  description?: string
  slsiRequired?: boolean
  certName?: string
  blockCreate?: boolean
  source?: 'manual' | 'import'
  validFrom?: string | Date | null
  validTo?: string | Date | null
  status?: 'enabled' | 'disabled'
  notes?: string
}

export async function createHsRule(
  db: AppDatabase,
  organizationId: string,
  input: UpsertHsRuleInput,
): Promise<HsRuleDto> {
  const hsCode = normalizeHsCode(input.hsCode)
  if (!hsCode) throw new Error('请填写有效的 HS 编码（至少 4 位数字）')
  const [dup] = await db
    .select({ id: complianceHsRules.id })
    .from(complianceHsRules)
    .where(and(eq(complianceHsRules.organizationId, organizationId), eq(complianceHsRules.hsCode, hsCode)))
    .limit(1)
  if (dup) throw new Error(`HS ${hsCode} 已存在，请编辑或停用原记录`)
  const id = createId()
  await db.insert(complianceHsRules).values({
    id,
    organizationId,
    hsCode,
    description: input.description?.trim() || null,
    slsiRequired: Boolean(input.slsiRequired),
    certName: input.certName?.trim() || null,
    blockCreate: Boolean(input.blockCreate),
    source: input.source === 'import' ? 'import' : 'manual',
    validFrom: parseOptionalDate(input.validFrom),
    validTo: parseOptionalDate(input.validTo, true),
    status: input.status === 'disabled' ? 'disabled' : 'enabled',
    notes: input.notes?.trim() || null,
  })
  const [row] = await db.select().from(complianceHsRules).where(eq(complianceHsRules.id, id)).limit(1)
  if (!row) throw new Error('创建清单后读取失败')
  return mapRule(row)
}

export async function updateHsRule(
  db: AppDatabase,
  organizationId: string,
  id: string,
  input: Omit<UpsertHsRuleInput, 'id' | 'hsCode'> & { hsCode?: string },
): Promise<HsRuleDto> {
  const [existing] = await db
    .select()
    .from(complianceHsRules)
    .where(and(eq(complianceHsRules.id, id), eq(complianceHsRules.organizationId, organizationId)))
    .limit(1)
  if (!existing) throw new Error('清单记录不存在')
  const hsCode = input.hsCode !== undefined ? normalizeHsCode(input.hsCode) : existing.hsCode
  if (!hsCode) throw new Error('请填写有效的 HS 编码（至少 4 位数字）')
  if (hsCode !== existing.hsCode) {
    const [dup] = await db
      .select({ id: complianceHsRules.id })
      .from(complianceHsRules)
      .where(and(eq(complianceHsRules.organizationId, organizationId), eq(complianceHsRules.hsCode, hsCode)))
      .limit(1)
    if (dup) throw new Error(`HS ${hsCode} 已存在`)
  }
  await db
    .update(complianceHsRules)
    .set({
      hsCode,
      description: input.description !== undefined ? input.description.trim() || null : existing.description,
      slsiRequired: input.slsiRequired ?? existing.slsiRequired,
      certName: input.certName !== undefined ? input.certName.trim() || null : existing.certName,
      blockCreate: input.blockCreate ?? existing.blockCreate,
      validFrom:
        input.validFrom !== undefined ? parseOptionalDate(input.validFrom) : existing.validFrom,
      validTo: input.validTo !== undefined ? parseOptionalDate(input.validTo, true) : existing.validTo,
      status: input.status ?? (existing.status === 'disabled' ? 'disabled' : 'enabled'),
      notes: input.notes !== undefined ? input.notes.trim() || null : existing.notes,
      updatedAt: new Date(),
    })
    .where(eq(complianceHsRules.id, id))
  const [row] = await db.select().from(complianceHsRules).where(eq(complianceHsRules.id, id)).limit(1)
  if (!row) throw new Error('更新清单后读取失败')
  return mapRule(row)
}

export async function setHsRuleStatus(
  db: AppDatabase,
  organizationId: string,
  id: string,
  status: 'enabled' | 'disabled',
): Promise<HsRuleDto> {
  return updateHsRule(db, organizationId, id, { status })
}

export type ImportHsRuleRow = {
  hsCode?: string
  description?: string
  slsiRequired?: unknown
  certName?: string
  blockCreate?: unknown
  validFrom?: string
  validTo?: string
  status?: string
  notes?: string
}

export type ImportHsRulesResult = {
  success: number
  inserted: number
  updated: number
  skipped: number
  failed: number
  errors: Array<{ row: number; hsCode?: string; reason: string }>
}

export async function importHsRules(
  db: AppDatabase,
  organizationId: string,
  rows: ImportHsRuleRow[],
): Promise<ImportHsRulesResult> {
  const result: ImportHsRulesResult = {
    success: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  }
  for (const [index, raw] of rows.entries()) {
    const rowNo = index + 2
    const rawCode = String(raw.hsCode ?? '').trim()
    if (!rawCode || /示例|说明|请删除/.test(rawCode)) {
      result.skipped += 1
      result.errors.push({ row: rowNo, hsCode: rawCode || undefined, reason: rawCode ? '说明行已跳过' : 'HS 编码为空，已跳过' })
      continue
    }
    const hsCode = normalizeHsCode(rawCode)
    if (!hsCode) {
      result.failed += 1
      result.errors.push({ row: rowNo, hsCode: rawCode, reason: 'HS 编码无效（至少 4 位数字）' })
      continue
    }
    try {
      const [existing] = await db
        .select()
        .from(complianceHsRules)
        .where(and(eq(complianceHsRules.organizationId, organizationId), eq(complianceHsRules.hsCode, hsCode)))
        .limit(1)
      if (existing) {
        await updateHsRule(db, organizationId, existing.id, {
          description: raw.description,
          slsiRequired: parseBool(raw.slsiRequired, existing.slsiRequired),
          certName: raw.certName,
          blockCreate: parseBool(raw.blockCreate, existing.blockCreate),
          validFrom: raw.validFrom,
          validTo: raw.validTo,
          status: raw.status ? parseStatus(raw.status) : undefined,
          notes: raw.notes,
        })
        result.updated += 1
      } else {
        await createHsRule(db, organizationId, {
          hsCode,
          description: raw.description,
          slsiRequired: parseBool(raw.slsiRequired),
          certName: raw.certName,
          blockCreate: parseBool(raw.blockCreate),
          source: 'import',
          validFrom: raw.validFrom,
          validTo: raw.validTo,
          status: parseStatus(raw.status),
          notes: raw.notes,
        })
        result.inserted += 1
      }
      result.success += 1
    } catch (error) {
      result.failed += 1
      result.errors.push({
        row: rowNo,
        hsCode,
        reason: error instanceof Error ? error.message : '导入失败',
      })
    }
  }
  return result
}

export async function lookupHs(
  db: AppDatabase,
  organizationId: string,
  rawCode: string,
): Promise<ComplianceCheckResult & { rule: HsRuleDto | null }> {
  const hsCode = normalizeHsCode(rawCode)
  if (!hsCode) {
    return {
      checked: false,
      hsCode: null,
      blocked: false,
      slsiRequired: false,
      blockCreate: false,
      certName: '',
      message: '请输入有效的 HS 编码',
      rule: null,
    }
  }
  const rule = await findMatchingEnabledRule(db, organizationId, hsCode)
  const evaluated = await evaluateHsCompliance(db, organizationId, { hsCode })
  if (evaluated.blocked) {
    return {
      ...evaluated,
      message: `HS ${hsCode} 命中强制认证「${evaluated.certName || 'SLSI 认证'}」，商品没有仍在有效期内的证书时将阻断建档和本地上架。`,
      rule: rule ? mapRule(rule) : null,
    }
  }
  return { ...evaluated, rule: rule ? mapRule(rule) : null }
}

export type ComplianceCertDto = {
  id: string
  productId: string
  productSpu: string
  productName: string
  variantId: string | null
  variantSku: string | null
  certNumber: string
  certName: string
  hsCode: string
  fileName: string
  fileUrl: string
  expiresAt: string | null
  status: 'enabled' | 'disabled'
  expired: boolean
  notes: string
  updatedAt: string | null
}

function mapCert(
  row: typeof productComplianceCerts.$inferSelect,
  product: { spuCode: string | null; title: string },
  variantSku: string | null,
): ComplianceCertDto {
  const expired = Boolean(row.expiresAt && row.expiresAt < new Date())
  return {
    id: row.id,
    productId: row.productId,
    productSpu: product.spuCode ?? '',
    productName: product.title,
    variantId: row.variantId,
    variantSku,
    certNumber: row.certNumber,
    certName: row.certName ?? '',
    hsCode: row.hsCode ?? '',
    fileName: row.fileName ?? '',
    fileUrl: row.fileUrl ?? '',
    expiresAt: toIso(row.expiresAt),
    status: row.status === 'disabled' ? 'disabled' : 'enabled',
    expired,
    notes: row.notes ?? '',
    updatedAt: toIso(row.updatedAt),
  }
}

export async function listCerts(
  db: AppDatabase,
  organizationId: string,
  input: { productId?: string; q?: string } = {},
): Promise<ComplianceCertDto[]> {
  const conditions: SQL[] = [eq(productComplianceCerts.organizationId, organizationId)]
  if (input.productId) conditions.push(eq(productComplianceCerts.productId, input.productId))
  const q = input.q?.trim()
  if (q) {
    const pattern = `%${q}%`
    conditions.push(
      or(
        ilike(productComplianceCerts.certNumber, pattern),
        ilike(productComplianceCerts.certName, pattern),
        ilike(productComplianceCerts.hsCode, pattern),
      )!,
    )
  }
  const rows = await db
    .select({
      cert: productComplianceCerts,
      spuCode: products.spuCode,
      title: products.title,
      skuCode: productVariants.skuCode,
      sku: productVariants.sku,
    })
    .from(productComplianceCerts)
    .innerJoin(products, eq(products.id, productComplianceCerts.productId))
    .leftJoin(productVariants, eq(productVariants.id, productComplianceCerts.variantId))
    .where(and(...conditions))
    .orderBy(desc(productComplianceCerts.updatedAt))
  return rows.map((row) =>
    mapCert(row.cert, { spuCode: row.spuCode, title: row.title }, row.skuCode ?? row.sku ?? null),
  )
}

const MAX_CERT_FILE_CHARS = 7_000_000

export type UpsertCertInput = {
  id?: string
  productId: string
  variantId?: string | null
  certNumber: string
  certName?: string
  hsCode?: string
  fileName?: string
  fileUrl?: string
  expiresAt?: string | Date | null
  status?: 'enabled' | 'disabled'
  notes?: string
}

export async function upsertCert(
  db: AppDatabase,
  organizationId: string,
  input: UpsertCertInput,
): Promise<ComplianceCertDto> {
  const certNumber = input.certNumber.trim()
  if (!certNumber) throw new Error('请填写证书编号')
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, input.productId), eq(products.organizationId, organizationId)))
    .limit(1)
  if (!product) throw new Error('商品不存在或不属于当前组织')
  let variantSku: string | null = null
  if (input.variantId) {
    const [variant] = await db
      .select()
      .from(productVariants)
      .where(
        and(
          eq(productVariants.id, input.variantId),
          eq(productVariants.organizationId, organizationId),
          eq(productVariants.productId, product.id),
        ),
      )
      .limit(1)
    if (!variant) throw new Error('SKU 不存在或不属于该商品')
    variantSku = variant.skuCode ?? variant.sku
  }
  const hsCode = input.hsCode != null && input.hsCode !== '' ? normalizeHsCode(input.hsCode) : null
  if (input.hsCode && !hsCode) throw new Error('证书对应的 HS 编码无效')
  if (input.fileUrl && input.fileUrl.length > MAX_CERT_FILE_CHARS) {
    throw new Error('证书文件过大，请上传不超过 5MB 的 PDF 或图片')
  }
  const values = {
    organizationId,
    productId: product.id,
    variantId: input.variantId || null,
    certNumber,
    certName: input.certName?.trim() || null,
    hsCode,
    fileName: input.fileName?.trim() || null,
    fileUrl: input.fileUrl || null,
    expiresAt: parseOptionalDate(input.expiresAt, true),
    status: input.status === 'disabled' ? 'disabled' : 'enabled',
    notes: input.notes?.trim() || null,
    updatedAt: new Date(),
  } as const

  if (input.id) {
    const [existing] = await db
      .select()
      .from(productComplianceCerts)
      .where(and(eq(productComplianceCerts.id, input.id), eq(productComplianceCerts.organizationId, organizationId)))
      .limit(1)
    if (!existing) throw new Error('证书不存在')
    await db
      .update(productComplianceCerts)
      .set({
        ...values,
        fileName: input.fileName !== undefined ? values.fileName : existing.fileName,
        fileUrl: input.fileUrl !== undefined ? values.fileUrl : existing.fileUrl,
      })
      .where(eq(productComplianceCerts.id, existing.id))
    const [row] = await db.select().from(productComplianceCerts).where(eq(productComplianceCerts.id, existing.id)).limit(1)
    if (!row) throw new Error('更新证书后读取失败')
    return mapCert(row, { spuCode: product.spuCode, title: product.title }, variantSku)
  }

  const id = createId()
  await db.insert(productComplianceCerts).values({ id, ...values })
  const [row] = await db.select().from(productComplianceCerts).where(eq(productComplianceCerts.id, id)).limit(1)
  if (!row) throw new Error('保存证书后读取失败')
  return mapCert(row, { spuCode: product.spuCode, title: product.title }, variantSku)
}

export async function setCertStatus(
  db: AppDatabase,
  organizationId: string,
  id: string,
  status: 'enabled' | 'disabled',
): Promise<ComplianceCertDto> {
  const [existing] = await db
    .select()
    .from(productComplianceCerts)
    .where(and(eq(productComplianceCerts.id, id), eq(productComplianceCerts.organizationId, organizationId)))
    .limit(1)
  if (!existing) throw new Error('证书不存在')
  return upsertCert(db, organizationId, {
    id,
    productId: existing.productId,
    variantId: existing.variantId,
    certNumber: existing.certNumber,
    certName: existing.certName ?? undefined,
    hsCode: existing.hsCode ?? undefined,
    status,
    notes: existing.notes ?? undefined,
  })
}
