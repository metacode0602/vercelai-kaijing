'use client'

import * as React from 'react'
import { Download, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { formatMoney } from '@/app/[locale]/(protected)/finance/_lib/display'
import { downloadTenantRegionGpuMonthlyBillReconcileExcel } from '@/lib/finance/tenant-region-gpu-monthly-bill-reconcile-export'
import {
  labelTenantRegionGpuProductLine,
} from '@/lib/finance/tenant-region-gpu-product-line'
import { trpc } from '@/lib/trpc/client'
import { fileToBase64 } from '@/lib/utils/file-to-base64'
import {
  isTenantRegionGpuMonthlyImportFileName,
  TENANT_REGION_GPU_MONTHLY_IMPORT_ACCEPT,
  TENANT_REGION_GPU_MONTHLY_IMPORT_MAX_BYTES,
  type TenantRegionGpuMonthlyImportBillReconcileStatus,
  type TenantRegionGpuMonthlyImportCommitResult,
  type TenantRegionGpuMonthlyImportPreviewResult,
} from '@/lib/types/tenant-region-gpu-monthly-import'
import { Alert, AlertDescription } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

type Step = 'upload' | 'preview' | 'done'
type Phase = 'idle' | 'parsing' | 'committing'

function currentUsageMonth(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function ParseBadge({ status }: { status: 'ok' | 'error' | 'skip' }) {
  if (status === 'ok') return <Badge variant="outline">可导入</Badge>
  if (status === 'skip') return <Badge variant="secondary">跳过</Badge>
  return <Badge variant="destructive">错误</Badge>
}

function ReconcileStatusBadge({ status }: { status: TenantRegionGpuMonthlyImportBillReconcileStatus }) {
  if (status === 'match') return <Badge variant="outline">一致</Badge>
  if (status === 'missing_bill') return <Badge variant="secondary">账单缺失</Badge>
  return <Badge variant="destructive">不一致</Badge>
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3 text-center">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  )
}

export function TenantRegionGpuMonthlyImportDialog({
  open,
  onOpenChange,
  onSuccess,
  defaultUsageMonth,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  defaultUsageMonth?: string
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [step, setStep] = React.useState<Step>('upload')
  const [phase, setPhase] = React.useState<Phase>('idle')
  const [usageMonth, setUsageMonth] = React.useState(defaultUsageMonth ?? currentUsageMonth())
  const [file, setFile] = React.useState<File | null>(null)
  const [preview, setPreview] = React.useState<TenantRegionGpuMonthlyImportPreviewResult | null>(null)
  const [commitResult, setCommitResult] = React.useState<TenantRegionGpuMonthlyImportCommitResult | null>(
    null,
  )
  const [parseError, setParseError] = React.useState<string | null>(null)

  const previewMutation = trpc.finance.tenantRegionGpuConsumption.previewMonthlyImport.useMutation()
  const commitMutation = trpc.finance.tenantRegionGpuConsumption.commitMonthlyImport.useMutation()

  const loading =
    phase === 'parsing' ||
    phase === 'committing' ||
    previewMutation.isPending ||
    commitMutation.isPending

  const reset = React.useCallback(() => {
    setStep('upload')
    setPhase('idle')
    setUsageMonth(defaultUsageMonth ?? currentUsageMonth())
    setFile(null)
    setPreview(null)
    setCommitResult(null)
    setParseError(null)
    if (inputRef.current) inputRef.current.value = ''
  }, [defaultUsageMonth])

  React.useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  React.useEffect(() => {
    if (defaultUsageMonth) setUsageMonth(defaultUsageMonth)
  }, [defaultUsageMonth])

  const importableCount = preview?.summary.ok ?? 0
  const hasBlockingErrors =
    (preview?.fileErrors.length ?? 0) > 0 || (preview?.summary.error ?? 0) > 0
  const canCommit = importableCount > 0 && !hasBlockingErrors

  const onFileChange = (next: File | null) => {
    setParseError(null)
    if (!next) {
      setFile(null)
      return
    }
    if (!isTenantRegionGpuMonthlyImportFileName(next.name)) {
      setFile(null)
      setParseError('仅支持 .xlsx / .xls / .csv / .tsv 文件')
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    if (next.size > TENANT_REGION_GPU_MONTHLY_IMPORT_MAX_BYTES) {
      setFile(null)
      setParseError('文件不能超过 10MB')
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    setFile(next)
  }

  const onParsePreview = async () => {
    if (!file) {
      toast.error('请选择 Excel 或 CSV 文件')
      return
    }

    setPhase('parsing')
    setParseError(null)
    try {
      const fileBase64 = await fileToBase64(file)
      const result = await previewMutation.mutateAsync({
        fileName: file.name,
        fileBase64,
        usageMonth,
      })
      setPreview(result)
      setStep('preview')

      if (result.fileErrors.length > 0) {
        toast.error(result.fileErrors[0] ?? '解析存在阻断错误')
      } else if (result.summary.error > 0) {
        toast.warning(
          `解析完成：${result.summary.ok} 行可导入，${result.summary.error} 行有误，${result.summary.skip} 行跳过`,
        )
      } else {
        const mismatch = result.billReconcile?.mismatchTenantCount ?? 0
        if (mismatch > 0) {
          toast.warning(
            `解析完成：共 ${result.summary.ok} 行可导入；账单对账差异租户 ${mismatch} 个`,
          )
        } else {
          toast.success(`解析完成：共 ${result.summary.ok} 行可导入`)
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : '解析失败'
      setParseError(message)
      toast.error(message)
    } finally {
      setPhase('idle')
    }
  }

  const onCommit = async () => {
    if (!preview || !file) return
    if (hasBlockingErrors) {
      toast.error('存在阻断错误，请先修复后再导入')
      return
    }
    if (importableCount === 0) {
      toast.error('没有可导入的有效行')
      return
    }

    setPhase('committing')
    try {
      const fileBase64 = await fileToBase64(file)
      const result = await commitMutation.mutateAsync({
        fileName: file.name,
        fileBase64,
        usageMonth,
      })
      setCommitResult(result)
      setStep('done')

      if (result.importedCount === 0 && result.errors.length > 0) {
        toast.error(result.errors[0] ?? '导入已中断')
        return
      }

      onSuccess()
      if (result.errors.length > 0) {
        toast.warning(
          `已导入 ${result.importedCount} 行（含裸金属 ${result.bareMetalAutoCount ?? 0} 行），${result.errors.length} 条问题`,
        )
      } else {
        toast.success(
          `导入完成：${result.importedCount} 行（含裸金属自动生成 ${result.bareMetalAutoCount ?? 0} 行）`,
        )
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '导入失败')
    } finally {
      setPhase('idle')
    }
  }

  const previewSummary = preview
    ? `共 ${preview.summary.total} 行，可导入 ${preview.summary.ok} 行（裸金属自动生成 ${preview.bareMetalAutoCount ?? 0} 行），错误 ${preview.summary.error} 行，跳过 ${preview.summary.skip} 行`
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[90vh] grid-rows-[auto_minmax(0,1fr)_auto] gap-4 overflow-hidden sm:max-w-5xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {step === 'upload' && '月度卡时导入'}
            {step === 'preview' && '确认月度导入'}
            {step === 'done' && '导入完成'}
          </DialogTitle>
          <DialogDescription>
            {step === 'upload' &&
              '选择目标月份并上传 Excel，写入月度汇总表（与日明细独立，不含日期列）。'}
            {step === 'preview' && (previewSummary ?? '核对解析结果后确认导入。')}
            {step === 'done' && '导入结果如下，关闭后列表已刷新。'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto overscroll-contain pr-1">
          {step === 'upload' && (
            <div className="space-y-4 px-1">
              <Alert>
                <AlertDescription>
                  表头需包含：租户Id、区域、GPU型号；可选：产品线、base_value / 总消费 / 券消费 /
                  余额消费 / 总卡时 / 券卡时 / 余额卡时。无需日期列；若含日期列将忽略。同租户×机房×卡型×产品线的多行会自动合并累加。
                </AlertDescription>
              </Alert>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="trg-monthly-import-month">目标月份</Label>
                  <Input
                    id="trg-monthly-import-month"
                    type="month"
                    className="w-full"
                    value={usageMonth}
                    disabled={loading}
                    onChange={(e) => setUsageMonth(e.target.value || currentUsageMonth())}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trg-monthly-import-file">Excel 文件</Label>
                  <Input
                    id="trg-monthly-import-file"
                    ref={inputRef}
                    type="file"
                    accept={TENANT_REGION_GPU_MONTHLY_IMPORT_ACCEPT}
                    disabled={loading}
                    onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
                  />
                </div>
              </div>

              {file ? (
                <p className="text-muted-foreground text-sm">
                  已选择：{file.name}（{(file.size / 1024).toFixed(1)} KB）
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  支持 .xlsx / .xls / .csv / .tsv，最大 10MB
                </p>
              )}

              {parseError ? (
                <Alert variant="destructive">
                  <AlertDescription>{parseError}</AlertDescription>
                </Alert>
              ) : null}
            </div>
          )}

          {step === 'preview' && preview && (
            <div className="space-y-4 px-1">
              <div className="grid grid-cols-4 gap-2">
                <Stat label="可导入" value={preview.summary.ok} />
                <Stat label="错误" value={preview.summary.error} />
                <Stat label="跳过" value={preview.summary.skip} />
                <Stat label="合计" value={preview.summary.total} />
              </div>

              {preview.fileErrors.length > 0 && (
                <Alert variant="destructive">
                  <AlertDescription>
                    <div className="space-y-1">
                      {preview.fileErrors.map((msg, i) => (
                        <p key={`${i}-${msg.slice(0, 24)}`}>{msg}</p>
                      ))}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {preview.billReconcile && preview.billReconcile.tenantCount > 0 ? (
                <div className="space-y-2 rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">账单对账（弹性部署）</p>
                      <p className="text-muted-foreground text-xs">
                        Excel 按租户汇总余额消费，对比当月 tenant_bill_detail 中弹性部署+云主机+Job（误差 ≤{' '}
                        {preview.billReconcile.tolerance}）
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          preview.billReconcile.mismatchTenantCount > 0 ? 'destructive' : 'outline'
                        }
                      >
                        差异租户 {preview.billReconcile.mismatchTenantCount} /{' '}
                        {preview.billReconcile.tenantCount}
                      </Badge>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={preview.billReconcile.mismatchTenantCount === 0}
                        onClick={() => {
                          const ok = downloadTenantRegionGpuMonthlyBillReconcileExcel({
                            rows: preview.billReconcile!.rows,
                            usageMonth: preview.usageMonth,
                            mismatchOnly: true,
                          })
                          if (!ok) {
                            toast.message('没有可导出的差异租户')
                            return
                          }
                          toast.success('已导出对账差异 Excel')
                        }}
                      >
                        <Download className="mr-1.5 size-3.5" />
                        导出差异
                      </Button>
                    </div>
                  </div>

                  {preview.billReconcile.mismatchTenantCount > 0 ? (
                    <div className="max-h-40 overflow-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>租户Id</TableHead>
                            <TableHead>状态</TableHead>
                            <TableHead className="text-right">Excel余额</TableHead>
                            <TableHead className="text-right">账单余额</TableHead>
                            <TableHead className="text-right">差额</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {preview.billReconcile.rows
                            .filter((r) => r.status !== 'match')
                            .map((r) => (
                              <TableRow key={r.tenantPlatformId}>
                                <TableCell className="font-mono text-xs">
                                  {r.tenantPlatformId}
                                </TableCell>
                                <TableCell>
                                  <ReconcileStatusBadge status={r.status} />
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatMoney(r.excelBalanceConsumption)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatMoney(r.billBalanceAmount)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatMoney(r.deltaBalanceConsumption)}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-xs">全部租户余额消费与账单一致。</p>
                  )}
                </div>
              ) : null}

              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">行</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>月份</TableHead>
                      <TableHead>产品线</TableHead>
                      <TableHead>租户Id</TableHead>
                      <TableHead>区域</TableHead>
                      <TableHead>GPU</TableHead>
                      <TableHead className="text-right">余额消费</TableHead>
                      <TableHead>说明</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.map((row) => (
                      <TableRow key={`${row.rowNo}-${row.parseStatus}-${row.parseMessage ?? ''}`}>
                        <TableCell>{row.rowNo}</TableCell>
                        <TableCell>
                          <ParseBadge status={row.parseStatus} />
                        </TableCell>
                        <TableCell>{row.usageMonth ?? usageMonth}</TableCell>
                        <TableCell>
                          {row.productLine ? labelTenantRegionGpuProductLine(row.productLine) : '—'}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {row.tenantPlatformId ?? '—'}
                        </TableCell>
                        <TableCell>{row.regionCode ?? '—'}</TableCell>
                        <TableCell>{row.gpuModel ?? '—'}</TableCell>
                        <TableCell className="text-right">
                          {row.balanceConsumption ? formatMoney(row.balanceConsumption) : '—'}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {row.parseMessage ?? '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {step === 'done' && commitResult && (
            <div className="space-y-4 px-1">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Stat label="已导入" value={commitResult.importedCount} />
                <Stat
                  label={commitResult.importedCount === 0 ? '错误' : '问题'}
                  value={commitResult.errors.length}
                />
              </div>
              {commitResult.errors.length > 0 && (
                <Alert variant="destructive">
                  <AlertDescription>
                    <div className="max-h-48 space-y-1 overflow-auto text-xs">
                      {commitResult.errors.map((msg, i) => (
                        <p key={`${i}-${msg.slice(0, 24)}`}>{msg}</p>
                      ))}
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 sm:gap-0">
          {step === 'upload' && (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="button" disabled={!file || loading} onClick={() => void onParsePreview()}>
                {phase === 'parsing' ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                解析并预览
              </Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button type="button" variant="outline" disabled={loading} onClick={() => setStep('upload')}>
                上一步
              </Button>
              <Button
                type="button"
                disabled={loading || !canCommit}
                onClick={() => void onCommit()}
              >
                {phase === 'committing' ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                {hasBlockingErrors ? '存在阻断错误' : `确认导入 ${importableCount} 行`}
              </Button>
            </>
          )}
          {step === 'done' && (
            <Button type="button" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function TenantRegionGpuMonthlyImportButton({
  onSuccess,
  defaultUsageMonth,
}: {
  onSuccess: () => void
  defaultUsageMonth?: string
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload className="mr-2 size-4" />
        月度卡时导入
      </Button>
      <TenantRegionGpuMonthlyImportDialog
        open={open}
        onOpenChange={setOpen}
        onSuccess={onSuccess}
        defaultUsageMonth={defaultUsageMonth}
      />
    </>
  )
}
