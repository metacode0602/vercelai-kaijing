import { and, desc, eq } from "drizzle-orm"
import { TRPCError } from "@trpc/server"
import {
  identityVerificationApplication,
  identityVerificationAttachment,
  organization,
  registryCredential,
} from "@workspace/db"
import { ensureBillingTenant } from "@workspace/billing"
import { db } from "@/lib/db"
import {
  encryptIdNumber,
  isValidChineseIdNumber,
  isValidMobile,
  isValidUscc,
  maskIdNumber,
  sanitizeFileName,
  createOssPresignedPutUrl,
} from "./crypto-oss"
import { sendIdentitySmsOtp, verifyIdentitySmsOtp } from "./otp"
import {
  getHarborClient,
  generateHarborPassword,
  HARBOR_HOST,
} from "@/lib/server/services/harbor"

export type IdentityStatus =
  | "unverified"
  | "pending"
  | "individual_verified"
  | "enterprise_verified"
  | "rejected"

export type ApplicationType =
  | "individual"
  | "enterprise"
  | "enterprise_upgrade"
  | "rename"

const ATTACHMENT_KINDS = [
  "business_license",
  "id_front",
  "id_back",
  "auth_letter",
  "rename_proof",
  "other",
] as const

type AttachmentKind = (typeof ATTACHMENT_KINDS)[number]

const ALLOWED_CONTENT = new Set([
  "image/jpeg",
  "image/png",
  "application/pdf",
])

async function getOrgIdentityStatus(organizationId: string): Promise<IdentityStatus> {
  const [org] = await db
    .select({
      identityStatus: organization.identityStatus,
      enterpriseVerificationStatus: organization.enterpriseVerificationStatus,
    })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1)
  if (!org) throw new TRPCError({ code: "NOT_FOUND", message: "组织不存在" })
  return (org.identityStatus as IdentityStatus) || "unverified"
}

async function assertNoPending(organizationId: string) {
  const [pending] = await db
    .select({ id: identityVerificationApplication.id })
    .from(identityVerificationApplication)
    .where(
      and(
        eq(identityVerificationApplication.organizationId, organizationId),
        eq(identityVerificationApplication.status, "pending"),
      ),
    )
    .limit(1)
  if (pending) {
    throw new TRPCError({ code: "CONFLICT", message: "已有审核中的申请，请勿重复提交" })
  }
}

async function setOrgPending(organizationId: string) {
  await db
    .update(organization)
    .set({
      identityStatus: "pending",
      enterpriseVerificationStatus: "pending",
    })
    .where(eq(organization.id, organizationId))
}

export const identityDataAccess = {
  async getStatus(organizationId: string) {
    const status = await getOrgIdentityStatus(organizationId)
    const [latest] = await db
      .select()
      .from(identityVerificationApplication)
      .where(eq(identityVerificationApplication.organizationId, organizationId))
      .orderBy(desc(identityVerificationApplication.createdAt))
      .limit(1)

    return {
      identityStatus: status,
      latestApplication: latest
        ? {
            id: latest.id,
            type: latest.type,
            status: latest.status,
            realName: latest.realName,
            idNumberMask: latest.idNumberMask,
            mobile: latest.mobile,
            companyName: latest.companyName,
            uscc: latest.uscc,
            newCompanyName: latest.newCompanyName,
            reviewComment: latest.reviewComment,
            createdAt: latest.createdAt,
            reviewedAt: latest.reviewedAt,
          }
        : null,
      canSubmitIndividual: status === "unverified" || status === "rejected",
      canSubmitEnterprise:
        status === "unverified" ||
        status === "rejected" ||
        status === "individual_verified",
      canSubmitRename: status === "enterprise_verified",
      isVerified:
        status === "individual_verified" || status === "enterprise_verified",
    }
  },

  async sendSmsCode(mobile: string) {
    if (!isValidMobile(mobile)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "手机号格式不正确" })
    }
    try {
      return await sendIdentitySmsOtp(mobile)
    } catch (e) {
      const err = e as Error & { code?: string }
      if (err.code === "COOLDOWN") {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: err.message })
      }
      throw e
    }
  },

  async createUploadUrl(input: {
    organizationId: string
    kind: string
    fileName: string
    contentType: string
    sizeBytes: number
  }) {
    if (!ATTACHMENT_KINDS.includes(input.kind as AttachmentKind)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "无效的附件类型" })
    }
    if (!ALLOWED_CONTENT.has(input.contentType)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "仅支持 JPG/PNG/PDF" })
    }
    if (input.sizeBytes <= 0 || input.sizeBytes > 10 * 1024 * 1024) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "单文件需 ≤ 10MB" })
    }
    const objectKey = [
      "identity-verification",
      input.organizationId,
      `${crypto.randomUUID()}_${sanitizeFileName(input.fileName)}`,
    ].join("/")
    return createOssPresignedPutUrl({
      objectKey,
      contentType: input.contentType,
    })
  },

  async submitIndividual(input: {
    organizationId: string
    userId: string
    realName: string
    idNumber: string
    mobile: string
    smsCode: string
  }) {
    const status = await getOrgIdentityStatus(input.organizationId)
    if (status !== "unverified" && status !== "rejected") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "当前状态不可提交个人实名" })
    }
    await assertNoPending(input.organizationId)

    const realName = input.realName.trim()
    const idNumber = input.idNumber.trim().toUpperCase()
    const mobile = input.mobile.trim()
    if (realName.length < 2) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "请输入真实姓名" })
    }
    if (!isValidChineseIdNumber(idNumber)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "身份证号无效" })
    }
    if (!isValidMobile(mobile)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "手机号格式不正确" })
    }
    const ok = await verifyIdentitySmsOtp(mobile, input.smsCode)
    if (!ok) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "验证码错误或已过期" })
    }

    await ensureBillingTenant(db, input.organizationId, {
      organizationId: input.organizationId,
    })

    const id = crypto.randomUUID()
    await db.insert(identityVerificationApplication).values({
      id,
      organizationId: input.organizationId,
      tenantId: input.organizationId,
      type: "individual",
      status: "pending",
      realName,
      idNumberCipher: encryptIdNumber(idNumber),
      idNumberMask: maskIdNumber(idNumber),
      mobile,
      mobileVerified: true,
      submittedBy: input.userId,
    })
    await setOrgPending(input.organizationId)
    return { applicationId: id, status: "pending" as const }
  },

  async submitEnterprise(input: {
    organizationId: string
    userId: string
    companyName: string
    uscc: string
    legalPersonName: string
    applicantRole: "legal_person" | "authorized"
    authorizedPersonName?: string
    attachments: Array<{
      kind: AttachmentKind
      fileName: string
      contentType: string
      sizeBytes: number
      storageKey: string
    }>
  }) {
    const status = await getOrgIdentityStatus(input.organizationId)
    if (
      status !== "unverified" &&
      status !== "rejected" &&
      status !== "individual_verified"
    ) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "当前状态不可提交企业实名" })
    }
    await assertNoPending(input.organizationId)

    const companyName = input.companyName.trim()
    const uscc = input.uscc.trim().toUpperCase()
    const legalPersonName = input.legalPersonName.trim()
    if (companyName.length < 2) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "请输入企业名称" })
    }
    if (!isValidUscc(uscc)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "统一社会信用代码无效" })
    }
    if (legalPersonName.length < 2) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "请输入法人姓名" })
    }

    const kinds = new Set(input.attachments.map((a) => a.kind))
    if (!kinds.has("business_license")) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "请上传营业执照" })
    }
    if (input.applicantRole === "legal_person") {
      if (!kinds.has("id_front") || !kinds.has("id_back")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "请上传法人身份证正反面" })
      }
    } else {
      if (!input.authorizedPersonName?.trim()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "请填写授权人姓名" })
      }
      if (!kinds.has("id_front") || !kinds.has("id_back") || !kinds.has("auth_letter")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "请上传授权人身份证正反面及授权书",
        })
      }
    }
    for (const a of input.attachments) {
      if (!a.storageKey.startsWith("oss://")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "附件存储地址无效" })
      }
      if (!ALLOWED_CONTENT.has(a.contentType)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "附件类型不支持" })
      }
    }

    await ensureBillingTenant(db, input.organizationId, {
      organizationId: input.organizationId,
      name: companyName,
    })

    const type: ApplicationType =
      status === "individual_verified" ? "enterprise_upgrade" : "enterprise"
    const id = crypto.randomUUID()

    await db.transaction(async (tx) => {
      await tx.insert(identityVerificationApplication).values({
        id,
        organizationId: input.organizationId,
        tenantId: input.organizationId,
        type,
        status: "pending",
        companyName,
        uscc,
        legalPersonName,
        applicantRole: input.applicantRole,
        authorizedPersonName: input.authorizedPersonName?.trim() || null,
        submittedBy: input.userId,
      })
      if (input.attachments.length > 0) {
        await tx.insert(identityVerificationAttachment).values(
          input.attachments.map((a) => ({
            id: crypto.randomUUID(),
            applicationId: id,
            kind: a.kind,
            fileName: a.fileName,
            contentType: a.contentType,
            sizeBytes: a.sizeBytes,
            storageKey: a.storageKey,
          })),
        )
      }
      await tx
        .update(organization)
        .set({
          identityStatus: "pending",
          enterpriseVerificationStatus: "pending",
        })
        .where(eq(organization.id, input.organizationId))
    })

    return { applicationId: id, status: "pending" as const, type }
  },

  async submitRename(input: {
    organizationId: string
    userId: string
    newCompanyName: string
    reason?: string
    attachments: Array<{
      kind: "rename_proof" | "other"
      fileName: string
      contentType: string
      sizeBytes: number
      storageKey: string
    }>
  }) {
    const status = await getOrgIdentityStatus(input.organizationId)
    if (status !== "enterprise_verified") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "仅企业实名后可申请改名" })
    }
    await assertNoPending(input.organizationId)

    const newCompanyName = input.newCompanyName.trim()
    if (newCompanyName.length < 2) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "请输入新企业名称" })
    }
    if (input.attachments.length < 1) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "请上传改名证明材料" })
    }

    const id = crypto.randomUUID()
    await db.transaction(async (tx) => {
      await tx.insert(identityVerificationApplication).values({
        id,
        organizationId: input.organizationId,
        tenantId: input.organizationId,
        type: "rename",
        status: "pending",
        newCompanyName,
        renameReason: input.reason?.trim() || null,
        submittedBy: input.userId,
      })
      await tx.insert(identityVerificationAttachment).values(
        input.attachments.map((a) => ({
          id: crypto.randomUUID(),
          applicationId: id,
          kind: a.kind,
          fileName: a.fileName,
          contentType: a.contentType,
          sizeBytes: a.sizeBytes,
          storageKey: a.storageKey,
        })),
      )
      await tx
        .update(organization)
        .set({ identityStatus: "pending" })
        .where(eq(organization.id, input.organizationId))
    })

    return { applicationId: id, status: "pending" as const }
  },

  async ensureHarborAccount(tenantId: string, userId: string) {
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
    if (existing) return { username: existing.username, created: false }

    const harbor = getHarborClient()
    const projectName = `tenant-${tenantId}`
    const password = generateHarborPassword()

    const [user] = await db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, tenantId))
      .limit(1)
    const username = `user-${tenantId.slice(0, 8).toLowerCase()}`

    try {
      const exists = await harbor.userExists(username)
      if (exists) {
        await harbor.resetUserPassword(username, password)
      } else {
        await harbor.createUser(username, password, `${username}@gpu.local`, user?.name || username)
      }
    } catch (e) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Harbor 账户创建失败，请重试",
      })
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
      passwordEnc: encryptIdNumber(password),
      credentialType: "basic",
      scope: "project",
    })

    return { username, created: true }
  },
}
