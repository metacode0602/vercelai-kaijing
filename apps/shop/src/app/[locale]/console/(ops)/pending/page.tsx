import { PageDemoBanner } from '@/components/console/page-demo-banner'
import { MOCK_PENDING } from '@/lib/crossborder/mock-data'
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

export default function PendingPage() {
  return (
    <div className="space-y-4">
      <PageDemoBanner />
      <div>
        <h2 className="text-xl font-semibold tracking-tight">待审队列</h2>
        <p className="text-sm text-muted-foreground">AI-B HITL · mock 确认/拒绝</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>类型</TableHead>
            <TableHead>标题</TableHead>
            <TableHead>店铺</TableHead>
            <TableHead>创建者</TableHead>
            <TableHead>状态</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MOCK_PENDING.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-mono text-xs">{row.kind}</TableCell>
              <TableCell className="font-medium">{row.title}</TableCell>
              <TableCell>{row.shop}</TableCell>
              <TableCell>{row.createdBy}</TableCell>
              <TableCell>
                <Badge variant="secondary">{row.status}</Badge>
              </TableCell>
              <TableCell className="space-x-2 text-right">
                <Button size="sm" variant="default" disabled>
                  确认
                </Button>
                <Button size="sm" variant="outline" disabled>
                  拒绝
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
