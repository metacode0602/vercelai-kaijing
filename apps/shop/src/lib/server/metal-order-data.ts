/**
 * Bare metal order data access layer for apps/gpus.
 *
 * Provides CRUD operations for bare metal orders with real database queries.
 * Uses db.transaction() for atomic order creation + balance debit + device allocation.
 * Includes price snapshot and order audit logging.
 */

import { eq, and, desc, asc, count, sql, lte, gte, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { getSession } from "@/lib/server/auth-utils"
import {
  bareMetalOrder,
  bareMetalOrderDevice,
  bareMetalOrderPriceSnapshot,
  bareMetalOrderLog,
  billingTenant,
  gpuCardType,
  dataCenter,
  supplierDevice,
} from "@workspace/db"
import { generateBareMetalOrderNo, DEFAULT_MERCHANT_ID } from "@workspace/billing"
import {
  debitBalance,
  getOrCreateTenantBalance,
} from "@workspace/billing"
import { validateCoupon, consumeCoupon } from "@/lib/server/services/metal-order"
import type { PaginatedResult } from "@workspace/billing"

// ---------------------------------------------------------------------------
// Types for the UI
// ---------------------------------------------------------------------------

export type MetalOrderStatus =
  | "pending"
  | "provisioning"
  | "running"
  | "stopping"
  | "stopped"
  | "overdue"
  | "expired"
  | "cancelled"
  | "reserved"
  | "released"

export type MetalPaymentStatus = "unpaid" | "paid" | "partial_refund" | "full_refund"

export interface MetalOrderWithDevice {
  id: string
  orderNo: string | null
  description: string | null
  status: string
  payStatus: string
  billingUnit: string
  deviceCount: number
  gpuCount: number
  orderAmount: number
  balanceAmount: number
  couponAmount: number
  finalAmount: number
  orderedAt: string
  rentStartsAt: string | null
  rentEndsAt: string | null
  dataCenterName: string | null
  gpuModelName: string | null
  deployConfig: Record<string, unknown>
  sshEnabled: boolean
  sshPublicKey: string | null
  autoRenew: boolean
  nextBillingAt: string | null
  renewCount: number
  workspaceId: string | null
  devices: MetalOrderDeviceDto[]
}

export interface MetalOrderDeviceDto {
  id: string
  lineNo: number
  gpuCardTypeName: string | null
  gpuCount: number
  allocationStatus: string
  deviceStatus: string | null
  sn: string | null
  externalIp: string | null
  internalIp: string | null
}

export interface MetalDeviceListing {
  id: string
  displayName: string
  gpuModelKey: string
  gpuCount: number
  region: string
  dataCenterId: string
  pricing: {
    hourly: number
    daily: number
    weekly: number
    monthly: number
  }
  networkMode: string
  availableUntil: string
  availableHours: number
  inStock: boolean
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function getTenantId(): Promise<string> {
  const session = await getSession()
  if (!session?.session?.activeOrganizationId) {
    throw new Error("Unauthorized")
  }
  return session.session.activeOrganizationId
}

// ---------------------------------------------------------------------------
// List orders for current tenant
// ---------------------------------------------------------------------------

export async function listMetalOrders(params?: {
  page?: number
  pageSize?: number
  status?: string
}): Promise<PaginatedResult<MetalOrderWithDevice>> {
  const page = Math.max(1, params?.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, params?.pageSize ?? 20))

  const tenantId = await getTenantId()
  const conditions = [eq(bareMetalOrder.tenantId, tenantId)]
  if (params?.status && params.status !== 'all') {
    conditions.push(eq(bareMetalOrder.status, params.status))
  }
  const where = and(...conditions)

  const [totalRow] = await db
    .select({ total: count() })
    .from(bareMetalOrder)
    .where(where)

  const total = Number(totalRow?.total ?? 0)
  const offset = (page - 1) * pageSize

  const rows = await db
    .select({
      id: bareMetalOrder.id,
      orderNo: bareMetalOrder.orderNo,
      description: bareMetalOrder.description,
      status: bareMetalOrder.status,
      payStatus: bareMetalOrder.payStatus,
      billingUnit: bareMetalOrder.billingUnit,
      deviceCount: bareMetalOrder.deviceCount,
      gpuCount: bareMetalOrder.gpuCount,
      orderAmount: bareMetalOrder.orderAmount,
      balanceAmount: bareMetalOrder.balanceAmount,
      couponAmount: bareMetalOrder.couponAmount,
      finalAmount: bareMetalOrder.finalAmount,
      orderedAt: bareMetalOrder.orderedAt,
      rentStartsAt: bareMetalOrder.rentStartsAt,
      rentEndsAt: bareMetalOrder.rentEndsAt,
      dataCenterName: dataCenter.name,
      gpuModelName: gpuCardType.name,
      deployConfig: bareMetalOrder.deployConfig,
      sshEnabled: bareMetalOrder.sshEnabled,
      sshPublicKey: bareMetalOrder.sshPublicKey,
      autoRenew: bareMetalOrder.autoRenew,
      nextBillingAt: bareMetalOrder.nextBillingAt,
      renewCount: bareMetalOrder.renewCount,
      workspaceId: bareMetalOrder.workspaceId,
    })
    .from(bareMetalOrder)
    .leftJoin(dataCenter, eq(bareMetalOrder.dataCenterId, dataCenter.id))
    .leftJoin(
      bareMetalOrderDevice,
      eq(bareMetalOrderDevice.bareMetalOrderId, bareMetalOrder.id),
    )
    .leftJoin(gpuCardType, eq(bareMetalOrderDevice.gpuCardTypeId, gpuCardType.id))
    .where(where)
    .orderBy(desc(bareMetalOrder.orderedAt))
    .limit(pageSize)
    .offset(offset)

  const items = rows.map((r) => ({
    ...r,
    orderAmount: Number(r.orderAmount ?? 0),
    balanceAmount: Number(r.balanceAmount ?? 0),
    couponAmount: Number(r.couponAmount ?? 0),
    finalAmount: Number(r.finalAmount ?? 0),
    orderedAt: r.orderedAt?.toISOString() ?? "",
    rentStartsAt: r.rentStartsAt?.toISOString() ?? null,
    rentEndsAt: r.rentEndsAt?.toISOString() ?? null,
    deployConfig: (r.deployConfig as Record<string, unknown>) ?? {},
    sshEnabled: r.sshEnabled ?? false,
    sshPublicKey: r.sshPublicKey ?? null,
    autoRenew: r.autoRenew ?? false,
    nextBillingAt: r.nextBillingAt?.toISOString() ?? null,
    renewCount: r.renewCount ?? 0,
    workspaceId: r.workspaceId ?? null,
    devices: [],
  }))

  return { items, total, page, pageSize }
}

// ---------------------------------------------------------------------------
// Get single order by ID
// ---------------------------------------------------------------------------

export async function getMetalOrderById(
  orderId: string,
): Promise<MetalOrderWithDevice | null> {
  const tenantId = await getTenantId()

  const [row] = await db
    .select({
      id: bareMetalOrder.id,
      orderNo: bareMetalOrder.orderNo,
      description: bareMetalOrder.description,
      status: bareMetalOrder.status,
      payStatus: bareMetalOrder.payStatus,
      billingUnit: bareMetalOrder.billingUnit,
      deviceCount: bareMetalOrder.deviceCount,
      gpuCount: bareMetalOrder.gpuCount,
      orderAmount: bareMetalOrder.orderAmount,
      balanceAmount: bareMetalOrder.balanceAmount,
      couponAmount: bareMetalOrder.couponAmount,
      finalAmount: bareMetalOrder.finalAmount,
      orderedAt: bareMetalOrder.orderedAt,
      rentStartsAt: bareMetalOrder.rentStartsAt,
      rentEndsAt: bareMetalOrder.rentEndsAt,
      dataCenterName: dataCenter.name,
      gpuModelName: gpuCardType.name,
      deployConfig: bareMetalOrder.deployConfig,
      sshEnabled: bareMetalOrder.sshEnabled,
      sshPublicKey: bareMetalOrder.sshPublicKey,
      autoRenew: bareMetalOrder.autoRenew,
      nextBillingAt: bareMetalOrder.nextBillingAt,
      renewCount: bareMetalOrder.renewCount,
      workspaceId: bareMetalOrder.workspaceId,
    })
    .from(bareMetalOrder)
    .leftJoin(dataCenter, eq(bareMetalOrder.dataCenterId, dataCenter.id))
    .leftJoin(
      bareMetalOrderDevice,
      eq(bareMetalOrderDevice.bareMetalOrderId, bareMetalOrder.id),
    )
    .leftJoin(gpuCardType, eq(bareMetalOrderDevice.gpuCardTypeId, gpuCardType.id))
    .where(
      and(
        eq(bareMetalOrder.id, orderId),
        eq(bareMetalOrder.tenantId, tenantId),
      ),
    )
    .limit(1)

  if (!row) return null

  const deviceRows = await db
    .select({
      id: bareMetalOrderDevice.id,
      lineNo: bareMetalOrderDevice.lineNo,
      gpuCardTypeName: gpuCardType.name,
      gpuCount: bareMetalOrderDevice.gpuCount,
      allocationStatus: bareMetalOrderDevice.allocationStatus,
      deviceStatus: bareMetalOrderDevice.deviceStatus,
      sn: bareMetalOrderDevice.sn,
      externalIp: bareMetalOrderDevice.externalIp,
      internalIp: bareMetalOrderDevice.internalIp,
    })
    .from(bareMetalOrderDevice)
    .leftJoin(gpuCardType, eq(bareMetalOrderDevice.gpuCardTypeId, gpuCardType.id))
    .where(eq(bareMetalOrderDevice.bareMetalOrderId, orderId))
    .orderBy(asc(bareMetalOrderDevice.lineNo))

  return {
    ...row,
    orderAmount: Number(row.orderAmount ?? 0),
    balanceAmount: Number(row.balanceAmount ?? 0),
    couponAmount: Number(row.couponAmount ?? 0),
    finalAmount: Number(row.finalAmount ?? 0),
    orderedAt: row.orderedAt?.toISOString() ?? "",
    rentStartsAt: row.rentStartsAt?.toISOString() ?? null,
    rentEndsAt: row.rentEndsAt?.toISOString() ?? null,
    deployConfig: (row.deployConfig as Record<string, unknown>) ?? {},
    sshEnabled: row.sshEnabled ?? false,
    sshPublicKey: row.sshPublicKey ?? null,
    autoRenew: row.autoRenew ?? false,
    nextBillingAt: row.nextBillingAt?.toISOString() ?? null,
    renewCount: row.renewCount ?? 0,
    workspaceId: row.workspaceId ?? null,
    devices: deviceRows.map((d) => ({
      id: d.id,
      lineNo: d.lineNo,
      gpuCardTypeName: d.gpuCardTypeName ?? null,
      gpuCount: d.gpuCount ?? 0,
      allocationStatus: d.allocationStatus,
      deviceStatus: d.deviceStatus ?? null,
      sn: d.sn ?? null,
      externalIp: d.externalIp ?? null,
      internalIp: d.internalIp ?? null,
    })),
  }
}

// ---------------------------------------------------------------------------
// Create bare metal order (consumer flow) — transactional
// ---------------------------------------------------------------------------

export interface CreateMetalOrderInput {
  dataCenterId: string
  gpuCardTypeId: string
  workspaceId?: string
  description?: string
  billingUnit: string
  deviceCount: number
  gpuCount: number
  unitPricePerCardHour: number
  durationHours: number
  couponId?: string
  autoRenew?: boolean
  sshEnabled?: boolean
  sshPublicKey?: string
  envTemplateId?: string
  ports?: string
}

export async function createMetalOrder(
  input: CreateMetalOrderInput,
): Promise<{ orderId: string; orderNo: string }> {
  const tenantId = await getTenantId()
  const session = await getSession()
  const organizationId = session?.session?.activeOrganizationId ?? ""

  // 1. Look up data center
  const [dc] = await db
    .select()
    .from(dataCenter)
    .where(eq(dataCenter.id, input.dataCenterId))
    .limit(1)

  if (!dc) throw new Error("数据中心不存在")

  // 2. Calculate order amount
  const orderAmount =
    input.unitPricePerCardHour *
    input.gpuCount *
    input.durationHours *
    input.deviceCount

  // 3. Validate coupon if provided
  let couponAmount = 0
  if (input.couponId) {
    const validation = await validateCoupon(
      input.couponId,
      orderAmount,
      input.billingUnit,
      organizationId,
    )
    if (!validation.valid) {
      throw new Error(validation.error ?? "算力券无效")
    }
    couponAmount = validation.deduction
  }

  const balanceAmount = orderAmount - couponAmount
  const finalAmount = Math.max(0, balanceAmount)

  // 3. Check balance sufficiency
  const balance = await getOrCreateTenantBalance(db, tenantId, organizationId)
  const availableBalance = Number(balance.availableBalance)

  if (availableBalance < finalAmount) {
    throw new Error(
      `余额不足：可用 ¥${availableBalance.toFixed(2)}，需 ¥${finalAmount.toFixed(2)}`,
    )
  }

  // 4. Atomic: create order + price snapshot + order log + debit balance + device allocation
  // 归属商户：订单的 merchant_id 必须是租户的真实商户。此前硬编码成空串，
  // 订单永远归不到任何商户 —— 商户账单/报表里这张单直接消失（P1-21）。
  const [tenantRow] = await db
    .select({ merchantId: billingTenant.merchantId })
    .from(billingTenant)
    .where(eq(billingTenant.id, tenantId))
    .limit(1)
  const merchantId = tenantRow?.merchantId ?? DEFAULT_MERCHANT_ID

  const orderId = crypto.randomUUID()
  const orderNo = generateBareMetalOrderNo()
  const now = new Date()
  const rentStartsAt = now
  const rentEndsAt = new Date(now.getTime() + input.durationHours * 3600 * 1000)

  const result = await db.transaction(async (tx) => {
    // 4a. Create order
    const [order] = await tx
      .insert(bareMetalOrder)
      .values({
        id: orderId,
        orderNo,
        orderMark: "online",
        tenantId,
        platformTenantId: tenantId,
        merchantId,
        dataCenterId: input.dataCenterId,
        supplierId: dc.supplierId,
        idcCode: dc.code,
        idcName: dc.name,
        status: "pending",
        payStatus: "paid",
        billingUnit: input.billingUnit,
        purchaseQty: input.durationHours,
        deviceCount: input.deviceCount,
        gpuCount: input.gpuCount,
        orderAmount: String(orderAmount),
        finalAmount: String(finalAmount),
        balanceAmount: String(balanceAmount),
        couponAmount: String(couponAmount),
        orderedAt: now,
        importedAt: now,
        paidAt: now,
        rentStartsAt,
        rentEndsAt,
        source: "consumer",
        workspaceId: input.workspaceId ?? null,
        description: input.description ?? null,
        organizationId,
        sshEnabled: input.sshEnabled ?? false,
        sshPublicKey: input.sshPublicKey ?? null,
        autoRenew: input.autoRenew ?? false,
        nextBillingAt: rentEndsAt,
        deployConfig: {
          envTemplateId: input.envTemplateId ?? null,
          ports: input.ports ?? "22",
        },
      })
      .returning()

    // 4b. Create price snapshot
    await tx.insert(bareMetalOrderPriceSnapshot).values({
      id: crypto.randomUUID(),
      bareMetalOrderId: orderId,
      unitPricePerCardHour: String(input.unitPricePerCardHour),
      gpuCount: input.gpuCount,
      orderAmount: String(orderAmount),
      currency: "CNY",
      priceSource: "consumer_order",
    })

    // 4c. Create order log
    await tx.insert(bareMetalOrderLog).values({
      id: crypto.randomUUID(),
      bareMetalOrderId: orderId,
      eventType: "created",
      newStatus: "pending",
      description: `裸金属订单创建 - ${dc.name} ${input.durationHours}h`,
      detail: {
        dataCenterName: dc.name,
        gpuCount: input.gpuCount,
        durationHours: input.durationHours,
        unitPricePerCardHour: input.unitPricePerCardHour,
      },
      operatorId: organizationId,
      operatorSource: "user",
      occurredAt: now,
    })

    // 4d. Debit balance (pass tx client for atomicity)
    await debitBalance(tx, {
      tenantId,
      organizationId,
      amount: finalAmount,
      txType: "auto_deduction",
      refType: "bare_metal_order",
      refId: orderId,
      description: `裸金属租用 - ${dc.name} ${input.durationHours}h`,
    })

    // 4e. Consume coupon if provided
    if (input.couponId && couponAmount > 0) {
      await consumeCoupon(tx, input.couponId, couponAmount)
    }

    // 4f. Create device allocation records (batch insert)
    const deviceRows = Array.from({ length: input.deviceCount }, (_, i) => ({
      id: crypto.randomUUID(),
      bareMetalOrderId: orderId,
      lineNo: i + 1,
      allocationStatus: "planned" as const,
      gpuCardTypeId: input.gpuCardTypeId,
      gpuCount: input.gpuCount,
      durationHours: String(input.durationHours),
      unitPricePerCardHour: String(input.unitPricePerCardHour),
      rentStartsAt,
      rentEndsAt,
    }))

    await tx.insert(bareMetalOrderDevice).values(deviceRows)

    return order
  })

  return { orderId: result.id, orderNo: result.orderNo ?? orderNo }
}

// ---------------------------------------------------------------------------
// Renew bare metal order
// ---------------------------------------------------------------------------

export interface RenewMetalOrderInput {
  orderId: string
  months: number
}

export async function renewMetalOrder(
  input: RenewMetalOrderInput,
): Promise<{ orderId: string; newExpiry: Date }> {
  const tenantId = await getTenantId()
  const session = await getSession()
  const organizationId = session?.session?.activeOrganizationId ?? ""

  // 1. Fetch current order
  const [order] = await db
    .select()
    .from(bareMetalOrder)
    .where(
      and(
        eq(bareMetalOrder.id, input.orderId),
        eq(bareMetalOrder.tenantId, tenantId),
      ),
    )
    .limit(1)

  if (!order) throw new Error("订单不存在")
  if (order.status === "released" || order.status === "expired") {
    throw new Error("订单已释放或过期，无法续租")
  }

  // 2. Calculate renewal amount
  const currentEnd = order.rentEndsAt ?? new Date()
  const msPerMonth = 30 * 24 * 3600 * 1000
  const renewalMs = input.months * msPerMonth
  const newExpiry = new Date(currentEnd.getTime() + renewalMs)

  // Renewal amount = unit price × gpu count × renewal hours
  const renewalHours = (input.months * 30 * 24)
  const unitPrice = Number(order.orderAmount ?? 0) / (Number(order.gpuCount) * Number(order.purchaseQty ?? 1) || 1)
  const renewalAmount = unitPrice * Number(order.gpuCount) * renewalHours

  // 3. Check balance
  const balance = await getOrCreateTenantBalance(db, tenantId, organizationId)
  const availableBalance = Number(balance.availableBalance)

  if (availableBalance < renewalAmount) {
    throw new Error(
      `余额不足：可用 ¥${availableBalance.toFixed(2)}，续租需 ¥${renewalAmount.toFixed(2)}`,
    )
  }

  // 4. Atomic: update order + debit balance + log
  await db.transaction(async (tx) => {
    // 4a. Update order expiry and renew count
    await tx
      .update(bareMetalOrder)
      .set({
        rentEndsAt: newExpiry,
        nextBillingAt: newExpiry,
        renewCount: (order.renewCount ?? 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(bareMetalOrder.id, input.orderId))

    // 4b. Debit balance
    await debitBalance(tx, {
      tenantId,
      organizationId,
      amount: renewalAmount,
      txType: "auto_deduction",
      refType: "bare_metal_order",
      refId: input.orderId,
      description: `裸金属续租 ${input.months} 个月`,
    })

    // 4c. Create order log
    await tx.insert(bareMetalOrderLog).values({
      id: crypto.randomUUID(),
      bareMetalOrderId: input.orderId,
      eventType: "renewed",
      previousStatus: order.status,
      newStatus: order.status,
      description: `续租 ${input.months} 个月，新到期时间 ${newExpiry.toISOString()}`,
      detail: {
        months: input.months,
        renewalAmount,
        previousExpiry: currentEnd.toISOString(),
        newExpiry: newExpiry.toISOString(),
      },
      operatorId: organizationId,
      operatorSource: "user",
      occurredAt: new Date(),
    })
  })

  return { orderId: input.orderId, newExpiry }
}

// ---------------------------------------------------------------------------
// Toggle auto-renew
// ---------------------------------------------------------------------------

export async function toggleAutoRenew(
  orderId: string,
  autoRenew: boolean,
): Promise<void> {
  const tenantId = await getTenantId()
  const session = await getSession()
  const organizationId = session?.session?.activeOrganizationId ?? ""

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

  if (!order) throw new Error("订单不存在")

  await db.transaction(async (tx) => {
    await tx
      .update(bareMetalOrder)
      .set({ autoRenew, updatedAt: new Date() })
      .where(eq(bareMetalOrder.id, orderId))

    await tx.insert(bareMetalOrderLog).values({
      id: crypto.randomUUID(),
      bareMetalOrderId: orderId,
      eventType: autoRenew ? "auto_renewed" : "status_changed",
      description: autoRenew ? "开启自动续租" : "关闭自动续租",
      detail: { autoRenew },
      operatorId: organizationId,
      operatorSource: "user",
      occurredAt: new Date(),
    })
  })
}

// ---------------------------------------------------------------------------
// Get order audit log
// ---------------------------------------------------------------------------

export async function getOrderLogs(orderId: string) {
  const tenantId = await getTenantId()

  // Verify order belongs to tenant
  const [order] = await db
    .select({ id: bareMetalOrder.id })
    .from(bareMetalOrder)
    .where(
      and(
        eq(bareMetalOrder.id, orderId),
        eq(bareMetalOrder.tenantId, tenantId),
      ),
    )
    .limit(1)

  if (!order) throw new Error("订单不存在")

  const logs = await db
    .select()
    .from(bareMetalOrderLog)
    .where(eq(bareMetalOrderLog.bareMetalOrderId, orderId))
    .orderBy(desc(bareMetalOrderLog.occurredAt))

  return logs
}
