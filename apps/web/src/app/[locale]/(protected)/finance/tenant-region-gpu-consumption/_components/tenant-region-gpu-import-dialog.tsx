'use client'

import * as React from 'react'
import { Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { formatMoney } from '@/app/[locale]/(protected)/finance/_lib/display'
import { labelTenantRegionGpuProductLine } from '@/lib/finance/tenant-region-gpu-product-line'
import { trpc } from '@/lib/trpc/client'
import { fileToBase64 } from '@/lib/utils/file-to-base64'
import {
  isTenantRegionGpuImportFileName,
  TENANT_REGION_GPU_IMPORT_ACCEPT,
  TENANT_REGION_GPU_IMPORT_MAX_BYTES,
  type TenantRegionGpuImportCommitResult,
  type TenantRegionGpuImportPreviewResult,
} from '@/lib/types/tenant-region-gpu-import'
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

function ParseBadge({ status }: { status: 'ok' | 'error' | 'skip' }) {
  if (status === 'ok') return <Badge variant="outline">可导入</Badge>
  if (status === 'skip') return <Badge variant="secondary">跳过</Badge>
  return <Badge variant="destructive">错误</Badge>
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3 text-center">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  )
}

export function TenantRegionGpuImportDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [step, setStep] = React.useState<Step>('upload')
  const [phase, setPhase] = React.useState<Phase>('idle')
  const [file, setFile] = React.useState<File | null>(null)
  const [preview, setPreview] = React.useState<TenantRegionGpuImportPreviewResult | null>(null)
  const [commitResult, setCommitResult] = React.useState<TenantRegionGpuImportCommitResult | null>(
    null,
  )
  const [parseError, setParseError] = React.useState<string | null>(null)

  const previewMutation = trpc.finance.tenantRegionGpuConsumption.previewImport.useMutation()
  const commitMutation = trpc.finance.tenantRegionGpuConsumption.commitImport.useMutation()

  const loading =
    phase === 'parsing' ||
    phase === 'committing' ||
    previewMutation.isPending ||
    commitMutation.isPending

  const reset = React.useCallback(() => {
    setStep('upload')
    setPhase('idle')
    setFile(null)
    setPreview(null)
    setCommitResult(null)
    setParseError(null)
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  React.useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  const importableCount = preview?.summary.ok ?? 0

  const onFileChange = (next: File | null) => {
    setParseError(null)
    if (!next) {
      setFile(null)
      return
    }
    if (!isTenantRegionGpuImportFileName(next.name)) {
      setFile(null)
      setParseError('仅支持 .xlsx / .xls / .csv / .tsv 文件')
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    if (next.size > TENANT_REGION_GPU_IMPORT_MAX_BYTES) {
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
      })
      setPreview(result)
      setStep('preview')

      if (result.fileErrors.length > 0) {
        toast.error(result.fileErrors.join('；'))
      } else if (result.summary.error > 0) {
        toast.warning(
          `解析完成：${result.summary.ok} 行可导入，${result.summary.error} 行有误，${result.summary.skip} 行跳过`,
        )
      } else {
        toast.success(`解析完成：共 ${result.summary.ok} 行可导入`)
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
      })
      setCommitResult(result)
      setStep('done')
      onSuccess()

      if (result.errors.length > 0) {
        toast.warning(`已导入 ${result.importedCount} 行，${result.errors.length} 条警告`)
      } else {
        toast.success(`导入完成：${result.importedCount} 行`)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '导入失败')
    } finally {
      setPhase('idle')
    }
  }

  const previewSummary = preview
    ? `共 ${preview.summary.total} 行，可导入 ${preview.summary.ok} 行，错误 ${preview.summary.error} 行，跳过 ${preview.summary.skip} 行`
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[90vh] grid-rows-[auto_minmax(0,1fr)_auto] gap-4 overflow-hidden sm:max-w-5xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {step === 'upload' && '日卡时导入'}
            {step === 'preview' && '确认导入'}
            {step === 'done' && '导入完成'}
          </DialogTitle>
          <DialogDescription>
            {step === 'upload' &&
              '上传 Excel 后先解析预览，核对无误再写入日表（与日/月汇总独立，不自动 rollup）。'}
            {step === 'preview' && (previewSummary ?? '核对解析结果后确认导入。')}
            {step === 'done' && '导入结果如下，关闭后列表已刷新。'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto overscroll-contain pr-1">
          {step === 'upload' && (
            <div className="space-y-4 px-1">
              <Alert>
                <AlertDescription>
                  表头需包含：日期、租户Id、区域、GPU型号；可选：产品线、总消费、券消费、余额消费、总卡时、券卡时、余额卡时、基准消费等。
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="trg-import-file">Excel 文件</Label>
                <Input
                  id="trg-import-file"
                  ref={inputRef}
                  type="file"
                  accept={TENANT_REGION_GPU_IMPORT_ACCEPT}
                  disabled={loading}
                  onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
                />
                {file ? (
                  <p className="text-muted-foreground text-sm">
                    已选择：{file.name}（{(file.size / 1024).toFixed(1)} KB）
                  </p>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    支持 .xlsx / .xls / .csv / .tsv，最大 10MB
                  </p>
                )}
              </div>

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
                  <AlertDescription>{preview.fileErrors.join('；')}</AlertDescription>
                </Alert>
              )}

              {preview.summary.error > 0 && (
                <Alert variant="destructive">
                  <AlertDescription>
                    有 {preview.summary.error} 行存在错误，确认导入时将跳过这些行
                  </AlertDescription>
                </Alert>
              )}

              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">行</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>日期</TableHead>
                      <TableHead>产品线</TableHead>
                      <TableHead>租户Id</TableHead>
                      <TableHead>区域</TableHead>
                      <TableHead>GPU</TableHead>
                      <TableHead className="text-right">余额消费</TableHead>
                      <TableHead className="text-right">余额卡时</TableHead>
                      <TableHead>说明</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.map((row) => (
                      <TableRow key={row.rowNo}>
                        <TableCell>{row.rowNo}</TableCell>
                        <TableCell>
                          <ParseBadge status={row.parseStatus} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{row.usageDate ?? '—'}</TableCell>
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
                        <TableCell className="text-right">
                          {row.balanceCardHours ? formatMoney(row.balanceCardHours) : '—'}
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
                <Stat label="警告" value={commitResult.errors.length} />
              </div>
              {commitResult.errors.length > 0 && (
                <div className="max-h-40 overflow-auto rounded-md border p-3 text-xs text-muted-foreground">
                  {commitResult.errors.map((msg, i) => (
                    <p key={`${i}-${msg}`}>{msg}</p>
                  ))}
                </div>
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
                disabled={loading || importableCount === 0}
                onClick={() => void onCommit()}
              >
                {phase === 'committing' ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                确认导入 {importableCount} 行
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

export function TenantRegionGpuImportButton({
  onSuccess,
}: {
  onSuccess: () => void
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload className="mr-2 size-4" />
        日卡时导入
      </Button>
      <TenantRegionGpuImportDialog open={open} onOpenChange={setOpen} onSuccess={onSuccess} />
    </>
  )
}
