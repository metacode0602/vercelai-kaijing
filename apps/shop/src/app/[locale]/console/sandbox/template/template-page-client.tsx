"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  filterSandboxTemplates,
  getDefaultSandboxTemplateFilters,
  paginateSandboxTemplates,
} from "@/lib/sandbox-template/data"
import type {
  SandboxTemplateFilters,
  SandboxTemplatePageData,
} from "@/lib/sandbox-template/types"
import { TemplateFilters } from "./_components/template-filters"
import { TemplateTable } from "./_components/template-table"

interface TemplatePageClientProps {
  initialData: SandboxTemplatePageData
}

export function TemplatePageClient({ initialData }: TemplatePageClientProps) {
  const [filters, setFilters] = useState<SandboxTemplateFilters>(
    getDefaultSandboxTemplateFilters,
  )
  const [page, setPage] = useState(1)

  const filteredTemplates = useMemo(
    () => filterSandboxTemplates(initialData.templates, filters),
    [initialData.templates, filters],
  )

  const totalPages = Math.max(
    1,
    Math.ceil(filteredTemplates.length / initialData.pageSize),
  )

  const paginatedTemplates = useMemo(
    () => paginateSandboxTemplates(filteredTemplates, page, initialData.pageSize),
    [filteredTemplates, page, initialData.pageSize],
  )

  useEffect(() => {
    setPage(1)
  }, [filters])

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  function handleCopyTemplateId(templateId: string) {
    void navigator.clipboard.writeText(templateId)
    toast.success("Template ID 已复制")
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-6">
      <div className="flex flex-col gap-4">
        <TemplateFilters
          filters={filters}
          totalCount={filteredTemplates.length}
          labels={initialData.labels}
          onKeywordChange={(keyword) =>
            setFilters((prev) => ({ ...prev, keyword }))
          }
          onCpuCoresChange={(cpuCores) =>
            setFilters((prev) => ({ ...prev, cpuCores }))
          }
          onMemoryMiBChange={(memoryMiB) =>
            setFilters((prev) => ({ ...prev, memoryMiB }))
          }
          onVisibilityChange={(visibility) =>
            setFilters((prev) => ({ ...prev, visibility }))
          }
        />

        <TemplateTable
          templates={paginatedTemplates}
          page={page}
          totalPages={totalPages}
          publicTooltip={initialData.labels.publicTooltip}
          onPageChange={setPage}
          onCopyTemplateId={handleCopyTemplateId}
        />
      </div>
    </div>
  )
}
