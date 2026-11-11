'use client'

import * as React from 'react'
import { ConfirmReasonDialog } from '@/components/shared/confirm-reason-dialog'
import {
  TableEmptyRow,
  TableErrorRow,
  TableLoadingRow,
} from '@/components/shared/data-table'
import { ListPagination } from '@/components/shared/list-pagination'
import { formatOpsTime } from '@/lib/console/format-time'
import { LocaleLink } from '@/lib/i18n/navigation'
import { useListPagination } from '@/lib/pagination/use-list-pagination'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
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
  const { page, setPage, pageSize, setPageSize } = useListPagination()
  const conflicts = trpc.platformOnboarding.listConflicts.useQuery({
    page,
    pageSize,
  })
  const [notice, setNotice] = React.useState('')
  const [upholdTarget, setUpholdTarget] = React.useState<{ id: string; name: string } | null>(null)

  const uphold = trpc.platformOnboarding.upholdConflict.useMutation({
    onSuccess: async () => {
      setNotice('已维持原绑定。')
      setUpholdTarget(null)
      await utils.platformOnboarding.listConflicts.invalidate()
    },
    onError: (error) => setNotice(error.message),
  })

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">店铺绑定冲突</h2>
        <p className="text-sm text-muted-foreground">
          后来者授权会被当场拒绝，默认维持原绑定。批准转移请进入详情核对双方后再填写原因。历史订单、库存和结算留在原租户，不会迁移。系统不会自动通知原租户。
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>平台店铺</TableHead>
            <TableHead>后来者</TableHead>
            <TableHead>占用方</TableHead>
            <TableHead>状态</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {conflicts.isLoading ? (
            <TableLoadingRow colSpan={5} />
          ) : conflicts.isError ? (
            <TableErrorRow
              colSpan={5}
              message={conflicts.error.message}
              onRetry={() => conflicts.refetch()}
            />
          ) : conflicts.data?.items.length ? (
            conflicts.data.items.map((conflict) => (
              <TableRow key={conflict.id}>
                <TableCell>
                  <div className="font-medium">
                    <LocaleLink className="underline-offset-2 hover:underline" href={`/console/shop-conflicts/${conflict.id}`}>
                      <Badge variant="outline">{conflict.platform}</Badge>
                      <span className="ml-2 font-mono text-xs">{conflict.externalShopId}</span>
                    </LocaleLink>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    发起于 {formatOpsTime(conflict.createdAt)}
                  </div>
                </TableCell>
                <TableCell>
                  <div>{conflict.challengerOrganizationName}</div>
                  <div className="text-xs text-muted-foreground">{conflict.challengerShopName}</div>
                </TableCell>
                <TableCell>
                  <div>{conflict.occupantOrganizationName}</div>
                  <div className="text-xs text-muted-foreground">{conflict.occupantShopName}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{conflict.statusLabel}</Badge>
                  {conflict.appealDeadlineAt ? (
                    <div className="mt-1 text-xs text-muted-foreground">
                      申诉截止 {formatOpsTime(conflict.appealDeadlineAt)}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button asChild size="sm" variant="outline">
                      <LocaleLink href={`/console/shop-conflicts/${conflict.id}`}>
                        {conflict.status === 'pending' || conflict.status === 'appealed_pending_review'
                          ? '处理'
                          : '详情'}
                      </LocaleLink>
                    </Button>
                    {conflict.status === 'pending' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={uphold.isPending}
                        onClick={() =>
                          setUpholdTarget({
                            id: conflict.id,
                            name: `${conflict.platform} / ${conflict.externalShopId}`,
                          })
                        }
                      >
                        维持原绑定
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableEmptyRow colSpan={5}>暂无绑定冲突。</TableEmptyRow>
          )}
        </TableBody>
      </Table>
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      <ListPagination
        page={page}
        totalPages={Math.max(1, Math.ceil((conflicts.data?.total ?? 0) / pageSize))}
        totalItems={conflicts.data?.total ?? 0}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
      <ConfirmReasonDialog
        open={Boolean(upholdTarget)}
        onOpenChange={(open) => {
          if (!open) setUpholdTarget(null)
        }}
        title="维持原绑定"
        description={
          upholdTarget
            ? `确认维持原绑定并关闭后来者对「${upholdTarget.name}」的这次申请？`
            : ''
        }
        confirmLabel="确认维持"
        reasonLabel="备注"
        placeholder="可选填写备注"
        required={false}
        pending={uphold.isPending}
        onConfirm={(reason) => {
          if (upholdTarget) {
            uphold.mutate({
              conflictId: upholdTarget.id,
              reason: reason || undefined,
            })
          }
        }}
      />
    </div>
  )
}
