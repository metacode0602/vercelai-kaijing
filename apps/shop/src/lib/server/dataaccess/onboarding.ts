import { createId } from '@paralleldrive/cuid2'
import { isOwnerIdentity } from '@workspace/auth'
import { and, eq, inArray, ne } from 'drizzle-orm'
import {
  auditEvents,
  member,
  organization,
  tenantOnboardingApplications,
  type OnboardingHandlerType,
  type OnboardingStatus,
  type OnboardingSubjectType,
} from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

export type OnboardingApplicationDto =
  typeof tenantOnboardingApplications.$inferSelect

export type OnboardingStateDto = {
  status: OnboardingStatus | 'not_started'
  organizationId: string | null
  organizationName: string | null
  organizationRole: string | null
  organizationStatus: string | null
  entryApproved: boolean
  canEdit: boolean
  bindingAllowed: boolean
  application: OnboardingApplicationDto | null
}

export type SaveOnboardingStepInput = {
  subjectType: OnboardingSubjectType
  companyName: string
  registrationNo?: string | null
  countryCode: string
  handlerType?: OnboardingHandlerType
  legalRepresentative?: string | null
  legalRepIdNo?: string | null
  legalRepIdFrontKey?: string | null
  legalRepIdBackKey?: string | null
  authorizationFileKey?: string | null
  agentName?: string | null
  agentIdNo?: string | null
  agentIdFrontKey?: string | null
  agentIdBackKey?: string | null
  contactName: string
  contactPhone: string
  contactEmail?: string | null
  licenseFileKey?: string | null
  licenseFileName?: string | null
}

type MembershipWithApplication = {
  organizationId: string
  organizationName: string
  organizationRole: string
  organizationStatus: string
  entryApproved: boolean
  application: OnboardingApplicationDto | null
}

async function findTenantMembership(
  db: DbLike,
  userId: string,
  organizationId: string,
): Promise<{
  organizationId: string
  organizationName: string
  role: string
  organizationStatus: string
  entryApproved: boolean
} | null> {
  const [row] = await db
    .select({
      organizationId: organization.id,
      organizationName: organization.name,
      role: member.role,
      organizationStatus: organization.status,
      entryApproved: organization.entryApproved,
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(
      and(
        eq(member.userId, userId),
        eq(organization.orgType, 'tenant'),
        eq(organization.id, organizationId),
      ),
    )
    .limit(1)
  return row ?? null
}

async function findApplication(
  db: DbLike,
  organizationId: string,
): Promise<OnboardingApplicationDto | null> {
  const [row] = await db
    .select()
    .from(tenantOnboardingApplications)
    .where(eq(tenantOnboardingApplications.organizationId, organizationId))
    .limit(1)
  return row ?? null
}

async function loadMembershipWithApplication(
  db: DbLike,
  userId: string,
  organizationId: string | null | undefined,
): Promise<MembershipWithApplication | null> {
  if (!organizationId) return null
  const membership = await findTenantMembership(db, userId, organizationId)
  if (!membership) return null
  const application = await findApplication(db, membership.organizationId)
  return {
    organizationId: membership.organizationId,
    organizationName: membership.organizationName,
    organizationRole: membership.role,
    organizationStatus: membership.organizationStatus,
    entryApproved: membership.entryApproved,
    application,
  }
}

export async function getOnboardingState(
  db: AppDatabase,
  userId: string,
  organizationId?: string | null,
): Promise<OnboardingStateDto> {
  const membership = await loadMembershipWithApplication(db, userId, organizationId)
  if (!membership) {
    return {
      status: 'not_started',
      organizationId: null,
      organizationName: null,
      organizationRole: null,
      organizationStatus: null,
      entryApproved: false,
      canEdit: true,
      bindingAllowed: false,
      application: null,
    }
  }
  const status = (membership.application?.status ?? 'not_started') as
    | OnboardingStatus
    | 'not_started'
  return {
    status,
    organizationId: membership.organizationId,
    organizationName: membership.organizationName,
    organizationRole: membership.organizationRole,
    organizationStatus: membership.organizationStatus,
    entryApproved: membership.entryApproved,
    canEdit: status === 'draft' || status === 'rejected' || status === 'not_started',
    bindingAllowed: isShopBindingAllowed({ status }),
    application: membership.application,
  }
}

function canStart(status: OnboardingStatus | undefined) {
  return status == null || status === 'draft' || status === 'rejected'
}

function seedName(name: string) {
  return name === '待完善企业信息' || name === '待完善个人信息' ? '' : name
}

export async function startOnboarding(
  db: AppDatabase,
  input: {
    userId: string
    subjectType: OnboardingSubjectType
    countryCode: string
    nameHint?: string | null
    organizationId?: string | null
  },
): Promise<{ organizationId: string; applicationId: string }> {
  return db.transaction(async (tx) => {
    const membership = input.organizationId
      ? await findTenantMembership(tx, input.userId, input.organizationId)
      : null
    if (input.organizationId && !membership) {
      throw new Error('当前组织不存在或你不是组织成员')
    }
    if (!membership) {
      const [existing] = await tx
        .select({ id: member.id })
        .from(member)
        .innerJoin(organization, eq(member.organizationId, organization.id))
        .where(and(eq(member.userId, input.userId), eq(organization.orgType, 'tenant')))
        .limit(1)
      if (existing) {
        throw new Error('你已属于其他组织，请先选择组织后再开始入驻')
      }
    }
    if (membership) {
      const application = await findApplication(tx, membership.organizationId)
      if (!canStart(application?.status as OnboardingStatus | undefined)) {
        throw new Error('入驻申请已提交，不能重新开始')
      }
      if (application) {
        return {
          organizationId: membership.organizationId,
          applicationId: application.id,
        }
      }
      if (!isOwnerIdentity(membership.role)) {
        throw new Error('仅组织所有者可创建入驻申请')
      }
      const now = new Date()
      const applicationId = createId()
      await tx.insert(tenantOnboardingApplications).values({
        id: applicationId,
        organizationId: membership.organizationId,
        applicantUserId: input.userId,
        subjectType: input.subjectType,
        companyName: seedName(membership.organizationName),
        countryCode: input.countryCode,
        handlerType: 'legal_rep',
        contactName: input.nameHint?.trim() || seedName(membership.organizationName),
        contactPhone: '',
        status: 'draft',
        version: 1,
        metadata: {},
        createdAt: now,
        updatedAt: now,
      })
      return { organizationId: membership.organizationId, applicationId }
    }

    const now = new Date()
    const organizationId = createId()
    const applicationId = createId()
    const organizationName =
      input.subjectType === 'enterprise'
        ? '待完善企业信息'
        : input.nameHint?.trim() || '待完善个人信息'

    await tx.insert(organization).values({
      id: organizationId,
      name: organizationName,
      slug: `tenant-${organizationId.slice(0, 12)}`,
      createdAt: now,
      orgType: 'tenant',
      merchantStatus: 'pending',
      identityStatus: 'unverified',
      enterpriseVerificationStatus: 'unverified',
      entryApproved: false,
      isCurrent: false,
      status: 'active',
      metadata: { onboardingSubjectType: input.subjectType },
    })

    await tx.insert(member).values({
      id: createId(),
      organizationId,
      userId: input.userId,
      role: 'tenant_owner',
      createdAt: now,
    })

    await tx.insert(tenantOnboardingApplications).values({
      id: applicationId,
      organizationId,
      applicantUserId: input.userId,
      subjectType: input.subjectType,
      companyName: '',
      countryCode: input.countryCode,
      handlerType: 'legal_rep',
      contactName: input.nameHint?.trim() || '',
      contactPhone: '',
      status: 'draft',
      version: 1,
      metadata: {},
      createdAt: now,
      updatedAt: now,
    })

    return { organizationId, applicationId }
  })
}

export async function saveOnboardingStep(
  db: AppDatabase,
  input: SaveOnboardingStepInput & { userId: string; organizationId?: string | null },
): Promise<{ version: number; status: OnboardingStatus }> {
  return db.transaction(async (tx) => {
    const membership = await loadMembershipWithApplication(
      tx,
      input.userId,
      input.organizationId,
    )
    if (!membership?.application) {
      throw new Error('请先开始入驻')
    }
    const application = membership.application
    if (application.status !== 'draft' && application.status !== 'rejected') {
      throw new Error('当前申请不可编辑')
    }

    const subjectType = input.subjectType
    const handlerType: OnboardingHandlerType =
      subjectType === 'enterprise' ? input.handlerType ?? 'legal_rep' : 'legal_rep'
    const isEnterprise = subjectType === 'enterprise'

    await tx
      .update(tenantOnboardingApplications)
      .set({
        subjectType,
        companyName: input.companyName.trim(),
        registrationNo: input.registrationNo?.trim() || null,
        countryCode: input.countryCode.trim().toUpperCase(),
        handlerType,
        legalRepresentative: isEnterprise ? input.legalRepresentative?.trim() || null : null,
        legalRepIdNo:
          isEnterprise && handlerType === 'legal_rep'
            ? input.legalRepIdNo?.trim() || null
            : null,
        legalRepIdFrontKey:
          isEnterprise && handlerType === 'legal_rep'
            ? input.legalRepIdFrontKey || null
            : null,
        legalRepIdBackKey:
          isEnterprise && handlerType === 'legal_rep'
            ? input.legalRepIdBackKey || null
            : null,
        authorizationFileKey:
          isEnterprise && handlerType === 'authorized_agent'
            ? input.authorizationFileKey || null
            : null,
        agentName:
          isEnterprise && handlerType === 'authorized_agent'
            ? input.agentName?.trim() || null
            : null,
        agentIdNo:
          isEnterprise && handlerType === 'authorized_agent'
            ? input.agentIdNo?.trim() || null
            : null,
        agentIdFrontKey:
          isEnterprise && handlerType === 'authorized_agent'
            ? input.agentIdFrontKey || null
            : null,
        agentIdBackKey:
          isEnterprise && handlerType === 'authorized_agent'
            ? input.agentIdBackKey || null
            : null,
        contactName: input.contactName.trim(),
        contactPhone: input.contactPhone.trim(),
        contactEmail: input.contactEmail?.trim() || null,
        licenseFileKey: input.licenseFileKey || null,
        licenseFileName: input.licenseFileName?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(tenantOnboardingApplications.id, application.id))

    await tx
      .update(organization)
      .set({
        name: input.companyName.trim(),
        merchantStatus: 'pending',
        identityStatus: 'unverified',
      })
      .where(eq(organization.id, membership.organizationId))

    return { version: application.version, status: application.status }
  })
}

function assertApplicationReady(application: OnboardingApplicationDto) {
  if (application.companyName.trim().length < 2) {
    throw new Error('请输入有效的主体名称')
  }
  const registrationNo = application.registrationNo?.trim() ?? ''
  const registrationNoMin = application.subjectType === 'enterprise' ? 8 : 4
  if (registrationNo.length < registrationNoMin || registrationNo.length > 32) {
    throw new Error(
      application.subjectType === 'enterprise'
        ? '企业注册号需为 8–32 位字母数字'
        : '证件号需为 4–32 位字母数字',
    )
  }
  if (!application.contactName.trim() || !application.contactPhone.trim()) {
    throw new Error('请填写联系人姓名和电话')
  }
  if (!application.licenseFileKey) {
    throw new Error('请上传营业执照 / 证件照片')
  }
  if (application.subjectType === 'enterprise') {
    if (!application.legalRepresentative?.trim()) {
      throw new Error('请填写法定代表人')
    }
    if (!application.handlerType || !['legal_rep', 'authorized_agent'].includes(application.handlerType)) {
      throw new Error('请选择办理方式')
    }
    if (application.handlerType === 'legal_rep') {
      if (
        !application.legalRepIdNo?.trim() ||
        !application.legalRepIdFrontKey ||
        !application.legalRepIdBackKey
      ) {
        throw new Error('本人办理需填写法人身份证号并上传身份证正反面')
      }
    } else if (
      !application.authorizationFileKey ||
      !application.agentName?.trim() ||
      !application.agentIdNo?.trim() ||
      !application.agentIdFrontKey ||
      !application.agentIdBackKey
    ) {
      throw new Error('授权办理需上传授权书、填写授权人信息并上传身份证正反面')
    }
  }
}

export async function submitOnboarding(
  db: AppDatabase,
  input: { userId: string; organizationId?: string | null; agreement: true },
): Promise<{ status: 'submitted'; version: number }> {
  return db.transaction(async (tx) => {
    if (!input.agreement) {
      throw new Error('请先阅读并同意《卖家服务协议》和《隐私政策》')
    }
    const membership = await loadMembershipWithApplication(
      tx,
      input.userId,
      input.organizationId,
    )
    if (!membership?.application) {
      throw new Error('请先开始入驻')
    }
    const application = membership.application
    if (application.status !== 'draft' && application.status !== 'rejected') {
      throw new Error('当前申请不可提交')
    }
    assertApplicationReady(application)

    if (application.registrationNo) {
      const duplicates = await tx
        .select({ id: tenantOnboardingApplications.id })
        .from(tenantOnboardingApplications)
        .where(
          and(
            eq(tenantOnboardingApplications.countryCode, application.countryCode),
            eq(tenantOnboardingApplications.registrationNo, application.registrationNo),
            inArray(tenantOnboardingApplications.status, ['submitted', 'approved']),
            ne(tenantOnboardingApplications.id, application.id),
          ),
        )
        .limit(1)
      if (duplicates.length > 0) {
        throw new Error('该国家 / 地区下的注册号已被其他租户提交')
      }
    }

    const now = new Date()
    const nextVersion =
      application.status === 'rejected' ? application.version + 1 : application.version

    await tx
      .update(tenantOnboardingApplications)
      .set({
        status: 'submitted',
        version: nextVersion,
        submittedAt: now,
        reviewedAt: null,
        reviewedBy: null,
        reviewNote: null,
        updatedAt: now,
      })
      .where(eq(tenantOnboardingApplications.id, application.id))

    await tx
      .update(organization)
      .set({
        merchantStatus: 'pending',
        identityStatus: 'pending',
        entryApproved: false,
      })
      .where(eq(organization.id, membership.organizationId))

    await tx.insert(auditEvents).values({
      organizationId: membership.organizationId,
      actorUserId: input.userId,
      action: 'onboarding.submit',
      entityType: 'tenant_onboarding_application',
      entityId: application.id,
      before: { status: application.status, version: application.version },
      after: { status: 'submitted', version: nextVersion },
      result: 'success',
    })

    return { status: 'submitted' as const, version: nextVersion }
  })
}

export function isShopBindingAllowed(
  state: Pick<OnboardingStateDto, 'status'>,
  requiresApproval = process.env.SHOP_BINDING_REQUIRES_APPROVAL === 'true',
) {
  if (state.status === 'approved') return true
  if (requiresApproval) return false
  return state.status === 'submitted'
}
