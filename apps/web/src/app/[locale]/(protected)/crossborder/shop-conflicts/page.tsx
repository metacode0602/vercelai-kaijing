'use client'

import * as React from 'react'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { NativeSelect } from '@workspace/ui/components/native-select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

export default function ShopConflictsPage() {
  const utils = trpc.useUtils()
  const conflicts = trpc.platformOnboarding.listConflicts.useQuery()
  const tenants = trpc.platformOnboarding.tenants.useQuery({ page: 1, pageSize: 100 })
  const [targets, setTargets] = React.useState<Record<string, string>>({})
  const [notice, setNotice] = React.useState('')

  const resolve = trpc.platformOnboarding.resolveConflict.useMutation({
    onSuccess: async () => {
      setNotice('冲突已处理。')
      await utils.platformOnboarding.listConflicts.invalidate()
    },
    onError: (error) => setNotice(error.message),
  })

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">店铺绑定冲突</h2>
        <p className="text-sm text-muted-foreground">
          同一平台店铺被多个租户认领时在此处理：停用当前草稿，或转移到目标租户后重新授权。
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>店铺</TableHead>
            <TableHead>平台店铺 ID</TableHead>
            <TableHead>当前租户</TableHead>
            <TableHead>已绑定租户</TableHead>
            <TableHead>处理</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {conflicts.isLoading ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                加载中…
              </TableCell>
            </TableRow>
          ) : conflicts.data?.length ? (
            conflicts.data.map((conflict) => (
              <TableRow key={conflict.shopId}>
                <TableCell>
                  <div className="font-medium">{conflict.shopName}</div>
                  <div className="text-xs text-muted-foreground">
                    <Badge variant="outline">{conflict.platform}</Badge>{' '}
                    {conflict.lastError || '绑定冲突'}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {conflict.externalShopId || '—'}
                </TableCell>
                <TableCell>{conflict.organizationName}</TableCell>
                <TableCell>
                  {conflict.otherOrganizationName}
                  <div className="font-mono text-xs text-muted-foreground">
                    {conflict.otherShopId}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    <NativeSelect
                      value={targets[conflict.shopId] ?? ''}
                      onChange={(event) =>
                        setTargets((current) => ({
                          ...current,
                          [conflict.shopId]: event.target.value,
                        }))
                      }
                    >
                      <option value="">选择目标租户</option>
                      {tenants.data?.items.map((tenant) => (
                        <option key={tenant.id} value={tenant.id}>
                          {tenant.name}
                        </option>
                      ))}
                    </NativeSelect>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={resolve.isPending}
                      onClick={() => {
                        const targetOrganizationId = targets[conflict.shopId]
                        if (!targetOrganizationId) {
                          setNotice('请选择目标租户。')
                          return
                        }
                        if (
                          window.confirm(
                            `确认将店铺「${conflict.shopName}」转移到所选租户？`,
                          )
                        ) {
                          resolve.mutate({
                            shopId: conflict.shopId,
                            action: 'reassign',
                            targetOrganizationId,
                          })
                        }
                      }}
                    >
                      转移
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={resolve.isPending}
                      onClick={() => {
                        if (window.confirm(`确认停用冲突店铺「${conflict.shopName}」？`)) {
                          resolve.mutate({ shopId: conflict.shopId, action: 'disable' })
                        }
                      }}
                    >
                      停用草稿
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                暂无绑定冲突。
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
    </div>
  )
}
