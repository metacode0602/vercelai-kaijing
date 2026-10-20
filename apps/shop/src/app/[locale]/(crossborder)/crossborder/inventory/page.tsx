import { CrossborderDemoAlert } from "@/components/crossborder/demo-alert"
import { MOCK_INVENTORY } from "@/lib/crossborder/mock-data"
import { Badge } from "@workspace/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

export default function InventoryPage() {
  return (
    <div>
      <CrossborderDemoAlert />
      <h1 className="mb-3 text-xl font-semibold">库存预警</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SKU</TableHead>
            <TableHead>在库</TableHead>
            <TableHead>预留</TableHead>
            <TableHead>阈值</TableHead>
            <TableHead>告警</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MOCK_INVENTORY.map((row) => (
            <TableRow key={row.sku}>
              <TableCell className="font-mono text-xs">{row.sku}</TableCell>
              <TableCell>{row.onHand}</TableCell>
              <TableCell>{row.reserved}</TableCell>
              <TableCell>{row.threshold}</TableCell>
              <TableCell>
                {row.alert ? (
                  <Badge variant="destructive">{row.alert}</Badge>
                ) : (
                  "—"
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
