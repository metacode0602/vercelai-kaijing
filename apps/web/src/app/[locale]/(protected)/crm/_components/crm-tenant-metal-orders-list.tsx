"use client"

import * as React from "react"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { ProjectBareMetalOrderDetailDialog } from "@/components/dashboard/project-bare-metal-order-detail-dialog"
import { StatusBadge } from "@/components/dashboard/status-badge"
import { ListPagination } from "@/components/shared/list-pagination"
import { trpc } from "@/lib/trpc/client"
import type { TenantBareMetalOrderListItem } from "@/lib/types/tenant-billing-list"
import {
  billingUnitLabels,
  formatDateTime,
  formatRmb,
  orderStatusLabels,
} from "./crm-tenant-billing-shared"

const PAGE_SIZE = 20

function summarizeGpu(order: TenantBareMetalOrderListItem) {
  if (order.gpuCount != null && order.deviceModel) {
    return `${order.deviceModel} × ${order.gpuCount}`
  }
  if (order.items.length > 0) {
    return order.items.map((item) => `${item.name} × ${item.quantity}`).join("，")
  }
  return "—"
}

function summarizeDeviceCount(order: TenantBareMetalOrderListItem) {
  if (order.deviceCount != null) return String(order.deviceCount)
  return "—"
}

export function CrmTenantMetalOrdersList({ tenantId }: { tenantId: string }) {
  const [page, setPage] = React.useState(1)
  const [detailOrderId, setDetailOrderId] = React.useState<string | null>(null)

  React.useEffect(() => {
    setPage(1)
  }, [tenantId])

  const { data, isLoading, isFetching } = trpc.crm.tenants.listMetalOrders.useQuery(
    { tenantId, page, pageSize: PAGE_SIZE },
    { placeholderData: (prev) => prev },
  )

  const rows = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>裸金属订单</CardTitle>
        <CardDescription>
          来自 bare_metal_order，共 {total} 条
          {isLoading ? "，加载中…" : isFetching ? "，刷新中…" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-muted-foreground text-sm">加载中…</p>
        ) : total === 0 ? (
          <p className="text-muted-foreground text-sm">暂无裸金属订单，可通过「从平台同步账单」导入。</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>订单号</TableHead>
                    <TableHead>机房</TableHead>
                    <TableHead>设备数</TableHead>
                    <TableHead>GPU</TableHead>
                    <TableHead>计费单位</TableHead>
                    <TableHead className="text-right">订单金额</TableHead>
                    <TableHead className="text-right">算力券支付</TableHead>
                    <TableHead className="text-right">折后应付金额</TableHead>
                    <TableHead className="text-right">余额支付</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>下单时间</TableHead>
                    <TableHead className="w-[88px]">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">{row.orderNo || "—"}</TableCell>
                      <TableCell>{row.dataCenterName ?? "—"}</TableCell>
                      <TableCell>{summarizeDeviceCount(row)}</TableCell>
                      <TableCell>{summarizeGpu(row)}</TableCell>
                      <TableCell>{row.unit ? (billingUnitLabels[row.unit] ?? row.unit) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatRmb(row.orderAmount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatRmb(row.couponAmount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatRmb(row.discountAmount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatRmb(row.balanceAmount)}</TableCell>

                      <TableCell>
                        <StatusBadge status={row.status} labelMap={orderStatusLabels} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {formatDateTime(row.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setDetailOrderId(row.id)}
                        >
                          查看详情
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ListPagination
              page={page}
              totalPages={totalPages}
              totalItems={total}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </>
        )}
      </CardContent>
    </Card>

    <ProjectBareMetalOrderDetailDialog
      open={detailOrderId != null}
      onOpenChange={(open) => {
        if (!open) setDetailOrderId(null)
      }}
      tenantId={tenantId}
      orderId={detailOrderId}
    />
    </>
  )
}
