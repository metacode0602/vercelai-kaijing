'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc/client'
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
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
import { Badge } from '@workspace/ui/components/badge'
import { ListPagination } from '@/components/shared/list-pagination'
import { ContractCreateDialog } from './contract-create-dialog'
import { useLocaleRouter as useRouter } from '@/lib/i18n/navigation'
import { contractPricingModeLabel } from '@/lib/data/types'

const statusLabels: Record<string, string> = {
  draft: '草稿',
  pending: '待确认',
  active: '生效中',
  rejected: '已拒绝',
  expired: '已过期',
  terminated: '已终止',
}

const statusColors: Record<string, string> = {
  draft: 'border-gray-300 text-gray-700',
  pending: 'border-yellow-300 text-yellow-700 bg-yellow-50',
  active: 'border-green-300 text-green-700 bg-green-50',
  rejected: 'border-red-300 text-red-700 bg-red-50',
  expired: 'border-gray-300 text-gray-500',
  terminated: 'border-gray-300 text-gray-500',
}

const typeLabels: Record<string, string> = {
  cooperation: '合作协议',
  supplement: '补充协议',
  renewal: '续签协议',
}

export function ContractsContent() {
  const router = useRouter()
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [showCreate, setShowCreate] = useState(false)

  const { data, isLoading } = trpc.supplier.contract.list.useQuery({
    page,
    pageSize,
    search: search || undefined,
    status: statusFilter || undefined,
    type: typeFilter || undefined,
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">合同管理</h1>
        <Button onClick={() => setShowCreate(true)}>创建合同</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: '总数', value: total },
          { label: '生效中', value: items.filter((i) => i.status === 'active').length },
          { label: '待确认', value: items.filter((i) => i.status === 'pending').length },
          { label: '草稿', value: items.filter((i) => i.status === 'draft').length },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">{stat.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-3">
            <Input
              placeholder="搜索合同编号或供应商..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className="max-w-sm"
            />
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v === 'all' ? '' : v)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                {Object.entries(statusLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={typeFilter}
              onValueChange={(v) => {
                setTypeFilter(v === 'all' ? '' : v)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="全部类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                {Object.entries(typeLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>合同编号</TableHead>
                <TableHead>供应商</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>计价方式</TableHead>
                <TableHead>产能行</TableHead>
                <TableHead>期限</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>供应商确认</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    加载中...
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    暂无数据
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow
                    key={item.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/supplier/contracts/${item.id}`)}
                  >
                    <TableCell className="font-medium">{item.contractNo}</TableCell>
                    <TableCell>{item.supplierName}</TableCell>
                    <TableCell>{typeLabels[item.type] ?? item.type}</TableCell>
                    <TableCell>{contractPricingModeLabel(item.pricingMode)}</TableCell>
                    <TableCell>{item.capacityLineCount ?? 0} 行</TableCell>
                    <TableCell className="text-sm">
                      {item.startDate}
                      <br />
                      ~ {item.endDate ?? '无固定期限'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColors[item.status]}>
                        {statusLabels[item.status] ?? item.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColors[item.supplierConfirmationStatus] ?? ''}>
                        {item.supplierConfirmationStatus === 'none' ? '未发送' :
                         item.supplierConfirmationStatus === 'pending' ? '等待确认' :
                         item.supplierConfirmationStatus === 'confirmed' ? '已确认' :
                         item.supplierConfirmationStatus === 'rejected' ? '已拒绝' :
                         item.supplierConfirmationStatus === 'modification_requested' ? '请求修改' :
                         item.supplierConfirmationStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          router.push(`/supplier/contracts/${item.id}`)
                        }}
                      >
                        查看
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {total > pageSize && (
            <div className="mt-4 flex justify-end">
              <ListPagination
                page={page}
                pageSize={pageSize}
                totalItems={total}
                totalPages={Math.ceil(total / pageSize)}
                onPageChange={setPage}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <ContractCreateDialog open={showCreate} onOpenChange={setShowCreate} />
    </div>
  )
}
