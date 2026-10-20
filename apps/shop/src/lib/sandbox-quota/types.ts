export type SandboxTierId = "free" | "paid" | "enterprise"

export interface SandboxTier {
  id: SandboxTierId
  label: string
}

export type SandboxQuotaActionType = "increase" | "none"

export interface SandboxQuotaItem {
  id: string
  name: string
  currentLimit: string
  action: SandboxQuotaActionType
}

export interface SandboxQuotaCustomSection {
  title: string
  description: string
  contactLabel: string
}

export interface SandboxQuotaPageData {
  tier: SandboxTier
  quotas: SandboxQuotaItem[]
  pricingHref: string
  customQuota: SandboxQuotaCustomSection
}
