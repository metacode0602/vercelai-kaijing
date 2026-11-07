'use client'

import * as React from 'react'
import {
  ConsoleFilterBar,
  ConsoleListSection,
  ConsoleTableEmpty,
} from '@/components/console/list'
import { LocaleLink } from '@/lib/i18n/navigation'
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

const PAGE_SIZE = 20

export default function FreightPage() {
  const [keyword, setKeyword] = React.useState('')
  const [page, setPage] = React.useState(1)
  const listQuery = trpc.finance.listFreight.useQuery({
    page,
    pageSize: PAGE_SIZE,
    q: keyword || undefined,
  })
  const rows = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">运费测算</h2>
        <p className="text-sm text-muted-foreground">
          运价卡 commerce_freight_rate_cards + 费用模板 ocean_freight + 海运柜次 packing。
        </p>
      </div>
      <UedPrototypeNotice>
        正式运价维护在运价卡；海运柜次金额来自 packing_details。成本测算读取同一套运价卡。
      </UedPrototypeNotice>
      <ConsoleFilterBar
        keyword={keyword}
        onKeywordChange={(v) => {
          setKeyword(v)
          setPage(1)
        }}
        keywordPlaceholder="编码 / 名称 / 平台"
      />
      <ConsoleListSection
        title="运费 / 柜次估算"
        description={`共 ${total} 条`}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
      >
        {listQuery.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">加载…</p>
        ) : rows.length === 0 ? (
          <ConsoleTableEmpty />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>编码</TableHead>
                <TableHead>名称</TableHead>
                <TableHead>来源</TableHead>
                <TableHead>平台</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>版本</TableHead>
                <TableHead className="text-right">金额</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={`${row.source}:${row.id}`}>
                  <TableCell className="font-mono text-xs">
                    <LocaleLink
                      href={`/console/freight/${encodeURIComponent(row.id)}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {row.code}
                    </LocaleLink>
                  </TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.source}</TableCell>
                  <TableCell>{row.platform}</TableCell>
                  <TableCell>{row.type}</TableCell>
                  <TableCell className="tabular-nums">{row.versionNo ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.amount == null ? '—' : `${row.amount} ${row.currency}`}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ConsoleListSection>
    </div>
  )
}
