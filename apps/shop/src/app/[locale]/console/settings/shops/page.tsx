'use client'

import * as React from 'react'
import {
  ConsoleFilterBar,
  ConsoleListSection,
  ConsoleTableEmpty,
  matchesKeyword,
} from '@/components/console/list'
import { MOCK_SHOPS } from '@/lib/crossborder/mock-data'
import { LocaleLink } from '@/lib/i18n/navigation'
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

function statusVariant(status: string) {
  if (status === 'active') return 'default' as const
  if (status === 'error') return 'destructive' as const
  if (status === 'connecting') return 'secondary' as const
  return 'outline' as const
}

const STATUSES = [...new Set(MOCK_SHOPS.map((s) => s.status))]
const PLATFORMS = [...new Set(MOCK_SHOPS.map((s) => s.platform))]

export default function SettingsShopsPage() {
  const [keyword, setKeyword] = React.useState('')
  const [status, setStatus] = React.useState('all')
  const [platform, setPlatform] = React.useState('all')

  const rows = MOCK_SHOPS.filter((shop) => {
    if (!matchesKeyword(keyword, shop.name, shop.id, shop.externalShopId, shop.region)) return false
    if (status !== 'all' && shop.status !== status) return false
    if (platform !== 'all' && shop.platform !== platform) return false
    return true
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">店铺连接</h2>
          <p className="text-sm text-muted-foreground">连接健康与同步状态 · 点击店铺看凭证概览</p>
        </div>
        <Button disabled>添加店铺</Button>
      </div>

      <ConsoleFilterBar
        keyword={keyword}
        onKeywordChange={setKeyword}
        keywordPlaceholder="店铺名 / ID / 区域"
        filters={[
          {
            id: 'status',
            label: '状态',
            value: status,
            onChange: setStatus,
            options: STATUSES.map((v) => ({ value: v, label: v })),
          },
          {
            id: 'platform',
            label: '平台',
            value: platform,
            onChange: setPlatform,
            options: PLATFORMS.map((v) => ({ value: v, label: v })),
          },
        ]}
      />

      <ConsoleListSection title="店铺列表" description={`共 ${rows.length} 条`}>
        {rows.length === 0 ? (
          <ConsoleTableEmpty />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>店铺</TableHead>
                <TableHead>平台</TableHead>
                <TableHead>区域</TableHead>
                <TableHead>币种</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>同步</TableHead>
                <TableHead>最近同步</TableHead>
                <TableHead>错误</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((shop) => (
                <TableRow key={shop.id}>
                  <TableCell className="font-medium">
                    <LocaleLink
                      href={`/console/settings/shops/${shop.id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {shop.name}
                    </LocaleLink>
                  </TableCell>
                  <TableCell>{shop.platform}</TableCell>
                  <TableCell className="font-mono text-xs">{shop.region}</TableCell>
                  <TableCell>{shop.currency}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(shop.status)}>{shop.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{shop.syncStatus}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{shop.lastSyncAt}</TableCell>
                  <TableCell className="max-w-[180px] truncate text-sm text-destructive">
                    {shop.lastError ?? '—'}
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
