'use client'

import { use, useState } from 'react'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  Clock,
  Copy,
  Cpu,
  Globe,
  HardDrive,
  Loader2,
  Power,
  RefreshCw,
  Terminal,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import { LocaleLink, useLocaleRouter } from '@/lib/i18n/navigation'
import { cn } from '@workspace/ui/lib/utils'
import { trpc } from '@/trpc/client'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@workspace/ui/components/alert-dialog'
import { Alert, AlertDescription } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Card } from '@workspace/ui/components/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@workspace/ui/components/breadcrumb'

function formatCNY(amount: number) {
  return `¥${amount.toFixed(2)}`
}

function formatDateTime(dateStr: string | Date | null): string {
  if (!dateStr) return '—'
  try {
    const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
    return d.toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return String(dateStr)
  }
}

function formatDate(dateStr: string | Date | null): string {
  if (!dateStr) return '—'
  try {
    const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
  } catch {
    return String(dateStr)
  }
}

function daysUntil(dateStr: string | null) {
  if (!dateStr) return null
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (diff < 0) return `${Math.abs(diff)} 天前已到期`
  if (diff === 0) return '今天到期'
  return `${diff} 天后到期`
}

const statusMeta: Record<string, { dot: string; label: string; badge: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  pending: { dot: 'bg-chart-4 animate-pulse', label: '待部署', badge: 'secondary' },
  provisioning: { dot: 'bg-chart-4 animate-pulse', label: '部署中', badge: 'secondary' },
  running: { dot: 'bg-primary', label: '运行中', badge: 'default' },
  active: { dot: 'bg-primary', label: '运行中', badge: 'default' },
  stopping: { dot: 'bg-muted-foreground', label: '停止中', badge: 'outline' },
  stopped: { dot: 'bg-muted-foreground', label: '已停止', badge: 'outline' },
  overdue: { dot: 'bg-destructive', label: '已逾期', badge: 'destructive' },
  expired: { dot: 'bg-destructive', label: '已过期', badge: 'destructive' },
  cancelled: { dot: 'bg-muted-foreground', label: '已取消', badge: 'outline' },
  released: { dot: 'bg-muted-foreground', label: '已释放', badge: 'outline' },
}

const payStatusLabels: Record<string, string> = {
  unpaid: '未支付',
  paid: '已支付',
  partial_refund: '部分退款',
  full_refund: '全额退款',
}

const billingUnitLabels: Record<string, string> = {
  hour: '按小时',
  day: '按天',
  week: '按周',
  month: '按月',
}

export default function MetalInstanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useLocaleRouter()
  const utils = trpc.useUtils()

  const { data: order, isLoading, error } = trpc.metal.orderGetById.useQuery({ id })
  const { data: logs } = trpc.metal.orderLogs.useQuery({ orderId: id })

  const [confirmAction, setConfirmAction] = useState<'start' | 'shutdown' | null>(null)
  const [releaseOpen, setReleaseOpen] = useState(false)
  const [releaseReason, setReleaseReason] = useState('')

  const stopMutation = trpc.metal.orderStop.useMutation({
    onSuccess: () => {
      utils.metal.orderGetById.invalidate({ id })
      utils.metal.orderList.invalidate()
      toast.success('设备已关机')
    },
    onError: (e) => toast.error(e.message),
  })

  const cancelMutation = trpc.metal.orderCancel.useMutation({
    onSuccess: () => {
      utils.metal.orderGetById.invalidate({ id })
      utils.metal.orderList.invalidate()
      toast.success('订单已取消')
      router.push('/console/metal/instances')
    },
    onError: (e) => toast.error(e.message),
  })

  const renewMutation = trpc.metal.orderRenew.useMutation({
    onSuccess: () => {
      utils.metal.orderGetById.invalidate({ id })
      toast.success('续租成功')
    },
    onError: (e) => toast.error(e.message),
  })

  const toggleAutoRenewMutation = trpc.metal.orderToggleAutoRenew.useMutation({
    onSuccess: () => {
      utils.metal.orderGetById.invalidate({ id })
      toast.success('自动续租设置已更新')
    },
    onError: (e) => toast.error(e.message),
  })

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 pb-32 pt-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="size-5 animate-spin mr-2" />
          加载中…
        </div>
      </div>
    )
  }

  if (error || !order) {
    notFound()
  }

  const st = statusMeta[order.status] ?? { dot: 'bg-muted-foreground', label: order.status, badge: 'outline' as const }
  const isRunning = order.status === 'running' || order.status === 'active'
  const isStopped = order.status === 'stopped'
  const isPending = order.status === 'pending' || order.status === 'provisioning'
  const isActive = order.status === 'active' || order.status === 'running' || order.status === 'stopped' || order.status === 'overdue'

  function copy(text: string, label: string) {
    navigator.clipboard?.writeText(text)
    toast.success(`已复制${label}`)
  }

  return (
    <>
      <div className="container mx-auto px-4 pb-32 pt-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <LocaleLink href="/console/metal/instances">我的裸金属</LocaleLink>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{order.description || order.orderNo || order.id.slice(0, 8)}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <section className="mb-6">
          <Card className="gap-4 rounded-2xl p-4 ring-border/80">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-accent">
                  <HardDrive className="size-5 text-accent-foreground" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-semibold text-foreground">
                      {order.description || order.orderNo || '裸金属订单'}
                    </p>
                    <Badge variant={st.badge} className="gap-1.5">
                      <span className={cn('size-1.5 rounded-full', st.dot)} />
                      {st.label}
                    </Badge>
                    {(stopMutation.isPending || cancelMutation.isPending) && (
                      <Badge variant="outline" className="gap-1 text-xs">
                        <Loader2 className="size-3 animate-spin" />
                        处理中
                      </Badge>
                    )}
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">{order.orderNo ?? order.id}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3" />
                    创建于 {formatDateTime(order.orderedAt)}
                  </p>
                </div>
              </div>

              {/* Actions */}
              {isActive && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => setConfirmAction('start')}
                    disabled={!isStopped || stopMutation.isPending || isPending}
                  >
                    <Power className="size-3.5" />
                    开机
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmAction('shutdown')}
                    disabled={!isRunning || stopMutation.isPending}
                  >
                    <Power className="size-3.5" />
                    关机
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setReleaseOpen(true)}
                    disabled={isPending || stopMutation.isPending}
                  >
                    取消订单
                  </Button>
                </div>
              )}
            </div>

            {isRunning && (
              <Alert className="border-border bg-muted/50 py-2">
                <AlertTriangle className="text-muted-foreground" />
                <AlertDescription className="text-xs text-muted-foreground">
                  裸金属为预付费产品，费用在下单时一次性收取。关机不退还剩余时长费用，开机不额外计费。
                </AlertDescription>
              </Alert>
            )}
          </Card>
        </section>

        <div className="flex flex-col gap-4">
          {/* 设备信息 */}
          <Card className="gap-4 rounded-2xl p-4 ring-border/80">
            <h2 className="text-sm font-bold flex items-center gap-2">
              <Cpu className="size-4" />
              设备信息
            </h2>
            <div className="grid gap-4 text-sm sm:grid-cols-2">
              <InfoItem label="GPU 卡型" value={order.gpuModelName ?? '—'} />
              <InfoItem label="GPU 数量" value={`${order.gpuCount} 卡`} />
              <InfoItem label="设备数量" value={`${order.deviceCount} 台`} />
              <InfoItem label="机房" value={order.dataCenterName ?? '—'} />
              <InfoItem label="订单描述" value={order.description ?? '—'} />
              <InfoItem label="工作区" value={order.workspaceId ?? '—'} mono />
            </div>
          </Card>

          {/* 租用信息 */}
          <Card className="gap-4 rounded-2xl p-4 ring-border/80">
            <h2 className="text-sm font-bold flex items-center gap-2">
              <Clock className="size-4" />
              租用信息
            </h2>
            <div className="grid gap-4 text-sm sm:grid-cols-2">
              <InfoItem label="计费单位" value={billingUnitLabels[order.billingUnit] ?? order.billingUnit} />
              <InfoItem label="租用时长" value={`${order.renewCount ?? 0} 次续租`} />
              <InfoItem label="租期开始" value={formatDate(order.rentStartsAt)} />
              <InfoItem label="租期结束" value={formatDate(order.rentEndsAt)} />
              <InfoItem label="剩余天数" value={daysUntil(order.rentEndsAt) ?? '—'} />
              <InfoItem label="自动续租" value={order.autoRenew ? '已开启' : '未开启'} />
              <InfoItem label="下次扣费" value={order.nextBillingAt ? formatDateTime(order.nextBillingAt) : '—'} />
              <InfoItem label="续租次数" value={`${order.renewCount ?? 0}`} />
            </div>
          </Card>

          {/* 费用信息 */}
          <Card className="gap-4 rounded-2xl p-4 ring-border/80">
            <h2 className="text-sm font-bold">费用信息</h2>
            <div className="grid gap-4 text-sm sm:grid-cols-2">
              <InfoItem label="订单金额" value={formatCNY(order.orderAmount)} />
              <InfoItem label="余额支付" value={formatCNY(order.balanceAmount)} />
              <InfoItem label="算力券" value={formatCNY(order.couponAmount)} />
              <InfoItem label="实付金额" value={formatCNY(order.finalAmount)} highlight />
              <InfoItem label="支付状态" value={payStatusLabels[order.payStatus] ?? order.payStatus} />
            </div>
          </Card>

          {/* SSH 连接 */}
          {order.sshEnabled && (
            <Card className="gap-4 rounded-2xl p-4 ring-border/80">
              <div className="flex items-center gap-2">
                <Terminal className="size-4 text-primary" />
                <h2 className="text-sm font-bold">SSH 连接</h2>
              </div>
              <p className="text-xs text-muted-foreground">
                使用以下信息通过 SSH 登录裸金属主机。实例停止后无法连接。
              </p>
              {order.sshPublicKey && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">SSH 公钥</span>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono text-foreground">
                      {order.sshPublicKey}
                    </code>
                    <Button variant="outline" size="icon" className="size-9 shrink-0" onClick={() => copy(order.sshPublicKey!, '公钥')}>
                      <Copy className="size-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* 设备明细 */}
          <Card className="gap-4 rounded-2xl p-4 ring-border/80">
            <h2 className="text-sm font-bold">设备明细</h2>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>行号</TableHead>
                    <TableHead>GPU 卡型</TableHead>
                    <TableHead>卡数</TableHead>
                    <TableHead>分配状态</TableHead>
                    <TableHead>设备状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.devices?.map((device) => (
                    <TableRow key={device.id}>
                      <TableCell>{device.lineNo}</TableCell>
                      <TableCell>{device.gpuCardTypeName ?? '—'}</TableCell>
                      <TableCell>{device.gpuCount}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{device.allocationStatus}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{device.deviceStatus ?? '—'}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* 订单日志 */}
          {logs && logs.length > 0 && (
            <Card className="gap-4 rounded-2xl p-4 ring-border/80">
              <h2 className="text-sm font-bold flex items-center gap-2">
                <Globe className="size-4" />
                订单日志（最近 {logs.length} 条）
              </h2>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>事件</TableHead>
                      <TableHead>状态变更</TableHead>
                      <TableHead>描述</TableHead>
                      <TableHead>时间</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          <Badge variant="outline">{log.eventType}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {log.previousStatus && log.newStatus
                            ? `${log.previousStatus} → ${log.newStatus}`
                            : log.newStatus ?? '—'}
                        </TableCell>
                        <TableCell className="text-xs max-w-[300px] truncate">
                          {log.description ?? '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDateTime(log.occurredAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Start/Stop confirmation dialog */}
      <AlertDialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === 'start' ? '确认开机？' : '确认关机？'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === 'start'
                ? '开机后设备重新启动并可 SSH 连接。裸金属为预付费产品，开机不影响已付费用。'
                : '关机将停止 SSH 连接，设备仍被锁定。裸金属为预付费产品，关机不退还剩余时长费用。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (confirmAction === 'shutdown') {
                stopMutation.mutate({ orderId: id })
              }
              setConfirmAction(null)
            }}>
              {confirmAction === 'start' ? '开机' : '关机'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Release confirmation dialog */}
      <AlertDialog open={releaseOpen} onOpenChange={setReleaseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认取消订单？</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>取消后订单将被终止，设备将被释放。此操作不可撤销。</p>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">取消原因（可选）</label>
                <select
                  value={releaseReason}
                  onChange={(e) => setReleaseReason(e.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">请选择原因</option>
                  <option value="completed">任务已完成</option>
                  <option value="too-expensive">费用超出预算</option>
                  <option value="wrong-spec">规格不满足需求</option>
                  <option value="other">其他原因</option>
                </select>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                cancelMutation.mutate({ orderId: id })
                setReleaseOpen(false)
              }}
            >
              确认取消
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function InfoItem({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('font-medium', highlight && 'text-lg text-primary', mono && 'font-mono text-xs')}>{value}</p>
    </div>
  )
}
