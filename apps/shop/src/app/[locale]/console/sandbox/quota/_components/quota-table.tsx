"use client"

import { Button } from "@workspace/ui/components/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import type { SandboxQuotaItem } from "@/lib/sandbox-quota/types"

interface QuotaTableProps {
  quotas: SandboxQuotaItem[]
  onIncreaseLimit?: (quota: SandboxQuotaItem) => void
}

export function QuotaTable({ quotas, onIncreaseLimit }: QuotaTableProps) {
  return (
    <div className="relative w-full overflow-auto rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="min-w-[200px] px-4 py-2 text-left text-muted-foreground">
              Quota name
            </TableHead>
            <TableHead className="min-w-[100px] px-4 py-2 text-left text-muted-foreground">
              Current Limit
            </TableHead>
            <TableHead className="min-w-[120px] px-4 py-2 text-left text-muted-foreground">
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {quotas.map((quota) => (
            <TableRow key={quota.id}>
              <TableCell className="px-4 py-3.5 align-middle">
                {quota.name}
              </TableCell>
              <TableCell className="px-4 py-3.5 align-middle">
                {quota.currentLimit}
              </TableCell>
              <TableCell className="px-4 py-3.5 align-middle">
                {quota.action === "increase" ? (
                  <Button
                    variant="link"
                    className="h-9 p-0 text-sm text-primary"
                    onClick={() => onIncreaseLimit?.(quota)}
                  >
                    提高限制
                  </Button>
                ) : (
                  <span className="inline-flex h-9 items-center text-muted-foreground">
                    -
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
