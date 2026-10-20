'use client'

import { PERSONAL_BAREMETAL_HINT } from '@/lib/finance/personal-income-labels'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { IconDatabase, IconLoader2 } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

const COST_BAREMETAL_ORDERED_AT_HINT =
  '从 bare_metal_order / bare_metal_order_device 读取账期内已支付订单（含线上同步与线下导入），按下单时间筛选，映射机房、卡型、时长后写入成本 Raw'

const COST_BAREMETAL_IMPORTED_AT_HINT =
  '从 bare_metal_order / bare_metal_order_device 读取账期内已支付订单，按入库时间（东八区）落入账期区间筛选，映射机房、卡型、时长后写入成本 Raw'

const PERSONAL_BAREMETAL_DB_HINT =
  '从 bare_metal_order / bare_metal_order_device 读取账期内已支付订单，按入库时间（东八区）落入账期区间筛选，写入个人收入 Raw'

type PreviewData = {
  totalCandidates: number
  validRows: number
  skippedPaidFilter: number
  issues: Array<{
    orderId: string
    orderNo: string | null
    level: 'error' | 'warning'
    code: string
    message: string
  }>
  preview: Array<{
    orderId: string
    tenantPlatformId: string
    idcName: string
    deviceModel: string
    purchaseQtyText: string
    deviceQty: number
    finalAmount: string
    orderedAt: string
    importedAt: string
    sourceOrderMark: 'online' | 'offline'
  }>
}

export type BaremetalDbImportPanelProps = {
  billingPeriodId: string
  variant?: 'cost' | 'personal'
  /** 成本路径账期筛选字段；personal 固定为 imported_at */
  periodField?: 'ordered_at' | 'imported_at'
  /** 允许写入空批次（无订单时仍可确认导入） */
  allowEmptyImport?: boolean
  disabled?: boolean
  preserveIncomeDerived?: boolean
  /** 已有读库批次时恢复为 done */
  initialImported?: boolean
  initialRowCount?: number
  onImported?: () => void
  onStatusChange?: (status: 'empty' | 'preview' | 'done' | 'error') => void
}

function formatShanghaiTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
}

export function BaremetalDbImportPanel({
  billingPeriodId,
  variant = 'cost',
  periodField = 'ordered_at',
  allowEmptyImport = false,
  disabled = false,
  preserveIncomeDerived = false,
  initialImported = false,
  initialRowCount = 0,
  onImported,
  onStatusChange,
}: BaremetalDbImportPanelProps) {
  const utils = trpc.useUtils()
  const importBaremetalFromDb = trpc.finance.periods.importBaremetalFromDb.useMutation()
  const importPersonalBaremetalFromDb =
    trpc.finance.periods.importPersonalBaremetalFromDb.useMutation()
  const purgePersonalBaremetal = trpc.finance.periods.purgePersonalBaremetal.useMutation()

  const isPersonal = variant === 'personal'
  const filterByImportedAt = isPersonal || periodField === 'imported_at'
  const hint = isPersonal
    ? PERSONAL_BAREMETAL_DB_HINT
    : filterByImportedAt
      ? COST_BAREMETAL_IMPORTED_AT_HINT
      : COST_BAREMETAL_ORDERED_AT_HINT
  const importPending = isPersonal
    ? importPersonalBaremetalFromDb.isPending
    : importBaremetalFromDb.isPending

  const [status, setStatus] = useState<'empty' | 'parsing' | 'preview' | 'done' | 'error'>(
    initialImported ? 'done' : 'empty',
  )
  const [message, setMessage] = useState(
    initialImported
      ? initialRowCount > 0
        ? `已导入 ${initialRowCount} 行`
        : '已导入（账期内无裸金属订单）'
      : '',
  )
  const [previewData, setPreviewData] = useState<PreviewData | null>(null)

  const notifyStatus = useCallback(
    (next: 'empty' | 'preview' | 'done' | 'error') => {
      onStatusChange?.(next)
    },
    [onStatusChange],
  )

  useEffect(() => {
    if (initialImported) {
      setStatus('done')
      setMessage(
        initialRowCount > 0
          ? `已导入 ${initialRowCount} 行`
          : '已导入（账期内无裸金属订单）',
      )
      notifyStatus('done')
    } else if (status === 'done') {
      setStatus('empty')
      setMessage('')
      setPreviewData(null)
      notifyStatus('empty')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅随 initialImported / initialRowCount 同步
  }, [initialImported, initialRowCount])

  const busy = status === 'parsing' || importPending || purgePersonalBaremetal.isPending

  const handleClearDbImport = async () => {
    if (!isPersonal) return
    setStatus('parsing')
    setMessage('正在清除读库数据…')
    try {
      await purgePersonalBaremetal.mutateAsync({ billingPeriodId })
      setStatus('empty')
      setMessage('')
      setPreviewData(null)
      notifyStatus('empty')
      toast.success('已清除裸金属读库导入，将使用 Excel 口径')
      onImported?.()
    } catch (e) {
      const msg = e instanceof Error ? e.message : '清除读库失败'
      setStatus('error')
      setMessage(msg)
      notifyStatus('error')
      toast.error(msg)
    }
  }

  const handlePreview = async () => {
    setStatus('parsing')
    setMessage('正在读取数据库…')
    setPreviewData(null)
    try {
      const result = isPersonal
        ? await utils.finance.periods.previewPersonalBaremetalFromDb.fetch({
            billingPeriodId,
          })
        : await utils.finance.periods.previewBaremetalFromDb.fetch({
            billingPeriodId,
            periodField,
          })
      const hasError = result.issues.some((i) => i.level === 'error')
      setPreviewData(result)
      if (hasError) {
        setStatus('error')
        setMessage(
          `发现 ${result.issues.filter((i) => i.level === 'error').length} 条错误，请修正订单主数据`,
        )
        notifyStatus('error')
        toast.error('读库预览发现错误，无法导入')
      } else {
        setStatus('preview')
        const periodLabel = filterByImportedAt ? '入库时间' : '下单时间'
        setMessage(
          `按${periodLabel}筛选：共 ${result.totalCandidates} 单（${result.skippedPaidFilter} 单未支付已跳过），可导入 ${result.validRows} 行`,
        )
        notifyStatus('preview')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '读库预览失败'
      setStatus('error')
      setMessage(msg)
      notifyStatus('error')
      toast.error(msg)
    }
  }

  const handleImport = async () => {
    if (status !== 'preview' || !previewData) return
    if (!isPersonal && !allowEmptyImport && previewData.validRows === 0) return

    setStatus('parsing')
    setMessage('正在写入…')
    try {
      const result = isPersonal
        ? await importPersonalBaremetalFromDb.mutateAsync({ billingPeriodId })
        : await importBaremetalFromDb.mutateAsync({
            billingPeriodId,
            preserveIncomeDerived,
            periodField,
            allowEmptyImport,
          })
      setStatus('done')
      setMessage(result.message)
      notifyStatus('done')
      onImported?.()
    } catch (e) {
      const msg = e instanceof Error ? e.message : '读库导入失败'
      setStatus('error')
      setMessage(msg)
      notifyStatus('error')
      toast.error(msg)
    }
  }

  const canConfirmImport =
    status === 'preview' &&
    previewData != null &&
    (isPersonal || allowEmptyImport || previewData.validRows > 0)

  const previewErrors = previewData?.issues.filter((i) => i.level === 'error') ?? []
  const previewWarnings = previewData?.issues.filter((i) => i.level === 'warning') ?? []

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">裸金属消费订单</p>
            {isPersonal ? (
              <Badge variant="outline" className="font-normal">
                选填
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {isPersonal ? PERSONAL_BAREMETAL_HINT : hint}
          </p>
        </div>
        {busy && <IconLoader2 className="size-5 animate-spin text-muted-foreground" />}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || busy || status === 'done'}
          onClick={() => void handlePreview()}
        >
          <IconDatabase className="mr-1 size-4" />
          预览订单
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={disabled || busy || !canConfirmImport}
          onClick={() => void handleImport()}
        >
          确认导入
        </Button>
        {isPersonal && (status === 'done' || initialImported) ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || busy}
            onClick={() => void handleClearDbImport()}
          >
            清除读库
          </Button>
        ) : null}
      </div>

      {message ? (
        <p
          className={
            status === 'error' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'
          }
        >
          {message}
        </p>
      ) : null}

      {previewErrors.length > 0 && (
        <ul className="text-sm text-destructive space-y-1 list-disc pl-4">
          {previewErrors.slice(0, 8).map((issue) => (
            <li key={`${issue.orderId}-${issue.code}`}>{issue.message}</li>
          ))}
          {previewErrors.length > 8 && <li>…另有 {previewErrors.length - 8} 条错误</li>}
        </ul>
      )}

      {previewWarnings.length > 0 && status !== 'empty' && (
        <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
          {previewWarnings.slice(0, 5).map((issue) => (
            <li key={`${issue.orderId}-${issue.code}`}>{issue.message}</li>
          ))}
        </ul>
      )}

      {previewData && previewData.preview.length > 0 && (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>订单 ID</TableHead>
                <TableHead>租户</TableHead>
                <TableHead>机房</TableHead>
                <TableHead>型号</TableHead>
                <TableHead>购买数量</TableHead>
                <TableHead>台数</TableHead>
                <TableHead>总额</TableHead>
                {filterByImportedAt ? <TableHead>下单时间</TableHead> : null}
                {filterByImportedAt ? <TableHead>入库时间</TableHead> : null}
                <TableHead>来源</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewData.preview.map((row) => (
                <TableRow key={row.orderId}>
                  <TableCell className="font-mono text-xs">{row.orderId}</TableCell>
                  <TableCell>{row.tenantPlatformId}</TableCell>
                  <TableCell>{row.idcName}</TableCell>
                  <TableCell>{row.deviceModel}</TableCell>
                  <TableCell className="text-xs">{row.purchaseQtyText}</TableCell>
                  <TableCell>{row.deviceQty}</TableCell>
                  <TableCell>{row.finalAmount}</TableCell>
                  {filterByImportedAt ? (
                    <TableCell className="text-xs whitespace-nowrap">
                      {formatShanghaiTime(row.orderedAt)}
                    </TableCell>
                  ) : null}
                  {filterByImportedAt ? (
                    <TableCell className="text-xs whitespace-nowrap">
                      {formatShanghaiTime(row.importedAt)}
                    </TableCell>
                  ) : null}
                  <TableCell>{row.sourceOrderMark === 'offline' ? '线下' : '线上'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {previewData.validRows > previewData.preview.length && (
            <p className="text-xs text-muted-foreground p-2 border-t">
              预览仅展示前 {previewData.preview.length} 行，导入将写入全部 {previewData.validRows}{' '}
              行
            </p>
          )}
        </div>
      )}
    </div>
  )
}
