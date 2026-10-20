import { CrossborderDemoAlert } from "@/components/crossborder/demo-alert"
import { MOCK_SYNC_HEALTH } from "@/lib/crossborder/mock-data"
import { Badge } from "@workspace/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

export default function CrossborderSyncHealthPage() {
  return (
    <div>
      <CrossborderDemoAlert />
      <h2 className="mb-3 text-lg font-medium">连接器同步健康</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>店铺</TableHead>
            <TableHead>平台</TableHead>
            <TableHead>健康</TableHead>
            <TableHead>最近订单同步</TableHead>
            <TableHead>最近库存同步</TableHead>
            <TableHead>错误</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MOCK_SYNC_HEALTH.map((row) => (
            <TableRow key={row.shop}>
              <TableCell className="font-medium">{row.shop}</TableCell>
              <TableCell>{row.platform}</TableCell>
              <TableCell>
                <Badge
                  variant={
                    row.health === "success"
                      ? "default"
                      : row.health === "error"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {row.health}
                </Badge>
              </TableCell>
              <TableCell className="text-sm">{row.lastOrders}</TableCell>
              <TableCell className="text-sm">{row.lastInventory}</TableCell>
              <TableCell className="text-destructive text-sm">{row.error ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
