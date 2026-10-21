import { PageDemoBanner } from '@/components/console/page-demo-banner'
import { MOCK_CANDIDATES } from '@/lib/crossborder/mock-data'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

export default function CandidatesPage() {
  return (
    <div className="space-y-4">
      <PageDemoBanner />
      <div>
        <h2 className="text-xl font-semibold tracking-tight">AI 选品</h2>
        <p className="text-sm text-muted-foreground">候选列表 · 点击进入 Go/No-Go 详情</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>产品</TableHead>
            <TableHead>类目</TableHead>
            <TableHead>到仓成本</TableHead>
            <TableHead>建议售价</TableHead>
            <TableHead>净利率</TableHead>
            <TableHead>潜力</TableHead>
            <TableHead>Go/No-Go</TableHead>
            <TableHead>状态</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MOCK_CANDIDATES.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">
                <LocaleLink
                  href={`/console/candidates/${row.id}`}
                  className="underline-offset-2 hover:underline"
                >
                  {row.title}
                </LocaleLink>
              </TableCell>
              <TableCell>{row.categoryHint}</TableCell>
              <TableCell className="tabular-nums">
                {row.landedCost.toFixed(2)} {row.currency}
              </TableCell>
              <TableCell className="tabular-nums">
                {row.suggestPrice.toFixed(2)} {row.currency}
              </TableCell>
              <TableCell>{row.marginPct}%</TableCell>
              <TableCell className="tabular-nums">{row.score}</TableCell>
              <TableCell>
                <Badge variant={row.goNoGo === 'GO' ? 'default' : 'secondary'}>{row.goNoGo}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={row.status === 'new' ? 'secondary' : 'default'}>{row.status}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
