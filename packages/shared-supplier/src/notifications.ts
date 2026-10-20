/**
 * Shared supplier notification functions
 * 
 * Used by apps/web to notify suppliers about onboarding/retire decisions.
 * Actual implementation delegates to apps/supplier site message service.
 */

import { supplier, supplierSiteMessage } from '@workspace/db/schema'
import { schema } from '@workspace/db'
import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { createId } from '@paralleldrive/cuid2'

export type SharedSupplierDb = NodePgDatabase<typeof schema>

/**
 * Notify supplier about onboarding approval/rejection
 * Called from apps/web supplier CRM onboarding audit flow
 */
export async function notifySupplierOnboardingResult(
  db: SharedSupplierDb,
  supplierId: string,
  result: 'approved' | 'rejected',
  reason?: string,
): Promise<void> {
  const [supplierRow] = await db
    .select({ organizationId: supplier.organizationId })
    .from(supplier)
    .where(eq(supplier.id, supplierId))
    .limit(1)

  if (!supplierRow?.organizationId) {
    console.warn(
      `[notifySupplierOnboardingResult] Supplier ${supplierId} has no organizationId, skipping`,
    )
    return
  }

  const title = result === 'approved' ? '供应商入驻审核通过' : '供应商入驻审核未通过'
  const content =
    result === 'approved'
      ? '恭喜！您的供应商入驻申请已通过审核，现在可以开始上架设备了。'
      : `您的供应商入驻申请未通过审核。${reason ? `原因：${reason}` : ''}`

  await db.insert(supplierSiteMessage).values({
    id: createId(),
    supplierOrgId: supplierRow.organizationId,
    title,
    summary: content.slice(0, 200),
    content,
    category: '供应商',
    links: [{ label: '进入供应商门户', href: '/console' }],
    read: false,
  })
}

/**
 * Notify supplier about device retire batch approval/rejection
 * Called from apps/web supplier CRM retire batch audit flow
 */
export async function notifySupplierRetireResult(
  db: SharedSupplierDb,
  supplierId: string,
  batchCode: string,
  deviceCount: number,
  result: 'approved' | 'rejected',
  reason?: string,
): Promise<void> {
  const [supplierRow] = await db
    .select({ organizationId: supplier.organizationId })
    .from(supplier)
    .where(eq(supplier.id, supplierId))
    .limit(1)

  if (!supplierRow?.organizationId) {
    console.warn(
      `[notifySupplierRetireResult] Supplier ${supplierId} has no organizationId, skipping`,
    )
    return
  }

  const title =
    result === 'approved' ? `下架申请 ${batchCode} 已批准` : `下架申请 ${batchCode} 已驳回`
  const content =
    result === 'approved'
      ? `您提交的 ${deviceCount} 台设备的下架申请已批准，系统将在计划时间执行下架流程。`
      : `您提交的 ${deviceCount} 台设备的下架申请已驳回。${reason ? `原因：${reason}` : ''}`

  await db.insert(supplierSiteMessage).values({
    id: createId(),
    supplierOrgId: supplierRow.organizationId,
    title,
    summary: content.slice(0, 200),
    content,
    category: '设备',
    links: [{ label: '查看下架管理', href: '/console/devices/retire' }],
    read: false,
  })
}
/**
 * Notify supplier that a monthly settlement bill is ready for confirmation.
 * Called from apps/web supplier billing generation cron.
 */
export async function notifyBillGenerated(
  db: SharedSupplierDb,
  supplierId: string,
  billMonth: string,
  amount: string,
): Promise<void> {
  const supplierOrgId = await resolveSupplierOrgId(db, supplierId, 'notifyBillGenerated')
  if (!supplierOrgId) return

  const content = `您好，

> ${billMonth} 结算账单已生成，总金额 **¥${amount}**。

请在收到本消息后 **3 个工作日内** 完成确认。如有疑问，请联系运营经理或在系统中查看明细。`

  await db.insert(supplierSiteMessage).values({
    id: createId(),
    supplierOrgId,
    title: '账单待确认提醒',
    summary: `${billMonth} 结算账单已生成，请在 3 个工作日内完成确认`,
    content,
    category: '财务',
    links: [{ label: '查看账单明细', href: '/console/billing' }],
    read: false,
  })
}

/**
 * Notify supplier that finance marked their confirmed bill as settled (paid).
 * Called from apps/web supplier settlement flow (markBillPaid).
 */
export async function notifyBillPaid(
  db: SharedSupplierDb,
  supplierId: string,
  billMonth: string,
  amount: string,
  paidAt: Date,
  paymentReference: string | null,
): Promise<void> {
  const supplierOrgId = await resolveSupplierOrgId(db, supplierId, 'notifyBillPaid')
  if (!supplierOrgId) return

  const referenceLine = paymentReference
    ? `付款流水号：**${paymentReference}**\n\n`
    : ''

  const content = `您好，

> ${billMonth} 结算账单（**¥${amount}**）已完成付款。

${referenceLine}到账时间：**${formatCnDateTime(paidAt)}**

如对金额有疑问，请联系运营经理。`

  await db.insert(supplierSiteMessage).values({
    id: createId(),
    supplierOrgId,
    title: '账单付款通知',
    summary: `${billMonth} 结算账单 ¥${amount} 已完成付款`,
    content,
    category: '财务',
    links: [{ label: '查看账单明细', href: '/console/billing' }],
    read: false,
  })
}

/**
 * Resolve supplier id → organizationId, warning instead of throwing so a missing
 * org mapping never rolls back a financial transaction that already succeeded.
 */
async function resolveSupplierOrgId(
  db: SharedSupplierDb,
  supplierId: string,
  caller: string,
): Promise<string | null> {
  const [supplierRow] = await db
    .select({ organizationId: supplier.organizationId })
    .from(supplier)
    .where(eq(supplier.id, supplierId))
    .limit(1)

  if (!supplierRow?.organizationId) {
    console.warn(`[${caller}] Supplier ${supplierId} has no organizationId, skipping`)
    return null
  }
  return supplierRow.organizationId
}

function formatCnDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`
  )
}
