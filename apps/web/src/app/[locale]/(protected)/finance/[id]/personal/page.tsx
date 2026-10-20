"use client"

import { BaremetalDbImportPanel } from "@/app/[locale]/(protected)/finance/_components/baremetal-db-import-panel"
import { PersonalIncomeTenantDetailDrawer } from "@/app/[locale]/(protected)/finance/_components/personal-income-tenant-detail-drawer"
import { PersonalIncomeEnterpriseCrossCheckDrawer } from "@/app/[locale]/(protected)/finance/_components/personal-income-enterprise-cross-check-drawer"
import { formatMoney } from "@/app/[locale]/(protected)/finance/_lib/display"
import { isPublishedPeriodStatus } from "@/app/[locale]/(protected)/finance/_lib/period"
import {
  downloadExcludedProjectTenantsExcel,
  formatExcludedProjectTenantsMarkdown,
} from "@/lib/finance/excluded-project-tenants-export"
import {
  downloadPersonalIncomeSummaryExcel,
  downloadPersonalIncomeTenantDetailExcel,
} from "@/lib/finance/personal-income-summary-export"
import {
  buildImportParseFailureMessage,
  buildImportSuccessMessage,
  downloadBase64Excel,
} from "@/lib/finance/import-error-download"
import { CopyToClipboard } from "@/components/shared/copy-to-clipboard"
import {
  PERSONAL_INCOME_SUMMARY_DISPLAY_ORDER,
  PERSONAL_TENANT_BILL_HINT,
  personalIncomeSummaryKindLabel,
  type PersonalIncomeSummaryKind,
} from "@/lib/finance/personal-income-labels"
import { LocaleLink } from "@/lib/i18n/navigation"
import { trpc } from "@/lib/trpc/client"
import { fileToBase64 } from "@/lib/utils/file-to-base64"
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { IconDownload, IconLoader2, IconUpload } from "@tabler/icons-react"
import { AlertCircle, Calculator, CheckCircle2, Download, RotateCcw } from "lucide-react"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

type PersonalImportSlot = "personalTenantBill"

type SlotState = {
  file: File | null
  status: "empty" | "parsing" | "done" | "error"
  message: string
  rowCount: number
  hasErrorReport: boolean
  parseErrorCount: number
}

function emptySlot(): SlotState {
  return {
    file: null,
    status: "empty",
    message: "",
    rowCount: 0,
    hasErrorReport: false,
    parseErrorCount: 0,
  }
}

function slotStateFromBatch(batch: {
  file_name: string
  parse_status: string
  parse_error_count: number
  row_count: number
  has_error_report: boolean
}): SlotState {
  if (batch.parse_status === "ok") {
    return {
      file: null,
      status: "done",
      message: buildImportSuccessMessage(batch.row_count),
      rowCount: batch.row_count,
      hasErrorReport: false,
      parseErrorCount: 0,
    }
  }
  return {
    file: null,
    status: "error",
    message: buildImportParseFailureMessage({
      parseErrorCount: batch.parse_error_count,
      hasErrorReport: batch.has_error_report,
    }),
    rowCount: 0,
    hasErrorReport: batch.has_error_report,
    parseErrorCount: batch.parse_error_count,
  }
}

function SlotUploadRow({
  label,
  hint,
  accept,
  state,
  disabled,
  onFile,
  onDownloadError,
}: {
  label: string
  hint: string
  accept: string
  state: SlotState
  disabled?: boolean
  onFile: (file: File | null) => void
  onDownloadError?: () => void
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{label}</p>
          <p className="text-muted-foreground text-xs">{hint}</p>
        </div>
        {state.status === "parsing" && (
          <IconLoader2 className="size-5 animate-spin text-muted-foreground" />
        )}
        {state.status === "done" && (
          <Badge variant="secondary">已解析 {state.rowCount} 行</Badge>
        )}
        {state.status === "error" && (
          <Badge variant="destructive">
            {state.parseErrorCount > 0
              ? `${state.parseErrorCount} 处错误`
              : "解析失败"}
          </Badge>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" asChild disabled={disabled}>
          <label className="cursor-pointer">
            <IconUpload className="mr-1 size-4" />
            选择文件
            <input
              type="file"
              accept={accept}
              className="sr-only"
              disabled={disabled || state.status === "parsing"}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                e.target.value = ""
                if (f) onFile(f)
              }}
            />
          </label>
        </Button>
        {state.file ? (
          <span className="text-muted-foreground text-sm truncate max-w-[220px]">
            {state.file.name}
          </span>
        ) : null}
        {state.hasErrorReport && onDownloadError ? (
          <Button type="button" variant="outline" size="sm" onClick={onDownloadError}>
            <IconDownload className="mr-1 size-4" />
            下载错误明细 Excel
          </Button>
        ) : null}
      </div>
      {state.status !== "empty" && state.message ? (
        <p
          className={
            state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"
          }
        >
          {state.message}
        </p>
      ) : null}
    </div>
  )
}

export default function FinancePeriodPersonalIncomePage() {
  const params = useParams<{ id: string }>()
  const id = params.id ?? ""

  const utils = trpc.useUtils()
  const { data: bundle, isLoading, refetch } = trpc.finance.periods.getPersonalBundle.useQuery(
    { billingPeriodId: id },
    { enabled: Boolean(id) },
  )

  const importFile = trpc.finance.periods.importFile.useMutation()
  const computePersonal = trpc.finance.periods.computePersonalIncome.useMutation()
  const purgePersonal = trpc.finance.periods.purgePersonalIncome.useMutation()

  const [tenantBill, setTenantBill] = useState<SlotState>(emptySlot())
  const [computeError, setComputeError] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [detailSegment, setDetailSegment] = useState<PersonalIncomeSummaryKind | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [crossCheckOpen, setCrossCheckOpen] = useState(false)

  const period = bundle?.period
  const validation = bundle?.validation
  const periodPublished = period ? isPublishedPeriodStatus(period.status) : false

  const displaySummaries = useMemo(() => {
    const rows = bundle?.summaries ?? []
    return PERSONAL_INCOME_SUMMARY_DISPLAY_ORDER.map((kind) =>
      rows.find((r) => r.summary_kind === kind),
    ).filter((r): r is NonNullable<typeof r> => Boolean(r))
  }, [bundle?.summaries])

  const reconciliation = validation?.reconciliation ?? null
  const baremetalSourceMode = validation?.baremetalSourceMode ?? "excel"

  const syncSlotsFromBundle = useCallback(() => {
    const tb = bundle?.batches.tenant_bill
    setTenantBill((prev) => {
      if (prev.status === "parsing") return prev
      if (!tb) return emptySlot()
      return slotStateFromBatch(tb)
    })
  }, [bundle?.batches])

  useEffect(() => {
    syncSlotsFromBundle()
  }, [syncSlotsFromBundle])

  const downloadImportError = useCallback(
    async (slot: PersonalImportSlot) => {
      setComputeError(null)
      try {
        const report = await utils.finance.periods.downloadImportErrorReport.fetch({
          billingPeriodId: id,
          slot,
        })
        downloadBase64Excel(report.fileName, report.fileBase64)
      } catch (e) {
        setComputeError(e instanceof Error ? e.message : "下载错误明细失败")
      }
    },
    [id, utils.finance.periods.downloadImportErrorReport],
  )

  const applyImportResult = (
    file: File,
    result: {
      ok: boolean
      message: string
      rowCount: number
      parseErrorCount: number
      hasErrorReport: boolean
    },
  ): SlotState => {
    if (result.ok) {
      return {
        file,
        status: "done",
        message: buildImportSuccessMessage(result.rowCount),
        rowCount: result.rowCount,
        hasErrorReport: false,
        parseErrorCount: 0,
      }
    }
    return {
      file,
      status: "error",
      message: buildImportParseFailureMessage({
        message: result.message,
        parseErrorCount: result.parseErrorCount,
        hasErrorReport: result.hasErrorReport,
      }),
      rowCount: 0,
      hasErrorReport: result.hasErrorReport,
      parseErrorCount: result.parseErrorCount,
    }
  }

  const uploadTenantBill = async (file: File) => {
    setComputeError(null)
    setTenantBill({
      file,
      status: "parsing",
      message: "正在上传并解析…",
      rowCount: 0,
      hasErrorReport: false,
      parseErrorCount: 0,
    })
    try {
      const fileBase64 = await fileToBase64(file)
      const result = await importFile.mutateAsync({
        billingPeriodId: id,
        slot: "personalTenantBill",
        fileName: file.name,
        fileBase64,
      })
      setTenantBill(applyImportResult(file, result))
      await refetch()
    } catch (e) {
      const msg = e instanceof Error ? e.message : "账单详情上传失败"
      setTenantBill({
        file,
        status: "error",
        message: msg,
        rowCount: 0,
        hasErrorReport: false,
        parseErrorCount: 0,
      })
    }
  }

  const handleRegenerate = async () => {
    setRegenerating(true)
    setComputeError(null)
    try {
      await purgePersonal.mutateAsync({ billingPeriodId: id })
      setTenantBill(emptySlot())
      await refetch()
    } catch (e) {
      setComputeError(e instanceof Error ? e.message : "重新生成清理失败")
    } finally {
      setRegenerating(false)
    }
  }

  const handleCompute = async () => {
    setComputeError(null)
    try {
      await computePersonal.mutateAsync({ billingPeriodId: id })
      await refetch()
    } catch (e) {
      setComputeError(e instanceof Error ? e.message : "计算个人收入失败")
    }
  }

  const canCompute =
    Boolean(validation?.canCompute) &&
    !periodPublished &&
    !computePersonal.isPending &&
    !importFile.isPending

  const excludedProjectTenants = validation?.excludedProjectTenants ?? []

  const excludedMarkdown = useMemo(
    () =>
      formatExcludedProjectTenantsMarkdown(excludedProjectTenants, {
        periodCode: period?.period_code,
      }),
    [excludedProjectTenants, period?.period_code],
  )

  const handleDownloadExcludedExcel = () => {
    if (!period) return
    const ok = downloadExcludedProjectTenantsExcel({
      rows: excludedProjectTenants,
      periodCode: period.period_code,
    })
    if (ok) toast.success("已排除租户列表 Excel 已下载")
    else toast.error("暂无数据可导出")
  }

  const handleDownloadSummaryExcel = () => {
    if (!period) return
    const ok = downloadPersonalIncomeSummaryExcel({
      rows: displaySummaries,
      periodCode: period.period_code,
      reconciliation,
    })
    if (ok) toast.success("收入汇总 Excel 已下载")
    else toast.error("暂无汇总数据可导出")
  }

  const openDetail = (segment: PersonalIncomeSummaryKind) => {
    setDetailSegment(segment)
    setDetailOpen(true)
  }

  const handleExportSegmentExcel = async (segment: PersonalIncomeSummaryKind) => {
    if (!period) return
    try {
      const rows = await utils.finance.periods.listPersonalIncomeTenantLines.fetch({
        billingPeriodId: id,
        segment,
      })
      const ok = downloadPersonalIncomeTenantDetailExcel({
        rows,
        periodCode: period.period_code,
        summaryKind: segment,
      })
      if (ok) toast.success("租户明细 Excel 已下载")
      else toast.error("暂无数据可导出")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导出失败")
    }
  }

  if (!id) {
    return (
      <div className="bg-background p-4 md:p-6">
        <p className="text-muted-foreground">无效账期 ID</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="bg-background p-4 md:p-6">
        <p className="text-muted-foreground">加载中…</p>
      </div>
    )
  }

  if (!period) {
    return (
      <div className="bg-background p-4 md:p-6">
        <p className="text-muted-foreground">未找到该账期。</p>
        <Button variant="link" asChild className="mt-2 px-0">
          <LocaleLink href="/finance">返回账期列表</LocaleLink>
        </Button>
      </div>
    )
  }

  return (
    <div className="bg-background p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <LocaleLink href="/finance">← 账期列表</LocaleLink>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <LocaleLink href={`/finance/${id}/income`}>企业收入</LocaleLink>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <LocaleLink href={`/finance/${id}/monthly-cost`}>月度成本</LocaleLink>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>个人收入 · {period.period_code}</CardTitle>
          <CardDescription>
            账期 {period.period_start} ~ {period.period_end}。按 Excel 全量余额消费四段互斥汇总（B
            端 / 个人 / 黑名单 / 内部）；裸金属口径可选读库或 Excel「新版裸金属」行。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {validation?.messages && validation.messages.length > 0 ? (
            <Alert variant={validation.canCompute ? "default" : "destructive"}>
              <AlertCircle className="size-4" />
              <AlertTitle>数据就绪检查</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4 space-y-1">
                  {validation.messages.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
                {validation.tenantsPersonal > 0 ? (
                  <p className="mt-2">
                    将纳入计算的非项目租户约 {validation.tenantsPersonal} 个（Excel 去重{" "}
                    {validation.tenantsInExcel} 个，排除项目关联{" "}
                    {validation.tenantsExcludedProject} 个）。
                  </p>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}

          {computeError ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertTitle>操作失败</AlertTitle>
              <AlertDescription>{computeError}</AlertDescription>
            </Alert>
          ) : null}

          {periodPublished ? (
            <Alert>
              <AlertTitle>账期已发布</AlertTitle>
              <AlertDescription>须先在账期管理中撤回发布，方可重新上传或计算。</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={regenerating || purgePersonal.isPending || periodPublished}
              onClick={() => void handleRegenerate()}
            >
              <RotateCcw className="size-4" />
              重新生成（清空导入与汇总）
            </Button>
            <Button
              size="sm"
              className="gap-2"
              disabled={!canCompute}
              onClick={() => void handleCompute()}
            >
              {computePersonal.isPending ? (
                <IconLoader2 className="size-4 animate-spin" />
              ) : (
                <Calculator className="size-4" />
              )}
              计算个人收入
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>导入数据</CardTitle>
          <CardDescription>
            客户账单详情须上传 Excel；裸金属订单读库为选填（导入后以订单余额支付为准，忽略 Excel
            「新版裸金属」行）。未读库时使用 Excel 中「类型=新版裸金属」的余额消费。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SlotUploadRow
            label="客户账单详情"
            hint={PERSONAL_TENANT_BILL_HINT}
            accept=".xlsx,.xls,.csv"
            state={tenantBill}
            disabled={periodPublished || regenerating}
            onFile={(f) => f && void uploadTenantBill(f)}
            onDownloadError={
              tenantBill.hasErrorReport
                ? () => void downloadImportError("personalTenantBill")
                : undefined
            }
          />
          <BaremetalDbImportPanel
            billingPeriodId={id}
            variant="personal"
            disabled={periodPublished || regenerating}
            initialImported={bundle?.batches.baremetal?.parse_status === "ok"}
            initialRowCount={bundle?.batches.baremetal?.row_count ?? 0}
            onImported={() => void refetch()}
          />
        </CardContent>
      </Card>

      {reconciliation ? (
        <Card>
          <CardHeader>
            <CardTitle>余额总消费核算</CardTitle>
            <CardDescription>
              四段互斥加总须等于 Excel 全量余额总消费；裸金属口径：
              {baremetalSourceMode === "db" ? "读库（余额支付）" : "Excel（新版裸金属行）"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 font-medium">
              <span>Excel 余额总消费（全量）</span>
              <span className="tabular-nums">
                {formatMoney(reconciliation.excel_computed_balance_total)}
              </span>
            </div>
            <div className="space-y-1 pl-2 border-l-2">
              <ReconciliationLine
                label="= B 端（项目租户）"
                value={reconciliation.enterprise_project_total_consumption}
                onDetail={() => openDetail("enterprise_project")}
              />
              <ReconciliationLine
                label="+ 个人收入（非项目租户）"
                value={reconciliation.personal_non_project_total_consumption}
                onDetail={() => openDetail("non_project")}
              />
              <ReconciliationLine
                label="+ 黑名单租户"
                value={reconciliation.blacklist_total_consumption}
                onDetail={() => openDetail("blacklist")}
              />
              <ReconciliationLine
                label="+ 内部租户"
                value={reconciliation.internal_total_consumption}
                onDetail={() => openDetail("internal")}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t font-medium">
              <span className="flex items-center gap-2">
                四段合计
                {reconciliation.four_segment_matches_excel ? (
                  <CheckCircle2 className="size-4 text-green-600" aria-label="校验通过" />
                ) : (
                  <AlertCircle className="size-4 text-destructive" aria-label="校验失败" />
                )}
              </span>
              <span className="tabular-nums">{formatMoney(reconciliation.four_segment_sum)}</span>
            </div>
            {reconciliation.enterprise_cross_check_delta != null ? (
              <Alert variant="default" className="mt-3">
                <AlertCircle className="size-4" />
                <AlertTitle>B 端 vs CRM 企业收入（参考）</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>
                    Excel B 端 {formatMoney(reconciliation.enterprise_project_total_consumption)}
                    {reconciliation.enterprise_crm_total_consumption != null
                      ? ` · CRM ${formatMoney(reconciliation.enterprise_crm_total_consumption)}`
                      : null}
                    {` · 差额 ${formatMoney(reconciliation.enterprise_cross_check_delta)}`}
                    （不阻断计算）
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCrossCheckOpen(true)}
                  >
                    查看租户明细
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>收入汇总</CardTitle>
            <CardDescription>
              {displaySummaries.length > 0
                ? "四段互斥汇总；点击详情查看租户明细。"
                : "上传账单 Excel 后点击「计算个人收入」（裸金属读库为选填）。"}
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 shrink-0"
            disabled={displaySummaries.length === 0}
            onClick={handleDownloadSummaryExcel}
          >
            <Download className="size-4" />
            下载 Excel
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>汇总类型</TableHead>
                <TableHead className="text-right">余额消费</TableHead>
                <TableHead className="text-right">线上裸金属消费</TableHead>
                <TableHead className="text-right">总消费</TableHead>
                <TableHead className="text-right">租户数</TableHead>
                <TableHead className="text-right w-[140px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displaySummaries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground text-center">
                    暂无汇总数据
                  </TableCell>
                </TableRow>
              ) : (
                displaySummaries.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {personalIncomeSummaryKindLabel(row.summary_kind)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(row.balance_consumption)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(row.bare_metal_consumption)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(row.total_consumption)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.matched_tenant_count}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => openDetail(row.summary_kind)}
                        >
                          详情
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleExportSegmentExcel(row.summary_kind)}
                        >
                          导出
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {excludedProjectTenants.length > 0 ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle>已排除的项目关联租户</CardTitle>
              <CardDescription>
                以下租户已关联经营项目，不计入个人收入汇总。共 {excludedProjectTenants.length}{" "}
                个。
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handleDownloadExcludedExcel}
              >
                <Download className="size-4" />
                下载 Excel
              </Button>
              <div className="flex items-center gap-1 rounded-md border bg-background pl-2 pr-1">
                <span className="text-muted-foreground text-xs whitespace-nowrap">
                  复制 Markdown
                </span>
                <CopyToClipboard
                  text={excludedMarkdown}
                  tooltip="复制 Markdown 表格"
                  successMessage="Markdown 已复制到剪贴板"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="max-h-64 overflow-auto">
            <ul className="text-sm space-y-1">
              {excludedProjectTenants.map((t) => (
                <li key={t.platform_tenant_id}>
                  <span className="font-mono">{t.platform_tenant_id}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    — {t.project_names.join("、")}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <PersonalIncomeTenantDetailDrawer
        billingPeriodId={id}
        periodCode={period.period_code}
        segment={detailSegment}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />

      <PersonalIncomeEnterpriseCrossCheckDrawer
        billingPeriodId={id}
        periodCode={period.period_code}
        open={crossCheckOpen}
        onOpenChange={setCrossCheckOpen}
      />
    </div>
  )
}

function ReconciliationLine({
  label,
  value,
  onDetail,
}: {
  label: string
  value: string
  onDetail: () => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span>{label}</span>
      <span className="flex items-center gap-2 tabular-nums">
        {formatMoney(value)}
        <Button type="button" variant="link" size="sm" className="h-auto px-1" onClick={onDetail}>
          详情
        </Button>
      </span>
    </div>
  )
}
