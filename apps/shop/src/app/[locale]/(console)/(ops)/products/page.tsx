import { PageDemoBanner } from '@/components/console/page-demo-banner'
import { MOCK_PRODUCTS } from '@/lib/crossborder/mock-data'
import { Badge } from '@workspace/ui/components/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

export default function ProductsPage() {
  return (
    <div className="space-y-4">
      <PageDemoBanner />
      <div>
        <h2 className="text-xl font-semibold tracking-tight">商品与刊登</h2>
        <p className="text-sm text-muted-foreground">本地商品 + listing 状态</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SKU</TableHead>
            <TableHead>标题</TableHead>
            <TableHead>店铺</TableHead>
            <TableHead>刊登状态</TableHead>
            <TableHead>价格</TableHead>
            <TableHead>更新</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MOCK_PRODUCTS.map((row) => (
            <TableRow key={row.sku}>
              <TableCell className="font-mono text-xs">{row.sku}</TableCell>
              <TableCell className="font-medium">{row.title}</TableCell>
              <TableCell>{row.shop}</TableCell>
              <TableCell>
                <Badge variant={row.listing === 'live' ? 'default' : 'secondary'}>{row.listing}</Badge>
              </TableCell>
              <TableCell>{row.price}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{row.updatedAt}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
