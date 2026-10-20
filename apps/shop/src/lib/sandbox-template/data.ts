import type {
  SandboxTemplate,
  SandboxTemplateFilters,
  SandboxTemplatePageData,
  SandboxTemplateVisibilityOption,
} from "./types"

export const SANDBOX_TEMPLATE_VISIBILITY_OPTIONS: SandboxTemplateVisibilityOption[] =
  [
    { value: "all", label: "全部" },
    { value: "public", label: "Public" },
    { value: "private", label: "Private" },
  ]

/** 演示数据；接入 API 后替换为真实数据源 */
const MOCK_SANDBOX_TEMPLATES: SandboxTemplate[] = [
  {
    id: "kk065fn4aju6x2v0ghgk",
    name: "base",
    cpuCount: 1,
    memoryMiB: 512,
    createdAt: "2026-06-08T08:38:00.000Z",
    updatedAt: "2026-06-08T08:42:00.000Z",
    visibility: "public",
  },
  {
    id: "ey23rva572ael79qxmtv",
    name: "code-interpreter-v1",
    cpuCount: 2,
    memoryMiB: 1024,
    createdAt: "2026-06-08T08:47:00.000Z",
    updatedAt: "2026-06-08T08:51:00.000Z",
    visibility: "public",
  },
  {
    id: "k5eovgvu6ae6sdpvu84m",
    name: "desktop",
    cpuCount: 8,
    memoryMiB: 8192,
    createdAt: "2026-06-08T08:57:00.000Z",
    updatedAt: "2026-06-10T04:56:00.000Z",
    visibility: "public",
  },
  {
    id: "2ozhd37f7iiufpzkvvmh",
    name: "browser-chromium",
    cpuCount: 2,
    memoryMiB: 1024,
    createdAt: "2026-06-08T09:05:00.000Z",
    updatedAt: "2026-06-08T09:16:00.000Z",
    visibility: "public",
  },
]

const MOCK_SANDBOX_TEMPLATE_PAGE_DATA: SandboxTemplatePageData = {
  templates: MOCK_SANDBOX_TEMPLATES,
  pageSize: 10,
  labels: {
    searchPlaceholder: "查找模板",
    templateCountSuffix: "模板",
    cpuLabel: "CPU 核心",
    cpuUnit: "核心",
    memoryLabel: "内存",
    memoryUnit: "MiB",
    visibilityLabel: "可见性",
    publicTooltip: "公开模板",
  },
}

export async function getSandboxTemplatePageData(): Promise<SandboxTemplatePageData> {
  return MOCK_SANDBOX_TEMPLATE_PAGE_DATA
}

export function getDefaultSandboxTemplateFilters(): SandboxTemplateFilters {
  return {
    keyword: "",
    cpuCores: 1,
    memoryMiB: 512,
    visibility: "all",
  }
}

export function formatSandboxTemplateDateTime(iso: string): string {
  const date = new Date(iso)
  const day = String(date.getUTCDate()).padStart(2, "0")
  const month = new Intl.DateTimeFormat("en-GB", {
    month: "short",
    timeZone: "UTC",
  }).format(date)
  const year = date.getUTCFullYear()
  const hours = String(date.getUTCHours()).padStart(2, "0")
  const minutes = String(date.getUTCMinutes()).padStart(2, "0")

  return `${day} ${month} ${year}, ${hours}:${minutes}`
}

export function filterSandboxTemplates(
  templates: SandboxTemplate[],
  filters: SandboxTemplateFilters,
): SandboxTemplate[] {
  const keyword = filters.keyword.trim().toLowerCase()

  return templates.filter((template) => {
    if (
      keyword &&
      !template.id.toLowerCase().includes(keyword) &&
      !template.name.toLowerCase().includes(keyword)
    ) {
      return false
    }

    if (template.cpuCount < filters.cpuCores) return false
    if (template.memoryMiB < filters.memoryMiB) return false
    if (
      filters.visibility !== "all" &&
      template.visibility !== filters.visibility
    ) {
      return false
    }

    return true
  })
}

export function paginateSandboxTemplates<T>(
  items: T[],
  page: number,
  pageSize: number,
): T[] {
  const start = (page - 1) * pageSize
  return items.slice(start, start + pageSize)
}
