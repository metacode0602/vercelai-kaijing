'use client'

import { useEffect, useMemo, useState } from 'react'
import { IconRefresh } from '@tabler/icons-react'
import { Search, Upload, X } from 'lucide-react'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card'
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
import { ProjectBareMetalOrderDetailDialog } from '@/components/dashboard/project-bare-metal-order-detail-dialog'
import { ProjectBareMetalOrderSyncDialog } from '@/components/dashboard/project-bare-metal-order-sync-dialog'
import { ProjectOfflineBareMetalOrderImportDialog } from '@/components/dashboard/project-offline-bare-metal-order-import-dialog'
import { CopyToClipboard } from '@/components/shared/copy-to-clipboard'
import { ListPagination } from '@/components/shared/list-pagination'
import { trpc } from '@/lib/trpc/client'
import type { Project } from '@/lib/data/types'
import {
  BARE_METAL_ORDER_MARK_LABELS,
  BARE_METAL_ORDER_SOURCE_LABELS,
  BARE_METAL_ORDER_STATUS_LABELS,
  formatBareMetalDateTime,
  formatBareMetalMoney,
  formatBareMetalPurchaseQty,
  computeBareMetalDiscountAmount,
} from '@/lib/supplier/bare-metal-order-utils'

interface ProjectOrdersPanelProps {
  project: Project
}

const BARE_METAL_PAGE_SIZE = 20

const EMPTY_BARE_METAL_FILTERS = {
  orderNo: '',
  gpuCard: '',
  dataCenter: '',
  orderedFrom: '',
  orderedTo: '',
}

export function ProjectOrdersPanel({ project }: ProjectOrdersPanelProps) {
  const [importOpen, setImportOpen] = useState(false)
  const [incrementalSyncOpen, setIncrementalSyncOpen] = useState(false)
  const [backfillOpen, setBackfillOpen] = useState(false)
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null)
  const [bareMetalPage, setBareMetalPage] = useState(1)
  const [filters, setFilters] = useState(EMPTY_BARE_METAL_FILTERS)
  const { data: bareMetalSyncConfig } = trpc.crm.bareMetalOrderSync.getConfig.useQuery()

  const bareMetalQueryInput = useMemo(
    () => ({
      projectId: project.id,
      page: bareMetalPage,
      pageSize: BARE_METAL_PAGE_SIZE,
      orderNo: filters.orderNo.trim() || undefined,
      gpuCard: filters.gpuCard.trim() || undefined,
      dataCenter: filters.dataCenter.trim() || undefined,
      orderedFrom: filters.orderedFrom || undefined,
      orderedTo: filters.orderedTo || undefined,
    }),
    [project.id, bareMetalPage, filters],
  )

  const hasActiveFilters =
    Boolean(filters.orderNo.trim()) ||
    Boolean(filters.gpuCard.trim()) ||
    Boolean(filters.dataCenter.trim()) ||
    Boolean(filters.orderedFrom) ||
    Boolean(filters.orderedTo)

  const {
    data: bareMetalData,
    refetch: refetchBareMetal,
    isLoading: bareMetalLoading,
    isFetching: bareMetalFetching,
  } = trpc.crm.projects.listBareMetalOrders.useQuery(bareMetalQueryInput)
  const bareMetalOrders = bareMetalData?.items ?? []
  const bareMetalTotal = bareMetalData?.total ?? 0
  const bareMetalTotalPages = Math.max(1, Math.ceil(bareMetalTotal / BARE_METAL_PAGE_SIZE))

  useEffect(() => {
    setBareMetalPage(1)
  }, [project.id])

  useEffect(() => {
    setBareMetalPage(1)
  }, [
    filters.orderNo,
    filters.gpuCard,
    filters.dataCenter,
    filters.orderedFrom,
    filters.orderedTo,
  ])

  const handleSynced = () => {
    setBareMetalPage(1)
    void refetchBareMetal()
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">裸金属订单</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIncrementalSyncOpen(true)}
            >
              <IconRefresh className="size-4 mr-1.5" />
              同步裸金属订单
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBackfillOpen(true)}
            >
              补同步遗漏
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="size-4 mr-1.5" />
              导入线下裸金属订单
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="border-b px-4 py-3 flex flex-wrap gap-3 items-end">
            <div className="space-y-1.5 min-w-[160px]">
              <Label htmlFor="bare-metal-filter-order-no" className="text-xs">
                订单号
              </Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  id="bare-metal-filter-order-no"
                  className="pl-8 h-8"
                  placeholder="模糊匹配"
                  value={filters.orderNo}
                  onChange={(e) => setFilters((prev) => ({ ...prev, orderNo: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5 min-w-[160px]">
              <Label htmlFor="bare-metal-filter-gpu-card" className="text-xs">
                卡型
              </Label>
              <Input
                id="bare-metal-filter-gpu-card"
                className="h-8"
                placeholder="卡型编码/名称"
                value={filters.gpuCard}
                onChange={(e) => setFilters((prev) => ({ ...prev, gpuCard: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 min-w-[160px]">
              <Label htmlFor="bare-metal-filter-data-center" className="text-xs">
                机房
              </Label>
              <Input
                id="bare-metal-filter-data-center"
                className="h-8"
                placeholder="机房名称"
                value={filters.dataCenter}
                onChange={(e) => setFilters((prev) => ({ ...prev, dataCenter: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bare-metal-filter-ordered-from" className="text-xs">
                下单开始
              </Label>
              <Input
                id="bare-metal-filter-ordered-from"
                type="date"
                className="h-8 w-[150px]"
                value={filters.orderedFrom}
                onChange={(e) => setFilters((prev) => ({ ...prev, orderedFrom: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bare-metal-filter-ordered-to" className="text-xs">
                下单结束
              </Label>
              <Input
                id="bare-metal-filter-ordered-to"
                type="date"
                className="h-8 w-[150px]"
                value={filters.orderedTo}
                onChange={(e) => setFilters((prev) => ({ ...prev, orderedTo: e.target.value }))}
              />
            </div>
            {hasActiveFilters ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => setFilters(EMPTY_BARE_METAL_FILTERS)}
              >
                <X className="size-3.5 mr-1" />
                重置
              </Button>
            ) : null}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>标记</TableHead>
                <TableHead>订单编号</TableHead>
                <TableHead>机房</TableHead>
                <TableHead>卡型</TableHead>
                <TableHead>设备/卡数</TableHead>
                <TableHead>数量/单位</TableHead>
                <TableHead>金额</TableHead>
                <TableHead>算力券支付</TableHead>
                <TableHead>折扣</TableHead>
                <TableHead>余额支付</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>下单时间</TableHead>
                <TableHead>来源</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {bareMetalLoading ? (
                <TableRow>
                  <TableCell colSpan={14} className="text-center text-muted-foreground py-8">
                    加载中…
                  </TableCell>
                </TableRow>
              ) : bareMetalTotal === 0 ? (
                <TableRow>
                  <TableCell colSpan={14} className="text-center text-muted-foreground py-8">
                    {hasActiveFilters ? '暂无符合条件的裸金属订单' : '暂无裸金属订单'}
                  </TableCell>
                </TableRow>
              ) : (
                bareMetalOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Badge variant={order.orderMark === 'offline' ? 'secondary' : 'default'}>
                        {BARE_METAL_ORDER_MARK_LABELS[order.orderMark] ?? order.orderMark}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-sm">{order.orderNo ?? '—'}</span>
                        {order.orderNo ? (
                          <CopyToClipboard text={order.orderNo} tooltip="复制订单编号" />
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{order.dataCenterName ?? order.idcName ?? '—'}</TableCell>
                    <TableCell>{order.gpuCardSummary ?? '—'}</TableCell>
                    <TableCell>
                      {order.deviceCount} 台 / {order.gpuCount} 卡
                    </TableCell>
                    <TableCell>
                      {formatBareMetalPurchaseQty({
                        purchaseQty: order.purchaseQty,
                        billingUnit: order.billingUnit,
                        purchaseQtyText: order.purchaseQtyText,
                      })}
                    </TableCell>
                    <TableCell>{formatBareMetalMoney(order.finalAmount)}</TableCell>
                    <TableCell className="tabular-nums">
                      {formatBareMetalMoney(order.couponAmount)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatBareMetalMoney(
                        computeBareMetalDiscountAmount({
                          orderAmount: order.orderAmount,
                          finalAmount: order.finalAmount,
                        }),
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatBareMetalMoney(order.balanceAmount)}
                    </TableCell>
                    <TableCell>
                      {BARE_METAL_ORDER_STATUS_LABELS[order.status] ?? order.status}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatBareMetalDateTime(order.orderedAt)}
                    </TableCell>
                    <TableCell>
                      {BARE_METAL_ORDER_SOURCE_LABELS[order.source] ?? order.source}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDetailOrderId(order.id)}
                      >
                        查看明细
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <ListPagination
            page={bareMetalPage}
            totalPages={bareMetalTotalPages}
            totalItems={bareMetalTotal}
            pageSize={BARE_METAL_PAGE_SIZE}
            onPageChange={setBareMetalPage}
          />
          {bareMetalFetching && !bareMetalLoading ? (
            <p className="text-muted-foreground text-xs px-4 pb-3">刷新中…</p>
          ) : null}
        </CardContent>
      </Card>

      <ProjectBareMetalOrderSyncDialog
        open={incrementalSyncOpen}
        onOpenChange={setIncrementalSyncOpen}
        project={project}
        mode="incremental"
        windowDays={bareMetalSyncConfig?.windowDays}
        onSynced={handleSynced}
      />

      <ProjectBareMetalOrderSyncDialog
        open={backfillOpen}
        onOpenChange={setBackfillOpen}
        project={project}
        mode="backfill"
        windowDays={bareMetalSyncConfig?.windowDays}
        onSynced={handleSynced}
      />

      <ProjectOfflineBareMetalOrderImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        project={project}
        onImported={() => {
          setBareMetalPage(1)
          void refetchBareMetal()
        }}
      />

      <ProjectBareMetalOrderDetailDialog
        open={detailOrderId != null}
        onOpenChange={(open) => {
          if (!open) setDetailOrderId(null)
        }}
        projectId={project.id}
        orderId={detailOrderId}
      />
    </div>
  )
}
