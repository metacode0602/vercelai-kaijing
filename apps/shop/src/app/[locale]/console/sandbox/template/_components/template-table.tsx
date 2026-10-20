"use client"

import { Globe } from "lucide-react"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@workspace/ui/components/pagination"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"
import { formatSandboxTemplateDateTime } from "@/lib/sandbox-template/data"
import type { SandboxTemplate } from "@/lib/sandbox-template/types"

interface TemplateTableProps {
  templates: SandboxTemplate[]
  page: number
  totalPages: number
  publicTooltip: string
  onPageChange: (page: number) => void
  onCopyTemplateId?: (templateId: string) => void
}

export function TemplateTable({
  templates,
  page,
  totalPages,
  publicTooltip,
  onPageChange,
  onCopyTemplateId,
}: TemplateTableProps) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-2">
      <div className="relative w-full overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="min-w-[120px] px-4 py-2 text-left text-muted-foreground md:min-w-[150px] xl:min-w-[200px]">
                Template ID
              </TableHead>
              <TableHead className="min-w-[120px] px-4 py-2 text-left text-muted-foreground md:min-w-[190px] xl:min-w-[200px]">
                Template Name
              </TableHead>
              <TableHead className="min-w-[120px] px-4 py-2 text-left text-muted-foreground md:min-w-[150px] xl:min-w-[200px]">
                CPU Count
              </TableHead>
              <TableHead className="min-w-[120px] px-4 py-2 text-left text-muted-foreground md:min-w-[110px] xl:min-w-[200px]">
                Memory
              </TableHead>
              <TableHead className="min-w-[120px] px-4 py-2 text-left text-muted-foreground md:min-w-[150px] xl:min-w-[200px]">
                Created At
              </TableHead>
              <TableHead className="min-w-[120px] px-4 py-2 text-left text-muted-foreground md:min-w-[150px] xl:min-w-[200px]">
                Updated At
              </TableHead>
              <TableHead className="min-w-[120px] px-4 py-2 text-left text-muted-foreground md:min-w-[100px] xl:min-w-[120px]">
                Visibility
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((template) => (
              <TableRow key={template.id}>
                <TableCell className="px-4 py-3.5 align-middle">
                  <button
                    type="button"
                    className="cursor-pointer font-mono text-sm text-foreground hover:text-primary"
                    onClick={() => onCopyTemplateId?.(template.id)}
                  >
                    {template.id}
                  </button>
                </TableCell>
                <TableCell className="px-4 py-3.5 align-middle">
                  <span className="flex flex-row items-center gap-1">
                    <span className="text-foreground">{template.name}</span>
                    {template.visibility === "public" ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Globe
                              className="size-4 text-muted-foreground"
                              aria-label={publicTooltip}
                            />
                          </TooltipTrigger>
                          <TooltipContent>{publicTooltip}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell className="px-4 py-3.5 align-middle">
                  <span>
                    <span className="text-primary">{template.cpuCount} </span>
                    <span className="text-foreground">核心</span>
                  </span>
                </TableCell>
                <TableCell className="px-4 py-3.5 align-middle">
                  <span>
                    <span className="text-primary">{template.memoryMiB} </span>
                    <span className="text-foreground">MiB</span>
                  </span>
                </TableCell>
                <TableCell className="px-4 py-3.5 align-middle text-foreground">
                  {formatSandboxTemplateDateTime(template.createdAt)}
                </TableCell>
                <TableCell className="px-4 py-3.5 align-middle text-foreground">
                  {formatSandboxTemplateDateTime(template.updatedAt)}
                </TableCell>
                <TableCell className="px-4 py-3.5 align-middle capitalize text-foreground">
                  {template.visibility}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 0 ? (
        <Pagination className="mt-8 justify-end" aria-label="分页">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                text="上一页"
                onClick={(event) => {
                  event.preventDefault()
                  if (page > 1) onPageChange(page - 1)
                }}
                aria-disabled={page <= 1}
                className={cn(
                  "h-8 text-foreground",
                  page <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer",
                )}
              />
            </PaginationItem>

            <PaginationItem>
              <PaginationLink
                isActive
                onClick={(event) => event.preventDefault()}
                className="size-8 cursor-default"
              >
                {page}
              </PaginationLink>
            </PaginationItem>

            <PaginationItem>
              <PaginationNext
                text="下一页"
                onClick={(event) => {
                  event.preventDefault()
                  if (page < totalPages) onPageChange(page + 1)
                }}
                aria-disabled={page >= totalPages}
                className={cn(
                  "h-8 text-foreground",
                  page >= totalPages
                    ? "pointer-events-none opacity-50"
                    : "cursor-pointer",
                )}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}
    </div>
  )
}
