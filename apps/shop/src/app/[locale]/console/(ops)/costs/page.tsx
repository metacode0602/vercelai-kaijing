'use client'

import * as React from 'react'
import { Calculator } from 'lucide-react'
import { CostCalculatorEntry } from '@/components/console/cost-calculator-host'
import {
  ConsoleFilterBar,
  ConsoleListSection,
  ConsoleTableEmpty,
  matchesKeyword,
  useConsolePagination,
} from '@/components/console/list'
import { MOCK_COSTS, costLandedTotal } from '@/lib/crossborder/mock-data'
import { useCosts } from '@/lib/crossborder/finance-store'
import { useSkuCostVersions } from '@/lib/crossborder/sku-cost-version-store'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Button } from '@workspace/ui/components/button'
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

const CURRENCIES = [...new Set(MOCK_COSTS.map((r) => r.currency))]

export default function CostsPage() {
  const [keyword, setKeyword] = React.useState('')
  const [currency, setCurrency] = React.useState('all')
  const sessionCosts = useCosts()
  const costVersions = useSkuCostVersions()

  const rows = MOCK_COSTS.filter((row) => {
    if (!matchesKeyword(keyword, row.sku, row.title)) return false
    if (currency !== 'all' && row.currency !== currency) return false
    return true
  })
  const { pagedRows: pagedCostVersions, pagination: costVersionsPagination } =
    useConsolePagination(costVersions)
  const { pagedRows: pagedSessionCosts, pagination: sessionCostsPagination } =
    useConsolePagination(sessionCosts)
  const { pagedRows: pagedRows, pagination } = useConsolePagination(rows)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">成本计算</h2>
          <p className="text-sm text-muted-foreground">
            到仓成本（示例） · 斯里兰卡税项结构 · 打开测算工作台
          </p>
        </div>
        <CostCalculatorEntry label="成本测算" />
      </div>

      <Alert>
        <AlertTitle>UED 演示工作台</AlertTitle>
        <AlertDescription>
          当前税率、运价和计算输入为示例，未接真实报价或业务数据库。工作台包含空运 DDP、海运 LCL 和 FCL；费用范围不一致时不会自动标注最优方案。
        </AlertDescription>
      </Alert>

      <UedPrototypeNotice>F32：测算结果可保存为按柜次的 sku_cost 版本（本机）。订单级净利润仍待平台账单费用与广告分摊确认；本页金额不可用于经营决策。</UedPrototypeNotice>

      <ConsoleFilterBar
        keyword={keyword}
        onKeywordChange={setKeyword}
        keywordPlaceholder="SKU / 标题"
        filters={[
          {
            id: 'currency',
            label: '币种',
            value: currency,
            onChange: setCurrency,
            options: CURRENCIES.map((v) => ({ value: v, label: v })),
          },
        ]}
      />


      <ConsoleListSection
        title="柜次成本版本（F32）"
        description={`共 ${costVersions.length} 条 · 测算工作台可按柜次保存到仓成本版本（PAL/CESS/VAT/SSCL）`}
        pagination={costVersionsPagination}
      >
        {costVersions.length === 0 ? (
          <ConsoleTableEmpty />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>版本 ID</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>柜次</TableHead>
                <TableHead>v#</TableHead>
                <TableHead>税模版</TableHead>
                <TableHead>到仓/件</TableHead>
                <TableHead>建议售价</TableHead>
                <TableHead>生效</TableHead>
                <TableHead>创建人</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedCostVersions.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.id}</TableCell>
                  <TableCell>
                    <LocaleLink
                      href={`/console/costs/${encodeURIComponent(row.sku)}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {row.sku}
                    </LocaleLink>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.lotCode}</TableCell>
                  <TableCell>v{row.versionNo}</TableCell>
                  <TableCell className="text-xs">{row.taxTemplateCode}</TableCell>
                  <TableCell className="tabular-nums">{row.landedUnitCost.toFixed(2)} {row.currency}</TableCell>
                  <TableCell className="tabular-nums">
                    {row.suggestPrice != null ? row.suggestPrice.toFixed(2) : '—'}
                  </TableCell>
                  <TableCell>{row.effectiveFrom}</TableCell>
                  <TableCell>{row.createdBy}</TableCell>
                  <TableCell><Badge variant="secondary">{row.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ConsoleListSection>

      <ConsoleListSection title="会话成本行（财务 store）" description={`共 ${sessionCosts.length} 条 · 费用拆分关联利润核算`} pagination={sessionCostsPagination}>
        {sessionCosts.length === 0 ? (
          <ConsoleTableEmpty />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>名称</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>金额</TableHead>
                <TableHead>生效</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedSessionCosts.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.id}</TableCell>
                  <TableCell>{row.sku}</TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>{row.kind}</TableCell>
                  <TableCell className="tabular-nums">{row.amount.toLocaleString()} {row.currency}</TableCell>
                  <TableCell>{row.effectiveFrom}</TableCell>
                  <TableCell><Badge variant="secondary">{row.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ConsoleListSection>

      <ConsoleListSection title="成本记录（示例）" description={`共 ${rows.length} 条 · 点击 SKU 看详情`} pagination={pagination}>
        {rows.length === 0 ? (
          <ConsoleTableEmpty />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>标题</TableHead>
                <TableHead>采购</TableHead>
                <TableHead>头程</TableHead>
                <TableHead>关税</TableHead>
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
              {pagedRows.map((row) => {
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
                    <TableCell className="font-medium">{row.title}</TableCell>
                    <TableCell className="tabular-nums">{row.purchase.toFixed(2)}</TableCell>
                    <TableCell className="tabular-nums">{row.freight.toFixed(2)}</TableCell>
                    <TableCell className="tabular-nums">{row.customs.toFixed(2)}</TableCell>
                    <TableCell className="tabular-nums">{row.pal.toFixed(2)}</TableCell>
                    <TableCell className="tabular-nums">{row.cess.toFixed(2)}</TableCell>
                    <TableCell className="tabular-nums">{row.vat.toFixed(2)}</TableCell>
                    <TableCell className="tabular-nums">{row.sscl.toFixed(2)}</TableCell>
                    <TableCell className="tabular-nums font-medium">{total}</TableCell>
                    <TableCell>{row.currency}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" className="gap-1.5" asChild>
                        <LocaleLink href={`/console/costs/${row.sku}/recalculate`}>
                          <Calculator className="size-3.5" />
                          测算
                        </LocaleLink>
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </ConsoleListSection>
    </div>
  )
}
