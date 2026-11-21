import { z } from "zod"

export const PLATFORM_SETTINGS_GLOBAL_ID = "global"

export const onboardingDocumentRequirementsSchema = z.object({
  requireLicenseFile: z.boolean(),
  requireLegalRepIdImages: z.boolean(),
  requireAuthorizationFile: z.boolean(),
  requireAgentIdImages: z.boolean(),
})

export type OnboardingDocumentRequirements = z.infer<
  typeof onboardingDocumentRequirementsSchema
>

export const DEFAULT_ONBOARDING_DOCUMENT_REQUIREMENTS: OnboardingDocumentRequirements = {
  requireLicenseFile: true,
  requireLegalRepIdImages: true,
  requireAuthorizationFile: true,
  requireAgentIdImages: true,
}

export type OnboardingDocumentCheckInput = {
  subjectType: string
  companyName: string
  registrationNo?: string | null
  contactName: string
  contactPhone: string
  licenseFileKey?: string | null
  legalRepresentative?: string | null
  handlerType?: string | null
  legalRepIdNo?: string | null
  legalRepIdFrontKey?: string | null
  legalRepIdBackKey?: string | null
  authorizationFileKey?: string | null
  agentName?: string | null
  agentIdNo?: string | null
  agentIdFrontKey?: string | null
  agentIdBackKey?: string | null
}

export function parseOnboardingDocumentRequirements(
  value: unknown,
): OnboardingDocumentRequirements {
  const parsed = onboardingDocumentRequirementsSchema.safeParse(value)
  return parsed.success ? parsed.data : { ...DEFAULT_ONBOARDING_DOCUMENT_REQUIREMENTS }
}

export function assertOnboardingDocumentsReady(
  application: OnboardingDocumentCheckInput,
  requirements: OnboardingDocumentRequirements = DEFAULT_ONBOARDING_DOCUMENT_REQUIREMENTS,
): void {
  if (application.companyName.trim().length < 2) {
    throw new Error("请输入有效的主体名称")
  }
  const registrationNo = application.registrationNo?.trim() ?? ""
  const registrationNoMin = application.subjectType === "enterprise" ? 8 : 4
  if (registrationNo.length < registrationNoMin || registrationNo.length > 32) {
    throw new Error(
      application.subjectType === "enterprise"
        ? "企业注册号需为 8–32 位字母数字"
        : "证件号需为 4–32 位字母数字",
    )
  }
  if (!application.contactName.trim() || !application.contactPhone.trim()) {
    throw new Error("请填写联系人姓名和电话")
  }
  if (requirements.requireLicenseFile && !application.licenseFileKey) {
    throw new Error("请上传营业执照 / 证件照片")
  }
  if (application.subjectType === "enterprise") {
    if (!application.legalRepresentative?.trim()) {
      throw new Error("请填写法定代表人")
    }
    if (
      !application.handlerType ||
      !["legal_rep", "authorized_agent"].includes(application.handlerType)
    ) {
      throw new Error("请选择办理方式")
    }
    if (application.handlerType === "legal_rep") {
      if (!application.legalRepIdNo?.trim()) {
        throw new Error("本人办理需填写法人身份证号")
      }
      if (requirements.requireLegalRepIdImages) {
        if (!application.legalRepIdFrontKey || !application.legalRepIdBackKey) {
          throw new Error("本人办理需上传法人身份证正反面")
        }
      }
    } else if (
      !application.agentName?.trim() ||
      !application.agentIdNo?.trim()
    ) {
      throw new Error("授权办理需填写授权人姓名与身份证号")
    } else {
      if (requirements.requireAuthorizationFile && !application.authorizationFileKey) {
        throw new Error("授权办理需上传《企业授权书》")
      }
      if (
        requirements.requireAgentIdImages &&
        (!application.agentIdFrontKey || !application.agentIdBackKey)
      ) {
        throw new Error("授权办理需上传授权人身份证正反面")
      }
    }
  }
}