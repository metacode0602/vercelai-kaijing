'use client'

import * as React from 'react'
import { DashboardTrendChart } from '@/components/console/dashboard-trend-chart'
import {
  MOCK_DASHBOARD_ALERTS,
  MOCK_DASHBOARD_KPIS,
  MOCK_DASHBOARD_TODOS,
} from '@/lib/crossborder/mock-data'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { NativeSelect, NativeSelectOption } from '@workspace/ui/components/native-select'
import { Input } from '@workspace/ui/components/input'

export default function DashboardPage() {
  const [platform, setPlatform] = React.useState('all')
  const [site, setSite] = React.useState('all')
  const [dateFrom, setDateFrom] = React.useState('2026-10-21')
  const [dateTo, setDateTo] = React.useState('2026-10-28')
  const [notice, setNotice] = React.useState('')
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">运营仪表盘</h2>
          <p className="text-sm text-muted-foreground">经营概览 · 示例数据 · 口径待确认</p>
        </div>
        <Badge variant="outline">示例数据</Badge>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
        <div className="flex flex-col gap-1"><label className="text-xs text-muted-foreground">开始日期</label><Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></div>
        <div className="flex flex-col gap-1"><label className="text-xs text-muted-foreground">结束日期</label><Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></div>
        <div className="flex flex-col gap-1"><label className="text-xs text-muted-foreground">平台</label><NativeSelect value={platform} onChange={(event) => setPlatform(event.target.value)}><NativeSelectOption value="all">全部平台</NativeSelectOption><NativeSelectOption value="lazada">Lazada</NativeSelectOption><NativeSelectOption value="daraz">Daraz</NativeSelectOption></NativeSelect></div>
        <div className="flex flex-col gap-1"><label className="text-xs text-muted-foreground">国家 / 站点</label><NativeSelect value={site} onChange={(event) => setSite(event.target.value)}><NativeSelectOption value="all">全部站点</NativeSelectOption><NativeSelectOption value="MY">MY</NativeSelectOption><NativeSelectOption value="LK">LK</NativeSelectOption><NativeSelectOption value="TH">TH</NativeSelectOption></NativeSelect></div>
        <Button variant="outline" onClick={() => setNotice(`已应用 ${dateFrom} 至 ${dateTo} · ${platform === 'all' ? '全部平台' : platform} · ${site === 'all' ? '全部站点' : site}（仅原型筛选状态）`)}>应用筛选</Button>
        <Button variant="ghost" onClick={() => { setDateFrom('2026-10-21'); setDateTo('2026-10-28'); setPlatform('all'); setSite('all'); setNotice('已重置为近 7 天、全部平台和站点。') }}>重置</Button>
      </div>
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      <Alert>
        <AlertTitle>跨币种指标暂不合计</AlertTitle>
        <AlertDescription>币种折算、订单状态范围和 GMV/利润公式待业务确认；当前页面不把不同币种相加。</AlertDescription>
      </Alert>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {MOCK_DASHBOARD_KPIS.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <LocaleLink href="/console/reports" className="block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><p className="text-2xl font-semibold tabular-nums">{kpi.value}</p><p className="mt-1 text-xs text-muted-foreground">{kpi.delta}</p><span className="sr-only">查看对应明细</span></LocaleLink>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle className="text-base">订单 / 营收趋势</CardTitle>
              <CardDescription>跨境多店示例 · 多币种尚未汇率折算，不作跨币种合计</CardDescription>
        </CardHeader>
        <CardContent className="overflow-visible">
          <DashboardTrendChart defaultRange={7} />
        </CardContent>
      </Card>

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
