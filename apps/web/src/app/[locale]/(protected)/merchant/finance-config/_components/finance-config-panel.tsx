'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import { Textarea } from '@workspace/ui/components/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { ListPagination } from '@/components/shared/list-pagination'
import { trpc } from '@/lib/trpc/client'

type AuditPage = {
  items: Array<{
    id: string
    configKey: string
    oldValue: number | null
    newValue: number
    operatorName: string
    occurredAt: string
    remark: string | null
  }>
  total: number
  page: number
  pageSize: number
}

type Impact = { unblocked: number; newlyBlocked: number; inheriting: number }

const KEY_LABEL: Record<string, string> = {
  recharge_block_threshold: '充值阻断阈值',
}

/**
 * 全局充值阻断阈值配置面板
 *
 * 三态语义（与 billing 的 resolveRechargeBlockThreshold 一致）：
 *   0        = 全局不阻断
 *   > 0      = 可用额低于此值的商户，其终端用户充值返回 402
 *   未配置    = 等价于 0
 *
 * 商户级覆盖优先级更高（NULL 继承全局 / >0 覆盖 / =0 显式永不阻断），
 * 所以改全局只影响「继承中」的商户。保存前强制预览影响面并二次确认，
 * 因为这一步可能一次性阻断大量商户的终端用户充值。
 */
export function FinanceConfigPanel({
  threshold,
  configured,
  audit,
}: {
  threshold: number
  configured: boolean
  audit: AuditPage
}) {
  const router = useRouter()
  const utils = trpc.useUtils()

  const [draft, setDraft] = useState(String(threshold))
  const [remark, setRemark] = useState('')
  const [impact, setImpact] = useState<Impact | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const parsed = Number(draft)
  const valid = Number.isFinite(parsed) && parsed >= 0
  const dirty = valid && parsed !== threshold

  const preview = trpc.merchant.financeConfig.previewRechargeBlockThreshold.useQuery(
    { value: valid ? parsed : 0 },
    { enabled: false },
  )

  const save = trpc.merchant.financeConfig.setRechargeBlockThreshold.useMutation({
    onSuccess: (r) => {
      toast.success(
        r.oldValue === null
          ? `阈值已设置为 ${r.newValue}`
          : `阈值已从 ${r.oldValue} 调整为 ${r.newValue}`,
      )
      setConfirmOpen(false)
      setImpact(null)
      setRemark('')
      void utils.merchant.financeConfig.invalidate()
      router.refresh()
    },
    onError: (e) => toast.error(e.message),
  })

  const totalPages = Math.max(1, Math.ceil(audit.total / audit.pageSize))

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">商户财务配置</h1>
        <p className="text-muted-foreground text-sm">
          平台级财务参数，调整会即时影响所有商户的充值准入
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            充值阻断阈值
            {configured ? (
              <Badge variant="outline">已配置</Badge>
            ) : (
              <Badge variant="secondary">未配置（不阻断）</Badge>
            )}
          </CardTitle>
          <CardDescription>
            商户三池可用额合计低于此值时，其终端用户充值将被拒绝。
            设为 <strong>0</strong> 表示不阻断。商户级覆盖优先于本值。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="threshold">阈值（元）</Label>
              <Input
                id="threshold"
                type="number"
                min={0}
                step="0.01"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              {!valid && (
                <p className="text-destructive text-xs">请输入不小于 0 的数字</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="remark">变更备注（可选）</Label>
              <Textarea
                id="remark"
                rows={2}
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="例如：Q3 风控收紧，抬高准入线"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              disabled={!dirty}
              onClick={() => preview.refetch()}
            >
              预览影响面
            </Button>
            {dirty && <span className="text-muted-foreground text-xs">当前 {threshold} → {parsed}</span>}
          </div>

          {impact && (
            <div className="bg-muted/40 space-y-2 rounded-md border p-3 text-sm">
              <p className="font-medium">影响面预览</p>
              <ul className="text-muted-foreground space-y-1 text-xs">
                <li>
                  继承全局阈值的商户：<strong>{impact.inheriting}</strong> 个
                </li>
                <li>
                  将从「可充值」变为「被阻断」：<strong>{impact.newlyBlocked}</strong> 个
                </li>
                <li>
                  将从「被阻断」恢复为「可充值」：<strong>{impact.unblocked}</strong> 个
                </li>
              </ul>
              <Button
                size="sm"
                disabled={impact.newlyBlocked > 0 && !confirmOpen}
                onClick={() => setConfirmOpen(true)}
              >
                确认保存
              </Button>
              {impact.newlyBlocked > 0 && !confirmOpen && (
                <p className="text-muted-foreground text-xs">
                  将阻断 {impact.newlyBlocked} 个商户的用户充值，请再次点击以确认
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>变更审计</CardTitle>
          <CardDescription>每次配置变更均留痕，不可删除</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>配置项</TableHead>
                <TableHead>原值</TableHead>
                <TableHead>新值</TableHead>
                <TableHead>操作人</TableHead>
                <TableHead>时间</TableHead>
                <TableHead>备注</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {audit.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground py-8 text-center">
                    暂无变更记录
                  </TableCell>
                </TableRow>
              ) : (
                audit.items.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm">
                      {KEY_LABEL[log.configKey] ?? log.configKey}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {log.oldValue ?? '未配置'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{log.newValue}</TableCell>
                    <TableCell className="text-sm">{log.operatorName}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(log.occurredAt).toLocaleString('zh-CN')}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-48 truncate text-xs">
                      {log.remark ?? '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <ListPagination
            page={audit.page}
            totalPages={totalPages}
            totalItems={audit.total}
            pageSize={audit.pageSize}
            onPageChange={(p) =>
              router.push(`?page=${p}&pageSize=${audit.pageSize}`)
            }
          />
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认调整充值阻断阈值</DialogTitle>
            <DialogDescription>
              阈值 <strong>{threshold}</strong> → <strong>{parsed}</strong>。
              {impact && impact.newlyBlocked > 0 && (
                <>
                  {' '}
                  将立即阻断 <strong>{impact.newlyBlocked}</strong> 个商户的终端用户充值，
                  这些用户会收到「商户额度不足」的失败提示。
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              取消
            </Button>
            <Button
              disabled={save.isPending || !valid}
              onClick={() => save.mutate({ value: parsed, remark: remark || undefined, confirmImpact: true })}
            >
              确认保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
