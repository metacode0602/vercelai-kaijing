/** 个人收入 v2 · 共享常量与纯函数（客户端/服务端均可 import） */

export const NEW_BARE_METAL_LINE_TYPE = '新版裸金属'

export const PERSONAL_INCOME_SUMMARY_KINDS = {
  enterpriseProject: 'enterprise_project',
  nonProject: 'non_project',
  blacklist: 'blacklist',
  internal: 'internal',
} as const

export type PersonalIncomeSummaryKind =
  (typeof PERSONAL_INCOME_SUMMARY_KINDS)[keyof typeof PERSONAL_INCOME_SUMMARY_KINDS]

export type PersonalIncomeSegment = PersonalIncomeSummaryKind

export type BaremetalSourceMode = 'db' | 'excel'

export const PERSONAL_INCOME_SUMMARY_DISPLAY_ORDER: PersonalIncomeSummaryKind[] = [
  PERSONAL_INCOME_SUMMARY_KINDS.enterpriseProject,
  PERSONAL_INCOME_SUMMARY_KINDS.nonProject,
  PERSONAL_INCOME_SUMMARY_KINDS.blacklist,
  PERSONAL_INCOME_SUMMARY_KINDS.internal,
]

export function personalIncomeSummaryKindLabel(kind: PersonalIncomeSummaryKind): string {
  switch (kind) {
    case PERSONAL_INCOME_SUMMARY_KINDS.enterpriseProject:
      return 'B 端（项目租户）'
    case PERSONAL_INCOME_SUMMARY_KINDS.nonProject:
      return '个人收入（非项目租户）'
    case PERSONAL_INCOME_SUMMARY_KINDS.blacklist:
      return '黑名单租户'
    case PERSONAL_INCOME_SUMMARY_KINDS.internal:
      return '内部租户'
    default:
      return kind
  }
}

export function normalizeBillLineType(value: string | null | undefined): string {
  if (value == null || value === '') return ''
  return value.normalize('NFKC').trim().replace(/\s+/g, '')
}

export function isNewBareMetalBillLineType(billLineType: string | null | undefined): boolean {
  return normalizeBillLineType(billLineType) === NEW_BARE_METAL_LINE_TYPE
}

export function classifyPersonalIncomeSegment(input: {
  platformTenantId: string
  internalIds: Set<string>
  projectLinkedIds: Set<string>
  blacklistIds: Set<string>
}): PersonalIncomeSegment {
  const id = input.platformTenantId.trim()
  if (input.internalIds.has(id)) return PERSONAL_INCOME_SUMMARY_KINDS.internal
  if (input.projectLinkedIds.has(id)) return PERSONAL_INCOME_SUMMARY_KINDS.enterpriseProject
  if (input.blacklistIds.has(id)) return PERSONAL_INCOME_SUMMARY_KINDS.blacklist
  return PERSONAL_INCOME_SUMMARY_KINDS.nonProject
}

export const PERSONAL_INCOME_AMOUNT_TOLERANCE = 0.01
