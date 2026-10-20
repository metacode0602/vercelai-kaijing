'use client'

import { useEffect, useMemo, useState } from 'react'
import { trpc } from '@/lib/trpc/client'
import {
  MONTHLY_COST_DEPT_MARKETING,
  MONTHLY_COST_DEPT_MIDDLE,
} from '@/lib/monthly-cost/constants'
import { Button } from '@workspace/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@workspace/ui/components/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'
import { Input } from '@workspace/ui/components/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

const INCENTIVE_LABELS = ['新客', '老客'] as const
const DEPTS = [MONTHLY_COST_DEPT_MIDDLE, MONTHLY_COST_DEPT_MARKETING] as const

type WeightRow = {
  staffId: string
  weightPercent: string
  note?: string
}

type Props = {
  usageMonth: string
}

export function MonthlyCostDeptWeightsPanel({ usageMonth }: Props) {
  const utils = trpc.useUtils()
  const [dept, setDept] = useState<(typeof DEPTS)[number]>(MONTHLY_COST_DEPT_MIDDLE)
  const [incentiveLabel, setIncentiveLabel] =
    useState<(typeof INCENTIVE_LABELS)[number]>('新客')
  const [rows, setRows] = useState<WeightRow[]>([{ staffId: '', weightPercent: '' }])

  const { data: staffList } = trpc.crm.staff.listActive.useQuery()
  const { data: savedWeights, refetch } = trpc.finance.monthlyCost.listDeptWeights.useQuery(
    { usageMonth, recipientDept: dept },
    { enabled: Boolean(usageMonth) },
  )

  const saveMutation = trpc.finance.monthlyCost.saveDeptWeights.useMutation({
    onSuccess: async () => {
      await utils.finance.monthlyCost.listDeptWeights.invalidate({ usageMonth })
      toast.success('权重已保存')
      void refetch()
    },
    onError: (e) => toast.error(e.message),
  })

  const currentBucket = useMemo(
    () =>
      (savedWeights ?? []).filter(
        (w) =>
          w.recipient_dept === dept && w.customer_incentive_label === incentiveLabel,
      ),
    [savedWeights, dept, incentiveLabel],
  )

  useEffect(() => {
    if (currentBucket.length > 0) {
      setRows(
        currentBucket.map((w) => ({
          staffId: w.staff_id,
          weightPercent: w.weight_percent,
          note: w.note ?? undefined,
        })),
      )
    } else {
      setRows([{ staffId: '', weightPercent: '' }])
    }
  }, [currentBucket, dept, incentiveLabel])

  const weightSum = rows.reduce((s, r) => s + (Number(r.weightPercent) || 0), 0)

  const eligibleStaff = (staffList ?? []).filter((s) => s.position !== '经理')

  return (
    <Card>
      <CardHeader>
        <CardTitle>部门池分配权重</CardTitle>
        <CardDescription>
          按结算月 × 部门 × 新客/老客维护池内二次分配比例（合计须 100%）。经理岗位不参与分配。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Select value={dept} onValueChange={(v) => setDept(v as (typeof DEPTS)[number])}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEPTS.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={incentiveLabel}
            onValueChange={(v) =>
              setIncentiveLabel(v as (typeof INCENTIVE_LABELS)[number])
            }
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INCENTIVE_LABELS.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span
            className={`text-sm self-center ${Math.abs(weightSum - 100) <= 0.01 ? 'text-muted-foreground' : 'text-destructive'}`}
          >
            合计 {weightSum.toFixed(2)}%
          </span>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>员工</TableHead>
              <TableHead className="w-[140px]">权重 %</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={index}>
                <TableCell>
                  <Select
                    value={row.staffId}
                    onValueChange={(v) => {
                      const next = [...rows]
                      next[index] = { ...next[index]!, staffId: v }
                      setRows(next)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择员工" />
                    </SelectTrigger>
                    <SelectContent>
                      {eligibleStaff.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.display_name}
                          {s.department ? ` · ${s.department}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={row.weightPercent}
                    onChange={(e) => {
                      const next = [...rows]
                      next[index] = { ...next[index]!, weightPercent: e.target.value }
                      setRows(next)
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={rows.length <= 1}
                    onClick={() => setRows(rows.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRows([...rows, { staffId: '', weightPercent: '' }])}
          >
            <Plus className="mr-1 size-4" />
            添加员工
          </Button>
          <Button
            size="sm"
            disabled={saveMutation.isPending || !usageMonth}
            onClick={() => {
              const payload = rows.filter((r) => r.staffId && r.weightPercent)
              if (payload.length === 0) {
                toast.error('请至少配置一名员工及权重')
                return
              }
              saveMutation.mutate({
                usageMonth,
                recipientDept: dept,
                customerIncentiveLabel: incentiveLabel,
                rows: payload.map((r) => ({
                  staffId: r.staffId,
                  weightPercent: r.weightPercent,
                })),
              })
            }}
          >
            <Save className="mr-1 size-4" />
            保存 {dept} · {incentiveLabel}
          </Button>
        </div>

        {currentBucket.length > 0 && (
          <p className="text-muted-foreground text-xs">
            已保存 {currentBucket.length} 条；重新跑批后生效池内二次分配。
          </p>
        )}
      </CardContent>
    </Card>
  )
}
