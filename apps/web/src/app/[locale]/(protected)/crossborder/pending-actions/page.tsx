import { CrossborderDemoAlert } from "@/components/crossborder/demo-alert"
import { MOCK_PENDING_ACTIONS } from "@/lib/crossborder/mock-data"
import { Badge } from "@workspace/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

export default function CrossborderPendingActionsPage() {
  return (
    <div>
      <CrossborderDemoAlert />
      <h2 className="mb-3 text-lg font-medium">跨租户待审抽检</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>租户</TableHead>
            <TableHead>类型</TableHead>
            <TableHead>标题</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>创建时间</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MOCK_PENDING_ACTIONS.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.org}</TableCell>
              <TableCell className="font-mono text-xs">{row.kind}</TableCell>
              <TableCell className="font-medium">{row.title}</TableCell>
              <TableCell>
                <Badge variant={row.status === "pending" ? "secondary" : "default"}>
                  {row.status}
                </Badge>
              </TableCell>
              <TableCell className="text-sm">{row.createdAt}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
