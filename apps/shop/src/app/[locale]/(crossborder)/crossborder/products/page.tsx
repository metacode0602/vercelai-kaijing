import { CrossborderDemoAlert } from "@/components/crossborder/demo-alert"
import { MOCK_PRODUCTS } from "@/lib/crossborder/mock-data"
import { Badge } from "@workspace/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

export default function ProductsPage() {
  return (
    <div>
      <CrossborderDemoAlert />
      <h1 className="mb-3 text-xl font-semibold">商品 / 刊登</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SKU</TableHead>
            <TableHead>标题</TableHead>
            <TableHead>刊登状态</TableHead>
            <TableHead>价格</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MOCK_PRODUCTS.map((row) => (
            <TableRow key={row.sku}>
              <TableCell className="font-mono text-xs">{row.sku}</TableCell>
              <TableCell className="font-medium">{row.title}</TableCell>
              <TableCell>
                <Badge variant={row.listing === "live" ? "default" : "secondary"}>
                  {row.listing}
                </Badge>
              </TableCell>
              <TableCell>{row.price}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
