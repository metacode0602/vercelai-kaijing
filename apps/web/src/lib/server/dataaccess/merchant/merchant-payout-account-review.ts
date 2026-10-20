/**
 * 商户/供应商收款账户审核（DEC-F3 / DEC-F12）
 *
 * 商户端（apps/merchant）只能提交、不能自审；审核与停用只在平台运营侧发生。
 *
 * 审核通过是**两处原子变更**：把目标户置 active，以及把该 owner 原有的
 * active+default 降级为 disabled。顺序不能反 —— 先置 active 会撞
 * merchant_payout_account_default_uk（同一 owner 只允许一个 active+default），
 * 先降级则目标户必然能落位。二者必须同事务，否则会出现「旧户已停用、
 * 新户没通过」的空窗，商户当期打款无目标。
 */

import { and, count, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'
import {
  merchant,
  merchantPayoutAccount,
  merchantPayoutAccountAuditLog,
  userStaff,
} from '@workspace/db/schema'
import { db } from '@/lib/db'
import { staffDataAccess } from '@/lib/server/dataaccess/crm/staff'
import type { PaginatedResult } from '@workspace/billing'

const PAYOUT_ACCOUNT_STATUSES = ['pending_review', 'active', 'rejected', 'disabled'] as const
export type PayoutAccountStatus = (typeof PAYOUT_ACCOUNT_STATUSES)[number]
export const PAYOUT_ACCOUNT_OWNER_TYPES = ['merchant', 'supplier'] as const
export type PayoutAccountOwnerType = (typeof PAYOUT_ACCOUNT_OWNER_TYPES)[number]

/** 运营列表 DTO：账号一律脱敏，运营也不需要看到完整账号 */
export interface PayoutAccountReviewRow {
  id: string
  ownerType: PayoutAccountOwnerType
  ownerId: string
  /** owner 的可读名（商户简称 / 供应商名称），列表直接展示 */
  ownerName: string
  accountName: string
  accountNoMasked: string
  bankName: string
  bankBranch: string | null
  bankCode: string | null
  accountType: 'enterprise' | 'personal'
  status: PayoutAccountStatus
  isDefault: boolean
  rejectReason: string | null
  remark: string | null
  verifiedAt: string | null
  verifiedByStaffId: string | null
  createdAt: string
  updatedAt: string
}

export interface PayoutAccountAuditRow {
  id: string
  payoutAccountId: string
  action: string
  operatorStaffId: string | null
  operatorName: string | null
  remark: string | null
  changes: unknown
  occurredAt: string
}

async function resolveStaff(user: { id: string; email?: string | null; name?: string | null }) {
  const staffId = await staffDataAccess.resolveStaffIdForAuthUser(user)
  if (!staffId) throw new Error('当前账号未关联员工信息')
  const staff = await db.query.userStaff.findFirst({
    where: eq(userStaff.id, staffId),
    columns: { id: true, displayName: true },
  })
  if (!staff) throw new Error('员工信息不存在')
  return { staffId, displayName: staff.displayName }
}

const toIso = (v: Date | string | null | undefined): string | null =>
  v ? (v instanceof Date ? v.toISOString() : new Date(v).toISOString()) : null

/** 与商户端 maskAccountNo 同口径：仅露后 4 位，短号全掩 */
function maskAccountNo(accountNo: string): string {
  if (accountNo.length <= 4) return '*'.repeat(4)
  return '*'.repeat(accountNo.length - 4) + accountNo.slice(-4)
}

function buildConditions(f: {
  status?: PayoutAccountStatus
  ownerType?: PayoutAccountOwnerType
  ownerId?: string
  search?: string
}): SQL[] {
  const conds: SQL[] = []
  if (f.status) conds.push(eq(merchantPayoutAccount.status, f.status))
  if (f.ownerType) conds.push(eq(merchantPayoutAccount.ownerType, f.ownerType))
  if (f.ownerId) conds.push(eq(merchantPayoutAccount.ownerId, f.ownerId))
  const q = f.search?.trim()
  if (q) {
    // 只搜 owner 展示名与开户名，**不搜账号** —— 避免运营拿账号当搜索条件做枚举
    conds.push(
      sql`(${merchantPayoutAccount.accountName} ILIKE ${'%' + q + '%'} OR ${merchantPayoutAccount.bankName} ILIKE ${'%' + q + '%'})`,
    )
  }
  return conds
}

export const payoutAccountReviewDataAccess = {
  /** 待审 + 全部，供运营工作台 */
  async listPage(params: {
    page?: number
    pageSize?: number
    status?: PayoutAccountStatus
    ownerType?: PayoutAccountOwnerType
    ownerId?: string
    search?: string
  }): Promise<PaginatedResult<PayoutAccountReviewRow>> {
    const page = Math.max(1, params.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20))
    const conds = buildConditions(params)
    const where = conds.length ? and(...conds) : undefined

    const [totalRow] = await db
      .select({ total: count() })
      .from(merchantPayoutAccount)
      .where(where)

    const rows = await db
      .select({
        id: merchantPayoutAccount.id,
        ownerType: merchantPayoutAccount.ownerType,
        ownerId: merchantPayoutAccount.ownerId,
        accountName: merchantPayoutAccount.accountName,
        accountNo: merchantPayoutAccount.accountNo,
        bankName: merchantPayoutAccount.bankName,
        bankBranch: merchantPayoutAccount.bankBranch,
        bankCode: merchantPayoutAccount.bankCode,
        accountType: merchantPayoutAccount.accountType,
        status: merchantPayoutAccount.status,
        isDefault: merchantPayoutAccount.isDefault,
        rejectReason: merchantPayoutAccount.rejectReason,
        remark: merchantPayoutAccount.remark,
        verifiedAt: merchantPayoutAccount.verifiedAt,
        verifiedByStaffId: merchantPayoutAccount.verifiedByStaffId,
        createdAt: merchantPayoutAccount.createdAt,
        updatedAt: merchantPayoutAccount.updatedAt,
      })
      .from(merchantPayoutAccount)
      .where(where)
      .orderBy(desc(merchantPayoutAccount.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize)

    // owner 展示名：merchant 取简称，supplier 取名称；缺失则回退到 id 前 8 位
    const ownerNames = await resolveOwnerNames(
      rows.map((r) => ({ ownerType: r.ownerType, ownerId: r.ownerId })),
    )

    return {
      // 逐字段显式映射，**不用 { ...r } 展开** —— 展开会把明文 accountNo
      // 一起带进 DTO，脱敏就形同虚设。DTO 里只有 accountNoMasked。
      items: rows.map((r) => ({
        id: r.id,
        ownerType: r.ownerType as PayoutAccountOwnerType,
        ownerId: r.ownerId,
        ownerName: ownerNames.get(`${r.ownerType}:${r.ownerId}`) ?? `${r.ownerId.slice(0, 8)}…`,
        accountName: r.accountName,
        accountNoMasked: maskAccountNo(r.accountNo),
        bankName: r.bankName,
        bankBranch: r.bankBranch,
        bankCode: r.bankCode,
        accountType: r.accountType as 'enterprise' | 'personal',
        status: r.status as PayoutAccountStatus,
        isDefault: r.isDefault,
        rejectReason: r.rejectReason,
        remark: r.remark,
        verifiedAt: toIso(r.verifiedAt),
        verifiedByStaffId: r.verifiedByStaffId,
        createdAt: toIso(r.createdAt)!,
        updatedAt: toIso(r.updatedAt)!,
      })),
      total: Number(totalRow?.total ?? 0),
      page,
      pageSize,
    }
  },

  /**
   * 审核通过。
   *
   * 同事务内：把该 owner 原有 active+default 置 disabled（is_default 置 false，
   * 否则部分唯一索引仍会占用），再把目标户置 active。顺序不可调换。
   */
  async approve(
    payoutAccountId: string,
    user: { id: string; email?: string | null; name?: string | null },
  ): Promise<{ id: string; disabledPreviousId: string | null }> {
    const operator = await resolveStaff(user)

    return db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(merchantPayoutAccount)
        .where(eq(merchantPayoutAccount.id, payoutAccountId))
        .limit(1)
      if (!target) throw new Error('收款账户不存在')
      if (target.status === 'active') throw new Error('该账户已是生效状态')

      const now = new Date()
      let disabledPreviousId: string | null = null

      // 1) 先降级旧的 active+default。is_default 必须同时置 false：
      //    部分唯一索引的条件是 (owner_type, owner_id) WHERE is_default AND status='active'，
      //    只改 status 的话新户仍会撞索引。
      if (target.isDefault) {
        const superseded = await tx
          .select({ id: merchantPayoutAccount.id })
          .from(merchantPayoutAccount)
          .where(
            and(
              eq(merchantPayoutAccount.ownerType, target.ownerType),
              eq(merchantPayoutAccount.ownerId, target.ownerId),
              eq(merchantPayoutAccount.status, 'active'),
              eq(merchantPayoutAccount.isDefault, true),
              sql`${merchantPayoutAccount.id} <> ${target.id}`,
            ),
          )
          .limit(1)

        if (superseded[0]) {
          await tx
            .update(merchantPayoutAccount)
            .set({
              status: 'disabled',
              isDefault: false,
              updatedAt: now,
            })
            .where(eq(merchantPayoutAccount.id, superseded[0].id))
          disabledPreviousId = superseded[0].id
          await tx.insert(merchantPayoutAccountAuditLog).values({
            id: crypto.randomUUID(),
            payoutAccountId: superseded[0].id,
            ownerType: target.ownerType,
            ownerId: target.ownerId,
            action: 'superseded',
            operatorStaffId: operator.staffId,
            operatorName: operator.displayName,
            occurredAt: now,
            changes: { supersededBy: target.id },
            remark: '新默认账户审核通过，原默认账户自动停用',
          })
        }
      }

      // 2) 再置新户 active
      await tx
        .update(merchantPayoutAccount)
        .set({
          status: 'active',
          isDefault: target.isDefault,
          verifiedAt: now,
          verifiedByStaffId: operator.staffId,
          rejectReason: null,
          updatedAt: now,
        })
        .where(eq(merchantPayoutAccount.id, target.id))

      await tx.insert(merchantPayoutAccountAuditLog).values({
        id: crypto.randomUUID(),
        payoutAccountId: target.id,
        ownerType: target.ownerType,
        ownerId: target.ownerId,
        action: 'approve',
        operatorStaffId: operator.staffId,
        operatorName: operator.displayName,
        occurredAt: now,
        changes: {
          from: target.status,
          to: 'active',
          accountNoMasked: maskAccountNo(target.accountNo),
          isDefault: target.isDefault,
        },
        remark: null,
      })

      return { id: target.id, disabledPreviousId }
    })
  },

  /** 驳回：必须给理由，运营要能据此回复商户 */
  async reject(
    payoutAccountId: string,
    input: { reason: string },
    user: { id: string; email?: string | null; name?: string | null },
  ): Promise<{ id: string }> {
    const reason = input.reason.trim()
    if (!reason) throw new Error('驳回必须填写理由')
    const operator = await resolveStaff(user)
    const now = new Date()

    return db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(merchantPayoutAccount)
        .where(eq(merchantPayoutAccount.id, payoutAccountId))
        .limit(1)
      if (!target) throw new Error('收款账户不存在')
      // 生效中的账户不能直接驳回：商户可能已在打款途中，必须先显式停用
      if (target.status === 'active') throw new Error('生效中的账户请先停用再驳回')

      await tx
        .update(merchantPayoutAccount)
        .set({ status: 'rejected', isDefault: false, rejectReason: reason, updatedAt: now })
        .where(eq(merchantPayoutAccount.id, payoutAccountId))

      await tx.insert(merchantPayoutAccountAuditLog).values({
        id: crypto.randomUUID(),
        payoutAccountId,
        ownerType: target.ownerType,
        ownerId: target.ownerId,
        action: 'reject',
        operatorStaffId: operator.staffId,
        operatorName: operator.displayName,
        occurredAt: now,
        changes: { from: target.status, to: 'rejected' },
        remark: reason,
      })

      return { id: payoutAccountId }
    })
  },

  /**
   * 停用。
   *
   * 停用 active+default 后该商户当期**没有打款目标** —— 这是有意的：
   * 宁可无人可打，也不要静默打给一个可能已过期的账户。佣金户此时应被准入拦住吗？
   * 不会：阈值判的是商户 available，与收款账户状态无关。两者是独立的闸，
   * 运营需自行保证「有 active 账户」后才允许首次打款。
   */
  async disable(
    payoutAccountId: string,
    input: { reason?: string },
    user: { id: string; email?: string | null; name?: string | null },
  ): Promise<{ id: string }> {
    const operator = await resolveStaff(user)
    const now = new Date()

    return db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(merchantPayoutAccount)
        .where(eq(merchantPayoutAccount.id, payoutAccountId))
        .limit(1)
      if (!target) throw new Error('收款账户不存在')
      if (target.status === 'disabled') throw new Error('该账户已停用')

      await tx
        .update(merchantPayoutAccount)
        .set({ status: 'disabled', isDefault: false, updatedAt: now })
        .where(eq(merchantPayoutAccount.id, payoutAccountId))

      await tx.insert(merchantPayoutAccountAuditLog).values({
        id: crypto.randomUUID(),
        payoutAccountId,
        ownerType: target.ownerType,
        ownerId: target.ownerId,
        action: 'disable',
        operatorStaffId: operator.staffId,
        operatorName: operator.displayName,
        occurredAt: now,
        changes: { from: target.status, to: 'disabled' },
        remark: input.reason?.trim() || null,
      })

      return { id: payoutAccountId }
    })
  },

  /** 账户审计日志（倒序） */
  async listAudit(payoutAccountId: string, limit = 50): Promise<PayoutAccountAuditRow[]> {
    const rows = await db
      .select({
        id: merchantPayoutAccountAuditLog.id,
        payoutAccountId: merchantPayoutAccountAuditLog.payoutAccountId,
        action: merchantPayoutAccountAuditLog.action,
        operatorStaffId: merchantPayoutAccountAuditLog.operatorStaffId,
        operatorName: merchantPayoutAccountAuditLog.operatorName,
        remark: merchantPayoutAccountAuditLog.remark,
        changes: merchantPayoutAccountAuditLog.changes,
        occurredAt: merchantPayoutAccountAuditLog.occurredAt,
      })
      .from(merchantPayoutAccountAuditLog)
      .where(eq(merchantPayoutAccountAuditLog.payoutAccountId, payoutAccountId))
      .orderBy(desc(merchantPayoutAccountAuditLog.occurredAt))
      .limit(Math.min(200, Math.max(1, limit)))

    return rows.map((r) => ({ ...r, occurredAt: toIso(r.occurredAt)! }))
  },

  /** 该 owner 是否已有生效默认账户（切 commission 前的前置检查） */
  async hasActiveDefault(ownerType: PayoutAccountOwnerType, ownerId: string): Promise<boolean> {
    const [row] = await db
      .select({ n: count() })
      .from(merchantPayoutAccount)
      .where(
        and(
          eq(merchantPayoutAccount.ownerType, ownerType),
          eq(merchantPayoutAccount.ownerId, ownerId),
          eq(merchantPayoutAccount.status, 'active'),
          eq(merchantPayoutAccount.isDefault, true),
        ),
      )
    return Number(row?.n ?? 0) > 0
  },
}

async function resolveOwnerNames(
  refs: { ownerType: string; ownerId: string }[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const merchantIds = [
    ...new Set(refs.filter((r) => r.ownerType === 'merchant').map((r) => r.ownerId)),
  ]
  if (merchantIds.length) {
    const rows = await db
      .select({ id: merchant.id, name: merchant.name })
      .from(merchant)
      .where(inArray(merchant.id, merchantIds))
    for (const r of rows) out.set(`merchant:${r.id}`, r.name)
  }
  // supplier 的展示名由 supply-schema 决定，这里先不硬依赖 —— 缺失时回退 id 前缀
  return out
}
