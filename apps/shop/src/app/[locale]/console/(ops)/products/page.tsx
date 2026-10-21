import { PageDemoBanner } from '@/components/console/page-demo-banner'
import { MOCK_PRODUCT_LIST_ROWS } from '@/lib/crossborder/mock-data'
import { LocaleLink } from '@/lib/i18n/navigation'
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
        <p className="text-sm text-muted-foreground">本地商品 + listing 状态 · 点击行进入详情</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SKU</TableHead>
            <TableHead>标题</TableHead>
            <TableHead>主店</TableHead>
            <TableHead>店铺数</TableHead>
            <TableHead>刊登状态</TableHead>
            <TableHead>价格</TableHead>
            <TableHead>更新</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MOCK_PRODUCT_LIST_ROWS.map((row) => (
            <TableRow key={row.sku}>
              <TableCell className="font-mono text-xs">
                <LocaleLink
                  href={`/console/products/${row.sku}`}
                  className="underline-offset-2 hover:underline"
                >
                  {row.sku}
                </LocaleLink>
              </TableCell>
              <TableCell className="font-medium">
                <LocaleLink
                  href={`/console/products/${row.sku}`}
                  className="underline-offset-2 hover:underline"
                >
                  {row.title}
                </LocaleLink>
              </TableCell>
              <TableCell>{row.shop}</TableCell>
              <TableCell className="tabular-nums">{row.shopCount}</TableCell>
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
