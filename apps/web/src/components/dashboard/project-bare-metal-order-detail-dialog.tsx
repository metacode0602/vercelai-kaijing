'use client'

import { Loader2 } from 'lucide-react'
import { Alert, AlertDescription } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { trpc } from '@/lib/trpc/client'
import {
  BARE_METAL_ORDER_MARK_LABELS,
  BARE_METAL_ORDER_SOURCE_LABELS,
  BARE_METAL_ORDER_STATUS_LABELS,
  computeBareMetalDiscountAmount,
  countBareMetalDevicesAwaitingRevenue,
  formatBareMetalBalanceConsumptionFormula,
  formatBareMetalDateTime,
  formatBareMetalMoney,
} from '@/lib/supplier/bare-metal-order-utils'

type ProjectBareMetalOrderDetailDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: string | null
} & (
  | { projectId: string; tenantId?: undefined }
  | { tenantId: string; projectId?: undefined }
)

export function ProjectBareMetalOrderDetailDialog({
  open,
  onOpenChange,
  orderId,
  projectId,
  tenantId,
}: ProjectBareMetalOrderDetailDialogProps) {
  const projectQuery = trpc.crm.projects.getBareMetalOrder.useQuery(
    { projectId: projectId!, orderId: orderId! },
    { enabled: open && !!orderId && !!projectId },
  )
  const tenantQuery = trpc.crm.tenants.getMetalOrder.useQuery(
    { tenantId: tenantId!, orderId: orderId! },
    { enabled: open && !!orderId && !!tenantId },
  )
  const { data: order, isLoading, error } = projectId ? projectQuery : tenantQuery

  const matchWarnings = order
    ? Object.entries(order.matchFlags ?? {}).filter(([, value]) => Boolean(value))
    : []

  const discountAmount = order
    ? computeBareMetalDiscountAmount({
        orderAmount: order.orderAmount,
        finalAmount: order.finalAmount,
      })
    : 0
  const balanceFormula = order
    ? formatBareMetalBalanceConsumptionFormula({
        finalAmount: order.finalAmount,
        couponAmount: order.couponAmount,
        balanceAmount: order.balanceAmount,
      })
    : ''
  const awaitingRevenueCount = order ? countBareMetalDevicesAwaitingRevenue(order.devices) : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl min-w-[40vw] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {isLoading ? (
              '加载订单明细…'
            ) : order ? (
              <>
                <span>{order.orderNo ?? order.id}</span>
                <Badge variant={order.orderMark === 'offline' ? 'secondary' : 'default'}>
                  {BARE_METAL_ORDER_MARK_LABELS[order.orderMark] ?? order.orderMark}
                </Badge>
                <Badge variant="outline">
                  {BARE_METAL_ORDER_STATUS_LABELS[order.status] ?? order.status}
                </Badge>
                <Badge variant="outline">
                  {BARE_METAL_ORDER_SOURCE_LABELS[order.source] ?? order.source}
                </Badge>
              </>
            ) : (
              '订单明细'
            )}
          </DialogTitle>
          <DialogDescription>
            来自 bare_metal_order 表，含订单头信息与设备明细。
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-auto flex-1 -mx-1 px-1 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="size-5 animate-spin mr-2" />
              加载中…
            </div>
          ) : error || !order ? (
            <Alert variant="destructive">
              <AlertDescription>{error?.message ?? '订单不存在'}</AlertDescription>
            </Alert>
          ) : (
            <>
              {awaitingRevenueCount > 0 && (
                <Alert>
                  <AlertDescription>
                    共 {awaitingRevenueCount} 台设备处于开通中或尚未记录租用时段，暂不纳入确收与月度消耗统计；待平台同步后自动更新。
                  </AlertDescription>
                </Alert>
              )}

              {matchWarnings.length > 0 && (
                <Alert>
                  <AlertDescription>
                    匹配警告：{matchWarnings.map(([key]) => key).join('、')}
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm rounded-md border p-4">
                <div>
                  <p className="text-muted-foreground">租户</p>
                  <p className="font-medium">{order.tenantName ?? '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">机房</p>
                  <p className="font-medium">{order.dataCenterName ?? order.idcName ?? '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">设备台数 / GPU 卡数</p>
                  <p className="font-medium">
                    {order.deviceCount} 台 / {order.gpuCount} 卡
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">租期摘要</p>
                  <p className="font-medium">{order.purchaseQtyText ?? '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">租用时段</p>
                  <p className="font-medium">
                    {formatBareMetalDateTime(order.rentStartsAt)} ~{' '}
                    {formatBareMetalDateTime(order.rentEndsAt)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">下单时间</p>
                  <p className="font-medium">{formatBareMetalDateTime(order.orderedAt)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">订单金额</p>
                  <p className="font-medium">{formatBareMetalMoney(order.orderAmount)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">折扣金额</p>
                  <p className="font-medium">{formatBareMetalMoney(discountAmount)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">订单金额 − 折后应付金额</p>
                </div>
                <div>
                  <p className="text-muted-foreground">折后应付金额</p>
                  <p className="font-medium text-lg">{formatBareMetalMoney(order.finalAmount)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">算力券支付</p>
                  <p className="font-medium">{formatBareMetalMoney(order.couponAmount)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">余额支付</p>
                  <p className="font-medium">{formatBareMetalMoney(order.balanceAmount)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">{balanceFormula}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">计费单位</p>
                  <p className="font-medium">{order.billingUnit}</p>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">
                  设备列表（{order.devices.length} 行）
                </p>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>行号</TableHead>
                        <TableHead>型号</TableHead>
                        <TableHead>卡数</TableHead>
                        <TableHead>平台状态</TableHead>
                        <TableHead>租用时段</TableHead>
                        <TableHead>时长(h)</TableHead>
                        <TableHead>卡时单价</TableHead>
                        <TableHead>行金额</TableHead>
                        <TableHead>分配状态</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {order.devices.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={9}
                            className="text-center text-muted-foreground py-8"
                          >
                            暂无设备明细
                          </TableCell>
                        </TableRow>
                      ) : (
                        order.devices.map((device) => (
                          <TableRow key={device.id}>
                            <TableCell>{device.lineNo}</TableCell>
                            <TableCell>
                              {device.gpuCardTypeCode ?? device.deviceModelText ?? '—'}
                            </TableCell>
                            <TableCell>{device.gpuCount}</TableCell>
                            <TableCell className="text-sm">
                              {device.deviceStatus ?? '—'}
                              {device.revenuePending ? (
                                <span className="block text-xs text-amber-600 dark:text-amber-500">
                                  待确收
                                </span>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                              {device.rentStartsAt && device.rentEndsAt ? (
                                <>
                                  {formatBareMetalDateTime(device.rentStartsAt)} ~{' '}
                                  {formatBareMetalDateTime(device.rentEndsAt)}
                                </>
                              ) : (
                                <span className="text-amber-600 dark:text-amber-500">
                                  待平台回写
                                </span>
                              )}
                            </TableCell>
                            <TableCell>{device.durationHours ?? '—'}</TableCell>
                            <TableCell>{formatBareMetalMoney(device.unitPricePerCardHour)}</TableCell>
                            <TableCell>{formatBareMetalMoney(device.lineAmount)}</TableCell>
                            <TableCell>{device.allocationStatus}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
