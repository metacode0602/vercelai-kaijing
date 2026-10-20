import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm"
import { TRPCError } from "@trpc/server"
import {
  billingTenant,
  customer,
  identityVerificationApplication,
  identityVerificationAttachment,
  organization,
  registryCredential,
  user,
  userStaff,
} from "@workspace/db/schema"
import {
  getHarborClient,
  generateHarborPassword,
  HARBOR_HOST,
} from "@workspace/shared-next"
import { db } from "@/lib/db"
import { createOssPresignedGetUrl } from "@/lib/server/dataaccess/crm/identity-oss"
import { decryptIdNumber } from "@/lib/server/dataaccess/crm/identity-pii"

type ListFilters = {
  page?: number
  pageSize?: number
  status?: string
  type?: string
  keyword?: string
}

async function findStaffIdByUserId(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: userStaff.id })
    .from(userStaff)
    .where(eq(userStaff.authUserId, userId))
    .limit(1)
  return row?.id ?? null
}

export const identityReviewDataAccess = {
  async list(filters: ListFilters) {
    const page = Math.max(1, filters.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20))
    const conditions = []
    if (filters.status) {
      conditions.push(eq(identityVerificationApplication.status, filters.status))
    }
    if (filters.type) {
      conditions.push(eq(identityVerificationApplication.type, filters.type))
    }
    if (filters.keyword?.trim()) {
      const kw = `%${filters.keyword.trim()}%`
      conditions.push(
        or(
          ilike(identityVerificationApplication.realName, kw),
          ilike(identityVerificationApplication.companyName, kw),
          ilike(identityVerificationApplication.newCompanyName, kw),
          ilike(organization.name, kw),
        )!,
      )
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [totalRow] = await db
      .select({ total: count() })
      .from(identityVerificationApplication)
      .leftJoin(
        organization,
        eq(organization.id, identityVerificationApplication.organizationId),
      )
      .where(where)

    const total = Number(totalRow?.total ?? 0)
    const offset = (page - 1) * pageSize

    const rows = await db
      .select({
        id: identityVerificationApplication.id,
        type: identityVerificationApplication.type,
        status: identityVerificationApplication.status,
        realName: identityVerificationApplication.realName,
        idNumberMask: identityVerificationApplication.idNumberMask,
        mobile: identityVerificationApplication.mobile,
        companyName: identityVerificationApplication.companyName,
        uscc: identityVerificationApplication.uscc,
        newCompanyName: identityVerificationApplication.newCompanyName,
        organizationId: identityVerificationApplication.organizationId,
        organizationName: organization.name,
        createdAt: identityVerificationApplication.createdAt,
        reviewedAt: identityVerificationApplication.reviewedAt,
      })
      .from(identityVerificationApplication)
      .leftJoin(
        organization,
        eq(organization.id, identityVerificationApplication.organizationId),
      )
      .where(where)
      .orderBy(desc(identityVerificationApplication.createdAt))
      .limit(pageSize)
      .offset(offset)

    return { items: rows, total, page, pageSize }
  },

  async get(applicationId: string) {
    const [row] = await db
      .select({
        application: identityVerificationApplication,
        organizationName: organization.name,
        submitterName: user.name,
        submitterEmail: user.email,
      })
      .from(identityVerificationApplication)
      .leftJoin(
        organization,
        eq(organization.id, identityVerificationApplication.organizationId),
      )
      .leftJoin(user, eq(user.id, identityVerificationApplication.submittedBy))
      .where(eq(identityVerificationApplication.id, applicationId))
      .limit(1)

    if (!row) return null

    const attachments = await db
      .select()
      .from(identityVerificationAttachment)
      .where(eq(identityVerificationAttachment.applicationId, applicationId))

    const attachmentsWithUrl = attachments.map((a) => ({
      ...a,
      downloadUrl: (() => {
        try {
          return createOssPresignedGetUrl(a.storageKey)
        } catch {
          return null
        }
      })(),
    }))

    // 疑似重复：同 USCC / 同证件掩码的已有客户
    const suspects: Array<{ id: string; name: string; type: string; certCode: string | null }> =
      []
    if (row.application.uscc) {
      const matched = await db
        .select({
          id: customer.id,
          name: customer.name,
          type: customer.type,
          certCode: customer.certCode,
        })
        .from(customer)
        .where(eq(customer.certCode, row.application.uscc))
        .limit(5)
      suspects.push(...matched)
    }

    return {
      ...row.application,
      organizationName: row.organizationName,
      submitterName: row.submitterName,
      submitterEmail: row.submitterEmail,
      attachments: attachmentsWithUrl,
      suspectCustomers: suspects,
    }
  },

  async approve(input: {
    applicationId: string
    reviewerUserId: string
    bindCustomerId?: string
  }) {
    const txResult = await db.transaction(async (tx) => {
      const [app] = await tx
        .select()
        .from(identityVerificationApplication)
        .where(eq(identityVerificationApplication.id, input.applicationId))
        .for("update")
        .limit(1)

      if (!app) throw new TRPCError({ code: "NOT_FOUND", message: "申请不存在" })
      if (app.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "申请不在待审状态" })
      }

      const tenantId = app.tenantId

      const staffId = await findStaffIdByUserId(input.reviewerUserId)
      const now = new Date()
      let customerId = input.bindCustomerId ?? app.boundCustomerId

      if (app.type === "rename") {
        if (!app.newCompanyName) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "缺少新企业名称" })
        }
        const [tenant] = await tx
          .select()
          .from(billingTenant)
          .where(eq(billingTenant.id, app.tenantId))
          .limit(1)
        if (!tenant?.customerId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "租户尚未绑定客户" })
        }
        customerId = tenant.customerId
        await tx
          .update(customer)
          .set({ name: app.newCompanyName, shortName: app.newCompanyName, updatedAt: now })
          .where(eq(customer.id, customerId))
        await tx
          .update(organization)
          .set({
            name: app.newCompanyName,
            identityStatus: "enterprise_verified",
            enterpriseVerificationStatus: "verified",
          })
          .where(eq(organization.id, app.organizationId))
        await tx
          .update(billingTenant)
          .set({ name: app.newCompanyName, updatedAt: now })
          .where(eq(billingTenant.id, app.tenantId))
      } else if (app.type === "individual") {
        const displayName = app.realName || "未命名"
        let idPlain: string | null = null
        if (app.idNumberCipher) {
          try {
            idPlain = decryptIdNumber(app.idNumberCipher)
          } catch {
            idPlain = null
          }
        }
        if (customerId) {
          await tx
            .update(customer)
            .set({
              name: displayName,
              shortName: displayName,
              type: "C",
              certCode: idPlain,
              contactPhone: app.mobile,
              identityVerified: true,
              identityVerifiedAt: now,
              identityVerificationType: "manual",
              updatedAt: now,
            })
            .where(eq(customer.id, customerId))
        } else {
          customerId = crypto.randomUUID()
          await tx.insert(customer).values({
            id: customerId,
            name: displayName,
            shortName: displayName,
            type: "C",
            status: "active",
            certCode: idPlain,
            contactPhone: app.mobile,
            industry: "",
            address: "",
            identityVerified: true,
            identityVerifiedAt: now,
            identityVerificationType: "manual",
          })
        }
        await tx
          .update(billingTenant)
          .set({ customerId, name: displayName, updatedAt: now })
          .where(eq(billingTenant.id, app.tenantId))
        await tx
          .update(organization)
          .set({
            name: displayName,
            identityStatus: "individual_verified",
            enterpriseVerificationStatus: "unverified",
          })
          .where(eq(organization.id, app.organizationId))
      } else {
        // enterprise | enterprise_upgrade
        const displayName = app.companyName || "未命名企业"
        if (customerId) {
          await tx
            .update(customer)
            .set({
              name: displayName,
              shortName: displayName,
              type: "B",
              certCode: app.uscc,
              identityVerified: true,
              identityVerifiedAt: now,
              identityVerificationType: "manual",
              updatedAt: now,
            })
            .where(eq(customer.id, customerId))
        } else {
          // 升级：优先用 tenant 已绑定的 customer
          const [tenant] = await tx
            .select()
            .from(billingTenant)
            .where(eq(billingTenant.id, app.tenantId))
            .limit(1)
          if (tenant?.customerId) {
            customerId = tenant.customerId
            await tx
              .update(customer)
              .set({
                name: displayName,
                shortName: displayName,
                type: "B",
                certCode: app.uscc,
                identityVerified: true,
                identityVerifiedAt: now,
                identityVerificationType: "manual",
                updatedAt: now,
              })
              .where(eq(customer.id, customerId))
          } else {
            customerId = crypto.randomUUID()
            await tx.insert(customer).values({
              id: customerId,
              name: displayName,
              shortName: displayName,
              type: "B",
              status: "active",
              certCode: app.uscc,
              industry: "",
              address: "",
              identityVerified: true,
              identityVerifiedAt: now,
              identityVerificationType: "manual",
            })
          }
        }
        await tx
          .update(billingTenant)
          .set({ customerId, name: displayName, updatedAt: now })
          .where(eq(billingTenant.id, app.tenantId))
        await tx
          .update(organization)
          .set({
            name: displayName,
            identityStatus: "enterprise_verified",
            enterpriseVerificationStatus: "verified",
          })
          .where(eq(organization.id, app.organizationId))
      }

      await tx
        .update(identityVerificationApplication)
        .set({
          status: "approved",
          reviewedBy: staffId,
          reviewedAt: now,
          boundCustomerId: customerId,
          updatedAt: now,
        })
        .where(eq(identityVerificationApplication.id, input.applicationId))

      return { applicationId: input.applicationId, customerId, status: "approved" as const, tenantId }
    })

    // Provision Harbor account after transaction succeeds
    const { tenantId } = txResult
    try {
        const harbor = getHarborClient()
        const [existing] = await db
          .select()
          .from(registryCredential)
          .where(
            and(
              eq(registryCredential.tenantId, tenantId),
              eq(registryCredential.registryHost, HARBOR_HOST),
            ),
          )
          .limit(1)

        if (!existing) {
          const projectName = `tenant-${tenantId}`
          const password = generateHarborPassword()
          const username = `user-${tenantId.slice(0, 8).toLowerCase()}`

          const exists = await harbor.userExists(username)
          if (exists) {
            await harbor.resetUserPassword(username, password)
          } else {
            const [org] = await db
              .select({ name: organization.name })
              .from(organization)
              .where(eq(organization.id, tenantId))
              .limit(1)
            await harbor.createUser(username, password, `${username}@gpu.local`, org?.name || username)
          }

          try {
            await harbor.createProject(projectName)
          } catch {
            // project may already exist
          }

          await harbor.addProjectMember(projectName, username, 1)
          await db.insert(registryCredential).values({
            id: crypto.randomUUID(),
            tenantId,
            registryHost: HARBOR_HOST,
            username,
            passwordEnc: Buffer.from(password).toString("base64"),
            credentialType: "basic",
            scope: "project",
          })
        }
      } catch {
        console.error("[identity-review] Harbor provisioning failed, will be retried manually")
      }

    return txResult
  },

  async reject(input: {
    applicationId: string
    reviewerUserId: string
    comment: string
  }) {
    return db.transaction(async (tx) => {
      const [app] = await tx
        .select()
        .from(identityVerificationApplication)
        .where(eq(identityVerificationApplication.id, input.applicationId))
        .for("update")
        .limit(1)

      if (!app) throw new TRPCError({ code: "NOT_FOUND", message: "申请不存在" })
      if (app.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "申请不在待审状态" })
      }

      const staffId = await findStaffIdByUserId(input.reviewerUserId)
      const now = new Date()

      // 回退展示状态：企业升级/改名驳回后保留原有效实名
      let nextStatus: string = "rejected"
      if (app.type === "enterprise_upgrade") {
        nextStatus = "individual_verified"
      } else if (app.type === "rename") {
        nextStatus = "enterprise_verified"
      } else {
        // 查是否仍有已通过的实名历史
        const [prev] = await tx
          .select({ type: identityVerificationApplication.type })
          .from(identityVerificationApplication)
          .where(
            and(
              eq(identityVerificationApplication.organizationId, app.organizationId),
              eq(identityVerificationApplication.status, "approved"),
              sql`${identityVerificationApplication.id} <> ${input.applicationId}`,
            ),
          )
          .orderBy(desc(identityVerificationApplication.reviewedAt))
          .limit(1)
        if (prev?.type === "enterprise" || prev?.type === "enterprise_upgrade") {
          nextStatus = "enterprise_verified"
        } else if (prev?.type === "individual") {
          nextStatus = "individual_verified"
        }
      }

      await tx
        .update(identityVerificationApplication)
        .set({
          status: "rejected",
          reviewComment: input.comment.trim(),
          reviewedBy: staffId,
          reviewedAt: now,
          updatedAt: now,
        })
        .where(eq(identityVerificationApplication.id, input.applicationId))

      await tx
        .update(organization)
        .set({
          identityStatus: nextStatus,
          enterpriseVerificationStatus:
            nextStatus === "enterprise_verified"
              ? "verified"
              : nextStatus === "pending"
                ? "pending"
                : "rejected",
        })
        .where(eq(organization.id, app.organizationId))

      return { applicationId: input.applicationId, status: "rejected" as const }
    })
  },
}
