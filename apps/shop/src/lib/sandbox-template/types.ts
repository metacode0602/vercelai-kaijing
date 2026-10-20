export type SandboxTemplateVisibility = "public" | "private"

export interface SandboxTemplate {
  id: string
  name: string
  cpuCount: number
  memoryMiB: number
  createdAt: string
  updatedAt: string
  visibility: SandboxTemplateVisibility
}

export interface SandboxTemplateVisibilityOption {
  value: "all" | SandboxTemplateVisibility
  label: string
}

export interface SandboxTemplateFilters {
  keyword: string
  cpuCores: number
  memoryMiB: number
  visibility: "all" | SandboxTemplateVisibility
}

export interface SandboxTemplatePageData {
  templates: SandboxTemplate[]
  pageSize: number
  labels: {
    searchPlaceholder: string
    templateCountSuffix: string
    cpuLabel: string
    cpuUnit: string
    memoryLabel: string
    memoryUnit: string
    visibilityLabel: string
    publicTooltip: string
  }
}
