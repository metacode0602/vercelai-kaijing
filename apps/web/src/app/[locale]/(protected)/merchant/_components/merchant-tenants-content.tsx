'use client'

import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, Search, Star } from 'lucide-react'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { ListPagination } from '@/components/shared/list-pagination'
import { MerchantDetailNav } from './merchant-detail-nav'
import { MerchantTenantSyncDialog } from './merchant-tenant-sync-dialog'
import { bindingRoleLabels } from './merchant-utils'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Card, CardContent } from '@workspace/ui/components/card'
import { Input } from '@workspace/ui/components/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

const PAGE_SIZE = 20

export function MerchantTenantsContent({ merchantId }: { merchantId: string }) {
  const [syncOpen, setSyncOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [platformTenantIdInput, setPlatformTenantIdInput] = useState('')
  const [platformTenantIdFilter, setPlatformTenantIdFilter] = useState('')

  useEffect(() => {
    setPage(1)
  }, [platformTenantIdFilter, merchantId])

  const merchantQuery = trpc.merchant.getById.useQuery({ id: merchantId })
  const tenantsQuery = trpc.merchant.tenant.list.useQuery({
    id: merchantId,
    page,
    pageSize: PAGE_SIZE,
    platformTenantId: platformTenantIdFilter || undefined,
  })

  const items = tenantsQuery.data?.items ?? []
  const totalItems = tenantsQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)

  if (merchantQuery.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        加载中…
      </div>
    )
  }

  const merchant = merchantQuery.data
  if (!merchant) {
    return <p className="text-muted-foreground">商户不存在</p>
  }

  return (
    <div className="space-y-6">
      <MerchantDetailNav merchant={merchant} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground max-w-2xl">
          展示当前商户与计费租户的归属关系（`tenant.merchant_id`）。可通过「同步租户」从平台拉取并比对入库，可选同步指定日期账单。
        </p>
        <Button onClick={() => setSyncOpen(true)}>
          <RefreshCw className="size-4" />
          同步租户
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative max-w-sm flex-1">
              <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
              <Input
                className="pl-8"
                placeholder="输入平台租户 ID 过滤"
                value={platformTenantIdInput}
                onChange={(e) => setPlatformTenantIdInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setPlatformTenantIdFilter(platformTenantIdInput.trim())
                  }
                }}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPlatformTenantIdFilter(platformTenantIdInput.trim())}
            >
              筛选
            </Button>
            {platformTenantIdFilter ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setPlatformTenantIdInput('')
                  setPlatformTenantIdFilter('')
                }}
              >
                清除
              </Button>
            ) : null}
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>租户</TableHead>
                  <TableHead>平台租户 ID</TableHead>
                  <TableHead>客户</TableHead>
                  <TableHead>绑定角色</TableHead>
                  <TableHead>主绑定</TableHead>
                  <TableHead>生效日</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenantsQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      加载中…
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      {platformTenantIdFilter ? '无匹配租户' : '暂无关联租户'}
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <LocaleLink
                          href={`/crm/tenants/${row.id}`}
                          className="text-sm hover:underline"
                        >
                          <div className="font-medium">{row.tenantName}</div>
                          <div className="text-xs text-muted-foreground">{row.tenantId}</div>
                        </LocaleLink>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{row.platformTenantId}</TableCell>
                      <TableCell>
                        {row.customerId !== '—' ? (
                          <LocaleLink
                            href={`/crm/customers/${row.customerId}`}
                            className="text-sm hover:underline"
                          >
                            {row.customerName}
                          </LocaleLink>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {bindingRoleLabels[row.bindingRole]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {row.isPrimary ? (
                          <Star className="size-4 fill-amber-400 text-amber-400" />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{row.effectiveFrom}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <ListPagination
            page={safePage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            className="border-t-0 px-0"
          />
        </CardContent>
      </Card>

      <MerchantTenantSyncDialog
        open={syncOpen}
        onOpenChange={setSyncOpen}
        merchantId={merchantId}
        onSuccess={() => {
          void tenantsQuery.refetch()
          void merchantQuery.refetch()
        }}
      />
    </div>
  )
}
