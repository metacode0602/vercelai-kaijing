'use client'

import { useMemo, useState } from 'react'
import { IconLoader2 } from '@tabler/icons-react'
import { toast } from 'sonner'
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
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import { formatCstDate, validateBillingDateRange } from '@/lib/crm/tenant-billing-import-utils'
import { trpc } from '@/lib/trpc/client'
import type { Project } from '@/lib/data/types'

function defaultBackfillDate(): string {
  return formatCstDate(new Date())
}

type SyncMode = 'incremental' | 'backfill'

type ProjectBareMetalOrderSyncDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: Project
  mode: SyncMode
  windowDays?: number
  onSynced?: () => void
}

function ProjectBareMetalOrderSyncDialogBody({
  onOpenChange,
  project,
  mode,
  windowDays,
  onSynced,
}: Omit<ProjectBareMetalOrderSyncDialogProps, 'open'>) {
  const utils = trpc.useUtils()
  const [startDate, setStartDate] = useState(defaultBackfillDate)
  const [endDate, setEndDate] = useState(defaultBackfillDate)

  const { data: billingTenants = [], isLoading: tenantsLoading } =
    trpc.crm.projects.listBillingTenants.useQuery({ projectId: project.id })

  const syncOrders = trpc.crm.projects.syncBareMetalOrders.useMutation()

  const dateRangeError = useMemo(() => {
    if (mode !== 'backfill') return null
    try {
      validateBillingDateRange(startDate, endDate)
      const todayCst = formatCstDate(new Date())
      if (endDate > todayCst) {
        return '结束日期不能晚于东八区今天'
      }
      return null
    } catch (e) {
      return e instanceof Error ? e.message : '日期范围无效'
    }
  }, [mode, startDate, endDate])

  const syncableTenants = billingTenants.filter((tenant) => tenant.platformTenantId?.trim())
  const skippedTenants = billingTenants.filter((tenant) => !tenant.platformTenantId?.trim())

  const handleConfirm = async () => {
    if (mode === 'backfill' && dateRangeError) {
      toast.error(dateRangeError)
      return
    }
    if (billingTenants.length === 0) {
      toast.error('未找到关联计费租户')
      return
    }
    if (syncableTenants.length === 0) {
      toast.error('关联租户均未绑定平台租户 ID，无法同步')
      return
    }

    try {
      const result = await syncOrders.mutateAsync({
        projectId: project.id,
        mode,
        ...(mode === 'backfill' ? { startDate, endDate } : {}),
      })

      onSynced?.()
      onOpenChange(false)

      const actionLabel = mode === 'backfill' ? '补同步' : '同步'
      if (result.failedCount > 0) {
        const failedNames = result.items
          .filter((item) => !item.success)
          .map((item) => item.tenantName)
          .slice(0, 3)
          .join('、')
        toast.warning(
          `裸金属订单${actionLabel}完成：拉取 ${result.ordersFetchedCount} 单，写入 ${result.orderUpsertedCount} 单；${result.successCount}/${result.items.length} 个租户成功${failedNames ? `；失败：${failedNames}` : ''}`,
        )
      } else if (result.successCount === 0) {
        toast.info('无可同步的计费租户')
      } else {
        toast.success(
          `裸金属订单${actionLabel}完成：拉取 ${result.ordersFetchedCount} 单，写入 ${result.orderUpsertedCount} 单（${result.startDate} ~ ${result.endDate}）`,
        )
      }

      void utils.crm.projects.listBareMetalOrders.invalidate({ projectId: project.id })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : mode === 'backfill' ? '补同步失败' : '同步失败')
    }
  }

  const isBusy = syncOrders.isPending
  const resolvedWindowDays = windowDays ?? 2

  return (
    <AlertDialogContent className="max-w-lg">
      <AlertDialogHeader>
        <AlertDialogTitle>
          {mode === 'backfill' ? '补同步遗漏裸金属订单' : '确认同步裸金属订单？'}
        </AlertDialogTitle>
        <AlertDialogDescription asChild>
          <div className="space-y-4 text-sm text-muted-foreground">
            {mode === 'incremental' ? (
              <div className="space-y-2">
                <p>
                  将从算算力平台拉取项目「{project.name}」关联计费租户的裸金属订单，并写入本系统（幂等更新）。
                </p>
                <ul className="list-inside list-disc space-y-1 text-xs">
                  <li>
                    同步范围：执行时刻向前 {resolvedWindowDays}{' '}
                    天的滑动窗口（东八区自然日，含当天至当前时刻）
                  </li>
                  <li>按关联租户的平台租户 ID 过滤订单；未绑定平台 ID 的租户将跳过</li>
                  <li>同一窗口可重复执行，已存在订单会按平台数据覆盖更新</li>
                  <li>受平台 API 限流影响，同步可能耗时较长</li>
                  <li>若需补拉更早区间，请使用「补同步遗漏」并指定起止日期</li>
                </ul>
              </div>
            ) : (
              <p>
                按指定日期区间从算算力平台拉取项目「{project.name}」关联租户的裸金属订单（按平台租户 ID
                过滤）。同一区间可重复执行，数据写入幂等。
              </p>
            )}

            {mode === 'backfill' ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="project-bare-metal-backfill-start">开始日期</Label>
                    <Input
                      id="project-bare-metal-backfill-start"
                      type="date"
                      value={startDate}
                      disabled={isBusy}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="project-bare-metal-backfill-end">结束日期</Label>
                    <Input
                      id="project-bare-metal-backfill-end"
                      type="date"
                      value={endDate}
                      disabled={isBusy}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>

                {dateRangeError ? (
                  <p className="text-destructive text-xs">{dateRangeError}</p>
                ) : null}

                <p className="text-xs">
                  默认可选至东八区今天；定时增量同步使用向前 {resolvedWindowDays}{' '}
                  天滑动窗口（至执行时刻），补同步不受此限制。
                </p>
              </>
            ) : null}

            <div className="rounded-md border bg-muted/30 p-3 text-xs text-foreground">
              {tenantsLoading ? (
                <p>正在加载关联租户…</p>
              ) : billingTenants.length === 0 ? (
                <p className="text-destructive">未找到关联计费租户</p>
              ) : (
                <div className="space-y-2">
                  <p>
                    将同步 {syncableTenants.length} 个租户
                    {skippedTenants.length > 0
                      ? `，跳过 ${skippedTenants.length} 个未绑定平台 ID 的租户`
                      : ''}
                    ：
                  </p>
                  <ul className="list-inside list-disc space-y-1">
                    {billingTenants.map((tenant) => (
                      <li key={tenant.id}>
                        {tenant.name}
                        {tenant.platformTenantId
                          ? `（平台 ID：${tenant.platformTenantId}）`
                          : '（未绑定平台 ID，将跳过）'}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel type="button" disabled={isBusy}>
          取消
        </AlertDialogCancel>
        <AlertDialogAction
          type="button"
          disabled={
            isBusy ||
            tenantsLoading ||
            billingTenants.length === 0 ||
            syncableTenants.length === 0 ||
            Boolean(dateRangeError)
          }
          onClick={(e) => {
            e.preventDefault()
            void handleConfirm()
          }}
        >
          {isBusy ? (
            <>
              <IconLoader2 className="mr-2 size-4 animate-spin" />
              同步中…
            </>
          ) : mode === 'backfill' ? (
            '确认补同步'
          ) : (
            '确认同步'
          )}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  )
}

export function ProjectBareMetalOrderSyncDialog({
  open,
  onOpenChange,
  project,
  mode,
  windowDays,
  onSynced,
}: ProjectBareMetalOrderSyncDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <ProjectBareMetalOrderSyncDialogBody
          onOpenChange={onOpenChange}
          project={project}
          mode={mode}
          windowDays={windowDays}
          onSynced={onSynced}
        />
      ) : null}
    </AlertDialog>
  )
}
