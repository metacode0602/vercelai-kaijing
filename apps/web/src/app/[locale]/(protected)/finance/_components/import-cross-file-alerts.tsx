"use client"

import { downloadBase64Excel } from "@/lib/finance/import-error-download"
import { trpc } from "@/lib/trpc/client"
import { Button } from "@workspace/ui/components/button"
import { IconDownload, IconLoader2 } from "@tabler/icons-react"
import { useCallback, useState } from "react"
import { toast } from "sonner"

export type CrossFileImportError = {
  rowNo: number
  message: string
  cellValue?: string | null
}

const PREVIEW_LIMIT = 30

function uniqueUnknownTenantIds(errors: CrossFileImportError[]): string[] {
  const ids = new Set<string>()
  for (const err of errors) {
    const id = err.cellValue?.trim()
    if (id) ids.add(id)
  }
  return [...ids].sort()
}

type ImportCrossFileAlertsProps = {
  billingPeriodId: string
  windowId?: string | null
  errors: CrossFileImportError[]
  hasErrorReport?: boolean
}

export function ImportCrossFileAlerts({
  billingPeriodId,
  windowId,
  errors,
  hasErrorReport = false,
}: ImportCrossFileAlertsProps) {
  const utils = trpc.useUtils()
  const [downloading, setDownloading] = useState(false)

  const handleDownload = useCallback(async () => {
    setDownloading(true)
    try {
      const report = await utils.finance.periods.downloadImportErrorReport.fetch({
        billingPeriodId,
        slot: "tenantBill",
        windowId: windowId ?? undefined,
      })
      downloadBase64Excel(report.fileName, report.fileBase64)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "下载忽略明细失败")
    } finally {
      setDownloading(false)
    }
  }, [billingPeriodId, utils.finance.periods.downloadImportErrorReport, windowId])

  if (errors.length === 0) return null

  const unknownIds = uniqueUnknownTenantIds(errors)
  const preview = errors.slice(0, PREVIEW_LIMIT)

  return (
    <div
      className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100 space-y-2"
      role="status"
    >
      <p className="font-medium">以下租户不在 CRM 主数据中，成本计算已自动忽略</p>
      <p className="text-amber-900/90 dark:text-amber-100/90">
        共 {unknownIds.length > 0 ? unknownIds.length : "若干"} 个租户 ID、{errors.length}{" "}
        行账单明细未参与本次成本计算；已在 CRM 维护的租户仍正常计算。
      </p>

      {unknownIds.length > 0 ? (
        <div>
          <p className="font-medium">已忽略的租户 ID：</p>
          <p className="mt-1 break-all font-mono text-xs">{unknownIds.join("、")}</p>
        </div>
      ) : null}

      <div>
        <p className="font-medium">忽略明细（按 Excel 行号）：</p>
        <ul className="mt-1 max-h-40 overflow-y-auto list-inside list-disc space-y-0.5">
          {preview.map((err, idx) => (
            <li key={`${err.rowNo}-${err.cellValue ?? ""}-${idx}`}>
              第 {err.rowNo} 行
              {err.cellValue ? (
                <>
                  {" "}
                  · 租户 ID <span className="font-mono">{err.cellValue}</span>
                </>
              ) : null}
              {" · "}
              {err.message}
            </li>
          ))}
        </ul>
        {errors.length > PREVIEW_LIMIT ? (
          <p className="mt-1 text-xs opacity-80">
            另有 {errors.length - PREVIEW_LIMIT} 行未列出，请下载完整明细查看。
          </p>
        ) : null}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-amber-600/40 text-amber-950 hover:bg-amber-500/15 dark:text-amber-100"
        disabled={downloading}
        onClick={() => void handleDownload()}
      >
        {downloading ? (
          <IconLoader2 className="mr-1 size-4 animate-spin" />
        ) : (
          <IconDownload className="mr-1 size-4" />
        )}
        下载忽略明细 Excel（含错误说明列）
      </Button>
      {!hasErrorReport ? (
        <p className="text-xs opacity-80">
          若下载失败，请重新上传客户账单后系统将自动生成明细文件。
        </p>
      ) : null}
    </div>
  )
}
