import { PageDemoBanner } from '@/components/console/page-demo-banner'
import {
  MOCK_DASHBOARD_ALERTS,
  MOCK_DASHBOARD_KPIS,
  MOCK_DASHBOARD_TODOS,
} from '@/lib/crossborder/mock-data'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card'
import { Badge } from '@workspace/ui/components/badge'

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageDemoBanner />
      <div>
        <h2 className="text-xl font-semibold tracking-tight">运营仪表盘</h2>
        <p className="text-sm text-muted-foreground">近 7 天经营概览（示例数据）</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {MOCK_DASHBOARD_KPIS.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">{kpi.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{kpi.delta}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">今日预警</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {MOCK_DASHBOARD_ALERTS.map((a) => (
              <LocaleLink
                key={a.message}
                href={a.href}
                className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm hover:bg-muted/50"
              >
                <span>
                  <Badge variant="secondary" className="mr-2">
                    {a.type}
                  </Badge>
                  {a.message}
                </span>
              </LocaleLink>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">待办</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {MOCK_DASHBOARD_TODOS.map((todo) => (
              <LocaleLink
                key={todo.title}
                href={todo.href}
                className="block rounded-md border px-3 py-2 text-sm hover:bg-muted/50"
              >
                {todo.title}
              </LocaleLink>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
