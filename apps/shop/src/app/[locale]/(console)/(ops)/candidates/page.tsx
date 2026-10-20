import { PageDemoBanner } from '@/components/console/page-demo-banner'
import { MOCK_CANDIDATES } from '@/lib/crossborder/mock-data'
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
        <p className="text-sm text-muted-foreground">候选列表 · 分析抽屉后续接入</p>
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
            <TableHead>状态</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MOCK_CANDIDATES.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">{row.title}</TableCell>
              <TableCell>{row.category}</TableCell>
              <TableCell className="tabular-nums">{row.landedCost}</TableCell>
              <TableCell className="tabular-nums">{row.suggestPrice}</TableCell>
              <TableCell>{row.margin}</TableCell>
              <TableCell className="tabular-nums">{row.score}</TableCell>
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
