import { CostCalculatorEntry } from '@/components/console/cost-calculator-host'
import { MOCK_COSTS, costLandedTotal } from '@/lib/crossborder/mock-data'
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

export default function CostsPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">成本计算</h2>
          <p className="text-sm text-muted-foreground">
            到仓成本 · 斯里兰卡税项结构 · 打开测算工作台
          </p>
        </div>
        <CostCalculatorEntry label="成本测算" />
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
            <TableHead className="text-right">操作</TableHead>
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
                  <Badge variant="outline" className="ml-2 text-[10px]">
                    示例
                  </Badge>
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
                <TableCell className="text-right">
                  <CostCalculatorEntry sku={row.sku} label="测算" variant="outline" />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
