'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { Button } from '@workspace/ui/components/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import type { SlaMonthlyReport } from '@/lib/types/sla'
import {
  formatAvailabilityRate,
  formatCardHours,
  formatCompensationTier,
  formatMoneyPrecise,
  formatMonthLabel,
  SLA_RATE_FORMULA_LABEL,
} from '../_lib/format-sla'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  report: SlaMonthlyReport | null
}

const POSTMORTEM_PREVIEW_MAX = 12

function truncateText(text: string, max: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max)}…`
}

function PostmortemPreview({
  review,
  recordedAt,
  faultType,
  onShowDetail,
}: {
  review: string
  recordedAt: string
  faultType: string
  onShowDetail: (input: { title: string; content: string }) => void
}) {
  const trimmed = review.trim()
  if (!trimmed) return <>—</>

  const isTruncated = trimmed.length > POSTMORTEM_PREVIEW_MAX
  const preview = truncateText(trimmed, POSTMORTEM_PREVIEW_MAX)

  if (!isTruncated) {
    return (
      <span className="block max-w-[18rem] text-xs leading-5 text-muted-foreground">{preview}</span>
    )
  }

  return (
    <button
      type="button"
      title="点击查看完整故障复盘"
      className="block max-w-[18rem] cursor-pointer text-left text-xs leading-5 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() =>
        onShowDetail({
          title: `故障复盘 · ${faultType} · ${recordedAt}`,
          content: trimmed,
        })
      }
    >
      {preview}
    </button>
  )
}

export function SlaReportDialog({ open, onOpenChange, report }: Props) {
  const [reviewDetail, setReviewDetail] = React.useState<{
    title: string
    content: string
  } | null>(null)

  React.useEffect(() => {
    if (open) return
    setReviewDetail(null)
  }, [open])

  if (!report) return null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] min-w-[50vw] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-1 border-b px-6 py-4 text-left">
          <DialogTitle>月度 SLA 报告</DialogTitle>
          <DialogDescription>
            {report.dataCenterName} · {report.supplierName} · {formatMonthLabel(report.slaMonth)}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">合同 SLA</p>
              <p className="text-xl font-bold tabular-nums">
                {formatAvailabilityRate(report.summaryFaultSlaRate)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{SLA_RATE_FORMULA_LABEL}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">供给卡时</p>
              <p className="text-xl font-bold tabular-nums">
                {formatCardHours(report.summarySupplyCardHours)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">故障卡时 / 赔偿合计</p>
              <p className="text-xl font-bold tabular-nums">
                {formatCardHours(report.summaryFaultCardHours)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                赔偿 {formatMoneyPrecise(report.totalCompensation)}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="whitespace-nowrap">记录时间</TableHead>
                  <TableHead className="whitespace-nowrap">解决时间</TableHead>
                  <TableHead className="whitespace-nowrap">故障类型</TableHead>
                  <TableHead className="whitespace-nowrap text-right">影响分钟</TableHead>
                  <TableHead className="whitespace-nowrap">影响范围</TableHead>
                  <TableHead className="whitespace-nowrap text-right">影响台数</TableHead>
                  <TableHead className="min-w-[14rem]">故障复盘</TableHead>
                  <TableHead className="whitespace-nowrap text-right">单实例可用性</TableHead>
                  <TableHead className="whitespace-nowrap text-right">赔偿梯度</TableHead>
                  <TableHead className="whitespace-nowrap text-right">服务费</TableHead>
                  <TableHead className="whitespace-nowrap text-right">赔偿金额</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.incidents.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-xs tabular-nums">
                      {row.recordedAt}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs tabular-nums">
                      {row.resolvedAt}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{row.faultType}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.impactMinutes}</TableCell>
                    <TableCell className="whitespace-nowrap">{row.impactScope}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.affectedDeviceCount}</TableCell>
                    <TableCell className="max-w-[18rem]">
                      <PostmortemPreview
                        review={row.review}
                        recordedAt={row.recordedAt}
                        faultType={row.faultType}
                        onShowDetail={setReviewDetail}
                      />
                    </TableCell>
                    {row.isGroupHead ? (
                      <>
                        <TableCell
                          rowSpan={row.groupRowSpan}
                          className="border-l text-right align-middle tabular-nums font-medium"
                        >
                          {formatAvailabilityRate(row.instanceAvailability)}
                        </TableCell>
                        <TableCell
                          rowSpan={row.groupRowSpan}
                          className="text-right align-middle tabular-nums"
                        >
                          {row.compensationNote
                            ? '—'
                            : formatCompensationTier(row.compensationTier)}
                        </TableCell>
                        <TableCell
                          rowSpan={row.groupRowSpan}
                          className="text-right align-middle tabular-nums"
                        >
                          {formatMoneyPrecise(row.serviceFee)}
                        </TableCell>
                        <TableCell
                          rowSpan={row.groupRowSpan}
                          className="text-right align-middle tabular-nums font-medium"
                        >
                          {row.compensationNote ? (
                            <div className="space-y-1">
                              <p>{formatMoneyPrecise(row.compensationAmount)}</p>
                              <p className="text-xs font-normal text-amber-700 dark:text-amber-300">
                                {row.compensationNote}
                              </p>
                            </div>
                          ) : (
                            formatMoneyPrecise(row.compensationAmount)
                          )}
                        </TableCell>
                      </>
                    ) : null}
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell colSpan={10} className="text-right">
                    赔偿合计
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoneyPrecise(report.totalCompensation)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t px-6 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
      </Dialog>

      <Dialog
        open={reviewDetail != null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setReviewDetail(null)
        }}
      >
        <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 space-y-1 border-b px-6 py-4 text-left">
            <DialogTitle className="text-base">{reviewDetail?.title ?? '故障复盘'}</DialogTitle>
            <DialogDescription>完整复盘内容</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <p className="whitespace-pre-wrap text-sm leading-6">{reviewDetail?.content}</p>
          </div>
          <DialogFooter className="shrink-0 border-t px-6 py-3">
            <Button variant="outline" onClick={() => setReviewDetail(null)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
