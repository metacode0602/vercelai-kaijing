import { and, asc, count, eq, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bankAccount, merchant } from '@workspace/db'
import type { PaginatedResult } from '@workspace/billing'

/**
 * 平台为商户开设的**专用收款账户**（数据来源：merchant 预付 / 对公转账）
 *
 * 与 `merchant_payout_account`（平台打款给商户）方向相反，别混淆：
 *   - merchant_payout_account：商户填、平台审核，用于**平台付款给商户**
 *   - bank_account(merchant_id)：平台填、商户只读，用于**商户付款给平台**
 *
 * 「严格专用」是本模块的核心约束：商户端只看到 `merchant_id = 自己` 的行
 * （`apps/merchant/.../prepay.ts: listBankAccounts`）。同一账户出现在多个商户的
 * 预付单里，汇款备注（orderNo）与到账流水无法唯一归属，串号后无法自动对账。
 *
 * 因此这里创建账户时**必须**带 merchantId；`merchant_id IS NULL` 的平台通用账户
 * 保留给其它场景（用户充值等），不通过本模块下发。
 */

/** DB 原始行（金额为 numeric → string，createdAt 可空） */
interface DedicatedAccountRow {
  id: string
  merchantId: string
  merchantName: string | null
  accountName: string
  accountNo: string
  bankName: string
  bankBranch: string | null
  bankCode: string | null
  accountType: string
  minAmount: string | null
  isActive: boolean
  sortOrder: number
  remark: string | null
  createdAt: Date | null
}

/** 对外 DTO（金额为 number，账号带掩码） */
export interface DedicatedAccountDto {
  id: string
  merchantId: string
  merchantName: string | null
  accountName: string
  /** 掩码：运营列表页不暴露完整账号（account_no 是敏感信息） */
  accountNoMasked: string
  accountNo: string
  bankName: string
  bankBranch: string | null
  bankCode: string | null
  accountType: string
  minAmount: number
  isActive: boolean
  sortOrder: number
  remark: string | null
  createdAt: Date
}

export interface ListDedicatedAccountInput {
  /** 按商户过滤；不传则返回全部专用账户 */
  merchantId?: string
  /** 只看启用 / 只看停用；不传则全部 */
  isActive?: boolean
  page: number
  pageSize: number
}

export interface CreateDedicatedAccountInput {
  merchantId: string
  accountName: string
  accountNo: string
  bankName: string
  bankBranch?: string | null
  bankCode?: string | null
  accountType?: 'enterprise' | 'personal'
  minAmount?: number
  sortOrder?: number
  remark?: string | null
  /** 操作人，写审计 */
  operatorId: string
}

/** 账号掩码：保留后 4 位，前段用 * 遮蔽 */
export function maskAccountNo(accountNo: string): string {
  const s = accountNo.trim()
  if (s.length <= 4) return '*'.repeat(s.length)
  return `${'*'.repeat(s.length - 4)}${s.slice(-4)}`
}

const toDto = (r: DedicatedAccountRow): DedicatedAccountDto => ({
  id: r.id,
  merchantId: r.merchantId,
  merchantName: r.merchantName,
  accountName: r.accountName,
  accountNo: r.accountNo,
  accountNoMasked: maskAccountNo(r.accountNo),
  bankName: r.bankName,
  bankBranch: r.bankBranch,
  bankCode: r.bankCode,
  accountType: r.accountType,
  minAmount: Number(r.minAmount ?? 0),
  isActive: r.isActive,
  sortOrder: r.sortOrder,
  remark: r.remark,
  createdAt: r.createdAt ?? new Date(0),
})

function newId(): string {
  return globalThis.crypto.randomUUID()
}

/** 平台未为该商户配置任何专用收款账户 */
export class MerchantHasNoDedicatedAccountError extends Error {
  readonly code = 'MERCHANT_HAS_NO_DEDICATED_ACCOUNT'
  constructor(merchantId: string) {
    super(`商户 ${merchantId} 尚未配置专用收款账户，商户端无法自助预付`)
    this.name = 'MerchantHasNoDedicatedAccountError'
  }
}

/** 同一商户下 sortOrder 重复（DB 有部分唯一索引兜底，这里给出可读错误） */
export class DuplicateAccountSortOrderError extends Error {
  readonly code = 'DUPLICATE_ACCOUNT_SORT_ORDER'
  constructor(merchantId: string, sortOrder: number) {
    super(`商户 ${merchantId} 下已存在展示顺序为 ${sortOrder} 的收款账户`)
    this.name = 'DuplicateAccountSortOrderError'
  }
}

export const merchantReceivingAccountDataAccess = {
  /** DB 级分页 */
  async list(input: ListDedicatedAccountInput): Promise<PaginatedResult<DedicatedAccountDto>> {
    const page = Math.max(1, input.page)
    const pageSize = Math.min(100, Math.max(1, input.pageSize))
    const conditions = [sql`${bankAccount.merchantId} is not null`]
    if (input.merchantId) {
      conditions.push(eq(bankAccount.merchantId, input.merchantId))
    }
    if (typeof input.isActive === 'boolean') {
      conditions.push(eq(bankAccount.isActive, input.isActive))
    }
    const where = and(...conditions)

    const [totalRow] = await db
      .select({ total: count() })
      .from(bankAccount)
      .where(where)
    const total = Number(totalRow?.total ?? 0)

    const rows = await db
      .select({
        id: bankAccount.id,
        merchantId: bankAccount.merchantId,
        accountName: bankAccount.accountName,
        accountNo: bankAccount.accountNo,
        bankName: bankAccount.bankName,
        bankBranch: bankAccount.bankBranch,
        bankCode: bankAccount.bankCode,
        accountType: bankAccount.accountType,
        minAmount: bankAccount.minAmount,
        isActive: bankAccount.isActive,
        sortOrder: bankAccount.sortOrder,
        remark: bankAccount.remark,
        createdAt: bankAccount.createdAt,
        merchantName: merchant.name,
      })
      .from(bankAccount)
      .leftJoin(merchant, eq(merchant.id, bankAccount.merchantId))
      .where(where)
      .orderBy(asc(bankAccount.merchantId), asc(bankAccount.sortOrder))
      .limit(pageSize)
      .offset((page - 1) * pageSize)

    return {
      items: rows.map((r) => toDto({ ...r, merchantId: r.merchantId as string })),
      total,
      page,
      pageSize,
    }
  },

  async getById(id: string): Promise<DedicatedAccountDto | null> {
    const [row] = await db
      .select({
        id: bankAccount.id,
        merchantId: bankAccount.merchantId,
        accountName: bankAccount.accountName,
        accountNo: bankAccount.accountNo,
        bankName: bankAccount.bankName,
        bankBranch: bankAccount.bankBranch,
        bankCode: bankAccount.bankCode,
        accountType: bankAccount.accountType,
        minAmount: bankAccount.minAmount,
        isActive: bankAccount.isActive,
        sortOrder: bankAccount.sortOrder,
        remark: bankAccount.remark,
        createdAt: bankAccount.createdAt,
        merchantName: merchant.name,
      })
      .from(bankAccount)
      .leftJoin(merchant, eq(merchant.id, bankAccount.merchantId))
      .where(eq(bankAccount.id, id))
    return row ? toDto({ ...row, merchantId: row.merchantId as string }) : null
  },

  /**
   * 为商户开设专用收款账户。
   *
   * `sortOrder` 缺省时取「该商户当前最大值 + 1」，让运营不必手填顺序。
   * 同一商户重复顺序由 DB 部分唯一索引兜底，这里先查一次给可读错误。
   */
  async create(input: CreateDedicatedAccountInput): Promise<DedicatedAccountDto> {
    const [m] = await db
      .select({ id: merchant.id })
      .from(merchant)
      .where(eq(merchant.id, input.merchantId))
    if (!m) {
      throw new Error(`商户不存在：${input.merchantId}`)
    }

    let sortOrder = input.sortOrder
    if (sortOrder === undefined) {
      const [maxRow] = await db
        .select({ max: sql<number | null>`max(${bankAccount.sortOrder})` })
        .from(bankAccount)
        .where(eq(bankAccount.merchantId, input.merchantId))
      sortOrder = Number(maxRow?.max ?? -1) + 1
    }

    const [dup] = await db
      .select({ id: bankAccount.id })
      .from(bankAccount)
      .where(
        and(
          eq(bankAccount.merchantId, input.merchantId),
          eq(bankAccount.sortOrder, sortOrder),
        ),
      )
    if (dup) {
      throw new DuplicateAccountSortOrderError(input.merchantId, sortOrder)
    }

    const id = newId()
    const inserted = await db
      .insert(bankAccount)
      .values({
        id,
        accountName: input.accountName,
        accountNo: input.accountNo,
        bankName: input.bankName,
        bankBranch: input.bankBranch ?? null,
        bankCode: input.bankCode ?? null,
        merchantId: input.merchantId,
        accountType: input.accountType ?? 'enterprise',
        minAmount: String(input.minAmount ?? 0),
        sortOrder,
        isActive: true,
        remark: input.remark ?? null,
        createdAt: new Date(),
      })
      .returning({ id: bankAccount.id })
    const row = inserted[0]
    if (!row) throw new Error('创建收款账户失败：未返回 id')

    const created = await this.getById(row.id)
    if (!created) throw new Error('创建后读取失败')
    return created
  },

  /**
   * 停用 / 启用。
   *
   * 停用是「停止下发」而非删除：已有预付单可能仍在等待这笔账户的到账，
   * 删掉会让运营在核对历史单据时看不到汇款目标。
   */
  async setActive(id: string, isActive: boolean): Promise<DedicatedAccountDto> {
    const existing = await this.getById(id)
    if (!existing) throw new Error(`收款账户不存在：${id}`)
    await db
      .update(bankAccount)
      .set({ isActive })
      .where(eq(bankAccount.id, id))
    const updated = await this.getById(id)
    if (!updated) throw new Error('更新后读取失败')
    return updated
  },

  /**
   * 开通账户时选商户用的候选列表（DB 级分页 + 关键字模糊匹配）。
   *
   * 不复用 `merchant.list`——那是 merchantScopedProcedure 且不接受分页参数，
   * 而本页需要「按商户筛 + 分页」的组合。
   */
  async listMerchantOptions(
    input: { search?: string; page: number; pageSize: number },
  ): Promise<PaginatedResult<{ id: string; name: string; code: string | null }>> {
    const page = Math.max(1, input.page)
    const pageSize = Math.min(100, Math.max(1, input.pageSize))
    const conditions: SQL[] = []
    if (input.search) {
      const kw = `%${input.search}%`
      conditions.push(
        sql`(lower(${merchant.name}) like lower(${kw}) or lower(${merchant.code}) like lower(${kw}))`,
      )
    }
    const where = conditions.length ? and(...conditions) : undefined

    const [totalRow] = await db
      .select({ total: count() })
      .from(merchant)
      .where(where)
    const total = Number(totalRow?.total ?? 0)

    const rows = await db
      .select({ id: merchant.id, name: merchant.name, code: merchant.code })
      .from(merchant)
      .where(where)
      .orderBy(asc(merchant.name))
      .limit(pageSize)
      .offset((page - 1) * pageSize)

    return { items: rows, total, page, pageSize }
  },

  /** 某商户是否已具备可用的专用账户（供运营在商户列表上提示） */
  async hasActiveAccount(merchantId: string): Promise<boolean> {
    const [row] = await db
      .select({ total: count() })
      .from(bankAccount)
      .where(and(eq(bankAccount.merchantId, merchantId), eq(bankAccount.isActive, true)))
    return Number(row?.total ?? 0) > 0
  },

  /** 批量检查：给商户列表打「可预付 / 未配置账户」标记 */
  async activeAccountMerchantIds(merchantIds: string[]): Promise<Set<string>> {
    if (merchantIds.length === 0) return new Set()
    const rows = await db
      .select({ merchantId: bankAccount.merchantId })
      .from(bankAccount)
      .where(
        and(
          sql`${bankAccount.merchantId} in ${merchantIds}`,
          eq(bankAccount.isActive, true),
        ),
      )
    return new Set(rows.map((r) => r.merchantId as string))
  },

  /**
   * 某商户下已存在的专用账户 id + 顺序（提交凭证时回显，让商户确认转对账户）
   */
  async listActiveForMerchant(merchantId: string): Promise<DedicatedAccountDto[]> {
    const res = await this.list({ merchantId, isActive: true, page: 1, pageSize: 100 })
    return res.items
  },

  /**
   * 校验商户在某专用账户上的最低汇款额。
   * 低于 minAmount 的单子即使到账也应退回，故下单时前置拦一次。
   */
  async assertMinAmount(id: string, amount: number): Promise<void> {
    const [row] = await db
      .select({ minAmount: bankAccount.minAmount })
      .from(bankAccount)
      .where(and(eq(bankAccount.id, id), eq(bankAccount.isActive, true)))
    if (!row) {
      throw new Error(`收款账户不存在或已停用：${id}`)
    }
    const min = Number(row.minAmount ?? 0)
    if (amount < min) {
      throw new Error(
        `该账户最低汇款额为 ¥${min.toFixed(2)}，本次 ¥${amount.toFixed(2)} 低于下限`,
      )
    }
  },
}
