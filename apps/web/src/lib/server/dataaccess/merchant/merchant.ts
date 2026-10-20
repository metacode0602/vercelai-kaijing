import { db } from '@/lib/db'
import type { MerchantDataScope } from '@/lib/server/auth/merchant-data-scope'
import {
  buildMerchantTableIdFilter,
  filterMerchantGetById,
  loadVisibleMerchantIds,
} from '@/lib/server/auth/merchant-data-scope'
import { deriveAccessMode } from '@/lib/merchant-access-mode'
import { staffDataAccess } from '@/lib/server/dataaccess/crm/staff'
import { merchantAccountManagerDataAccess } from '@/lib/server/dataaccess/merchant/merchant-account-manager'
import { merchantConsumptionDataAccess } from '@/lib/server/dataaccess/merchant/merchant-consumption'
import { merchantPricingDataAccess } from '@/lib/server/dataaccess/merchant/merchant-pricing'
import { merchantRegionDataAccess } from '@/lib/server/dataaccess/merchant/merchant-region'
import {
  mapMerchantListRow,
  mapMerchantRow,
} from '@/lib/server/mappers/merchant'
import type { Merchant, MerchantActivity, MerchantListRow } from '@/lib/types/merchant'
import {
  billingTenant,
  customer,
  merchant,
  merchantAccount,
  merchantAccountManagerAssignment,
  merchantActivity,
  userStaff,
} from '@workspace/db/schema'
import { payoutAccountReviewDataAccess } from '@/lib/server/dataaccess/merchant/merchant-payout-account-review'
import { and, count, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm'

function newId() {
  return crypto.randomUUID()
}

async function resolveStaff(user: {
  id: string
  email?: string | null
  name?: string | null
}) {
  const staffId = await staffDataAccess.resolveStaffIdForAuthUser(user)
  if (!staffId) throw new Error('当前账号未关联员工信息')
  const staff = await db.query.userStaff.findFirst({
    where: eq(userStaff.id, staffId),
    columns: { id: true, displayName: true },
  })
  if (!staff) throw new Error('员工信息不存在')
  return { staffId, displayName: staff.displayName }
}

async function appendSystemActivity(input: {
  merchantId: string
  type: MerchantActivity['type']
  title: string
  description?: string
  authorName: string
  refDomain?: string
  refId?: string
}) {
  await db.insert(merchantActivity).values({
    id: newId(),
    merchantId: input.merchantId,
    type: input.type,
    title: input.title,
    description: input.description,
    authorName: input.authorName,
    authorRole: input.authorName === '系统' ? 'system' : 'staff',
    refDomain: input.refDomain,
    refId: input.refId,
    occurredAt: new Date(),
    createdAt: new Date(),
  })
}

export type MerchantUpdateInput = {
  name: string
  companyFullName: string
  unifiedSocialCreditCode: string
  merchantMark?: string
  accessMode: Merchant['accessMode']
  /** 能力开关（D3-4=B）：省略 = 不修改；`access_mode` 由三者派生后写入 */
  oemEnabled?: boolean
  promoEnabled?: boolean
  iframeEnabled?: boolean
  type: Merchant['type']
  status: Merchant['status']
  remark?: string
  adminUrl?: string
  consoleUrl?: string
  website?: string
  /** 资金模式：prepay=商户预付 / commission=平台付现佣金（DEC-F1/F9） */
  fundingMode?: Merchant['fundingMode']
  /**
   * 商户级充值准入阈值覆盖（DEC-F4/F7）。
   * 缺省 = 不修改；显式 null = 改回「继承全局」。两者语义不同，不可合并。
   */
  rechargeBlockThreshold?: number | null
}

export const merchantDataAccess = {
  async list(
    scope: MerchantDataScope,
    params?: { search?: string; accountManagerStaffId?: string },
  ): Promise<MerchantListRow[]> {
    const visibleMerchantIds = await loadVisibleMerchantIds(scope)
    const q = params?.search?.trim()
    const amStaffId = params?.accountManagerStaffId?.trim()

    let amFilteredMerchantIds: string[] | null = null
    if (amStaffId) {
      const amRows = await db
        .select({ merchantId: merchantAccountManagerAssignment.merchantId })
        .from(merchantAccountManagerAssignment)
        .where(
          and(
            eq(merchantAccountManagerAssignment.userStaffId, amStaffId),
            eq(merchantAccountManagerAssignment.roleType, 'account_manager'),
            isNull(merchantAccountManagerAssignment.effectiveTo),
          ),
        )
      amFilteredMerchantIds = amRows.map((r) => r.merchantId)
    }

    let effectiveIds = visibleMerchantIds
    if (amFilteredMerchantIds !== null) {
      if (effectiveIds === null) {
        effectiveIds = amFilteredMerchantIds
      } else {
        effectiveIds = effectiveIds.filter((id) => amFilteredMerchantIds!.includes(id))
      }
    }

    const rows = await db
      .select()
      .from(merchant)
      .where(
        and(
          buildMerchantTableIdFilter(effectiveIds),
          q
            ? or(
                ilike(merchant.name, `%${q}%`),
                ilike(merchant.code, `%${q}%`),
                ilike(merchant.companyFullName, `%${q}%`),
                ilike(merchant.unifiedSocialCreditCode, `%${q}%`),
                sql`CAST(${merchant.platformMerchantId} AS TEXT) LIKE ${`%${q}%`}`,
              )
            : undefined,
        ),
      )
      .orderBy(desc(merchant.updatedAt))

    const merchantIds = rows.map((r) => r.id)
    const amMap = new Map<string, { staffId: string; staffName: string }>()
    if (merchantIds.length > 0) {
      const amRows = await db
        .select({
          merchantId: merchantAccountManagerAssignment.merchantId,
          staffId: merchantAccountManagerAssignment.userStaffId,
          staffName: userStaff.displayName,
        })
        .from(merchantAccountManagerAssignment)
        .innerJoin(userStaff, eq(merchantAccountManagerAssignment.userStaffId, userStaff.id))
        .where(
          and(
            inArray(merchantAccountManagerAssignment.merchantId, merchantIds),
            eq(merchantAccountManagerAssignment.roleType, 'account_manager'),
            isNull(merchantAccountManagerAssignment.effectiveTo),
          ),
        )
      for (const row of amRows) {
        amMap.set(row.merchantId, { staffId: row.staffId, staffName: row.staffName })
      }
    }

    const result: MerchantListRow[] = []
    for (const row of rows) {
      const [tenantStat] = await db
        .select({ count: count() })
        .from(billingTenant)
        .where(eq(billingTenant.merchantId, row.id))
      const openRegionCount = await merchantRegionDataAccess.countOpenRegionsByMerchantId(row.id)
      const monthConsumption = await merchantConsumptionDataAccess.getMonthConsumption(row.id)
      const am = amMap.get(row.id)
      result.push(
        mapMerchantListRow(row, {
          tenantCount: tenantStat?.count ?? 0,
          openRegionCount,
          monthConsumption,
          accountManagerStaffId: am?.staffId ?? null,
          accountManagerName: am?.staffName ?? null,
        }),
      )
    }
    return result
  },

  async getById(scope: MerchantDataScope, id: string): Promise<Merchant | null> {
    return filterMerchantGetById(scope, id, async () => {
      const row = await db.query.merchant.findFirst({ where: eq(merchant.id, id) })
      return row ? mapMerchantRow(row) : null
    })
  },

  async getAccountManager(merchantId: string) {
    return merchantAccountManagerDataAccess.getCurrent(merchantId)
  },

  /**
   * 商户资金相关设置（DEC-F4/F9）—— 编辑弹窗用。
   *
   * 阈值存在 merchant_account（1:1）而非 merchant 主表，所以单独查；
   * 收款账户只回「有没有生效默认户」这个布尔值，不泄露账号。
   */
  async getFundingSettings(merchantId: string): Promise<{
    rechargeBlockThreshold: number | null
    hasActiveDefaultPayoutAccount: boolean
  }> {
    const [acct] = await db
      .select({ v: merchantAccount.rechargeBlockThreshold })
      .from(merchantAccount)
      .where(eq(merchantAccount.merchantId, merchantId))
      .limit(1)
    return {
      rechargeBlockThreshold: acct?.v === null || acct?.v === undefined ? null : Number(acct.v),
      hasActiveDefaultPayoutAccount:
        await payoutAccountReviewDataAccess.hasActiveDefault('merchant', merchantId),
    }
  },

  async update(
    id: string,
    input: MerchantUpdateInput,
    user: { id: string; email?: string | null; name?: string | null },
  ): Promise<Merchant> {
    const existing = await db.query.merchant.findFirst({ where: eq(merchant.id, id) })
    if (!existing) throw new Error('商户不存在')

    const author = await resolveStaff(user)
    const now = new Date()

    const nextFundingMode = input.fundingMode ?? existing.fundingMode

    // D3-2=A/D3-1：三个能力 flag 是可编辑对象，access_mode 是它们的派生快照
    const nextFlags = {
      oemEnabled: input.oemEnabled ?? existing.oemEnabled,
      promoEnabled: input.promoEnabled ?? existing.promoEnabled,
      iframeEnabled: input.iframeEnabled ?? existing.iframeEnabled,
    }
    const nextAccessMode = deriveAccessMode(nextFlags)

    // 切到佣金模式前必须已有生效的默认收款账户（DEC-F9）。
    // 佣金模式下平台要向该商户打现金，没有收款账户等于「收了钱不知道付给谁」，
    // 所以这是硬校验而非 UI 提示——UI 会被绕过，DB 不会。
    if (nextFundingMode === 'commission' && existing.fundingMode !== 'commission') {
      const has = await payoutAccountReviewDataAccess.hasActiveDefault('merchant', id)
      if (!has) {
        throw new Error(
          '切换到佣金模式前，该商户必须有一个已审核生效的默认收款账户（请先在「收款账户审核」中处理）',
        )
      }
    }

    await db
      .update(merchant)
      .set({
        name: input.name,
        companyFullName: input.companyFullName,
        unifiedSocialCreditCode: input.unifiedSocialCreditCode.toUpperCase(),
        merchantMark: input.merchantMark ?? null,
        accessMode: nextAccessMode,
        oemEnabled: nextFlags.oemEnabled,
        promoEnabled: nextFlags.promoEnabled,
        iframeEnabled: nextFlags.iframeEnabled,
        type: input.type,
        status: input.status,
        remark: input.remark ?? null,
        adminUrl: input.adminUrl ?? null,
        consoleUrl: input.consoleUrl ?? null,
        website: input.website ?? null,
        fundingMode: nextFundingMode,
        updatedAt: now,
      })
      .where(eq(merchant.id, id))

    // 商户级阈值覆盖写在 merchant_account 上（与 billing 准入闸门同源），
    // 独立于 merchant 主表更新，且需要单独留痕：它直接决定该商户能否继续接单。
    let thresholdNote: string | null = null
    if (input.rechargeBlockThreshold !== undefined) {
      const [acct] = await db
        .select({ v: merchantAccount.rechargeBlockThreshold })
        .from(merchantAccount)
        .where(eq(merchantAccount.merchantId, id))
        .limit(1)
      if (!acct) throw new Error('商户账户不存在，无法设置充值准入阈值')

      const oldValue = acct.v
      const newValue =
        input.rechargeBlockThreshold === null ? null : String(input.rechargeBlockThreshold)
      // 比较按数值而非字符串，避免 '0' 与 '0.0000' 被误判为变更
      const same =
        (oldValue === null || newValue === null) && oldValue === newValue
          ? true
          : oldValue !== null && newValue !== null && Number(oldValue) === Number(newValue)
      if (!same) {
        await db
          .update(merchantAccount)
          .set({ rechargeBlockThreshold: newValue, updatedAt: now })
          .where(eq(merchantAccount.merchantId, id))
        thresholdNote =
          newValue === null
            ? '充值准入阈值：改回继承全局'
            : `充值准入阈值：${Number(oldValue ?? 0)} → ${Number(newValue)}`
      }
    }

    const changed: string[] = []
    if (existing.name !== input.name) changed.push('展示简称')
    if (existing.oemEnabled !== nextFlags.oemEnabled) {
      changed.push(nextFlags.oemEnabled ? '接入模式：开启 OEM' : '接入模式：关闭 OEM')
    }
    if (existing.promoEnabled !== nextFlags.promoEnabled) {
      changed.push(nextFlags.promoEnabled ? '接入模式：开启推广' : '接入模式：关闭推广')
    }
    if (existing.iframeEnabled !== nextFlags.iframeEnabled) {
      changed.push(nextFlags.iframeEnabled ? '接入模式：开启 iFrame' : '接入模式：关闭 iFrame')
    }
    if (existing.status !== input.status) changed.push('状态')
    if (input.fundingMode !== undefined && existing.fundingMode !== input.fundingMode) {
      changed.push(
        input.fundingMode === 'commission' ? '资金模式：改为佣金（推广链接）' : '资金模式：改为预付（OEM/iFrame）',
      )
    }
    if (thresholdNote) changed.push(thresholdNote)

    await appendSystemActivity({
      merchantId: id,
      type: 'info_updated',
      title: '更新商户基本信息',
      description: changed.length ? `变更字段：${changed.join('、')}` : '更新商户资料',
      authorName: author.displayName,
    })

    const updated = await db.query.merchant.findFirst({ where: eq(merchant.id, id) })
    if (!updated) throw new Error('更新失败')
    return mapMerchantRow(updated)
  },

  async countTenantsByMerchantId(merchantId: string): Promise<number> {
    const [row] = await db
      .select({ count: count() })
      .from(billingTenant)
      .where(eq(billingTenant.merchantId, merchantId))
    return row?.count ?? 0
  },

  async getQuickStats(merchantId: string) {
    const [tenantCount, regionStats, pricingCount] = await Promise.all([
      this.countTenantsByMerchantId(merchantId),
      merchantRegionDataAccess.countRegionsByMerchantId(merchantId),
      merchantPricingDataAccess.countByMerchantId(merchantId),
    ])
    return {
      tenantCount,
      openRegionCount: regionStats.openCount,
      regionCount: regionStats.totalCount,
      pricingCount,
    }
  },

  async listTenantsByMerchantId(
    merchantId: string,
    params?: { page?: number; pageSize?: number; platformTenantId?: string; search?: string },
  ) {
    const page = Math.max(1, params?.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, params?.pageSize ?? 20))
    const offset = (page - 1) * pageSize
    const platformTenantId = params?.platformTenantId?.trim()
    const search = params?.search?.trim()

    const whereClause = and(
      eq(billingTenant.merchantId, merchantId),
      platformTenantId
        ? ilike(billingTenant.platformTenantId, `%${platformTenantId}%`)
        : undefined,
      // `search` 是给「选租户」这类下拉用的模糊定位：租户名、平台租户号、客户名任一命中即可。
      // 与 `platformTenantId` 分开是因为后者是精确字段过滤，语义不能被悄悄放宽。
      search
        ? or(
            ilike(billingTenant.name, `%${search}%`),
            ilike(billingTenant.platformTenantId, `%${search}%`),
            ilike(customer.name, `%${search}%`),
          )
        : undefined,
    )

    const [totalRow] = await db
      .select({ total: count() })
      .from(billingTenant)
      .where(whereClause)

    const rows = await db
      .select({
        tenantId: billingTenant.id,
        merchantId: billingTenant.merchantId,
        tenantName: billingTenant.name,
        platformTenantId: billingTenant.platformTenantId,
        customerId: billingTenant.customerId,
        customerName: customer.name,
        tenantStatus: billingTenant.status,
        createdAt: billingTenant.createdAt,
      })
      .from(billingTenant)
      .leftJoin(customer, eq(billingTenant.customerId, customer.id))
      .where(whereClause)
      .orderBy(desc(billingTenant.createdAt))
      .limit(pageSize)
      .offset(offset)

    return {
      items: rows.map((row) => ({
        id: row.tenantId,
        tenantId: row.tenantId,
        merchantId: row.merchantId,
        isPrimary: true,
        bindingRole: 'platform_primary' as const,
        effectiveFrom: row.createdAt
          ? row.createdAt.toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10),
        effectiveTo: null as string | null,
        remark: undefined as string | undefined,
        tenantName: row.tenantName ?? row.tenantId,
        platformTenantId: row.platformTenantId ?? '—',
        customerId: row.customerId ?? '—',
        customerName: row.customerName ?? '—',
        tenantStatus: (row.tenantStatus ?? 'active') as 'active' | 'inactive' | 'suspended',
      })),
      total: totalRow?.total ?? 0,
      page,
      pageSize,
    }
  },

  /**
   * 租户是否属于该商户 —— 单行判定，不受分页影响。
   *
   * 归属校验绝不能写成「取前 100 个租户再 some()」：商户名下租户超过 100 个时，
   * 排在第 101 位之后的租户会被误判成「不属于该商户」，正常的发券被直接拒掉。
   * 这是校验，不是列表，必须精确命中那一行。
   */
  async tenantBelongsToMerchant(merchantId: string, tenantId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: billingTenant.id })
      .from(billingTenant)
      .where(and(eq(billingTenant.merchantId, merchantId), eq(billingTenant.id, tenantId)))
      .limit(1)
    return Boolean(row)
  },
}
