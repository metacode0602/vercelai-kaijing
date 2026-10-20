'use client'

import { useEffect, useMemo, useState } from 'react'
import { IconLoader2 } from '@tabler/icons-react'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import {
  currentSlaMonth,
  formatSlaMonthOption,
  listRecentSlaMonths,
  type SlaCompensationRow,
} from '@/lib/types/sla'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { Textarea } from '@workspace/ui/components/textarea'
import {
  formatCompensationTier,
  formatMoneyPrecise,
  formatMonthLabel,
} from '../_lib/format-sla'

type FormState = {
  groupKey: string
  serviceFee: string
  compensationTier: string
  compensationAmount: string
  compensationNote: string
}

const EMPTY_FORM: FormState = {
  groupKey: '',
  serviceFee: '',
  compensationTier: '',
  compensationAmount: '',
  compensationNote: '',
}

function rowToForm(row: SlaCompensationRow): FormState {
  return {
    groupKey: row.groupKey,
    serviceFee: row.serviceFee != null ? String(row.serviceFee) : '',
    compensationTier: row.compensationTier != null ? String(row.compensationTier) : '',
    compensationAmount: row.compensationAmount != null ? String(row.compensationAmount) : '',
    compensationNote: row.compensationNote ?? '',
  }
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

function CompensationEditDialog({
  open,
  onOpenChange,
  initial,
  slaMonth,
  dataCenterId,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: SlaCompensationRow | null
  slaMonth: string
  dataCenterId: string
  onSaved: () => void
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const upsertMutation = trpc.supplier.sla.upsertCompensation.useMutation({
    onSuccess: () => {
      toast.success(initial ? '赔偿记录已更新' : '赔偿记录已添加')
      onSaved()
      onOpenChange(false)
    },
    onError: (error) => toast.error(error.message),
  })

  useEffect(() => {
    if (!open) return
    setForm(initial ? rowToForm(initial) : EMPTY_FORM)
  }, [open, initial])

  const onSubmit = () => {
    if (!form.groupKey.trim()) {
      toast.error('请填写 groupKey')
      return
    }
    upsertMutation.mutate({
      slaMonth,
      dataCenterId,
      groupKey: form.groupKey.trim(),
      serviceFee: parseOptionalNumber(form.serviceFee),
      compensationTier: parseOptionalNumber(form.compensationTier),
      compensationAmount: parseOptionalNumber(form.compensationAmount),
      compensationNote: form.compensationNote.trim() || null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? '编辑赔偿' : '新增赔偿'}</DialogTitle>
          <DialogDescription>
            {formatMonthLabel(slaMonth)} · groupKey 填 <code>platform</code> 表示平台级，或填写设备 SN
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>groupKey *</Label>
            <Input
              value={form.groupKey}
              onChange={(e) => setForm((prev) => ({ ...prev, groupKey: e.target.value }))}
              placeholder="platform 或设备 SN"
              disabled={Boolean(initial)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>服务费（元）</Label>
              <Input
                type="number"
                step="0.01"
                value={form.serviceFee}
                onChange={(e) => setForm((prev) => ({ ...prev, serviceFee: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>赔偿梯度（0–1）</Label>
              <Input
                type="number"
                step="0.01"
                value={form.compensationTier}
                onChange={(e) => setForm((prev) => ({ ...prev, compensationTier: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>赔偿金额（元）</Label>
            <Input
              type="number"
              step="0.01"
              value={form.compensationAmount}
              onChange={(e) => setForm((prev) => ({ ...prev, compensationAmount: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>备注</Label>
            <Textarea
              value={form.compensationNote}
              onChange={(e) => setForm((prev) => ({ ...prev, compensationNote: e.target.value }))}
              placeholder="协商说明；有备注时月报隐藏梯度"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={onSubmit} disabled={upsertMutation.isPending}>
            {upsertMutation.isPending ? <IconLoader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function SlaCompensationContent({ dataCenterId }: { dataCenterId: string }) {
  const searchParams = useSearchParams()
  const initialMonth = searchParams.get('month') ?? currentSlaMonth()
  const [slaMonth, setSlaMonth] = useState(initialMonth)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<SlaCompensationRow | null>(null)

  const monthsQuery = trpc.supplier.sla.listMonths.useQuery(undefined, { retry: false })
  const detailQuery = trpc.supplier.sla.getDatacenterDetail.useQuery(
    { dataCenterId, slaMonth },
    { retry: false },
  )
  const listQuery = trpc.supplier.sla.listCompensation.useQuery(
    { dataCenterId, slaMonth },
    { retry: false },
  )

  const deleteMutation = trpc.supplier.sla.deleteCompensation.useMutation({
    onSuccess: () => {
      toast.success('已删除')
      void listQuery.refetch()
    },
    onError: (error) => toast.error(error.message),
  })

  const monthOptions = useMemo(() => {
    const months = monthsQuery.data?.length ? monthsQuery.data : listRecentSlaMonths()
    return months.map(formatSlaMonthOption)
  }, [monthsQuery.data])

  const detail = detailQuery.data?.detail
  const rows = listQuery.data ?? []
  const detailHref = `/supplier/sla/${dataCenterId}?month=${encodeURIComponent(slaMonth)}`

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (row: SlaCompensationRow) => {
    setEditing(row)
    setDialogOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <LocaleLink
            href={detailHref}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            返回 SLA 详情
          </LocaleLink>

          <div className="space-y-1">
            <h1 className="text-2xl font-bold">月报赔偿编辑</h1>
            <p className="text-muted-foreground">
              {detail?.dataCenterName ?? '—'} · {detail?.supplierName ?? '—'}
            </p>
            <p className="text-xs text-muted-foreground">
              groupKey：<Badge variant="secondary">platform</Badge> 表示平台级赔偿；否则填写设备 SN
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={slaMonth} onValueChange={setSlaMonth}>
            <SelectTrigger className="w-[11rem]">
              <SelectValue placeholder="选择统计月" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={openCreate}>
            <Plus className="mr-2 size-4" />
            新增
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{formatMonthLabel(slaMonth)} 赔偿覆盖</CardTitle>
          <CardDescription>
            手工覆盖月报中的服务费、梯度与赔偿金额；留空字段由系统按 SLA 梯度计算
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>groupKey</TableHead>
                <TableHead className="text-right">服务费</TableHead>
                <TableHead className="text-right">赔偿梯度</TableHead>
                <TableHead className="text-right">赔偿金额</TableHead>
                <TableHead>备注</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    加载中…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    暂无手工赔偿记录
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.groupKey}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoneyPrecise(row.serviceFee)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCompensationTier(row.compensationTier)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatMoneyPrecise(row.compensationAmount)}
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">
                      {row.compensationNote ?? '—'}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => {
                          if (window.confirm(`确定删除 groupKey「${row.groupKey}」的赔偿记录？`)) {
                            deleteMutation.mutate({ id: row.id })
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CompensationEditDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        slaMonth={slaMonth}
        dataCenterId={dataCenterId}
        onSaved={() => void listQuery.refetch()}
      />
    </div>
  )
}
