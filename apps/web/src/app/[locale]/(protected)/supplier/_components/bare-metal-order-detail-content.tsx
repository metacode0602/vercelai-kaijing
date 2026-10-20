'use client'

import Link from 'next/link'
import { ArrowLeft, Loader2, Terminal, RefreshCw, AlertTriangle, Clock } from 'lucide-react'
import { Alert, AlertDescription } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card'
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
  countBareMetalDevicesAwaitingRevenue,
  formatBareMetalDateTime,
  formatBareMetalMoney,
  formatBareMetalPurchaseQty,
} from '@/lib/supplier/bare-metal-order-utils'

const PAY_STATUS_LABELS: Record<string, string> = {
  unpaid: '未支付',
  paid: '已支付',
  partial_refund: '部分退款',
  full_refund: '全额退款',
}

export function BareMetalOrderDetailContent({ orderId }: { orderId: string }) {
  const { data: order, isLoading, error } = trpc.supplier.bareMetalOrder.getById.useQuery({ id: orderId })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="size-5 animate-spin mr-2" />
        加载中…
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="space-y-4">
        <Link href="/supplier/bare-metal-orders">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="size-4 mr-1" />
            返回列表
          </Button>
        </Link>
        <Alert variant="destructive">
          <AlertDescription>{error?.message ?? '订单不存在'}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const matchWarnings = Object.entries(order.matchFlags ?? {}).filter(([, v]) => Boolean(v))
  const awaitingRevenueCount = countBareMetalDevicesAwaitingRevenue(order.devices)

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <Link href="/supplier/bare-metal-orders">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="size-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{order.orderNo ?? order.id}</h1>
            <Badge variant={order.orderMark === 'offline' ? 'secondary' : 'default'}>
              {BARE_METAL_ORDER_MARK_LABELS[order.orderMark] ?? order.orderMark}
            </Badge>
            <Badge variant="outline">
              {BARE_METAL_ORDER_STATUS_LABELS[order.status] ?? order.status}
            </Badge>
            <Badge variant="outline">
              {BARE_METAL_ORDER_SOURCE_LABELS[order.source] ?? order.source}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1 font-mono">
            平台 ID：{order.platformOrderId ?? '—'}
          </p>
        </div>
      </div>

      {awaitingRevenueCount > 0 && (
        <Alert>
          <AlertDescription>
            共 {awaitingRevenueCount} 台设备处于开通中（Waiting）或尚未记录租用时段，暂不纳入确收与月度消耗统计；平台同步后将自动更新租期与支付拆分。
          </AlertDescription>
        </Alert>
      )}

      {matchWarnings.length > 0 && (
        <Alert>
          <AlertDescription>
            匹配警告：{matchWarnings.map(([k]) => k).join('、')}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">订单信息</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">租户</p>
            <p className="font-medium">{order.tenantName ?? '—'}</p>
            <p className="text-xs text-muted-foreground font-mono">{order.platformTenantId}</p>
          </div>
          <div>
            <p className="text-muted-foreground">机房</p>
            <p className="font-medium">{order.dataCenterName ?? order.idcName ?? '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">客户</p>
            <p className="font-medium">{order.customerName ?? '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">设备台数 / GPU 卡数</p>
            <p className="font-medium">
              {order.deviceCount} 台 / {order.gpuCount} 卡
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">租期摘要</p>
            <p className="font-medium">{order.purchaseQtyText ?? formatBareMetalPurchaseQty({ purchaseQty: order.purchaseQty, billingUnit: order.billingUnit })}</p>
          </div>
          <div>
            <p className="text-muted-foreground">租用时段</p>
            <p className="font-medium">
              {formatBareMetalDateTime(order.rentStartsAt)} ~ {formatBareMetalDateTime(order.rentEndsAt)}
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
            <p className="text-muted-foreground">商业折扣</p>
            <p className="font-medium">{formatBareMetalMoney(order.discountAmount)}</p>
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
          </div>
          <div>
            <p className="text-muted-foreground">支付状态</p>
            <p className="font-medium">{order.payStatus}</p>
          </div>
          <div>
            <p className="text-muted-foreground">计费单位</p>
            <p className="font-medium">{order.billingUnit}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">设备明细（{order.devices.length} 行）</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
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
                <TableHead>余额支付</TableHead>
                <TableHead>算力券支付</TableHead>
                <TableHead>分配状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.devices.map((device) => (
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
                  <TableCell className="text-sm text-muted-foreground">
                    {device.rentStartsAt && device.rentEndsAt ? (
                      <>
                        {formatBareMetalDateTime(device.rentStartsAt)} ~{' '}
                        {formatBareMetalDateTime(device.rentEndsAt)}
                      </>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-500">待平台回写</span>
                    )}
                  </TableCell>
                  <TableCell>{device.durationHours ?? '—'}</TableCell>
                  <TableCell>{formatBareMetalMoney(device.unitPricePerCardHour)}</TableCell>
                  <TableCell>{formatBareMetalMoney(device.lineAmount)}</TableCell>
                  <TableCell>
                    {device.revenuePending ? (
                      <span className="text-muted-foreground" title="开通中，暂不确收">
                        —
                      </span>
                    ) : (
                      formatBareMetalMoney(device.balanceAmount)
                    )}
                  </TableCell>
                  <TableCell>
                    {device.revenuePending ? (
                      <span className="text-muted-foreground" title="开通中，暂不确收">
                        —
                      </span>
                    ) : (
                      formatBareMetalMoney(device.couponAmount)
                    )}
                  </TableCell>
                  <TableCell>{device.allocationStatus}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* SSH 配置 */}
      {order.sshEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Terminal className="size-4" />
              SSH 配置
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">SSH 已启用</p>
              <p className="font-medium">是</p>
            </div>
            {order.sshPublicKey && (
              <div className="col-span-2">
                <p className="text-muted-foreground">SSH 公钥</p>
                <code className="block mt-1 text-xs bg-muted px-3 py-2 rounded font-mono break-all">
                  {order.sshPublicKey}
                </code>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 自动续租 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="size-4" />
            续租信息
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">自动续租</p>
            <p className="font-medium">{order.autoRenew ? '已开启' : '未开启'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">下次扣费时间</p>
            <p className="font-medium">{order.nextBillingAt ? formatBareMetalDateTime(order.nextBillingAt) : '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">续租次数</p>
            <p className="font-medium">{order.renewCount ?? 0}</p>
          </div>
          <div>
            <p className="text-muted-foreground">工作区</p>
            <p className="font-medium font-mono text-xs">{order.workspaceId ?? '—'}</p>
          </div>
        </CardContent>
      </Card>

      {/* 逾期信息 */}
      {order.overdueRetries != null && order.overdueRetries > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-500" />
              逾期信息
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">逾期重试次数</p>
              <p className="font-medium">{order.overdueRetries}</p>
            </div>
            <div>
              <p className="text-muted-foreground">逾期时间</p>
              <p className="font-medium">{order.overdueAt ? formatBareMetalDateTime(order.overdueAt) : '—'}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 价格快照 */}
      {order.priceSnapshot && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">价格快照</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">卡时单价</p>
              <p className="font-medium">{formatBareMetalMoney(order.priceSnapshot.unitPricePerCardHour)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">GPU 卡数</p>
              <p className="font-medium">{order.priceSnapshot.gpuCount}</p>
            </div>
            <div>
              <p className="text-muted-foreground">订单金额</p>
              <p className="font-medium">{formatBareMetalMoney(order.priceSnapshot.orderAmount)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">价格来源</p>
              <p className="font-medium">{order.priceSnapshot.priceSource ?? '—'}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 订单日志 */}
      {order.logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="size-4" />
              订单日志（最近 {order.logs.length} 条）
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>事件类型</TableHead>
                  <TableHead>状态变更</TableHead>
                  <TableHead>描述</TableHead>
                  <TableHead>操作人</TableHead>
                  <TableHead>时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <Badge variant="outline">{log.eventType}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.previousStatus && log.newStatus
                        ? `${log.previousStatus} → ${log.newStatus}`
                        : log.newStatus ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm max-w-[300px] truncate">
                      {log.description ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.operatorSource === 'user' ? '用户' : log.operatorSource === 'system' ? '系统' : log.operatorId ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatBareMetalDateTime(log.occurredAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
