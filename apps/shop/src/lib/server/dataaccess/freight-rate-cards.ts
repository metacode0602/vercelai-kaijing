/**
 * commerce_freight_rate_cards — 运价卡主数据（成本测算 / 运费页）。
 */
import { and, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { commerceFreightRateCards } from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import { formatStamp, toDbActiveStatus, toUiActiveStatus, type UiActiveStatus } from '@/lib/server/mappers/ops-master'
import { normalizePage, normalizePageSize, type PaginatedResult } from '@/lib/server/dataaccess/pagination'
import type { FreightRateBundle } from '@/lib/crossborder/cost-calculator'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

export type FreightRateCardDto = {
  id: string
  code: string
  name: string
  freightMode: string
  carrierId: string
  currency: string
  unitRate: number
  minCharge: number
  surcharge: number
  thc: number
  volumetricDivisor: number | null
  usableCbm: number | null
  unitRatePerTon: number | null
  originPort: string
  destPort: string
  effectiveFrom: string
  effectiveTo: string
  status: UiActiveStatus
  dbStatus: string
  note: string
  createdAt: string
  updatedAt: string
}

function num(v: string | number | null | undefined): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (v == null || v === '') return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function mapRow(row: typeof commerceFreightRateCards.$inferSelect): FreightRateCardDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    freightMode: row.freightMode,
    carrierId: row.carrierId || '',
    currency: row.currency,
    unitRate: num(row.unitRate),
    minCharge: num(row.minCharge),
    surcharge: num(row.surcharge),
    thc: num(row.thc),
    volumetricDivisor: row.volumetricDivisor,
    usableCbm: row.usableCbm == null ? null : num(row.usableCbm),
    unitRatePerTon: row.unitRatePerTon == null ? null : num(row.unitRatePerTon),
    originPort: row.originPort || '',
    destPort: row.destPort || '',
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo || '',
    status: toUiActiveStatus(row.status),
    dbStatus: row.status,
    note: row.note || '',
    createdAt: formatStamp(row.createdAt),
    updatedAt: formatStamp(row.updatedAt),
  }
}

export function toFreightRateBundle(card: FreightRateCardDto): FreightRateBundle {
  const mode = card.freightMode
  return {
    code: card.code,
    versionLabel: `${card.code}@${card.effectiveFrom}`,
    airDdpUsdPerKg: mode === 'AIR_DDP' ? card.unitRate : 0,
    airDdpMinChargeUsd: mode === 'AIR_DDP' ? card.minCharge : 0,
    airDdpVolumetricDivisor: card.volumetricDivisor || 6000,
    lclUsdPerCbm: mode === 'LCL' ? card.unitRate : 0,
    lclUsdPerTon: mode === 'LCL' ? card.unitRatePerTon || 0 : 0,
    lclSurchargeUsd: mode === 'LCL' ? card.surcharge : 0,
    fcl20Usd: mode === 'FCL20' ? card.unitRate : 0,
    fcl40Usd: mode === 'FCL40' ? card.unitRate : 0,
    thcUsd: card.thc,
    fcl20UsableCbm: mode === 'FCL20' ? card.usableCbm || 28 : 28,
    fcl40UsableCbm: mode === 'FCL40' ? card.usableCbm || 58 : 58,
  }
}

/** 合并同 asOf 下多模式运价卡为一束（AIR/LCL/FCL20/FCL40 各取最新）。 */
export async function resolveFreightRateBundle(
  db: AppDatabase,
  organizationId: string,
  input: { asOf?: string; freightMode?: string } = {},
): Promise<{ bundle: FreightRateBundle; cards: FreightRateCardDto[] }> {
  const asOf = (input.asOf || new Date().toISOString().slice(0, 10)).slice(0, 10)
  const filters: SQL[] = [
    eq(commerceFreightRateCards.organizationId, organizationId),
    eq(commerceFreightRateCards.status, 'active'),
    sql`${commerceFreightRateCards.effectiveFrom} <= ${asOf}`,
    or(
      sql`${commerceFreightRateCards.effectiveTo} is null`,
      sql`${commerceFreightRateCards.effectiveTo} = ''`,
      sql`${commerceFreightRateCards.effectiveTo} >= ${asOf}`,
    )!,
  ]
  if (input.freightMode) filters.push(eq(commerceFreightRateCards.freightMode, input.freightMode))
  const rows = await db
    .select()
    .from(commerceFreightRateCards)
    .where(and(...filters)!)
    .orderBy(desc(commerceFreightRateCards.effectiveFrom), desc(commerceFreightRateCards.updatedAt))
    .limit(50)
  const cards = rows.map(mapRow)
  const byMode = new Map<string, FreightRateCardDto>()
  for (const c of cards) {
    if (!byMode.has(c.freightMode)) byMode.set(c.freightMode, c)
  }
  const picked = [...byMode.values()]
  let bundle: FreightRateBundle = {
    code: picked.map((c) => c.code).join('+') || '',
    versionLabel: picked.map((c) => `${c.code}@${c.effectiveFrom}`).join(' / ') || '未配置运价卡',
    airDdpUsdPerKg: 0,
    airDdpMinChargeUsd: 0,
    airDdpVolumetricDivisor: 6000,
    lclUsdPerCbm: 0,
    lclUsdPerTon: 0,
    lclSurchargeUsd: 0,
    fcl20Usd: 0,
    fcl40Usd: 0,
    thcUsd: 0,
    fcl20UsableCbm: 28,
    fcl40UsableCbm: 58,
  }
  for (const c of picked) {
    const part = toFreightRateBundle(c)
    if (c.freightMode === 'AIR_DDP') {
      bundle = { ...bundle, airDdpUsdPerKg: part.airDdpUsdPerKg, airDdpMinChargeUsd: part.airDdpMinChargeUsd, airDdpVolumetricDivisor: part.airDdpVolumetricDivisor }
    } else if (c.freightMode === 'LCL') {
      bundle = { ...bundle, lclUsdPerCbm: part.lclUsdPerCbm, lclUsdPerTon: part.lclUsdPerTon, lclSurchargeUsd: part.lclSurchargeUsd }
    } else if (c.freightMode === 'FCL20') {
      bundle = { ...bundle, fcl20Usd: part.fcl20Usd, thcUsd: part.thcUsd || bundle.thcUsd, fcl20UsableCbm: part.fcl20UsableCbm }
    } else if (c.freightMode === 'FCL40') {
      bundle = { ...bundle, fcl40Usd: part.fcl40Usd, thcUsd: part.thcUsd || bundle.thcUsd, fcl40UsableCbm: part.fcl40UsableCbm }
    }
  }
  return { bundle, cards: picked }
}

export async function listFreightRateCards(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string; status?: string; freightMode?: string } = {},
): Promise<PaginatedResult<FreightRateCardDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize ?? 50)
  const filters: SQL[] = [eq(commerceFreightRateCards.organizationId, organizationId)]
  if (input.status === '启用' || input.status === 'active') filters.push(eq(commerceFreightRateCards.status, 'active'))
  if (input.status === '停用' || input.status === 'disabled') filters.push(eq(commerceFreightRateCards.status, 'disabled'))
  if (input.freightMode) filters.push(eq(commerceFreightRateCards.freightMode, input.freightMode))
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(or(ilike(commerceFreightRateCards.code, q), ilike(commerceFreightRateCards.name, q), ilike(commerceFreightRateCards.note, q))!)
  }
  const where = and(...filters)!
  const [totalRow] = await db.select({ value: count() }).from(commerceFreightRateCards).where(where)
  const rows = await db
    .select()
    .from(commerceFreightRateCards)
    .where(where)
    .orderBy(desc(commerceFreightRateCards.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  return { items: rows.map(mapRow), total: Number(totalRow?.value ?? 0), page, pageSize }
}

export async function getFreightRateCard(db: AppDatabase, organizationId: string, idOrCode: string) {
  const [byId] = await db
    .select()
    .from(commerceFreightRateCards)
    .where(and(eq(commerceFreightRateCards.organizationId, organizationId), eq(commerceFreightRateCards.id, idOrCode)))
    .limit(1)
  if (byId) return mapRow(byId)
  const [byCode] = await db
    .select()
    .from(commerceFreightRateCards)
    .where(and(eq(commerceFreightRateCards.organizationId, organizationId), eq(commerceFreightRateCards.code, idOrCode)))
    .limit(1)
  return byCode ? mapRow(byCode) : null
}

async function nextCode(db: DbLike, organizationId: string) {
  const rows = await db
    .select({ code: commerceFreightRateCards.code })
    .from(commerceFreightRateCards)
    .where(eq(commerceFreightRateCards.organizationId, organizationId))
  let max = 0
  for (const row of rows) {
    const m = /^FRC-(\d+)$/.exec(row.code)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `FRC-${String(max + 1).padStart(4, '0')}`
}

export async function createFreightRateCard(
  db: DbLike,
  organizationId: string,
  input: {
    name: string
    freightMode: string
    carrierId?: string
    currency?: string
    unitRate?: number
    minCharge?: number
    surcharge?: number
    thc?: number
    volumetricDivisor?: number
    usableCbm?: number
    unitRatePerTon?: number
    originPort?: string
    destPort?: string
    effectiveFrom: string
    effectiveTo?: string
    status?: string
    note?: string
    code?: string
  },
) {
  const code = (input.code?.trim() || (await nextCode(db, organizationId))).toUpperCase()
  const id = createId()
  const now = new Date()
  await db.insert(commerceFreightRateCards).values({
    id,
    organizationId,
    code,
    name: input.name.trim() || '未命名运价卡',
    freightMode: input.freightMode.trim() || 'LCL',
    carrierId: input.carrierId?.trim() || null,
    currency: (input.currency || 'USD').toUpperCase(),
    unitRate: String(input.unitRate ?? 0),
    minCharge: String(input.minCharge ?? 0),
    surcharge: String(input.surcharge ?? 0),
    thc: String(input.thc ?? 0),
    volumetricDivisor: input.volumetricDivisor ?? null,
    usableCbm: input.usableCbm != null ? String(input.usableCbm) : null,
    unitRatePerTon: input.unitRatePerTon != null ? String(input.unitRatePerTon) : null,
    originPort: input.originPort?.trim() || null,
    destPort: input.destPort?.trim() || null,
    effectiveFrom: input.effectiveFrom.slice(0, 10),
    effectiveTo: input.effectiveTo?.slice(0, 10) || null,
    status: toDbActiveStatus(input.status),
    note: input.note?.trim() || '',
    createdAt: now,
    updatedAt: now,
  })
  return getFreightRateCard(db as AppDatabase, organizationId, id)
}

export async function updateFreightRateCard(
  db: DbLike,
  organizationId: string,
  input: {
    id: string
    name?: string
    freightMode?: string
    carrierId?: string | null
    currency?: string
    unitRate?: number
    minCharge?: number
    surcharge?: number
    thc?: number
    volumetricDivisor?: number | null
    usableCbm?: number | null
    unitRatePerTon?: number | null
    originPort?: string
    destPort?: string
    effectiveFrom?: string
    effectiveTo?: string | null
    status?: string
    note?: string
  },
) {
  const existing = await getFreightRateCard(db as AppDatabase, organizationId, input.id)
  if (!existing) throw new Error('运价卡不存在')
  await db
    .update(commerceFreightRateCards)
    .set({
      name: input.name?.trim() ?? existing.name,
      freightMode: input.freightMode?.trim() ?? existing.freightMode,
      carrierId: input.carrierId === undefined ? existing.carrierId || null : input.carrierId || null,
      currency: input.currency?.toUpperCase() ?? existing.currency,
      unitRate: String(input.unitRate ?? existing.unitRate),
      minCharge: String(input.minCharge ?? existing.minCharge),
      surcharge: String(input.surcharge ?? existing.surcharge),
      thc: String(input.thc ?? existing.thc),
      volumetricDivisor: input.volumetricDivisor === undefined ? existing.volumetricDivisor : input.volumetricDivisor,
      usableCbm: input.usableCbm === undefined ? (existing.usableCbm != null ? String(existing.usableCbm) : null) : input.usableCbm != null ? String(input.usableCbm) : null,
      unitRatePerTon:
        input.unitRatePerTon === undefined
          ? existing.unitRatePerTon != null
            ? String(existing.unitRatePerTon)
            : null
          : input.unitRatePerTon != null
            ? String(input.unitRatePerTon)
            : null,
      originPort: (input.originPort ?? existing.originPort) || null,
      destPort: (input.destPort ?? existing.destPort) || null,
      effectiveFrom: input.effectiveFrom?.slice(0, 10) ?? existing.effectiveFrom,
      effectiveTo: input.effectiveTo === undefined ? existing.effectiveTo || null : input.effectiveTo || null,
      status: input.status != null ? toDbActiveStatus(input.status) : existing.dbStatus,
      note: input.note ?? existing.note,
      updatedAt: new Date(),
    })
    .where(and(eq(commerceFreightRateCards.organizationId, organizationId), eq(commerceFreightRateCards.id, existing.id)))
  return getFreightRateCard(db as AppDatabase, organizationId, existing.id)
}
