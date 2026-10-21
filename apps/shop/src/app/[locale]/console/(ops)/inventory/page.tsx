import { PageDemoBanner } from '@/components/console/page-demo-banner'
import { MOCK_INVENTORY_LIST_ROWS } from '@/lib/crossborder/mock-data'
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

export default function InventoryPage() {
  const urgent = MOCK_INVENTORY_LIST_ROWS.filter((i) => i.alert)
  const aged = MOCK_INVENTORY_LIST_ROWS.filter((i) => i.ageDays >= 60)

  return (
    <div className="space-y-4">
      <PageDemoBanner />
      <div>
        <h2 className="text-xl font-semibold tracking-tight">库存预警</h2>
        <p className="text-sm text-muted-foreground">紧急补货 / 库龄 / 建议 · 点击 SKU 看多店库存</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm">紧急补货</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{urgent.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm">库龄 ≥ 60 天</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{aged.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm">闪购建议</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              <LocaleLink href="/console/inventory/MAT-02" className="underline-offset-2 hover:underline">
                MAT-02
              </LocaleLink>{' '}
              可考虑清仓闪购（示例）
            </p>
          </CardContent>
        </Card>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SKU</TableHead>
            <TableHead>店铺数</TableHead>
            <TableHead>在库</TableHead>
            <TableHead>预留</TableHead>
            <TableHead>阈值</TableHead>
            <TableHead>库龄</TableHead>
            <TableHead>告警</TableHead>
            <TableHead>建议</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MOCK_INVENTORY_LIST_ROWS.map((row) => (
            <TableRow key={row.sku}>
              <TableCell className="font-mono text-xs">
                <LocaleLink
                  href={`/console/inventory/${row.sku}`}
                  className="underline-offset-2 hover:underline"
                >
                  {row.sku}
                </LocaleLink>
              </TableCell>
              <TableCell className="tabular-nums">{row.shopCount}</TableCell>
              <TableCell>{row.onHand}</TableCell>
              <TableCell>{row.reserved}</TableCell>
              <TableCell>{row.threshold}</TableCell>
              <TableCell className="tabular-nums">{row.ageDays}d</TableCell>
              <TableCell>
                {row.alert ? (
                  <Badge variant={row.alert === 'critical' ? 'destructive' : 'secondary'}>
                    {row.alert}
                  </Badge>
                ) : (
                  '—'
                )}
              </TableCell>
              <TableCell className="text-sm">{row.suggestion}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
