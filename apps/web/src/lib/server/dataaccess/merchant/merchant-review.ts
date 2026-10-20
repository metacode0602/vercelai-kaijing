/**
 * 商户入驻审核 dataaccess
 *
 * 流程：merchant 自助入驻 → organization (merchantStatus='pending') → 运营审核 → 创建 merchant 表记录
 */

import { db } from "@/lib/db"
import {
  merchant,
  merchantPromoLink,
  organization,
  member,
  user,
} from "@workspace/db/schema"
import { and, desc, eq, ilike, or, sql } from "drizzle-orm"

function newId() {
  return crypto.randomUUID()
}

/**
 * 推广码：10 位大写字母数字，去掉易混淆的 0/O/1/I。
 * 用 `crypto.getRandomValues` 而不是 Math.random，避免可预测的推广码被枚举。
 */
const PROMO_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"

function generatePromoCode(length = 10): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  // 直接迭代而不是 bytes[i]：`noUncheckedIndexedAccess` 会把下标取值判为
  // `number | undefined`，平白多一个非空断言。
  let out = ""
  for (const byte of bytes) {
    out += PROMO_CODE_ALPHABET.charAt(byte % PROMO_CODE_ALPHABET.length)
  }
  return out
}

function generateMerchantCode(merchantType: string): string {
  const now = new Date()
  const ts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("")
  const prefix = merchantType === "individual" ? "I" : "E"
  return `${prefix}${ts}`
}

export type MerchantOnboardingRow = {
  id: string
  name: string
  merchantType: "enterprise" | "individual"
  companyFullName: string | null
  unifiedSocialCreditCode: string | null
  legalPersonName: string | null
  legalPersonIdNumber: string | null
  licenseDataUrl: string | null
  idNumber: string | null
  idCardFrontDataUrl: string | null
  idCardBackDataUrl: string | null
  merchantStatus: string
  createdAt: Date
  contactEmail: string | null
  contactPhone: string | null
}

export type MerchantOnboardingDetail = MerchantOnboardingRow & {
  metadata: Record<string, unknown> | null
  entryApproved: boolean
}

function mapOnboardingRow(org: {
  id: string
  name: string
  metadata: unknown
  merchantStatus: string | null
  enterpriseVerificationStatus: string | null
  createdAt: Date
  contactEmail?: string | null
  contactPhone?: string | null
}): MerchantOnboardingRow {
  const meta = (org.metadata ?? {}) as Record<string, unknown>
  const merchantType = (meta.merchantType as string) ?? "enterprise"

  return {
    id: org.id,
    name: org.name,
    merchantType: merchantType as "enterprise" | "individual",
    companyFullName: (meta.companyFullName as string) ?? null,
    unifiedSocialCreditCode: (meta.uscc as string) ?? null,
    legalPersonName: (meta.legalPersonName as string) ?? null,
    legalPersonIdNumber: (meta.legalPersonIdNumber as string) ?? null,
    licenseDataUrl: (meta.licenseDataUrl as string) ?? null,
    idNumber: (meta.idNumber as string) ?? null,
    idCardFrontDataUrl: (meta.idCardFrontDataUrl as string) ?? null,
    idCardBackDataUrl: (meta.idCardBackDataUrl as string) ?? null,
    merchantStatus: org.merchantStatus ?? "pending",
    createdAt: org.createdAt,
    contactEmail: org.contactEmail ?? null,
    contactPhone: org.contactPhone ?? null,
  }
}

export const merchantReviewDataAccess = {
  async listPending(params?: {
    search?: string
    status?: string
    page?: number
    pageSize?: number
  }): Promise<{
    items: MerchantOnboardingRow[]
    total: number
    page: number
    pageSize: number
  }> {
    const page = Math.max(1, params?.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, params?.pageSize ?? 20))
    const q = params?.search?.trim()
    const status = params?.status?.trim() || "pending"

    const conditions = [eq(organization.orgType, "merchant")]

    if (status !== "all") {
      conditions.push(eq(organization.merchantStatus, status))
    }

    if (q) {
      conditions.push(
        or(
          ilike(organization.name, `%${q}%`),
          sql`(${organization.metadata}->>'companyFullName') ILIKE ${`%${q}%`}`,
          sql`(${organization.metadata}->>'uscc') ILIKE ${`%${q}%`}`,
          sql`(${organization.metadata}->>'fullName') ILIKE ${`%${q}%`}`,
          sql`(${organization.metadata}->>'idNumber') ILIKE ${`%${q}%`}`,
          ilike(user.email, `%${q}%`),
          ilike(user.phoneNumber, `%${q}%`)
        )!
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
        merchantStatus: organization.merchantStatus,
        enterpriseVerificationStatus: organization.enterpriseVerificationStatus,
        createdAt: organization.createdAt,
        contactEmail: user.email,
        contactPhone: user.phoneNumber,
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

  async getDetail(id: string): Promise<MerchantOnboardingDetail | null> {
    const [row] = await db
      .select({
        id: organization.id,
        name: organization.name,
        metadata: organization.metadata,
        merchantStatus: organization.merchantStatus,
        enterpriseVerificationStatus: organization.enterpriseVerificationStatus,
        createdAt: organization.createdAt,
        entryApproved: organization.entryApproved,
        contactEmail: user.email,
        contactPhone: user.phoneNumber,
      })
      .from(organization)
      .leftJoin(member, eq(member.organizationId, organization.id))
      .leftJoin(user, eq(user.id, member.userId))
      .where(eq(organization.id, id))
      .limit(1)

    if (!row || row.metadata === null) return null

    const meta = row.metadata as Record<string, unknown>
    const merchantType = (meta.merchantType as string) ?? "enterprise"

    return {
      id: row.id,
      name: row.name,
      merchantType: merchantType as "enterprise" | "individual",
      companyFullName: (meta.companyFullName as string) ?? null,
      unifiedSocialCreditCode: (meta.uscc as string) ?? null,
      legalPersonName: (meta.legalPersonName as string) ?? null,
      legalPersonIdNumber: (meta.legalPersonIdNumber as string) ?? null,
      licenseDataUrl: (meta.licenseDataUrl as string) ?? null,
      idNumber: (meta.idNumber as string) ?? null,
      idCardFrontDataUrl: (meta.idCardFrontDataUrl as string) ?? null,
      idCardBackDataUrl: (meta.idCardBackDataUrl as string) ?? null,
      merchantStatus: row.merchantStatus ?? "pending",
      createdAt: row.createdAt,
      contactEmail: row.contactEmail ?? null,
      contactPhone: row.contactPhone ?? null,
      metadata: row.metadata as Record<string, unknown>,
      entryApproved: row.entryApproved,
    }
  },

  async approve(
    organizationId: string,
    options?: { merchantType?: "partner" | "platform_direct" }
  ): Promise<{ merchantId: string }> {
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, organizationId),
    })

    if (!org) throw new Error("入驻申请不存在")
    if (org.orgType !== "merchant") throw new Error("该组织类型不支持审核")
    if (org.merchantStatus !== "pending") throw new Error("该申请已处理")

    const meta = (org.metadata ?? {}) as Record<string, unknown>
    const merchantType = (meta.merchantType as string) ?? "enterprise"
    const isIndividual = merchantType === "individual"
    // 入驻时选的资金模式。缺失时按 prepay 兜底（与 DB 列默认值一致）：
    // 老数据没有这个字段，不能因为缺省就把商户当成佣金模式并发推广链接。
    const fundingMode: "prepay" | "commission" =
      meta.fundingMode === "commission" ? "commission" : "prepay"

    const merchantId = newId()
    const now = new Date()

    await db.transaction(async (tx) => {
      // 创建 merchant 记录
      await tx.insert(merchant).values({
        id: merchantId,
        organizationId: organizationId,
        platformMerchantId: 0,
        code: generateMerchantCode(merchantType),
        name: isIndividual
          ? ((meta.fullName as string) ?? org.name)
          : ((meta.companyShortName as string) ?? org.name),
        companyFullName: isIndividual
          ? ((meta.fullName as string) ?? org.name)
          : ((meta.companyFullName as string) ?? org.name),
        unifiedSocialCreditCode: isIndividual
          ? null
          : ((meta.uscc as string) ?? null),
        type: options?.merchantType ?? "partner",
        status: "active",
        fundingMode,
        isDefault: false,
        contactUser: isIndividual
          ? ((meta.fullName as string) ?? null)
          : ((meta.legalPersonName as string) ?? null),
        createdAt: now,
      })

      // 佣金商户：审核通过即自动生成唯一推广链接，商户端只读展示，不提供创建入口。
      // 推广码有唯一性要求，碰撞时重试；approve() 本身被 merchantStatus='pending' 守卫，
      // 同一组织不会重复审核，所以每个商户只会有一条推广链接。
      if (fundingMode === "commission") {
        const merchantName = isIndividual
          ? ((meta.fullName as string) ?? org.name)
          : ((meta.companyShortName as string) ?? org.name)

        let promoLinkCreated = false
        for (let attempt = 0; attempt < 5; attempt++) {
          const promoCode = generatePromoCode()
          const taken = await tx
            .select({ id: merchantPromoLink.id })
            .from(merchantPromoLink)
            .where(eq(merchantPromoLink.promoCode, promoCode))
            .limit(1)
          if (taken.length > 0) continue

          await tx.insert(merchantPromoLink).values({
            id: newId(),
            merchantId,
            name: merchantName,
            promoCode,
            landingProduct: null,
            shortUrl: null,
            status: "active",
            validFrom: now,
            validTo: null,
            clickCount: 0,
            signupCount: 0,
            rechargeCount: 0,
            totalRechargeAmount: "0",
            totalConsumeAmount: "0",
            remark: null,
          })
          promoLinkCreated = true
          break
        }
        // 推广码连续碰撞就回滚审核：佣金商户拿不到推广链接就等于审核白做了，
        // 而商户端没有创建入口，事后无人能补救。让运营重试比静默产生死号可靠。
        if (!promoLinkCreated) {
          throw new Error("推广码生成失败，请重试审核")
        }
      }

      // 更新 organization 状态
      await tx
        .update(organization)
        .set({
          merchantStatus: "approved",
          entryApproved: true,
          enterpriseVerificationStatus: "verified",
        })
        .where(eq(organization.id, organizationId))
    })

    return { merchantId }
  },

  async reject(organizationId: string, reason?: string): Promise<void> {
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, organizationId),
    })

    if (!org) throw new Error("入驻申请不存在")
    if (org.orgType !== "merchant") throw new Error("该组织类型不支持审核")
    if (org.merchantStatus !== "pending") throw new Error("该申请已处理")

    await db
      .update(organization)
      .set({
        merchantStatus: "rejected",
        metadata: {
          ...((org.metadata as Record<string, unknown>) ?? {}),
          rejectReason: reason ?? null,
          rejectedAt: new Date().toISOString(),
        },
      })
      .where(eq(organization.id, organizationId))
  },
}
