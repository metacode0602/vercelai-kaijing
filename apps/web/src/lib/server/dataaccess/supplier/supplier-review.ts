/**
 * 供应商门户入驻审核 dataaccess
 *
 * 流程：supplier 自助入驻 → organization (supplierStatus='pending')
 *     → 运营审核 → 创建 supplier 主数据（organizationId + externalTenantId = org.id）
 */

import { db } from '@/lib/db'
import {
  supplier,
  organization,
  member,
  user,
} from '@workspace/db/schema'
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm'

function newId() {
  return crypto.randomUUID()
}

function generateSupplierCode(): string {
  const now = new Date()
  const ts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('')
  return `P${ts}`
}

export type SupplierOnboardingRow = {
  id: string
  name: string
  companyFullName: string | null
  companyShortName: string | null
  uscc: string | null
  legalPersonName: string | null
  contactPhone: string | null
  supplierStatus: string
  createdAt: Date
  contactEmail: string | null
  ownerPhone: string | null
  cooperationPreferences: Record<string, unknown> | null
}

export type SupplierOnboardingDetail = SupplierOnboardingRow & {
  metadata: Record<string, unknown> | null
  entryApproved: boolean
}

function mapOnboardingRow(org: {
  id: string
  name: string
  metadata: unknown
  supplierStatus: string | null
  createdAt: Date
  contactEmail?: string | null
  ownerPhone?: string | null
}): SupplierOnboardingRow {
  const meta = (org.metadata ?? {}) as Record<string, unknown>
  const prefs = meta.cooperationPreferences
  return {
    id: org.id,
    name: org.name,
    companyFullName: (meta.companyFullName as string) ?? null,
    companyShortName: (meta.companyShortName as string) ?? null,
    uscc: (meta.uscc as string) ?? null,
    legalPersonName: (meta.legalPersonName as string) ?? null,
    contactPhone: (meta.contactPhone as string) ?? null,
    supplierStatus: org.supplierStatus ?? 'pending',
    createdAt: org.createdAt,
    contactEmail: org.contactEmail ?? null,
    ownerPhone: org.ownerPhone ?? null,
    cooperationPreferences:
      prefs && typeof prefs === 'object' ? (prefs as Record<string, unknown>) : null,
  }
}

export const supplierReviewDataAccess = {
  async list(params?: {
    search?: string
    status?: string
    page?: number
    pageSize?: number
  }): Promise<{ items: SupplierOnboardingRow[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(1, params?.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, params?.pageSize ?? 20))
    const q = params?.search?.trim()
    const status = params?.status?.trim() || 'pending'

    const conditions = [eq(organization.orgType, 'supplier')]

    if (status !== 'all') {
      conditions.push(eq(organization.supplierStatus, status))
    }

    if (q) {
      conditions.push(
        or(
          ilike(organization.name, `%${q}%`),
          sql`(${organization.metadata}->>'companyFullName') ILIKE ${`%${q}%`}`,
          sql`(${organization.metadata}->>'companyShortName') ILIKE ${`%${q}%`}`,
          sql`(${organization.metadata}->>'uscc') ILIKE ${`%${q}%`}`,
          sql`(${organization.metadata}->>'legalPersonName') ILIKE ${`%${q}%`}`,
          sql`(${organization.metadata}->>'contactPhone') ILIKE ${`%${q}%`}`,
          ilike(user.email, `%${q}%`),
          ilike(user.phoneNumber, `%${q}%`),
        )!,
      )
    }

    const where = and(...conditions)

    const [totalRow] = await db
      .select({ total: sql<number>`count(distinct ${organization.id})` })
      .from(organization)
      .leftJoin(member, eq(member.organizationId, organization.id))
      .leftJoin(user, eq(user.id, member.userId))
      .where(where)

    const total = Number(totalRow?.total ?? 0)
    const offset = (page - 1) * pageSize

    const rows = await db
      .select({
        id: organization.id,
        name: organization.name,
        metadata: organization.metadata,
        supplierStatus: organization.supplierStatus,
        createdAt: organization.createdAt,
        contactEmail: user.email,
        ownerPhone: user.phoneNumber,
      })
      .from(organization)
      .leftJoin(member, eq(member.organizationId, organization.id))
      .leftJoin(user, eq(user.id, member.userId))
      .where(where)
      .orderBy(desc(organization.createdAt))
      .limit(pageSize)
      .offset(offset)

    return {
      items: rows.map(mapOnboardingRow),
      total,
      page,
      pageSize,
    }
  },

  async getDetail(id: string): Promise<SupplierOnboardingDetail | null> {
    const [row] = await db
      .select({
        id: organization.id,
        name: organization.name,
        metadata: organization.metadata,
        supplierStatus: organization.supplierStatus,
        createdAt: organization.createdAt,
        entryApproved: organization.entryApproved,
        contactEmail: user.email,
        ownerPhone: user.phoneNumber,
      })
      .from(organization)
      .leftJoin(member, eq(member.organizationId, organization.id))
      .leftJoin(user, eq(user.id, member.userId))
      .where(and(eq(organization.id, id), eq(organization.orgType, 'supplier')))
      .limit(1)

    if (!row) return null

    return {
      ...mapOnboardingRow(row),
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      entryApproved: row.entryApproved,
    }
  },

  async approve(organizationId: string): Promise<{ supplierId: string }> {
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, organizationId),
    })

    if (!org) throw new Error('入驻申请不存在')
    if (org.orgType !== 'supplier') throw new Error('该组织类型不支持审核')
    if (org.supplierStatus !== 'pending') throw new Error('该申请已处理')

    const meta = (org.metadata ?? {}) as Record<string, unknown>
    const companyFullName = (meta.companyFullName as string) ?? org.name
    const companyShortName = (meta.companyShortName as string) ?? org.name
    const uscc = (meta.uscc as string) ?? null
    const legalPersonName = (meta.legalPersonName as string) ?? null
    const contactPhone = (meta.contactPhone as string) ?? null

    const existing = await db
      .select({ id: supplier.id })
      .from(supplier)
      .where(
        or(
          eq(supplier.organizationId, organizationId),
          eq(supplier.externalTenantId, organizationId),
        ),
      )
      .limit(1)

    if (existing.length > 0) {
      throw new Error('该组织已关联供应商主数据')
    }

    const supplierId = newId()
    const now = new Date()

    await db.transaction(async (tx) => {
      // 若 CRM 已有同 USCC 主数据，禁止重复创建（入驻阶段已拦截；审核兜底）
      if (uscc) {
        const [dup] = await tx
          .select({ id: supplier.id })
          .from(supplier)
          .where(eq(supplier.identityNo, uscc))
          .limit(1)
        if (dup) {
          throw new Error('该统一社会信用代码已存在于供应商主数据，请联系管理员绑定')
        }
      }

      await tx.insert(supplier).values({
        id: supplierId,
        organizationId,
        code: generateSupplierCode(),
        externalTenantId: organizationId,
        name: companyFullName,
        shortName: companyShortName,
        status: 'cooperating',
        source: 'portal',
        onboardingType: 'enterprise',
        identityNo: uscc,
        contactPerson: legalPersonName,
        contactPhone,
        adminPhone: contactPhone,
        auditStatus: 'approved',
        auditConfirmed: true,
        createdAt: now,
        updatedAt: now,
      })

      await tx
        .update(organization)
        .set({
          supplierStatus: 'approved',
          entryApproved: true,
          enterpriseVerificationStatus: 'verified',
          name: companyShortName,
        })
        .where(eq(organization.id, organizationId))
    })

    // Notify supplier via portal site message
    try {
      const { notifySupplierOnboardingResult } = await import('@workspace/shared-supplier/notifications')
      await notifySupplierOnboardingResult(db, supplierId, 'approved')
    } catch (error) {
      console.error('[supplierReview.approve] Failed to send notification:', error)
    }

    return { supplierId }
  },

  async reject(organizationId: string, reason?: string): Promise<void> {
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, organizationId),
    })

    if (!org) throw new Error('入驻申请不存在')
    if (org.orgType !== 'supplier') throw new Error('该组织类型不支持审核')
    if (org.supplierStatus !== 'pending') throw new Error('该申请已处理')

    await db
      .update(organization)
      .set({
        supplierStatus: 'rejected',
        metadata: {
          ...((org.metadata as Record<string, unknown>) ?? {}),
          rejectReason: reason ?? null,
          rejectedAt: new Date().toISOString(),
        },
      })
      .where(eq(organization.id, organizationId))

    // Notify supplier via portal site message (if supplier record exists)
    try {
      const [existingSupplier] = await db
        .select({ id: supplier.id })
        .from(supplier)
        .where(
          or(
            eq(supplier.organizationId, organizationId),
            eq(supplier.externalTenantId, organizationId),
          ),
        )
        .limit(1)

      if (existingSupplier) {
        const { notifySupplierOnboardingResult } = await import('@workspace/shared-supplier/notifications')
        await notifySupplierOnboardingResult(db, existingSupplier.id, 'rejected', reason)
      }
    } catch (error) {
      console.error('[supplierReview.reject] Failed to send notification:', error)
    }
  },
}
