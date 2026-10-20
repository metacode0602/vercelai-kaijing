import { CrossborderDemoAlert } from "@/components/crossborder/demo-alert"
import { MOCK_PENDING } from "@/lib/crossborder/mock-data"
import { Badge } from "@workspace/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

export default function PendingPage() {
  return (
    <div>
      <CrossborderDemoAlert />
      <h1 className="mb-3 text-xl font-semibold">待审队列</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>类型</TableHead>
            <TableHead>标题</TableHead>
            <TableHead>状态</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MOCK_PENDING.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-mono text-xs">{row.kind}</TableCell>
              <TableCell className="font-medium">{row.title}</TableCell>
              <TableCell>
                <Badge variant="secondary">{row.status}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
