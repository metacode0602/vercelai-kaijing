import { PageDemoBanner } from '@/components/console/page-demo-banner'
import { MOCK_COSTS, costLandedTotal } from '@/lib/crossborder/mock-data'
import { LocaleLink } from '@/lib/i18n/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

export default function CostsPage() {
  return (
    <div className="space-y-4">
      <PageDemoBanner />
      <div>
        <h2 className="text-xl font-semibold tracking-tight">成本计算</h2>
        <p className="text-sm text-muted-foreground">到仓成本 · 斯里兰卡税项结构 · 点击 SKU 展开</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SKU</TableHead>
            <TableHead>采购</TableHead>
            <TableHead>头程</TableHead>
            <TableHead>Customs</TableHead>
            <TableHead>PAL</TableHead>
            <TableHead>CESS</TableHead>
            <TableHead>VAT</TableHead>
            <TableHead>SSCL</TableHead>
            <TableHead>合计</TableHead>
            <TableHead>币种</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MOCK_COSTS.map((row) => {
            const total = costLandedTotal(row).toFixed(2)
            return (
              <TableRow key={row.sku}>
                <TableCell className="font-mono text-xs">
                  <LocaleLink
                    href={`/console/costs/${row.sku}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {row.sku}
                  </LocaleLink>
                </TableCell>
                <TableCell className="tabular-nums">{row.purchase}</TableCell>
                <TableCell className="tabular-nums">{row.freight}</TableCell>
                <TableCell className="tabular-nums">{row.customs}</TableCell>
                <TableCell className="tabular-nums">{row.pal}</TableCell>
                <TableCell className="tabular-nums">{row.cess}</TableCell>
                <TableCell className="tabular-nums">{row.vat}</TableCell>
                <TableCell className="tabular-nums">{row.sscl}</TableCell>
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
