import { PageDemoBanner } from '@/components/console/page-demo-banner'
import { MOCK_FINANCE } from '@/lib/crossborder/mock-data'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

const active = MOCK_FINANCE.find((r) => !r.disabled) ?? MOCK_FINANCE[0]

export default function FinancePage() {
  return (
    <div className="space-y-4">
      <PageDemoBanner />
      <div>
        <h2 className="text-xl font-semibold tracking-tight">财务中心</h2>
        <p className="text-sm text-muted-foreground">营收 / 成本 / 利润粗览 · 点击平台看结算明细</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: '总营收', value: active.revenue.toLocaleString() },
          { label: '总成本', value: active.cost.toLocaleString() },
          { label: '净利润', value: active.profit.toLocaleString() },
          { label: '利润率', value: active.margin },
        ].map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm text-muted-foreground">{k.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-semibold tabular-nums">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>平台</TableHead>
            <TableHead>营收</TableHead>
            <TableHead>成本</TableHead>
            <TableHead>利润</TableHead>
            <TableHead>利润率</TableHead>
            <TableHead>状态</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MOCK_FINANCE.map((row) => (
            <TableRow key={row.platform} className={row.disabled ? 'opacity-60' : undefined}>
              <TableCell className="font-medium">
                <LocaleLink
                  href={`/console/finance/${row.platformKey}`}
                  className="underline-offset-2 hover:underline"
                >
                  {row.platform}
                </LocaleLink>
              </TableCell>
              <TableCell className="tabular-nums">{row.revenue.toLocaleString()}</TableCell>
              <TableCell className="tabular-nums">{row.cost.toLocaleString()}</TableCell>
              <TableCell className="tabular-nums">{row.profit.toLocaleString()}</TableCell>
              <TableCell>{row.margin}</TableCell>
              <TableCell>
                {row.disabled ? (
                  <Badge variant="outline">未接入</Badge>
                ) : (
                  <Badge variant="default">MVP</Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
