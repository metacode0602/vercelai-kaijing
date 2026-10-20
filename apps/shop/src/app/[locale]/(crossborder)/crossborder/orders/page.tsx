import { CrossborderDemoAlert } from "@/components/crossborder/demo-alert"
import { MOCK_ORDERS } from "@/lib/crossborder/mock-data"
import { Badge } from "@workspace/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

export default function OrdersPage() {
  return (
    <div>
      <CrossborderDemoAlert />
      <h1 className="mb-3 text-xl font-semibold">订单</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>外部单号</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>金额</TableHead>
            <TableHead>下单时间</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MOCK_ORDERS.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-mono text-xs">{row.id}</TableCell>
              <TableCell>
                <Badge variant="secondary">{row.status}</Badge>
              </TableCell>
              <TableCell className="tabular-nums">{row.total}</TableCell>
              <TableCell className="text-sm">{row.placedAt}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
