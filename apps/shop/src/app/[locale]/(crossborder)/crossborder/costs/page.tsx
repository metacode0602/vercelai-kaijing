import { CrossborderDemoAlert } from "@/components/crossborder/demo-alert"
import { MOCK_COSTS } from "@/lib/crossborder/mock-data"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

export default function CostsPage() {
  return (
    <div>
      <CrossborderDemoAlert />
      <h1 className="mb-3 text-xl font-semibold">落地成本 / 结算粗览</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SKU</TableHead>
            <TableHead>采购</TableHead>
            <TableHead>运费</TableHead>
            <TableHead>关税</TableHead>
            <TableHead>合计</TableHead>
            <TableHead>币种</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MOCK_COSTS.map((row) => {
            const total = (row.purchase + row.freight + row.duty).toFixed(2)
            return (
              <TableRow key={row.sku}>
                <TableCell className="font-mono text-xs">{row.sku}</TableCell>
                <TableCell className="tabular-nums">{row.purchase}</TableCell>
                <TableCell className="tabular-nums">{row.freight}</TableCell>
                <TableCell className="tabular-nums">{row.duty}</TableCell>
                <TableCell className="tabular-nums font-medium">{total}</TableCell>
                <TableCell>{row.currency}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
