import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  assertOnboardingDocumentsReady,
  DEFAULT_ONBOARDING_DOCUMENT_REQUIREMENTS,
} from "./onboarding-document-requirements"

const individualBase = {
  subjectType: "individual",
  companyName: "张三",
  registrationNo: "12345678",
  contactName: "张三",
  contactPhone: "+94771234567",
  licenseFileKey: "uploads/license.jpg",
}

const enterpriseLegalRepBase = {
  subjectType: "enterprise",
  companyName: "示例企业有限公司",
  registrationNo: "91310000MA1FL0001X",
  contactName: "李四",
  contactPhone: "+94771234567",
  licenseFileKey: "uploads/license.jpg",
  legalRepresentative: "王五",
  handlerType: "legal_rep",
  legalRepIdNo: "110101199001011234",
  legalRepIdFrontKey: "uploads/id-front.jpg",
  legalRepIdBackKey: "uploads/id-back.jpg",
}

describe("assertOnboardingDocumentsReady", () => {
  it("skips license upload when not required", () => {
    assertOnboardingDocumentsReady(
      { ...individualBase, licenseFileKey: null },
      { ...DEFAULT_ONBOARDING_DOCUMENT_REQUIREMENTS, requireLicenseFile: false },
    )
  })

  it("requires license when configured", () => {
    assert.throws(() => {
      assertOnboardingDocumentsReady(
        { ...individualBase, licenseFileKey: null },
        DEFAULT_ONBOARDING_DOCUMENT_REQUIREMENTS,
      )
    }, /营业执照/)
  })

  it("skips legal rep id images when not required but keeps id number", () => {
    assertOnboardingDocumentsReady(
      {
        ...enterpriseLegalRepBase,
        legalRepIdFrontKey: null,
        legalRepIdBackKey: null,
      },
      { ...DEFAULT_ONBOARDING_DOCUMENT_REQUIREMENTS, requireLegalRepIdImages: false },
    )
  })
})