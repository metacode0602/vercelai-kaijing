export type SandboxOverviewActionVariant = "primary" | "outline" | "inverse"

export interface SandboxOverviewAction {
  id: string
  label: string
  href?: string
  external?: boolean
  variant: SandboxOverviewActionVariant
}

export interface SandboxOverviewHero {
  title: string
  features: string[]
  actions: SandboxOverviewAction[]
}

export interface SandboxCodeTab {
  id: string
  label: string
  code: string
}

export interface SandboxCodeSection {
  id: string
  tabs: SandboxCodeTab[]
  defaultTabId: string
}

export interface SandboxGuideStep {
  id: string
  stepNumber: number
  title: string
  description?: string
  actions?: SandboxOverviewAction[]
  codeSections?: SandboxCodeSection[]
  runCommandHint?: string
  runCommand?: SandboxCodeSection
}

export interface SandboxOverviewPageData {
  hero: SandboxOverviewHero
  steps: SandboxGuideStep[]
}
