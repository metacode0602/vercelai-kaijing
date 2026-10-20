/**
 * Bare metal order commercial service.
 *
 * Handles:
 * - Auto-renewal cron (scan near-expiry orders → deduct balance → extend period)
 * - Overdue handling (3 retries → overdue → stop)
 * - Coupon validation and deduction
 * - Device allocation from supplier_device pool
 * - Order stop/cancel
 * - Pre-expiry notifications
 *
 * Design: bare-metal-order-commercialization.md §3-5, §9
 */

import { and, eq, sql, lte, gte } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  bareMetalOrder,
  bareMetalOrderDevice,
  bareMetalOrderPriceSnapshot,
  bareMetalOrderLog,
  gpuCoupon,
  gpuCouponTemplate,
  supplierDevice,
} from "@workspace/db"
import {
  debitBalance,
  getOrCreateTenantBalance,
} from "@workspace/billing"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_OVERDUE_RETRIES = 3

/** Billing unit → renewal window (how far ahead to scan for renewal) */
const RENEWAL_SCAN_WINDOW: Record<string, string> = {
  hour: "5 minutes",
  day: "1 hour",
  week: "6 hours",
  month: "24 hours",
}

/** Billing unit → pre-expiry reminder window */
const REMINDER_WINDOW: Record<string, string> = {
  hour: "10 minutes",
  day: "6 hours",
  week: "3 days",
  month: "7 days",
}

/** Billing unit → renewal period in hours */
const RENEWAL_HOURS: Record<string, number> = {
  hour: 1,
  day: 24,
  week: 24 * 7,
  month: 24 * 30,
}

// ---------------------------------------------------------------------------
// Auto-renewal cron
// ---------------------------------------------------------------------------

export interface RenewalResult {
  orderId: string
  status: "renewed" | "overdue" | "skipped" | "error"
  message?: string
}

/**
 * Scan orders nearing expiry and attempt automatic renewal.
 * Called by the cron job every hour.
 *
 * Flow per order:
 * 1. Check balance >= renewal amount (from price snapshot)
 * 2. Deduct balance
 * 3. Extend rent_ends_at and next_billing_at
 * 4. Increment renew_count
 * 5. Log the renewal
 *
 * On failure:
 * - Increment overdue_retries
 * - If retries >= 3, mark as overdue
 */
export async function scanAndRenewOrders(): Promise<RenewalResult[]> {
  const results: RenewalResult[] = []

  // Find orders that need renewal: running + auto_renew + next_billing_at within scan window
  const orders = await db
    .select({
      id: bareMetalOrder.id,
      tenantId: bareMetalOrder.tenantId,
      organizationId: bareMetalOrder.organizationId,
      billingUnit: bareMetalOrder.billingUnit,
      rentEndsAt: bareMetalOrder.rentEndsAt,
      nextBillingAt: bareMetalOrder.nextBillingAt,
      renewCount: bareMetalOrder.renewCount,
      overdueRetries: bareMetalOrder.overdueRetries,
      gpuCount: bareMetalOrder.gpuCount,
      status: bareMetalOrder.status,
    })
    .from(bareMetalOrder)
    .where(
      and(
        eq(bareMetalOrder.status, "running"),
        eq(bareMetalOrder.autoRenew, true),
        lte(bareMetalOrder.nextBillingAt, new Date()),
        gte(bareMetalOrder.nextBillingAt, sql`NOW() - INTERVAL '5 minutes'`),
      ),
    )

  for (const order of orders) {
    try {
      const result = await renewSingleOrder(order)
      results.push(result)
    } catch (err) {
      console.error(`[metal-renewal] Error renewing order ${order.id}:`, err)
      results.push({
        orderId: order.id,
        status: "error",
        message: err instanceof Error ? err.message : "Unknown error",
      })
    }
  }

  return results
}

async function renewSingleOrder(order: {
  id: string
  tenantId: string
  organizationId: string | null
  billingUnit: string
  rentEndsAt: Date | null
  nextBillingAt: Date | null
  renewCount: number | null
  overdueRetries: number | null
  gpuCount: number | null
  status: string
}): Promise<RenewalResult> {
  // 1. Get price snapshot for renewal amount
  const [snapshot] = await db
    .select()
    .from(bareMetalOrderPriceSnapshot)
    .where(eq(bareMetalOrderPriceSnapshot.bareMetalOrderId, order.id))
    .limit(1)

  if (!snapshot) {
    return {
      orderId: order.id,
      status: "error",
      message: "No price snapshot found",
    }
  }

  const renewalHours = RENEWAL_HOURS[order.billingUnit] ?? 24
  const unitPrice = Number(snapshot.unitPricePerCardHour)
  const gpuCount = order.gpuCount ?? Number(snapshot.gpuCount)
  const renewalAmount = unitPrice * gpuCount * renewalHours

  // 2. Check and deduct balance
  const orgId = order.organizationId ?? ""
  const balance = await getOrCreateTenantBalance(db, order.tenantId, orgId)
  const availableBalance = Number(balance.availableBalance)

  if (availableBalance < renewalAmount) {
    // Insufficient balance — increment overdue retries
    const newRetries = (order.overdueRetries ?? 0) + 1

    if (newRetries >= MAX_OVERDUE_RETRIES) {
      // Mark as overdue
      await db.transaction(async (tx) => {
        await tx
          .update(bareMetalOrder)
          .set({
            status: "overdue",
            overdueRetries: newRetries,
            overdueAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(bareMetalOrder.id, order.id))

        await tx.insert(bareMetalOrderLog).values({
          id: crypto.randomUUID(),
          bareMetalOrderId: order.id,
          eventType: "status_changed",
          previousStatus: order.status,
          newStatus: "overdue",
          description: `续费失败 ${newRetries} 次，标记为逾期`,
          detail: {
            renewalAmount,
            availableBalance,
            retries: newRetries,
          },
          operatorId: "system",
          operatorSource: "cron",
          occurredAt: new Date(),
        })
      })

      return {
        orderId: order.id,
        status: "overdue",
        message: `余额不足，已逾期 (重试 ${newRetries}/${MAX_OVERDUE_RETRIES})`,
      }
    }

    // Not yet overdue — just increment retries
    await db
      .update(bareMetalOrder)
      .set({
        overdueRetries: newRetries,
        updatedAt: new Date(),
      })
      .where(eq(bareMetalOrder.id, order.id))

    return {
      orderId: order.id,
      status: "skipped",
      message: `余额不足 (重试 ${newRetries}/${MAX_OVERDUE_RETRIES})`,
    }
  }

  // 3. Deduct balance and extend period
  const currentEnd = order.rentEndsAt ?? new Date()
  const newExpiry = new Date(currentEnd.getTime() + renewalHours * 3600 * 1000)

  await db.transaction(async (tx) => {
    // 3a. Debit balance
    await debitBalance(tx, {
      tenantId: order.tenantId,
      organizationId: orgId,
      amount: renewalAmount,
      txType: "auto_deduction",
      refType: "bare_metal_order",
      refId: order.id,
      description: `裸金属自动续费 (${order.billingUnit})`,
    })

    // 3b. Update order
    await tx
      .update(bareMetalOrder)
      .set({
        rentEndsAt: newExpiry,
        nextBillingAt: newExpiry,
        renewCount: (order.renewCount ?? 0) + 1,
        overdueRetries: 0, // Reset on successful renewal
        status: "running", // In case it was in a retry state
        updatedAt: new Date(),
      })
      .where(eq(bareMetalOrder.id, order.id))

    // 3c. Log renewal
    await tx.insert(bareMetalOrderLog).values({
      id: crypto.randomUUID(),
      bareMetalOrderId: order.id,
      eventType: "auto_renewed",
      previousStatus: "running",
      newStatus: "running",
      description: `自动续费成功，新到期时间 ${newExpiry.toISOString()}`,
      detail: {
        renewalAmount,
        previousExpiry: currentEnd.toISOString(),
        newExpiry: newExpiry.toISOString(),
        billingUnit: order.billingUnit,
      },
      operatorId: "system",
      operatorSource: "cron",
      occurredAt: new Date(),
    })
  })

  return {
    orderId: order.id,
    status: "renewed",
    message: `续费成功 ¥${renewalAmount.toFixed(2)}，新到期 ${newExpiry.toISOString()}`,
  }
}

// ---------------------------------------------------------------------------
// Overdue processing (called by cron after renewal scan)
// ---------------------------------------------------------------------------

/**
 * Process overdue orders: stop devices, release resources.
 * Called after the renewal scan completes.
 */
export async function processOverdueOrders(): Promise<
  { orderId: string; action: string }[]
> {
  const actions: { orderId: string; action: string }[] = []

  // Find orders that just became overdue (overdue_at within last 5 minutes)
  const overdueOrders = await db
    .select({
      id: bareMetalOrder.id,
      tenantId: bareMetalOrder.tenantId,
      organizationId: bareMetalOrder.organizationId,
      overdueAt: bareMetalOrder.overdueAt,
      status: bareMetalOrder.status,
    })
    .from(bareMetalOrder)
    .where(
      and(
        eq(bareMetalOrder.status, "overdue"),
        gte(bareMetalOrder.overdueAt, sql`NOW() - INTERVAL '5 minutes'`),
      ),
    )

  for (const order of overdueOrders) {
    try {
      // Log the overdue event
      await db.insert(bareMetalOrderLog).values({
        id: crypto.randomUUID(),
        bareMetalOrderId: order.id,
        eventType: "status_changed",
        previousStatus: "running",
        newStatus: "overdue",
        description: "订单逾期，设备即将停机",
        detail: { overdueAt: order.overdueAt?.toISOString() },
        operatorId: "system",
        operatorSource: "cron",
        occurredAt: new Date(),
      })

      // TODO: Send notification to tenant (§12.4 user notification system)
      // TODO: Trigger device stop via Agent (§12.3 Agent commands)

      actions.push({ orderId: order.id, action: "overdue_notified" })
    } catch (err) {
      console.error(`[metal-overdue] Error processing order ${order.id}:`, err)
    }
  }

  return actions
}

// ---------------------------------------------------------------------------
// Pre-expiry reminders
// ---------------------------------------------------------------------------

export interface ReminderResult {
  orderId: string
  tenantId: string
  reminderType: "pre_expiry" | "urgent"
  message: string
}

/**
 * Scan orders approaching expiry and generate reminder notifications.
 * Called by cron to send pre-expiry warnings.
 */
export async function scanForReminders(): Promise<ReminderResult[]> {
  const reminders: ReminderResult[] = []

  // Find running auto-renew orders where next_billing_at is within reminder window
  // but NOT yet within renewal scan window (to avoid double-processing)
  const orders = await db
    .select({
      id: bareMetalOrder.id,
      tenantId: bareMetalOrder.tenantId,
      billingUnit: bareMetalOrder.billingUnit,
      rentEndsAt: bareMetalOrder.rentEndsAt,
      nextBillingAt: bareMetalOrder.nextBillingAt,
      orderAmount: bareMetalOrder.orderAmount,
      gpuCount: bareMetalOrder.gpuCount,
    })
    .from(bareMetalOrder)
    .where(
      and(
        eq(bareMetalOrder.status, "running"),
        eq(bareMetalOrder.autoRenew, true),
        // next_billing_at is between now and reminder window
        lte(bareMetalOrder.nextBillingAt, sql`NOW() + INTERVAL '7 days'`),
        gte(bareMetalOrder.nextBillingAt, sql`NOW() + INTERVAL '5 minutes'`),
      ),
    )

  for (const order of orders) {
    const reminderWindow = REMINDER_WINDOW[order.billingUnit] ?? "24 hours"

    // Check if we should send a reminder (within the specific window for this billing unit)
    const [shouldRemind] = await db
      .select({ shouldRemind: sql<boolean>`
        ${order.nextBillingAt} <= NOW() + INTERVAL '${sql.raw(`'${reminderWindow}'`)}'
      ` })
      .from(bareMetalOrder)
      .where(eq(bareMetalOrder.id, order.id))
      .limit(1)

    if (shouldRemind?.shouldRemind) {
      const renewAmount = Number(order.orderAmount ?? 0)
      reminders.push({
        orderId: order.id,
        tenantId: order.tenantId,
        reminderType: "pre_expiry",
        message: `您的设备将于 ${order.rentEndsAt?.toISOString()} 到期，自动续费 ¥${renewAmount.toFixed(2)}`,
      })
    }
  }

  return reminders
}

// ---------------------------------------------------------------------------
// Coupon validation
// ---------------------------------------------------------------------------

export interface CouponValidationResult {
  valid: boolean
  couponId: string | null
  deduction: number
  error?: string
}

/**
 * Deduct the coupon's remaining value and update status.
 *
 * NOTE: gpuCouponUsage has NOT NULL FK to taskInstances (serverless flow).
 * TODO: Either make taskInstanceId nullable + add refType/refId, or create
 * a separate bare_metal_coupon_usage table. For now, we only validate and
 * deduct from gpuCoupon.remainingValue without creating a usage record.
 */
export async function consumeCoupon(
  tx: any,
  couponId: string,
  deduction: number,
): Promise<void> {
  // Fetch current remaining value
  const [coupon] = await tx
    .select({ remainingValue: gpuCoupon.remainingValue, status: gpuCoupon.status })
    .from(gpuCoupon)
    .where(eq(gpuCoupon.id, couponId))
    .for("update")
    .limit(1)

  if (!coupon) throw new Error("算力券不存在")
  if (coupon.status !== "available") throw new Error("算力券已使用或已失效")

  const remaining = Number(coupon.remainingValue ?? 0)
  if (remaining < deduction) throw new Error("算力券余额不足")

  const newRemaining = remaining - deduction

  await tx
    .update(gpuCoupon)
    .set({
      remainingValue: String(newRemaining),
      status: newRemaining <= 0 ? "used" : "available",
      usedAt: newRemaining <= 0 ? new Date() : undefined,
      updatedAt: new Date(),
    })
    .where(eq(gpuCoupon.id, couponId))
}

/**
 * Validate and calculate coupon deduction for a bare metal order.
 *
 * Rules (from bare-metal-order-commercialization.md §3.1):
 * 1. Coupon must be status='available'
 * 2. Coupon must not be expired
 * 3. remainingValue > 0
 * 4. applicableResources must match the billing unit
 * 5. Deduction = min(remainingValue, orderAmount)
 */
export async function validateCoupon(
  couponId: string,
  orderAmount: number,
  billingUnit: string,
  organizationId: string,
): Promise<CouponValidationResult> {
  // 1. Fetch coupon + template
  const [couponRow] = await db
    .select({
      id: gpuCoupon.id,
      templateId: gpuCoupon.templateId,
      status: gpuCoupon.status,
      remainingValue: gpuCoupon.remainingValue,
      expiredAt: gpuCoupon.expiredAt,
      organizationId: gpuCoupon.organizationId,
      templateType: gpuCouponTemplate.type,
      faceValue: gpuCouponTemplate.faceValue,
      discountPercent: gpuCouponTemplate.discountPercent,
      applicableResources: gpuCouponTemplate.applicableResources,
    })
    .from(gpuCoupon)
    .leftJoin(gpuCouponTemplate, eq(gpuCoupon.templateId, gpuCouponTemplate.id))
    .where(eq(gpuCoupon.id, couponId))
    .limit(1)

  if (!couponRow) {
    return { valid: false, couponId: null, deduction: 0, error: "算力券不存在" }
  }

  // 2. Check status
  if (couponRow.status !== "available") {
    return { valid: false, couponId: null, deduction: 0, error: "算力券已使用或已失效" }
  }

  // 3. Check expiry
  if (couponRow.expiredAt && couponRow.expiredAt < new Date()) {
    return { valid: false, couponId: null, deduction: 0, error: "算力券已过期" }
  }

  // 4. Check ownership (same organization)
  if (couponRow.organizationId && couponRow.organizationId !== organizationId) {
    return { valid: false, couponId: null, deduction: 0, error: "算力券不属于当前组织" }
  }

  // 5. Check remaining value
  const remainingValue = Number(couponRow.remainingValue ?? 0)
  if (remainingValue <= 0) {
    return { valid: false, couponId: null, deduction: 0, error: "算力券余额为零" }
  }

  // 6. Check applicable billing (if applicableResources is set)
  if (couponRow.applicableResources) {
    try {
      const resources = JSON.parse(couponRow.applicableResources) as {
        applicableBilling?: string[]
      }
      if (resources.applicableBilling && resources.applicableBilling.length > 0) {
        // Map billing unit to voucher billing type
        const billingMap: Record<string, string> = {
          hour: "hour",
          day: "daily",
          week: "weekly",
          month: "monthly",
        }
        const voucherBilling = billingMap[billingUnit]
        if (voucherBilling && !resources.applicableBilling.includes(voucherBilling)) {
          return {
            valid: false,
            couponId: null,
            deduction: 0,
            error: `算力券不适用于 ${billingUnit} 计费方式`,
          }
        }
      }
    } catch {
      // Parse error — skip billing check
    }
  }

  // 7. Calculate deduction
  let deduction: number
  const templateType = couponRow.templateType

  if (templateType === "fixed") {
    // Fixed value coupon: deduct min(faceValue, remaining, orderAmount)
    const faceValue = Number(couponRow.faceValue ?? 0)
    deduction = Math.min(faceValue, remainingValue, orderAmount)
  } else if (templateType === "discount") {
    // Discount coupon: deduct orderAmount × (1 - discountPercent/100)
    const discountPercent = Number(couponRow.discountPercent ?? 0)
    deduction = orderAmount * (discountPercent / 100)
    deduction = Math.min(deduction, remainingValue)
  } else if (templateType === "resource_pack") {
    // Resource pack: deduct min(remaining, orderAmount)
    deduction = Math.min(remainingValue, orderAmount)
  } else {
    return { valid: false, couponId: null, deduction: 0, error: `未知券类型: ${templateType}` }
  }

  deduction = Math.round(deduction * 100) / 100 // Round to 2 decimal places

  return {
    valid: true,
    couponId: couponRow.id,
    deduction,
  }
}

// ---------------------------------------------------------------------------
// Device allocation
// ---------------------------------------------------------------------------

/**
 * Auto-allocate a device from the supplier_device pool for a bare metal order.
 *
 * Requirements (from bare-metal-order-commercialization.md §7):
 * - lifecycle_status = 'listed'
 * - in_maintenance = false
 * - listing_disabled = false
 * - gpu_card_type_id matches order
 * - data_center_id matches order
 * - external_ip IS NOT NULL
 * - internal_ip IS NOT NULL
 *
 * Uses SELECT ... FOR UPDATE SKIP LOCKED for concurrent safety.
 */
export async function allocateDevice(
  orderId: string,
): Promise<{ deviceId: string; externalIp: string; internalIp: string } | null> {
  // Get order details
  const [order] = await db
    .select({
      id: bareMetalOrder.id,
      dataCenterId: bareMetalOrder.dataCenterId,
      tenantId: bareMetalOrder.tenantId,
    })
    .from(bareMetalOrder)
    .where(eq(bareMetalOrder.id, orderId))
    .limit(1)

  if (!order || !order.dataCenterId) return null

  // Get the GPU card type from the first device line
  const [deviceLine] = await db
    .select({ gpuCardTypeId: bareMetalOrderDevice.gpuCardTypeId })
    .from(bareMetalOrderDevice)
    .where(eq(bareMetalOrderDevice.bareMetalOrderId, orderId))
    .limit(1)

  if (!deviceLine?.gpuCardTypeId) return null

  // Find an available device using FOR UPDATE SKIP LOCKED
  const [device] = await db
    .select({
      id: supplierDevice.id,
      externalIp: supplierDevice.externalIp,
      internalIp: supplierDevice.internalIp,
    })
    .from(supplierDevice)
    .where(
      and(
        eq(supplierDevice.dataCenterId, order.dataCenterId),
        eq(supplierDevice.gpuCardTypeId, deviceLine.gpuCardTypeId),
        eq(supplierDevice.lifecycleStatus, "listed"),
        eq(supplierDevice.inMaintenance, false),
        eq(supplierDevice.listingDisabled, false),
        sql`${supplierDevice.externalIp} IS NOT NULL`,
        sql`${supplierDevice.internalIp} IS NOT NULL`,
      ),
    )
    .orderBy(sql` RANDOM()`)
    .limit(1)
    .for("update", { skipLocked: true })

  if (!device) return null

  // Allocate: update device line + mark device as allocated
  await db.transaction(async (tx) => {
    // Update device line with allocated device
    await tx
      .update(bareMetalOrderDevice)
      .set({
        supplierDeviceId: device.id,
        allocationStatus: "allocated",
        externalIp: device.externalIp,
        internalIp: device.internalIp,
        linkedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(bareMetalOrderDevice.bareMetalOrderId, orderId),
          eq(bareMetalOrderDevice.lineNo, 1),
        ),
      )

    // Mark device as allocated
    await tx
      .update(supplierDevice)
      .set({
        lifecycleStatus: "allocated",
        updatedAt: new Date(),
      })
      .where(eq(supplierDevice.id, device.id))

    // Log allocation
    await tx.insert(bareMetalOrderLog).values({
      id: crypto.randomUUID(),
      bareMetalOrderId: orderId,
      eventType: "device_allocated",
      previousStatus: "pending",
      newStatus: "running",
      description: `设备分配成功: ${device.externalIp}`,
      detail: {
        deviceId: device.id,
        externalIp: device.externalIp,
        internalIp: device.internalIp,
      },
      operatorId: "system",
      operatorSource: "cron",
      occurredAt: new Date(),
    })
  })

  return {
    deviceId: device.id,
    externalIp: device.externalIp!,
    internalIp: device.internalIp!,
  }
}

// ---------------------------------------------------------------------------
// Stop order
// ---------------------------------------------------------------------------

/**
 * Stop a running bare metal order.
 * Transitions status to 'stopping' → 'stopped'.
 */
export async function stopOrder(
  orderId: string,
  tenantId: string,
  reason: string = "user_requested",
): Promise<{ success: boolean; message: string }> {
  const [order] = await db
    .select()
    .from(bareMetalOrder)
    .where(
      and(
        eq(bareMetalOrder.id, orderId),
        eq(bareMetalOrder.tenantId, tenantId),
      ),
    )
    .limit(1)

  if (!order) return { success: false, message: "订单不存在" }
  if (order.status !== "running") {
    return { success: false, message: `订单状态为 ${order.status}，无法停机` }
  }

  await db.transaction(async (tx) => {
    // Update order status
    await tx
      .update(bareMetalOrder)
      .set({
        status: "stopped",
        autoRenew: false, // Stop auto-renew when manually stopped
        updatedAt: new Date(),
      })
      .where(eq(bareMetalOrder.id, orderId))

    // Release device allocation
    await tx
      .update(bareMetalOrderDevice)
      .set({
        allocationStatus: "released",
        updatedAt: new Date(),
      })
      .where(eq(bareMetalOrderDevice.bareMetalOrderId, orderId))

    // Free the supplier device
    const [deviceLine] = await tx
      .select({ supplierDeviceId: bareMetalOrderDevice.supplierDeviceId })
      .from(bareMetalOrderDevice)
      .where(eq(bareMetalOrderDevice.bareMetalOrderId, orderId))
      .limit(1)

    if (deviceLine?.supplierDeviceId) {
      await tx
        .update(supplierDevice)
        .set({
          lifecycleStatus: "listed",
          updatedAt: new Date(),
        })
        .where(eq(supplierDevice.id, deviceLine.supplierDeviceId))
    }

    // Log stop
    await tx.insert(bareMetalOrderLog).values({
      id: crypto.randomUUID(),
      bareMetalOrderId: orderId,
      eventType: "status_changed",
      previousStatus: "running",
      newStatus: "stopped",
      description: `订单停机: ${reason}`,
      detail: { reason },
      operatorId: tenantId,
      operatorSource: "user",
      occurredAt: new Date(),
    })
  })

  return { success: true, message: "订单已停机" }
}

// ---------------------------------------------------------------------------
// Cancel order
// ---------------------------------------------------------------------------

/**
 * Cancel a pending or stopped bare metal order.
 * Refunds the remaining balance.
 */
export async function cancelOrder(
  orderId: string,
  tenantId: string,
): Promise<{ success: boolean; message: string; refundAmount?: number }> {
  const [order] = await db
    .select()
    .from(bareMetalOrder)
    .where(
      and(
        eq(bareMetalOrder.id, orderId),
        eq(bareMetalOrder.tenantId, tenantId),
      ),
    )
    .limit(1)

  if (!order) return { success: false, message: "订单不存在" }

  const cancellableStatuses = ["pending", "stopped", "reserved"]
  if (!cancellableStatuses.includes(order.status)) {
    return {
      success: false,
      message: `订单状态为 ${order.status}，无法取消`,
    }
  }

  // Calculate refund: remaining time prorated
  const now = new Date()
  const rentStarts = order.rentStartsAt ?? order.orderedAt
  const rentEnds = order.rentEndsAt ?? now
  const totalMs = rentEnds.getTime() - rentStarts.getTime()
  const remainingMs = Math.max(0, rentEnds.getTime() - now.getTime())
  const usedRatio = totalMs > 0 ? 1 - remainingMs / totalMs : 1
  const totalPaid = Number(order.finalAmount ?? 0)
  const refundAmount = Math.round(totalPaid * (1 - usedRatio) * 100) / 100

  await db.transaction(async (tx) => {
    // Update order status
    await tx
      .update(bareMetalOrder)
      .set({
        status: "cancelled",
        refundAmount: String(refundAmount),
        autoRenew: false,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(bareMetalOrder.id, orderId))

    // Release device allocation
    await tx
      .update(bareMetalOrderDevice)
      .set({
        allocationStatus: "released",
        updatedAt: now,
      })
      .where(eq(bareMetalOrderDevice.bareMetalOrderId, orderId))

    // Free the supplier device
    const [deviceLine] = await tx
      .select({ supplierDeviceId: bareMetalOrderDevice.supplierDeviceId })
      .from(bareMetalOrderDevice)
      .where(eq(bareMetalOrderDevice.bareMetalOrderId, orderId))
      .limit(1)

    if (deviceLine?.supplierDeviceId) {
      await tx
        .update(supplierDevice)
        .set({
          lifecycleStatus: "listed",
          updatedAt: now,
        })
        .where(eq(supplierDevice.id, deviceLine.supplierDeviceId))
    }

    // Refund balance
    if (refundAmount > 0 && order.organizationId) {
      const { creditBalance } = await import("@workspace/billing")
      await creditBalance(tx, {
        tenantId,
        organizationId: order.organizationId,
        amount: refundAmount,
        txType: "refund",
        refType: "bare_metal_order",
        refId: orderId,
        description: `裸金属订单取消退款`,
      })
    }

    // Log cancel
    await tx.insert(bareMetalOrderLog).values({
      id: crypto.randomUUID(),
      bareMetalOrderId: orderId,
      eventType: "cancelled",
      previousStatus: order.status,
      newStatus: "cancelled",
      description: `订单取消，退款 ¥${refundAmount.toFixed(2)}`,
      detail: { refundAmount, totalPaid },
      operatorId: tenantId,
      operatorSource: "user",
      occurredAt: now,
    })
  })

  return {
    success: true,
    message: `订单已取消，退款 ¥${refundAmount.toFixed(2)}`,
    refundAmount,
  }
}

// ---------------------------------------------------------------------------
// Recover from overdue (user tops up balance)
// ---------------------------------------------------------------------------

/**
 * Recover an overdue order after user tops up balance.
 * Checks if balance is now sufficient and transitions back to running.
 */
export async function recoverOverdueOrder(
  orderId: string,
  tenantId: string,
): Promise<{ success: boolean; message: string }> {
  const [order] = await db
    .select()
    .from(bareMetalOrder)
    .where(
      and(
        eq(bareMetalOrder.id, orderId),
        eq(bareMetalOrder.tenantId, tenantId),
      ),
    )
    .limit(1)

  if (!order) return { success: false, message: "订单不存在" }
  if (order.status !== "overdue") {
    return { success: false, message: `订单状态为 ${order.status}，无需恢复` }
  }

  // Get price snapshot for renewal amount
  const [snapshot] = await db
    .select()
    .from(bareMetalOrderPriceSnapshot)
    .where(eq(bareMetalOrderPriceSnapshot.bareMetalOrderId, orderId))
    .limit(1)

  if (!snapshot) return { success: false, message: "价格快照不存在" }

  const renewalHours = RENEWAL_HOURS[order.billingUnit] ?? 24
  const unitPrice = Number(snapshot.unitPricePerCardHour)
  const gpuCount = order.gpuCount ?? Number(snapshot.gpuCount)
  const renewalAmount = unitPrice * gpuCount * renewalHours

  // Check balance
  const orgId = order.organizationId ?? ""
  const balance = await getOrCreateTenantBalance(db, tenantId, orgId)
  const availableBalance = Number(balance.availableBalance)

  if (availableBalance < renewalAmount) {
    return {
      success: false,
      message: `余额不足：可用 ¥${availableBalance.toFixed(2)}，续费需 ¥${renewalAmount.toFixed(2)}`,
    }
  }

  // Renew and recover
  const currentEnd = order.rentEndsAt ?? new Date()
  const newExpiry = new Date(currentEnd.getTime() + renewalHours * 3600 * 1000)

  await db.transaction(async (tx) => {
    // Debit balance
    await debitBalance(tx, {
      tenantId,
      organizationId: orgId,
      amount: renewalAmount,
      txType: "auto_deduction",
      refType: "bare_metal_order",
      refId: orderId,
      description: `裸金属逾期恢复续费`,
    })

    // Update order
    await tx
      .update(bareMetalOrder)
      .set({
        status: "running",
        rentEndsAt: newExpiry,
        nextBillingAt: newExpiry,
        renewCount: (order.renewCount ?? 0) + 1,
        overdueRetries: 0,
        overdueAt: null,
        updatedAt: new Date(),
      })
      .where(eq(bareMetalOrder.id, orderId))

    // Log recovery
    await tx.insert(bareMetalOrderLog).values({
      id: crypto.randomUUID(),
      bareMetalOrderId: orderId,
      eventType: "auto_renewed",
      previousStatus: "overdue",
      newStatus: "running",
      description: `逾期恢复，续费成功，新到期时间 ${newExpiry.toISOString()}`,
      detail: {
        renewalAmount,
        newExpiry: newExpiry.toISOString(),
      },
      operatorId: tenantId,
      operatorSource: "user",
      occurredAt: new Date(),
    })
  })

  return {
    success: true,
    message: `恢复成功，续费 ¥${renewalAmount.toFixed(2)}，设备可用至 ${newExpiry.toISOString()}`,
  }
}
