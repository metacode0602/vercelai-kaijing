/**
 * Retire batch review/approval dataaccess
 * Approves or rejects supplier device retire batches
 */

import { db } from '@/lib/db'
import { onboardingBatch } from '@workspace/db/schema'
import { eq } from 'drizzle-orm'

// Portal-created batches use 'pending_review', legacy CRM batches use '待开始' or 'pending'
const APPROVABLE_STATUSES = ['pending_review', 'pending', '待开始']

/**
 * Approve a retire batch
 */
export async function approveRetireBatch(
  batchId: string,
  operatorStaffId?: string
): Promise<void> {
  const [batch] = await db
    .select({
      id: onboardingBatch.id,
      batchKind: onboardingBatch.batchKind,
      batchStatus: onboardingBatch.batchStatus,
      supplierId: onboardingBatch.supplierId,
      batchCode: onboardingBatch.batchCode,
      plannedDeviceCount: onboardingBatch.plannedDeviceCount,
    })
    .from(onboardingBatch)
    .where(eq(onboardingBatch.id, batchId))
    .limit(1)

  if (!batch) {
    throw new Error('批次不存在')
  }

  if (batch.batchKind !== 'device_retire') {
    throw new Error('该批次不是下架批次')
  }

  if (!APPROVABLE_STATUSES.includes(batch.batchStatus)) {
    throw new Error(`批次状态为 ${batch.batchStatus}，不可审批`)
  }

  await db
    .update(onboardingBatch)
    .set({
      batchStatus: 'approved',
      updatedAt: new Date(),
    })
    .where(eq(onboardingBatch.id, batchId))

  // Notify supplier via portal site message
  try {
    const { notifySupplierRetireResult } = await import(
      '@workspace/shared-supplier/notifications'
    )
    await notifySupplierRetireResult(
      db,
      batch.supplierId,
      batch.batchCode,
      batch.plannedDeviceCount,
      'approved'
    )
  } catch (error) {
    console.error('[approveRetireBatch] Failed to send notification:', error)
  }
}

/**
 * Reject a retire batch
 */
export async function rejectRetireBatch(
  batchId: string,
  reason: string,
  operatorStaffId?: string
): Promise<void> {
  if (!reason?.trim()) {
    throw new Error('驳回原因不能为空')
  }

  const [batch] = await db
    .select({
      id: onboardingBatch.id,
      batchKind: onboardingBatch.batchKind,
      batchStatus: onboardingBatch.batchStatus,
      supplierId: onboardingBatch.supplierId,
      batchCode: onboardingBatch.batchCode,
      plannedDeviceCount: onboardingBatch.plannedDeviceCount,
    })
    .from(onboardingBatch)
    .where(eq(onboardingBatch.id, batchId))
    .limit(1)

  if (!batch) {
    throw new Error('批次不存在')
  }

  if (batch.batchKind !== 'device_retire') {
    throw new Error('该批次不是下架批次')
  }

  if (!APPROVABLE_STATUSES.includes(batch.batchStatus)) {
    throw new Error(`批次状态为 ${batch.batchStatus}，不可审批`)
  }

  await db
    .update(onboardingBatch)
    .set({
      batchStatus: 'rejected',
      remark: reason,
      updatedAt: new Date(),
    })
    .where(eq(onboardingBatch.id, batchId))

  // Notify supplier via portal site message
  try {
    const { notifySupplierRetireResult } = await import(
      '@workspace/shared-supplier/notifications'
    )
    await notifySupplierRetireResult(
      db,
      batch.supplierId,
      batch.batchCode,
      batch.plannedDeviceCount,
      'rejected',
      reason
    )
  } catch (error) {
    console.error('[rejectRetireBatch] Failed to send notification:', error)
  }
}
