'use client'

import * as React from 'react'
import {
  ConsoleFilterBar,
  ConsoleListSection,
  ConsoleTableEmpty,
  matchesKeyword,
} from '@/components/console/list'
import { MOCK_PENDING } from '@/lib/crossborder/mock-data'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { labelStatus, labeledOptions } from '@/lib/console/labels'

const KINDS = [...new Set(MOCK_PENDING.map((r) => r.kind))]
const STATUSES = [...new Set(MOCK_PENDING.map((r) => r.status))]
const SHOPS = [...new Set(MOCK_PENDING.map((r) => r.shop))]

export default function PendingPage() {
  const [keyword, setKeyword] = React.useState('')
  const [kind, setKind] = React.useState('all')
  const [status, setStatus] = React.useState('all')
  const [shop, setShop] = React.useState('all')

  const rows = MOCK_PENDING.filter((row) => {
    if (!matchesKeyword(keyword, row.title, row.id, row.kind, row.createdBy)) return false
    if (kind !== 'all' && row.kind !== kind) return false
    if (status !== 'all' && row.status !== status) return false
    if (shop !== 'all' && row.shop !== shop) return false
    return true
  })

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">待审队列</h2>
        <p className="text-sm text-muted-foreground">人工确认 · 示例确认/拒绝</p>
      </div>

      <ConsoleFilterBar
        keyword={keyword}
        onKeywordChange={setKeyword}
        keywordPlaceholder="标题 / 类型 / 创建者"
        filters={[
          {
            id: 'kind',
            label: '类型',
            value: kind,
            onChange: setKind,
            options: labeledOptions(KINDS),
          },
          {
            id: 'status',
            label: '状态',
            value: status,
            onChange: setStatus,
            options: labeledOptions(STATUSES),
          },
          {
            id: 'shop',
            label: '店铺',
            value: shop,
            onChange: setShop,
            options: SHOPS.map((v) => ({ value: v, label: v })),
          },
        ]}
      />

      <ConsoleListSection title="待审列表" description={`共 ${rows.length} 条`}>
        {rows.length === 0 ? (
          <ConsoleTableEmpty />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>类型</TableHead>
                <TableHead>标题</TableHead>
                <TableHead>店铺</TableHead>
                <TableHead>创建者</TableHead>
                <TableHead>过期</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-xs">{labelStatus(row.kind)}</TableCell>
                  <TableCell className="font-medium">{row.title}</TableCell>
                  <TableCell>{row.shop}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.createdBy}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.expiresAt}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{labelStatus(row.status)}</Badge>
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button size="sm" variant="default" disabled>
                      确认
                    </Button>
                    <Button size="sm" variant="outline" disabled>
                      拒绝
                    </Button>
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
