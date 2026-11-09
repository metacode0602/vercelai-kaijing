'use client'

import { trpc } from '@/lib/trpc/client'
import { Button } from '@workspace/ui/components/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@workspace/ui/components/card'

const CARDS = [
  { key: 'tenants', label: '租户数' },
  { key: 'activeShops', label: '活跃店铺' },
  { key: 'pendingActions', label: '待审动作' },
  { key: 'syncErrors', label: '同步错误' },
  { key: 'ordersToday', label: '今日订单' },
  { key: 'candidatesNew', label: '新选品候选' },
] as const

export default function CrossborderDashboardPage() {
  const query = trpc.platformOps.dashboardStats.useQuery()

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">运营概览</h2>
        <p className="text-sm text-muted-foreground">
          平台库实时统计：租户 / 活跃店铺 / 待审动作 / 同步错误 / 新选品候选为当前计数；今日订单按下单时间（UTC
          自然日）统计。
        </p>
      </div>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">加载中…</p>
      ) : query.isError ? (
        <div className="space-y-2 rounded-lg border p-4">
          <p className="text-sm text-destructive">
            统计数据加载失败：{query.error.message}
          </p>
          <Button size="sm" variant="outline" onClick={() => query.refetch()}>
            重试
          </Button>
        </div>
      ) : query.data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((card) => (
            <Card key={card.key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-muted-foreground text-sm font-medium">
                  {card.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tabular-nums">
                  {query.data[card.key]}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  )
}
