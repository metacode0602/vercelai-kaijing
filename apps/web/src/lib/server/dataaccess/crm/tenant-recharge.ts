import { db } from '@/lib/db'
import { crmLog } from '@/lib/server/dataaccess/crm/logger'
import { recharge } from '@workspace/db/schema'
import { billingTenant } from '@workspace/db/schema'
import { creditBalance } from '@workspace/billing'
import { eq } from 'drizzle-orm'

function newId() {
  return crypto.randomUUID()
}

function toNumber(val: string | number | null | undefined): number {
  if (val == null) return 0
  const n = typeof val === 'number' ? val : Number(val)
  return Number.isFinite(n) ? n : 0
}

export type CreateOfflineRechargeInput = {
  tenantId: string
  amount: number
  paymentMethod: string
  remark?: string
  operatorId: string
}

export type OfflineRechargeResult = {
  id: string
  amount: number
  paymentMethod: string
  status: string
  remark: string | null
  createdAt: string
  completedAt: string | null
}

export const tenantRechargeDataAccess = {
  async create(input: CreateOfflineRechargeInput): Promise<OfflineRechargeResult> {
    if (input.amount <= 0) {
      throw new Error('充值金额必须大于 0')
    }

    return db.transaction(async (tx) => {
      const tenantRow = await tx
        .select({
          organizationId: billingTenant.platformTenantId,
          merchantId: billingTenant.merchantId,
        })
        .from(billingTenant)
        .where(eq(billingTenant.id, input.tenantId))
        .limit(1)

      if (!tenantRow[0]) {
        throw new Error('租户不存在')
      }

      const { organizationId, merchantId } = tenantRow[0]
      if (!organizationId) {
        throw new Error('租户未绑定平台组织，无法充值')
      }
      const id = newId()
      const now = new Date()

      await tx.insert(recharge).values({
        id,
        tenantId: input.tenantId,
        merchantId,
        amount: String(input.amount),
        paymentMethod: input.paymentMethod,
        status: 'paid',
        source: 'manual',
        remark: input.remark ?? null,
        completedAt: now,
        createdAt: now,
      })

      const { balance } = await creditBalance(tx, {
        tenantId: input.tenantId,
        organizationId,
        amount: input.amount,
        txType: 'recharge',
        refType: 'recharge',
        refId: id,
        description: input.remark
          ? `线下充值 ¥${input.amount.toFixed(2)} - ${input.remark}`
          : `线下充值 ¥${input.amount.toFixed(2)}`,
        createdBy: input.operatorId,
      })

      crmLog('tenant-recharge', 'manual recharge created', {
        tenantId: input.tenantId,
        amount: input.amount,
        rechargeId: id,
        balanceAfter: toNumber(balance.availableBalance),
      })

      return {
        id,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        status: 'paid',
        remark: input.remark ?? null,
        createdAt: now.toISOString(),
        completedAt: now.toISOString(),
      }
    })
  },
}
