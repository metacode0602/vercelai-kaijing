/**
 * 候选选品 dataaccess（模块14）。
 * 手工录入 / 导入落库；审核通过 → 创建 SPU 草稿或关联已有 product；拒绝写理由。
 * 禁止声称市场爬虫成功。
 */
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import {
  pendingActions,
  productCandidates,
  products,
} from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import {
  formatStamp,
  money,
  toDbCandidateSource,
  toDbCandidateStatus,
  toUiCandidateSource,
  toUiCandidateStatus,
  type UiCandidateSource,
  type UiCandidateStatus,
} from '@/lib/server/mappers/candidates'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'
import { createProduct } from '@/lib/server/dataaccess/products'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

export type CandidateRationale = {
  demand?: string
  margin?: string
  risk?: string
  competition?: string
  marketPotential?: string
  goNoGo?: string
  currency?: string
  landedCost?: number
  suggestPrice?: number
  marginPct?: number
  aiSignals?: string[]
  evidenceLabel?: string
  evidenceStatus?: string
  [key: string]: unknown
}

export type CandidateDto = {
  id: string
  title: string
  url: string
  categoryHint: string
  score: number
  status: UiCandidateStatus
  dbStatus: string
  source: UiCandidateSource
  dbSource: string
  rejectReason: string
  productId: string
  productSpu: string
  pendingActionId: string
  rationale: CandidateRationale
  goNoGo: string
  currency: string
  landedCost: number
  suggestPrice: number
  marginPct: number
  competition: string
  marketPotential: string
  risk: string
  evidenceLabel: string
  reviewedBy: string
  reviewedAt: string
  createdAt: string
  updatedAt: string
}

function readRationale(raw: unknown): CandidateRationale {
  if (!raw || typeof raw !== 'object') return {}
  return raw as CandidateRationale
}

function mapCandidate(
  row: typeof productCandidates.$inferSelect,
  productSpu = '',
): CandidateDto {
  const rationale = readRationale(row.rationale)
  return {
    id: row.id,
    title: row.title,
    url: row.url ?? '',
    categoryHint: row.categoryHint ?? '',
    score: money(row.score),
    status: toUiCandidateStatus(row.status),
    dbStatus: row.status,
    source: toUiCandidateSource(row.source),
    dbSource: row.source ?? 'manual',
    rejectReason: row.rejectReason ?? '',
    productId: row.productId ?? '',
    productSpu,
    pendingActionId: row.pendingActionId ?? '',
    rationale,
    goNoGo: String(rationale.goNoGo ?? (row.status === 'accepted' ? 'GO' : row.status === 'rejected' ? 'NO_GO' : 'HOLD')),
    currency: String(rationale.currency ?? 'USD'),
    landedCost: Number(rationale.landedCost ?? 0),
    suggestPrice: Number(rationale.suggestPrice ?? 0),
    marginPct: Number(rationale.marginPct ?? 0),
    competition: String(rationale.competition ?? ''),
    marketPotential: String(rationale.marketPotential ?? ''),
    risk: String(rationale.risk ?? ''),
    evidenceLabel: String(rationale.evidenceLabel ?? (row.source === 'manual' ? '手工录入' : row.source === 'import' ? '导入' : '寻源备注')),
    reviewedBy: row.reviewedBy ?? '',
    reviewedAt: formatStamp(row.reviewedAt),
    createdAt: formatStamp(row.createdAt),
    updatedAt: formatStamp(row.updatedAt),
  }
}

export async function listCandidates(
  db: DbLike,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string; status?: string; source?: string },
): Promise<PaginatedResult<CandidateDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const filters: SQL[] = [eq(productCandidates.organizationId, organizationId)]
  if (input.status && input.status !== 'all') {
    filters.push(eq(productCandidates.status, toDbCandidateStatus(input.status)))
  }
  if (input.source && input.source !== 'all') {
    filters.push(eq(productCandidates.source, toDbCandidateSource(input.source)))
  }
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(
      or(
        ilike(productCandidates.title, q),
        ilike(productCandidates.categoryHint, q),
        ilike(productCandidates.id, q),
      )!,
    )
  }
  const where = and(...filters)!
  const [totalRow] = await db.select({ value: count() }).from(productCandidates).where(where)
  const rows = await db
    .select({
      candidate: productCandidates,
      spu: products.spuCode,
    })
    .from(productCandidates)
    .leftJoin(products, eq(productCandidates.productId, products.id))
    .where(where)
    .orderBy(desc(productCandidates.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return {
    items: rows.map((r) => mapCandidate(r.candidate, r.spu ?? '')),
    total: Number(totalRow?.value ?? 0),
    page,
    pageSize,
  }
}

export async function candidateStats(db: DbLike, organizationId: string) {
  const rows = await db
    .select({ status: productCandidates.status, value: count() })
    .from(productCandidates)
    .where(eq(productCandidates.organizationId, organizationId))
    .groupBy(productCandidates.status)
  let total = 0
  let pending = 0
  let accepted = 0
  let rejected = 0
  for (const r of rows) {
    const n = Number(r.value)
    total += n
    const ui = toUiCandidateStatus(r.status)
    if (ui === '待审') pending += n
    if (ui === '已通过') accepted += n
    if (ui === '已拒绝') rejected += n
  }
  return { total, pending, accepted, rejected }
}

export async function getCandidate(
  db: DbLike,
  organizationId: string,
  id: string,
): Promise<CandidateDto | null> {
  const [row] = await db
    .select({ candidate: productCandidates, spu: products.spuCode })
    .from(productCandidates)
    .leftJoin(products, eq(productCandidates.productId, products.id))
    .where(and(eq(productCandidates.organizationId, organizationId), eq(productCandidates.id, id)))
    .limit(1)
  if (!row) return null
  return mapCandidate(row.candidate, row.spu ?? '')
}

export type CreateCandidateInput = {
  title: string
  url?: string
  categoryHint?: string
  score?: number
  source?: string
  rationale?: CandidateRationale
  landedCost?: number
  suggestPrice?: number
  marginPct?: number
  currency?: string
  goNoGo?: string
  competition?: string
  marketPotential?: string
  risk?: string
  actor?: string
}

export async function createCandidate(
  db: DbLike,
  organizationId: string,
  input: CreateCandidateInput,
): Promise<CandidateDto> {
  const source = toDbCandidateSource(input.source, 'manual')
  if (source === 'sourcing' && !input.url && !(input.rationale && Object.keys(input.rationale).length)) {
    // 允许寻源备注，但不假装爬虫成功
  }
  const rationale: CandidateRationale = {
    ...(input.rationale ?? {}),
    currency: input.currency ?? input.rationale?.currency ?? 'USD',
    landedCost: input.landedCost ?? input.rationale?.landedCost ?? 0,
    suggestPrice: input.suggestPrice ?? input.rationale?.suggestPrice ?? 0,
    marginPct: input.marginPct ?? input.rationale?.marginPct ?? 0,
    goNoGo: input.goNoGo ?? input.rationale?.goNoGo ?? 'HOLD',
    competition: input.competition ?? input.rationale?.competition ?? '',
    marketPotential: input.marketPotential ?? input.rationale?.marketPotential ?? '',
    risk: input.risk ?? input.rationale?.risk ?? '',
    evidenceLabel:
      input.rationale?.evidenceLabel ??
      (source === 'manual' ? '手工录入 · 非爬虫' : source === 'import' ? '批量导入 · 非爬虫' : '寻源备注 · 未接市场爬虫'),
    evidenceStatus: input.rationale?.evidenceStatus ?? 'manual',
  }

  const id = createId()
  const actionId = createId()
  const now = new Date()
  const actor = input.actor?.trim() || 'console'

  await db.transaction(async (tx) => {
    await tx.insert(pendingActions).values({
      id: actionId,
      organizationId,
      kind: 'candidate_review',
      status: 'pending',
      title: `选品审核 · ${input.title.trim()}`,
      payload: { candidateId: id, source },
      idempotencyKey: `candidate:${id}`,
      createdBy: actor,
    })
    await tx.insert(productCandidates).values({
      id,
      organizationId,
      title: input.title.trim(),
      url: input.url?.trim() || null,
      categoryHint: input.categoryHint?.trim() || null,
      score: String(input.score ?? 0),
      rationale,
      status: 'new',
      source,
      pendingActionId: actionId,
      createdAt: now,
      updatedAt: now,
    })
  })

  const row = await getCandidate(db, organizationId, id)
  if (!row) throw new Error('创建候选后读取失败')
  return row
}

export async function updateCandidate(
  db: DbLike,
  organizationId: string,
  input: {
    id: string
    title?: string
    url?: string
    categoryHint?: string
    score?: number
    rationale?: CandidateRationale
    landedCost?: number
    suggestPrice?: number
    marginPct?: number
    currency?: string
    goNoGo?: string
  },
): Promise<CandidateDto> {
  const [existing] = await db
    .select()
    .from(productCandidates)
    .where(and(eq(productCandidates.organizationId, organizationId), eq(productCandidates.id, input.id)))
    .limit(1)
  if (!existing) throw new Error(`候选不存在：${input.id}`)
  if (existing.status !== 'new') throw new Error('仅待审候选可编辑')

  const prev = readRationale(existing.rationale)
  const rationale: CandidateRationale = {
    ...prev,
    ...(input.rationale ?? {}),
  }
  if (input.currency != null) rationale.currency = input.currency
  if (input.landedCost != null) rationale.landedCost = input.landedCost
  if (input.suggestPrice != null) rationale.suggestPrice = input.suggestPrice
  if (input.marginPct != null) rationale.marginPct = input.marginPct
  if (input.goNoGo != null) rationale.goNoGo = input.goNoGo

  await db
    .update(productCandidates)
    .set({
      title: input.title?.trim() ?? existing.title,
      url: input.url !== undefined ? input.url.trim() || null : existing.url,
      categoryHint:
        input.categoryHint !== undefined ? input.categoryHint.trim() || null : existing.categoryHint,
      score: input.score != null ? String(input.score) : existing.score,
      rationale,
      updatedAt: new Date(),
    })
    .where(eq(productCandidates.id, existing.id))

  const row = await getCandidate(db, organizationId, existing.id)
  if (!row) throw new Error('更新后读取失败')
  return row
}

export async function acceptCandidate(
  db: AppDatabase,
  organizationId: string,
  input: {
    id: string
    mode?: 'create_draft' | 'link_existing'
    productId?: string
    productSpu?: string
    brand?: string
    owner?: string
    material?: string
    style?: string
    actor?: string
  },
): Promise<CandidateDto> {
  const [existing] = await db
    .select()
    .from(productCandidates)
    .where(and(eq(productCandidates.organizationId, organizationId), eq(productCandidates.id, input.id)))
    .limit(1)
  if (!existing) throw new Error(`候选不存在：${input.id}`)
  if (existing.status === 'accepted') {
    const row = await getCandidate(db, organizationId, existing.id)
    if (!row) throw new Error('已通过候选读取失败')
    return row
  }
  if (existing.status === 'rejected') throw new Error('已拒绝的候选不能再通过')

  const actor = input.actor?.trim() || 'console'
  const mode = input.mode ?? 'create_draft'
  let productId = input.productId?.trim() || ''

  if (mode === 'link_existing') {
    if (!productId && input.productSpu) {
      const [p] = await db
        .select()
        .from(products)
        .where(and(eq(products.organizationId, organizationId), eq(products.spuCode, input.productSpu)))
        .limit(1)
      if (!p) throw new Error(`未找到 SPU ${input.productSpu}`)
      productId = p.id
    }
    if (!productId) throw new Error('关联已有商品时需要 productId 或 productSpu')
  } else {
    const created = await createProduct(
      db,
      organizationId,
      {
        name: existing.title,
        brand: input.brand?.trim() || '待填',
        category: existing.categoryHint?.trim() || '未分类',
        owner: input.owner?.trim() || actor,
        material: input.material?.trim() || '待填',
        style: input.style?.trim() || '待填',
        status: '待确认',
      },
      undefined,
    )
    const [p] = await db
      .select()
      .from(products)
      .where(and(eq(products.organizationId, organizationId), eq(products.spuCode, created.spu)))
      .limit(1)
    if (!p) throw new Error('创建 SPU 草稿后未找到商品')
    productId = p.id
  }

  const now = new Date()
  await db.transaction(async (tx) => {
    await tx
      .update(productCandidates)
      .set({
        status: 'accepted',
        productId,
        rejectReason: null,
        reviewedBy: actor,
        reviewedAt: now,
        updatedAt: now,
        rationale: {
          ...readRationale(existing.rationale),
          goNoGo: 'GO',
        },
      })
      .where(eq(productCandidates.id, existing.id))

    if (existing.pendingActionId) {
      await tx
        .update(pendingActions)
        .set({
          status: 'confirmed',
          confirmedBy: actor,
          confirmedAt: now,
          executedAt: now,
          updatedAt: now,
        })
        .where(eq(pendingActions.id, existing.pendingActionId))
    }

    // 候选通过 → 自动生成刊登提交待审（mode=create；确认时创建本地刊登）。
    const listingPendingKey = `listing_submit:candidate:${existing.id}`
    const [listingPending] = await tx
      .select({ id: pendingActions.id })
      .from(pendingActions)
      .where(
        and(
          eq(pendingActions.organizationId, organizationId),
          eq(pendingActions.idempotencyKey, listingPendingKey),
        ),
      )
      .limit(1)
    if (!listingPending) {
      await tx.insert(pendingActions).values({
        id: createId(),
        organizationId,
        kind: 'listing_submit',
        status: 'pending',
        title: `刊登提交：${existing.title}`,
        payload: {
          mode: 'create',
          source: 'candidate',
          candidateId: existing.id,
          productId,
          title: existing.title,
          categoryPath: existing.categoryHint?.trim() || '',
          brandName: input.brand?.trim() || '',
        },
        idempotencyKey: listingPendingKey,
        createdBy: actor,
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        updatedAt: now,
      })
    }
  })

  const row = await getCandidate(db, organizationId, existing.id)
  if (!row) throw new Error('审核通过后读取失败')
  return row
}

export async function rejectCandidate(
  db: DbLike,
  organizationId: string,
  input: { id: string; reason: string; actor?: string },
): Promise<CandidateDto> {
  const reason = input.reason?.trim()
  if (!reason) throw new Error('拒绝必须填写理由')

  const [existing] = await db
    .select()
    .from(productCandidates)
    .where(and(eq(productCandidates.organizationId, organizationId), eq(productCandidates.id, input.id)))
    .limit(1)
  if (!existing) throw new Error(`候选不存在：${input.id}`)
  if (existing.status === 'accepted') throw new Error('已通过的候选不能拒绝')

  const actor = input.actor?.trim() || 'console'
  const now = new Date()
  await db.transaction(async (tx) => {
    await tx
      .update(productCandidates)
      .set({
        status: 'rejected',
        rejectReason: reason,
        reviewedBy: actor,
        reviewedAt: now,
        updatedAt: now,
        rationale: {
          ...readRationale(existing.rationale),
          goNoGo: 'NO_GO',
        },
      })
      .where(eq(productCandidates.id, existing.id))

    if (existing.pendingActionId) {
      await tx
        .update(pendingActions)
        .set({
          status: 'rejected',
          confirmedBy: actor,
          confirmedAt: now,
          error: reason,
          updatedAt: now,
        })
        .where(eq(pendingActions.id, existing.pendingActionId))
    }
  })

  const row = await getCandidate(db, organizationId, existing.id)
  if (!row) throw new Error('拒绝后读取失败')
  return row
}
