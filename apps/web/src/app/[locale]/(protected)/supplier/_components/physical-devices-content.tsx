'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Eye,
  Loader2,
  MoreHorizontal,
  Search,
  Server,
} from 'lucide-react'
import { toast } from 'sonner'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@workspace/ui/components/dropdown-menu'
import { Alert, AlertDescription } from '@workspace/ui/components/alert'
import { ListPagination } from '@/components/shared/list-pagination'
import type { DeviceCooperationType, PhysicalDevice } from '@/lib/data/types'
import { DEVICE_COOPERATION_TYPE_LABELS } from '@/lib/data/types'
import { trpc } from '@/lib/trpc/client'
import { LIFECYCLE_STATUS_COLORS } from '@/lib/supplier/onboarding-batch-utils'

const PAGE_SIZE = 20

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return '操作失败，请稍后重试'
}

function formatDeviceIp(device: PhysicalDevice): string {
  if (device.internalIp && device.externalIp) {
    return `${device.internalIp} / ${device.externalIp}`
  }
  return device.internalIp ?? device.externalIp ?? '—'
}

function formatClusterAndRole(device: PhysicalDevice): string {
  if (device.clusterName && device.nodeRole) {
    return `${device.clusterName} · ${device.nodeRole}`
  }
  return device.clusterName ?? device.nodeRole ?? '—'
}

export function PhysicalDevicesContent({ supplierIdFilter }: { supplierIdFilter?: string }) {
  const router = useRouter()
  const utils = trpc.useUtils()

  const [search, setSearch] = useState('')
  const [cardTypeFilter, setCardTypeFilter] = useState('all')
  const [opsStatusFilter, setOpsStatusFilter] = useState('all')
  const [cooperationTypeFilter, setCooperationTypeFilter] = useState<'all' | DeviceCooperationType>('all')
  const [lifecycleFilter, setLifecycleFilter] = useState('all')
  const [maintenanceFilter, setMaintenanceFilter] = useState<'all' | 'yes' | 'no'>('all')
  const [page, setPage] = useState(1)

  useEffect(() => {
    setPage(1)
  }, [
    search,
    cardTypeFilter,
    opsStatusFilter,
    cooperationTypeFilter,
    lifecycleFilter,
    maintenanceFilter,
    supplierIdFilter,
  ])

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = trpc.supplier.listPhysicalDevices.useQuery(
    {
      supplierId: supplierIdFilter,
      search: search.trim() || undefined,
      cardTypeName: cardTypeFilter !== 'all' ? cardTypeFilter : undefined,
      opsStatus: opsStatusFilter !== 'all' ? opsStatusFilter : undefined,
      cooperationType: cooperationTypeFilter !== 'all' ? cooperationTypeFilter : undefined,
      lifecycleStatus: lifecycleFilter !== 'all' ? lifecycleFilter : undefined,
      inMaintenance: maintenanceFilter !== 'all' ? maintenanceFilter : undefined,
      page,
      pageSize: PAGE_SIZE,
    },
    { retry: 1, placeholderData: (prev) => prev },
  )

  const { data: filterOptionsData } = trpc.supplier.listPhysicalDeviceFilterOptions.useQuery(
    { supplierId: supplierIdFilter },
    { retry: 1 },
  )

  const devices = data?.items ?? []
  const totalItems = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const filterOptions = {
    cardTypes: filterOptionsData?.cardTypes ?? [],
    opsStatuses: filterOptionsData?.opsStatuses ?? [],
  }

  const { data: stats } = trpc.supplier.getPhysicalDeviceStats.useQuery(
    { supplierId: supplierIdFilter },
    { retry: 1 },
  )

  const markOnlineMutation = trpc.supplier.markPhysicalDeviceOnline.useMutation({
    onSuccess: (device) => {
      toast.success(`设备 ${device.sn} 已标记上线`)
      void utils.supplier.listPhysicalDevices.invalidate()
      void utils.supplier.getPhysicalDeviceStats.invalidate()
      void utils.supplier.listGpuInventory.invalidate()
    },
    onError: (err) => {
      const message = getErrorMessage(err)
      if (message.includes('已在线')) {
        toast.info(message)
      } else {
        toast.error(message)
      }
    },
  })

  const listMutation = trpc.supplier.listPhysicalDevice.useMutation({
    onSuccess: (device) => {
      toast.success(`设备 ${device.sn} 已上架`)
      void utils.supplier.listPhysicalDevices.invalidate()
    },
    onError: (err) => {
      toast.error(getErrorMessage(err))
    },
  })

  const unlistMutation = trpc.supplier.unlistPhysicalDevice.useMutation({
    onSuccess: (device) => {
      toast.success(`设备 ${device.sn} 已下架`)
      void utils.supplier.listPhysicalDevices.invalidate()
    },
    onError: (err) => {
      toast.error(getErrorMessage(err))
    },
  })

  const setListingDisabledMutation = trpc.supplier.setPhysicalDeviceListingDisabled.useMutation({
    onSuccess: (device) => {
      toast.success(device.listingDisabled ? '已禁止上架' : '已恢复上架')
      void utils.supplier.listPhysicalDevices.invalidate()
    },
    onError: (err) => {
      toast.error(getErrorMessage(err))
    },
  })

  const displayStats = stats ?? {
    total: 0,
    online: 0,
    onboarding: 0,
  }

  const markOnline = (device: PhysicalDevice) => {
    if (device.lifecycleStatus === '在线') {
      toast.info('设备已在线')
      return
    }
    markOnlineMutation.mutate({ deviceId: device.id })
  }

  const listToListed = (device: PhysicalDevice) => {
    listMutation.mutate({ deviceId: device.id })
  }

  const unlistFromMarket = (device: PhysicalDevice) => {
    unlistMutation.mutate({ deviceId: device.id })
  }

  const toggleListingDisabled = (device: PhysicalDevice) => {
    setListingDisabledMutation.mutate({
      deviceId: device.id,
      listingDisabled: !device.listingDisabled,
    })
  }

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        加载物理机列表...
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

  const emptyMessage = '暂无物理机，请先上架设备'

  return (
    <div className="space-y-4">
      {!supplierIdFilter && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          <Card>
            <CardContent className="flex gap-3 p-4">
              <Server className="h-8 w-8 shrink-0 text-primary" />
              <div>
                <p className="text-2xl font-semibold">{displayStats.total}</p>
                <p className="text-xs text-muted-foreground">物理机总数</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-semibold text-green-500">{displayStats.online}</p>
              <p className="text-xs text-muted-foreground">在线</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-semibold text-blue-500">{displayStats.onboarding}</p>
              <p className="text-xs text-muted-foreground">接入中</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap">
          <div className="relative w-full sm:min-w-[200px] sm:max-w-sm sm:flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="搜索 SN、资产号、机房、IP..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
            <Select value={cardTypeFilter} onValueChange={setCardTypeFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="GPU 卡型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部卡型</SelectItem>
                {filterOptions.cardTypes.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={opsStatusFilter} onValueChange={setOpsStatusFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="运营状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部运营状态</SelectItem>
                {filterOptions.opsStatuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={cooperationTypeFilter}
              onValueChange={(v) => setCooperationTypeFilter(v as 'all' | DeviceCooperationType)}
            >
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue placeholder="合作类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部合作类型</SelectItem>
                {(Object.keys(DEVICE_COOPERATION_TYPE_LABELS) as DeviceCooperationType[]).map(
                  (type) => (
                    <SelectItem key={type} value={type}>
                      {DEVICE_COOPERATION_TYPE_LABELS[type]}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
            <Select value={lifecycleFilter} onValueChange={setLifecycleFilter}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue placeholder="生命周期" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部生命周期</SelectItem>
                <SelectItem value="待接入">待接入</SelectItem>
                <SelectItem value="接入中">接入中</SelectItem>
                <SelectItem value="在线">在线</SelectItem>
                <SelectItem value="listed">已上架</SelectItem>
                <SelectItem value="维护中">维护中</SelectItem>
                <SelectItem value="离线">离线</SelectItem>
                <SelectItem value="退订">退订</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={maintenanceFilter}
              onValueChange={(v) => setMaintenanceFilter(v as 'all' | 'yes' | 'no')}
            >
              <SelectTrigger className="col-span-2 w-full sm:col-span-1 sm:w-[130px]">
                <SelectValue placeholder="维修中" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="yes">维修中</SelectItem>
                <SelectItem value="no">非维修中</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <div className="divide-y md:hidden">
          {totalItems === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>
          ) : (
            devices.map((d) => (
              <PhysicalDeviceCard
                key={d.id}
                device={d}
                markingOnline={
                  markOnlineMutation.isPending &&
                  markOnlineMutation.variables?.deviceId === d.id
                }
                onView={() => router.push(`/supplier/devices/${d.id}`)}
                onOnline={() => markOnline(d)}
                onList={() => listToListed(d)}
                onUnlist={() => unlistFromMarket(d)}
                onToggleListingDisabled={() => toggleListingDisabled(d)}
              />
            ))
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <Table className="min-w-[960px]">
            <TableHeader>
              <TableRow>
                <TableHead>SN / 资产号</TableHead>
                <TableHead>供应商</TableHead>
                <TableHead>机房</TableHead>
                <TableHead>卡型</TableHead>
                <TableHead className="hidden xl:table-cell">设备用途</TableHead>
                <TableHead className="hidden lg:table-cell">运营状态</TableHead>
                <TableHead className="hidden xl:table-cell">预期集群服务</TableHead>
                <TableHead className="hidden lg:table-cell">合作类型</TableHead>
                <TableHead className="hidden xl:table-cell">K8s 集群 / 角色</TableHead>
                <TableHead className="hidden lg:table-cell">IP 地址</TableHead>
                <TableHead className="hidden md:table-cell">状态</TableHead>
                <TableHead>生命周期</TableHead>
                <TableHead className="hidden xl:table-cell">子阶段</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {totalItems === 0 ? (
                <TableRow>
                  <TableCell colSpan={14} className="py-8 text-center text-muted-foreground">
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                devices.map((d) => (
                  <PhysicalDeviceRow
                    key={d.id}
                    device={d}
                    markingOnline={
                      markOnlineMutation.isPending &&
                      markOnlineMutation.variables?.deviceId === d.id
                    }
                    onView={() => router.push(`/supplier/devices/${d.id}`)}
                    onOnline={() => markOnline(d)}
                    onList={() => listToListed(d)}
                    onUnlist={() => unlistFromMarket(d)}
                    onToggleListingDisabled={() => toggleListingDisabled(d)}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>

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
    </div>
  )
}

function PhysicalDeviceActions({
  device,
  markingOnline,
  onView,
  onOnline,
  onList,
  onUnlist,
  onToggleListingDisabled,
}: {
  device: PhysicalDevice
  markingOnline: boolean
  onView: () => void
  onOnline: () => void
  onList: () => void
  onUnlist: () => void
  onToggleListingDisabled: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" disabled={markingOnline}>
          {markingOnline ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MoreHorizontal className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onView}>
          <Eye className="mr-2 h-4 w-4" />
          详情
        </DropdownMenuItem>
        {device.lifecycleStatus !== '在线' && (
          <DropdownMenuItem onClick={onOnline} disabled={markingOnline}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            确认上线
          </DropdownMenuItem>
        )}
        {(device.lifecycleStatus === '在线' || device.lifecycleStatus === 'online') && (
          <DropdownMenuItem onClick={onList}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            上架
          </DropdownMenuItem>
        )}
        {device.lifecycleStatus === 'listed' && (
          <DropdownMenuItem onClick={onUnlist}>
            <Server className="mr-2 h-4 w-4" />
            下架
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onToggleListingDisabled}>
          {device.listingDisabled ? (
            <><CheckCircle2 className="mr-2 h-4 w-4" />恢复上架</>
          ) : (
            <><AlertTriangle className="mr-2 h-4 w-4" />禁止上架</>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function PhysicalDeviceCard({
  device,
  markingOnline,
  onView,
  onOnline,
  onList,
  onUnlist,
  onToggleListingDisabled,
}: {
  device: PhysicalDevice
  markingOnline: boolean
  onView: () => void
  onOnline: () => void
  onList: () => void
  onUnlist: () => void
  onToggleListingDisabled: () => void
}) {
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-mono text-sm">{device.sn}</div>
          <div className="truncate text-xs text-muted-foreground">{device.assetNo}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge
            variant="outline"
            className={LIFECYCLE_STATUS_COLORS[device.lifecycleStatus] ?? ''}
          >
            {device.lifecycleStatus}
          </Badge>
          <PhysicalDeviceActions
            device={device}
            markingOnline={markingOnline}
            onView={onView}
            onOnline={onOnline}
            onList={onList}
            onUnlist={onUnlist}
            onToggleListingDisabled={onToggleListingDisabled}
          />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">供应商</dt>
          <dd className="truncate">
            <Link
              href={`/supplier/suppliers/${device.supplierId}`}
              className="text-primary hover:underline"
            >
              {device.supplierShortName}
            </Link>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">机房</dt>
          <dd className="truncate">{device.idcCode}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">卡型</dt>
          <dd className="truncate">{device.cardTypeName}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">合作类型</dt>
          <dd className="truncate">{DEVICE_COOPERATION_TYPE_LABELS[device.cooperationType]}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">运营状态</dt>
          <dd className="truncate">{device.opsStatus ?? '—'}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">维修中</dt>
          <dd>
            {device.inMaintenance ? (
              <Badge
                variant="outline"
                className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30"
              >
                是
              </Badge>
            ) : (
              <span className="text-muted-foreground">否</span>
            )}
          </dd>
          <dt className="text-xs text-muted-foreground mt-1">禁止上架</dt>
          <dd>
            {device.listingDisabled ? (
              <Badge
                variant="outline"
                className="bg-red-500/10 text-red-400 border-red-500/30"
              >
                是
              </Badge>
            ) : (
              <span className="text-muted-foreground">否</span>
            )}
          </dd>
        </div>
        <div className="col-span-2 min-w-0">
          <dt className="text-xs text-muted-foreground">IP 地址</dt>
          <dd className="truncate font-mono text-xs">{formatDeviceIp(device)}</dd>
        </div>
        {device.onboardingSubstage ? (
          <div className="col-span-2 min-w-0">
            <dt className="text-xs text-muted-foreground">子阶段</dt>
            <dd className="truncate text-muted-foreground">{device.onboardingSubstage}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  )
}

function PhysicalDeviceRow({
  device,
  markingOnline,
  onView,
  onOnline,
  onList,
  onUnlist,
  onToggleListingDisabled,
}: {
  device: PhysicalDevice
  markingOnline: boolean
  onView: () => void
  onOnline: () => void
  onList: () => void
  onUnlist: () => void
  onToggleListingDisabled: () => void
}) {
  return (
    <TableRow>
      <TableCell>
        <div className="font-mono text-sm">{device.sn}</div>
        <div className="text-xs text-muted-foreground">{device.assetNo}</div>
      </TableCell>
      <TableCell>
        <Link
          href={`/supplier/suppliers/${device.supplierId}`}
          className="text-primary hover:underline text-sm"
        >
          {device.supplierShortName}
        </Link>
      </TableCell>
      <TableCell>{device.idcCode}</TableCell>
      <TableCell>{device.cardTypeName}</TableCell>
      <TableCell className="hidden max-w-[120px] truncate text-sm xl:table-cell" title={device.devicePurpose ?? undefined}>
        {device.devicePurpose ?? '—'}
      </TableCell>
      <TableCell className="hidden text-sm lg:table-cell">{device.opsStatus ?? '—'}</TableCell>
      <TableCell className="hidden max-w-[140px] truncate text-sm xl:table-cell" title={device.expectedService ?? undefined}>
        {device.expectedService ?? '—'}
      </TableCell>
      <TableCell className="hidden text-sm lg:table-cell">
        {DEVICE_COOPERATION_TYPE_LABELS[device.cooperationType]}
      </TableCell>
      <TableCell className="hidden max-w-[160px] truncate text-sm xl:table-cell" title={formatClusterAndRole(device)}>
        {formatClusterAndRole(device)}
      </TableCell>
      <TableCell className="hidden font-mono text-xs lg:table-cell">{formatDeviceIp(device)}</TableCell>
      <TableCell className="hidden md:table-cell">
        {device.inMaintenance ? (
          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30">
            维修中
          </Badge>
        ) : device.listingDisabled ? (
          <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30">
            禁止上架
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground">否</span>
        )}
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={LIFECYCLE_STATUS_COLORS[device.lifecycleStatus] ?? ''}
        >
          {device.lifecycleStatus}
        </Badge>
      </TableCell>
      <TableCell className="hidden text-muted-foreground xl:table-cell">{device.onboardingSubstage ?? '—'}</TableCell>
      <TableCell>
        <PhysicalDeviceActions
          device={device}
          markingOnline={markingOnline}
          onView={onView}
          onOnline={onOnline}
          onList={onList}
          onUnlist={onUnlist}
          onToggleListingDisabled={onToggleListingDisabled}
        />
      </TableCell>
    </TableRow>
  )
}
