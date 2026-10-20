'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Eye,
  LinkIcon,
  Loader2,
  MapPin,
  MoreHorizontal,
  Search,
  Server,
  Phone,
  Settings2,
} from 'lucide-react'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Badge } from '@workspace/ui/components/badge'
import { Card, CardContent } from '@workspace/ui/components/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@workspace/ui/components/dropdown-menu'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'
import { Progress } from '@workspace/ui/components/progress'
import { Alert, AlertDescription } from '@workspace/ui/components/alert'
import { ListPagination } from '@/components/shared/list-pagination'
import { PlatformDatacenterImportTrigger } from '@/components/dashboard/platform-datacenter-import-dialog'
import { PlatformDatacenterBindDialog } from '@/components/dashboard/platform-datacenter-bind-dialog'
import { SupplierOpsEngineersDialog } from '@/components/dashboard/supplier-ops-engineers-dialog'
import { SupplierDatacenterImportTrigger } from '@/components/dashboard/supplier-datacenter-import-dialog'
import type { DataCenter } from '@/lib/data/types'
import { trpc } from '@/lib/trpc/client'
import { dcStatusColors, statusNames, dcCooperationStatusNames, dcCooperationStatusColors, dcCooperationStatusIcons, dcCooperationStatusConfirmDescriptions, type DataCenterCooperationStatus } from '@/components/dashboard/supplier-detail-constants'
import { toast } from 'sonner'

const PAGE_SIZE = 20

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return '加载失败，请稍后重试'
}

function formatLocation(dc: DataCenter): string {
  return dc.address || dc.location || '—'
}

function isDatacenterPlatformBound(dc: DataCenter): boolean {
  return !!dc.externalOnboardingId
}

export function DatacentersContent({ supplierIdFilter }: { supplierIdFilter?: string }) {
  const utils = trpc.useUtils()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('online')
  const [cooperationStatusFilter, setCooperationStatusFilter] = useState('active')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [containerInstanceRegionFilter, setContainerInstanceRegionFilter] = useState('')
  const [page, setPage] = useState(1)
  const [bindDataCenter, setBindDataCenter] = useState<DataCenter | null>(null)
  const [bindDialogOpen, setBindDialogOpen] = useState(false)
  const [opsEngineerDataCenter, setOpsEngineerDataCenter] = useState<DataCenter | null>(null)
  const [opsEngineersDialogOpen, setOpsEngineersDialogOpen] = useState(false)
  const [cooperationConfirmTarget, setCooperationConfirmTarget] = useState<{
    dataCenterId: string
    dataCenterName: string
    cooperationStatus: DataCenterCooperationStatus
  } | null>(null)

  const supplierIdForQuery =
    supplierIdFilter ?? (supplierFilter !== 'all' ? supplierFilter : undefined)

  useEffect(() => {
    setPage(1)
  }, [
    searchTerm,
    statusFilter,
    cooperationStatusFilter,
    supplierFilter,
    containerInstanceRegionFilter,
    supplierIdFilter,
  ])

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = trpc.supplier.listAllDataCenters.useQuery(
    {
      supplierId: supplierIdForQuery,
      search: searchTerm.trim() || undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      cooperationStatus:
        cooperationStatusFilter !== 'all' ? cooperationStatusFilter : undefined,
      containerInstanceRegion: containerInstanceRegionFilter.trim() || undefined,
      page,
      pageSize: PAGE_SIZE,
    },
    { retry: 1, placeholderData: (prev) => prev },
  )

  const dataCenters = data?.items ?? []
  const totalItems = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)

  const { data: stats } = trpc.supplier.getDataCenterStats.useQuery(
    { supplierId: supplierIdFilter },
    { retry: 1 },
  )

  const { data: suppliersData } = trpc.supplier.list.useQuery(
    { page: 1, pageSize: 100 },
    { enabled: !supplierIdFilter },
  )
  const suppliers = suppliersData?.items ?? []

  const updateCooperationStatusMutation = trpc.supplier.updateDataCenterCooperationStatus.useMutation({
    onSuccess: (result) => {
      toast.success(
        `机房「${result.dataCenter.name}」合作状态已设为${dcCooperationStatusNames[result.dataCenter.cooperationStatus]}`,
      )
      setCooperationConfirmTarget(null)
      void utils.supplier.listAllDataCenters.invalidate()
      void utils.supplier.getDataCenterStats.invalidate(
        supplierIdFilter ? { supplierId: supplierIdFilter } : undefined,
      )
      void utils.supplier.list.invalidate()
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const displayStats = stats ?? {
    total: 0,
    online: 0,
    offline: 0,
    maintenance: 0,
    totalGpu: 0,
    onlineGpu: 0,
  }

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        加载机房列表...
      </div>
    )
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="flex flex-wrap items-center gap-3">
          <span>{getErrorMessage(error)}</span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            重试
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  const invalidateDatacenters = () => {
    void utils.supplier.listAllDataCenters.invalidate()
    void utils.supplier.getDataCenterStats.invalidate(
      supplierIdFilter ? { supplierId: supplierIdFilter } : undefined,
    )
    void utils.supplier.list.invalidate()
  }

  const handleBindOpenChange = (open: boolean) => {
    setBindDialogOpen(open)
    if (!open) setBindDataCenter(null)
  }

  const handleOpsEngineersOpenChange = (open: boolean) => {
    setOpsEngineersDialogOpen(open)
    if (!open) setOpsEngineerDataCenter(null)
  }

  return (
    <div className="space-y-6">
      {!supplierIdFilter && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">机房管理</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              数据中心台账、运行状态与 GPU 资源概览
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <PlatformDatacenterImportTrigger onSuccess={invalidateDatacenters} />
            <SupplierDatacenterImportTrigger onSuccess={invalidateDatacenters} />
          </div>
        </div>
      )}

      {!supplierIdFilter && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-foreground">{displayStats.total}</p>
                  <p className="text-xs text-muted-foreground">机房总数</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-foreground">{displayStats.online}</p>
                  <p className="text-xs text-muted-foreground">在线机房</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-500/10">
                  <Settings2 className="h-5 w-5 text-yellow-500" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-foreground">
                    {displayStats.maintenance}
                  </p>
                  <p className="text-xs text-muted-foreground">维护中</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                  <Server className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-foreground">
                    {displayStats.onlineGpu.toLocaleString()}
                    <span className="text-sm font-normal text-muted-foreground">
                      /{displayStats.totalGpu.toLocaleString()}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">在线 GPU</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="border-border bg-card">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[200px] max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索机房名称、编码、地址、供应商..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="运行状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部运行状态</SelectItem>
                <SelectItem value="online">在线</SelectItem>
                <SelectItem value="offline">离线</SelectItem>
                <SelectItem value="maintenance">维护中</SelectItem>
              </SelectContent>
            </Select>
            <Select value={cooperationStatusFilter} onValueChange={setCooperationStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="合作状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部合作状态</SelectItem>
                <SelectItem value="active">合作中</SelectItem>
                <SelectItem value="pause">合作暂停</SelectItem>
                <SelectItem value="inactive">合作终止</SelectItem>
              </SelectContent>
            </Select>
            {!supplierIdFilter && (
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="供应商" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部供应商</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.shortName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Input
              placeholder="容器实例区域"
              className="w-[180px]"
              value={containerInstanceRegionFilter}
              onChange={(e) => setContainerInstanceRegionFilter(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-x-auto border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
            <TableHead className="text-muted-foreground">机房</TableHead>

              {!supplierIdFilter && (
                <TableHead className="text-muted-foreground">供应商</TableHead>
              )}
              <TableHead className="text-muted-foreground">编码</TableHead>
              <TableHead className="text-muted-foreground">容器区域</TableHead>
              <TableHead className="text-muted-foreground">容器编码</TableHead>
              <TableHead className="text-muted-foreground">裸金属区域</TableHead>
              <TableHead className="text-muted-foreground">运行状态</TableHead>
              <TableHead className="text-muted-foreground">合作状态</TableHead>
              <TableHead className="text-muted-foreground">GPU 在线率</TableHead>
              {/* <TableHead className="text-muted-foreground">网络费 (月)</TableHead> */}
              {/* <TableHead className="text-muted-foreground">管控费 (月)</TableHead> */}
              <TableHead className="text-muted-foreground">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {totalItems === 0 ? (
              <TableRow className="border-border">
                <TableCell
                  colSpan={supplierIdFilter ? 9 : 10}
                  className="py-12 text-center text-muted-foreground"
                >
                  {dataCenters.length === 0 && !searchTerm.trim() && statusFilter === 'online' && cooperationStatusFilter === 'active' && supplierFilter === 'all' && !containerInstanceRegionFilter.trim()
                    ? '暂无机房数据，可通过供应商详情页「导入机房」批量新增'
                    : '暂无匹配的机房记录'}
                </TableCell>
              </TableRow>
            ) : (
              dataCenters.map((dc) => {
                const onlineRate =
                  dc.totalDeviceCount > 0
                    ? (dc.onlineDeviceCount / dc.totalDeviceCount) * 100
                    : 0
                return (
                  <TableRow key={dc.id} className="border-border">
                    <TableCell>
                      <Link href={`/supplier/datacenters/${dc.id}`} className="block group">
                        <div className="font-medium text-foreground group-hover:text-primary transition-colors">
                          {dc.name}
                        </div>
                      </Link>
                      {dc.sourceDeleted && (
                        <Badge
                          variant="outline"
                          className="mt-1 border-amber-500/30 bg-amber-500/10 text-amber-400"
                        >
                          源已删除
                        </Badge>
                      )}
                    </TableCell>
                    {!supplierIdFilter && (
                      <TableCell>
                        <Link
                          href={`/supplier/suppliers/${dc.supplierId}`}
                          className="text-sm text-primary hover:underline"
                        >
                          {dc.supplierName}
                        </Link>
                      </TableCell>
                    )}

                    <TableCell>
                      <code className="rounded bg-muted px-2 py-0.5 text-sm text-foreground">
                        {dc.code}
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-foreground">
                        <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="max-w-[180px] truncate">{formatLocation(dc)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-foreground">
                        <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="max-w-[180px] truncate">{dc.containerInstanceRegion}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-foreground">
                        <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="max-w-[180px] truncate">{dc.bareMetalRegion}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={dcStatusColors[dc.status]}>
                        {statusNames[dc.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={dcCooperationStatusColors[dc.cooperationStatus]}
                      >
                        {dcCooperationStatusNames[dc.cooperationStatus]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <Progress value={onlineRate} className="h-2 w-16" />
                          <span className="text-sm text-foreground">
                            {dc.onlineDeviceCount}/{dc.totalDeviceCount}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          CPU {(dc.cpuDeviceCount ?? 0).toLocaleString()} 台
                        </span>
                      </div>
                    </TableCell>
                    {/* <TableCell className="text-foreground">
                      ¥{dc.networkFee.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-foreground">
                      ¥{dc.managementNodeFee.toLocaleString()}
                    </TableCell> */}
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-full">
                          <DropdownMenuItem asChild>
                            <Link href={`/supplier/datacenters/${dc.id}`}>
                              <Eye className="mr-2 h-4 w-4" />
                              查看详情
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => {
                              setOpsEngineerDataCenter(dc)
                              setOpsEngineersDialogOpen(true)
                            }}
                          >
                            <Phone className="mr-2 h-4 w-4" />
                            运维通讯录
                          </DropdownMenuItem>
                          {!isDatacenterPlatformBound(dc) && (
                            <DropdownMenuItem
                              onSelect={() => {
                                setBindDataCenter(dc)
                                setBindDialogOpen(true)
                              }}
                            >
                              <LinkIcon className="mr-2 h-4 w-4" />
                              平台绑定
                            </DropdownMenuItem>
                          )}
                          {(['active', 'pause', 'inactive'] as DataCenterCooperationStatus[])
                            .filter((status) => status !== dc.cooperationStatus).length > 0 && (
                            <DropdownMenuSeparator />
                          )}
                          {(['active', 'pause', 'inactive'] as DataCenterCooperationStatus[])
                            .filter((status) => status !== dc.cooperationStatus)
                            .map((status) => {
                              const StatusIcon = dcCooperationStatusIcons[status]
                              return (
                                <DropdownMenuItem
                                  key={status}
                                  disabled={updateCooperationStatusMutation.isPending}
                                  onSelect={() =>
                                    setCooperationConfirmTarget({
                                      dataCenterId: dc.id,
                                      dataCenterName: dc.name,
                                      cooperationStatus: status,
                                    })
                                  }
                                >
                                  <StatusIcon className="mr-2 h-4 w-4" />
                                  设为{dcCooperationStatusNames[status]}
                                </DropdownMenuItem>
                              )
                            })}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
        {totalItems > 0 && (
          <ListPagination
            page={safePage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        )}
      </Card>

      <PlatformDatacenterBindDialog
        open={bindDialogOpen}
        onOpenChange={handleBindOpenChange}
        dataCenter={bindDataCenter}
        onSuccess={invalidateDatacenters}
      />

      <SupplierOpsEngineersDialog
        open={opsEngineersDialogOpen}
        onOpenChange={handleOpsEngineersOpenChange}
        dataCenter={opsEngineerDataCenter}
      />

      <AlertDialog
        open={cooperationConfirmTarget !== null}
        onOpenChange={(open) => !open && setCooperationConfirmTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {cooperationConfirmTarget
                ? `确认设为${dcCooperationStatusNames[cooperationConfirmTarget.cooperationStatus]}？`
                : ''}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {cooperationConfirmTarget
                ? `将机房「${cooperationConfirmTarget.dataCenterName}」${dcCooperationStatusConfirmDescriptions[cooperationConfirmTarget.cooperationStatus]}`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              type="button"
              disabled={updateCooperationStatusMutation.isPending}
            >
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              disabled={updateCooperationStatusMutation.isPending}
              onClick={() => {
                if (!cooperationConfirmTarget) return
                updateCooperationStatusMutation.mutate({
                  dataCenterId: cooperationConfirmTarget.dataCenterId,
                  cooperationStatus: cooperationConfirmTarget.cooperationStatus,
                })
              }}
            >
              {updateCooperationStatusMutation.isPending ? '处理中…' : '确认'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
